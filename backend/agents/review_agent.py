"""Backwards-compatible convenience wrapper.

The real pipeline lives in :mod:`core.orchestrator` (a LangGraph that runs the
security/performance/style agents in parallel and aggregates the results). This
module just exposes a simple ``review_pull_request`` helper for callers that
already have a diff.
"""

from __future__ import annotations

from agents.aggregator_agent import ReviewReport
from core.orchestrator import run_review


async def review_pull_request(
    repo: str, pr_number: int, diff: str
) -> ReviewReport:
    """Run the full multi-agent review over ``diff``."""
    return await run_review(diff=diff, repo_name=repo, pr_number=pr_number)
