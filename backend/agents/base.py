"""Shared building blocks for the review agents.

Each specialized agent (security/performance/style) analyzes a code diff and
returns a list of :class:`Issue` objects. They all share the same LLM plumbing
and output schema, defined here to avoid duplication.
"""

from __future__ import annotations

from enum import Enum

from langchain_groq import ChatGroq
from pydantic import BaseModel, Field

from core.config import settings

# Default model for all review agents.
MODEL = "llama-3.3-70b-versatile"


class RateLimitError(Exception):
    """Raised when the LLM provider rate-limits us (HTTP 429).

    Propagated out of the agents so the API can return a clear 429 instead of a
    misleading clean report (empty issues -> score 100)."""


def _is_rate_limit(exc: Exception) -> bool:
    """Best-effort detection of a provider rate-limit error across SDKs."""
    status = getattr(exc, "status_code", None) or getattr(exc, "code", None)
    if status == 429:
        return True
    text = str(exc).lower()
    return "429" in text or "too many requests" in text or "rate limit" in text


class Severity(str, Enum):
    CRITICAL = "critical"
    HIGH = "high"
    MEDIUM = "medium"
    LOW = "low"


# Lower number == more severe. Used for ranking/sorting.
SEVERITY_ORDER: dict[str, int] = {
    Severity.CRITICAL: 0,
    Severity.HIGH: 1,
    Severity.MEDIUM: 2,
    Severity.LOW: 3,
}

# Score penalty applied per issue by severity (see aggregator).
# Score = 100 - (25*critical + 10*high + 5*medium + 2*low), floored at 0.
SEVERITY_WEIGHT: dict[str, int] = {
    Severity.CRITICAL: 25,
    Severity.HIGH: 10,
    Severity.MEDIUM: 5,
    Severity.LOW: 2,
}

# Shared precision guardrails appended to every agent's system prompt. These
# keep agents from inventing issues, inflating severity, or flagging diffs that
# contain nothing in their domain (e.g. docs-only PRs).
PRECISION_GUARDRAILS = """

CRITICAL REVIEW RULES — follow these exactly:
- Review ONLY the added/changed lines (those starting with '+'). Ignore removed
  lines and unchanged context except as needed to understand the change.
- Report a finding ONLY when you can tie it to a specific changed line that
  clearly exhibits the problem. Quote nothing hypothetical.
- DO NOT speculate. No "this could be", "might be", "consider whether". If you
  are not confident the issue is real and present in THIS diff, do not report it.
- Prefer precision over recall. A clean diff MUST return an empty list. Returning
  an empty list is the correct, expected answer when there are no real issues —
  do not invent problems to appear thorough.
- If the diff only touches documentation or non-code files (e.g. .md, .markdown,
  .rst, .txt, LICENSE, CHANGELOG, files under docs/), there is nothing in your
  domain to review: return an empty list.
- Severity must reflect real-world impact, never be inflated to pad the report.
"""


class Issue(BaseModel):
    """A single finding produced by a review agent."""

    category: str = Field(description="Short category, e.g. 'SQL Injection'")
    severity: Severity = Field(description="critical | high | medium | low")
    line_number: int | None = Field(
        default=None, description="Line in the diff the issue refers to, if known"
    )
    file: str | None = Field(
        default=None, description="Path of the file the issue is in, if known"
    )
    description: str = Field(description="What is wrong and why it matters")
    fix_suggestion: str = Field(description="Concrete suggested fix")
    agent: str = Field(default="", description="Which agent produced this issue")


class IssueList(BaseModel):
    """Structured-output wrapper so the LLM returns a typed list."""

    issues: list[Issue] = Field(default_factory=list)


def get_llm(model: str = MODEL, temperature: float = 0.0) -> ChatGroq:
    """Construct a Groq chat model via langchain-groq."""
    return ChatGroq(
        model=model,
        api_key=settings.GROQ_API_KEY,
        temperature=temperature,
        max_tokens=2048,
    )


async def analyze_diff(diff: str, system_prompt: str, agent_name: str) -> list[Issue]:
    """Run a single agent's analysis over ``diff`` and return tagged issues.

    Uses Groq structured output so the model is forced to return an
    :class:`IssueList`. Each returned issue is stamped with ``agent_name``.
    """
    llm = get_llm().with_structured_output(IssueList)
    messages = [
        ("system", system_prompt + PRECISION_GUARDRAILS),
        (
            "human",
            "Analyze the following unified diff. Report ONLY real, concrete issues "
            "in your area of responsibility that you can point to on a specific "
            "changed line. If you find none, return an empty list (this is common "
            "and correct).\n\n```diff\n" + diff + "\n```",
        ),
    ]
    try:
        result: IssueList = await llm.ainvoke(messages)
    except Exception as exc:
        if _is_rate_limit(exc):
            raise RateLimitError(str(exc)) from exc
        raise
    for issue in result.issues:
        issue.agent = agent_name
    return result.issues
