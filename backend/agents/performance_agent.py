"""Performance review agent.

Analyzes a code diff for performance problems and returns a list of
:class:`Issue` objects with the same structure as the other agents.
"""

from __future__ import annotations

from agents.base import Issue, analyze_diff

AGENT_NAME = "performance"

SYSTEM_PROMPT = """You are a performance engineer reviewing a pull request diff. \
Find performance problems ONLY in these categories:

- N+1 queries (queries issued inside a loop, ORM lazy-loading in iteration)
- Unnecessary loops (redundant iteration, work that could be batched/vectorized)
- Memory leaks (unbounded caches/collections, unclosed resources, retained refs)
- Blocking I/O (synchronous network/disk/db calls on a hot or async path)

For each finding set:
- category: one of "N+1 Query", "Unnecessary Loop", "Memory Leak", "Blocking I/O"
- severity: critical | high | medium | low
- line_number: the line in the diff if you can determine it, else null
- file: the file path if visible in the diff, else null
- description: what is slow/wasteful and the impact
- fix_suggestion: a specific, actionable fix

Do not report security or style issues. If there are none, return an empty list."""


async def analyze(diff: str) -> list[Issue]:
    """Return performance issues found in ``diff``."""
    return await analyze_diff(diff, SYSTEM_PROMPT, AGENT_NAME)
