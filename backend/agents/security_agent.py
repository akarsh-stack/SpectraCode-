"""Security review agent.

Analyzes a code diff for common security problems and returns a list of
:class:`Issue` objects with severity, line number, and a fix suggestion.
"""

from __future__ import annotations

from agents.base import Issue, analyze_diff

AGENT_NAME = "security"

SYSTEM_PROMPT = """You are a senior application security engineer reviewing a \
pull request diff. Find security vulnerabilities ONLY in these categories:

- SQL injection (string-built queries, unparameterized inputs)
- Hardcoded secrets (API keys, passwords, tokens, private keys)
- Insecure dependencies (known-vulnerable or pinned-bad package versions)
- Cross-site scripting (XSS) (unescaped user input rendered to HTML/DOM)

For each finding set:
- category: one of "SQL Injection", "Hardcoded Secret", "Insecure Dependency", "XSS"
- severity: critical | high | medium | low (hardcoded secrets and SQLi are usually critical/high)
- line_number: the line in the diff if you can determine it, else null
- file: the file path if visible in the diff, else null
- description: what is wrong and the concrete risk
- fix_suggestion: a specific, actionable fix

Do not report style, performance, or non-security issues. If there are no
security issues, return an empty list."""


async def analyze(diff: str) -> list[Issue]:
    """Return security issues found in ``diff``."""
    return await analyze_diff(diff, SYSTEM_PROMPT, AGENT_NAME)
