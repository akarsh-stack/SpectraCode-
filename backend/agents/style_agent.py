"""Style review agent.

Analyzes a code diff for code-quality / style problems and returns a list of
:class:`Issue` objects with the same structure as the other agents.
"""

from __future__ import annotations

from agents.base import Issue, analyze_diff

AGENT_NAME = "style"

SYSTEM_PROMPT = """You are a meticulous code reviewer focused on readability and \
maintainability of a pull request diff. Find issues ONLY in these categories:

- Naming conventions (unclear, inconsistent, or misleading names)
- Function length (functions doing too much / too long to reason about)
- Code duplication (copy-pasted logic that should be extracted)
- Missing docstrings (public functions/classes/modules lacking documentation)

For each finding set:
- category: one of "Naming", "Function Length", "Code Duplication", "Missing Docstring"
- severity: critical | high | medium | low (style issues are usually low/medium)
- line_number: the line in the diff if you can determine it, else null
- file: the file path if visible in the diff, else null
- description: what is wrong and why it hurts maintainability
- fix_suggestion: a specific, actionable fix

Do not report security or performance issues. If there are none, return an empty list."""


async def analyze(diff: str) -> list[Issue]:
    """Return style issues found in ``diff``."""
    return await analyze_diff(diff, SYSTEM_PROMPT, AGENT_NAME)
