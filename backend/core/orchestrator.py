"""LangGraph orchestration of the review agents.

The graph fans out to the security, performance, and style agents in parallel,
then fans in to the aggregator which produces the final report::

              ┌──────────────┐
        ┌────►│   security   │────┐
        │     └──────────────┘    │
    ┌───┴──┐  ┌──────────────┐    ▼   ┌────────────┐
    │ START├─►│ performance  ├──►(aggregate)──► END │
    └───┬──┘  └──────────────┘    ▲   └────────────┘
        │     ┌──────────────┐    │
        └────►│    style     │────┘
              └──────────────┘

Each agent node is wrapped in error handling: if one agent raises, its issue
list is treated as empty and the failure is recorded in ``errors`` so the rest
of the review still completes.
"""

from __future__ import annotations

import operator
from typing import Annotated, TypedDict

from langgraph.graph import END, START, StateGraph

from agents import performance_agent, security_agent, style_agent
from agents.aggregator_agent import ReviewReport, aggregate
from agents.base import Issue, RateLimitError


class ReviewState(TypedDict, total=False):
    """Shared state threaded through the graph."""

    # Inputs
    pr_url: str
    diff: str
    repo_name: str
    pr_number: int

    # Per-agent outputs (each node writes only its own key — no conflicts)
    security_issues: list[Issue]
    performance_issues: list[Issue]
    style_issues: list[Issue]

    # Fan-in result
    report: ReviewReport

    # Accumulated across nodes that may run concurrently
    errors: Annotated[list[str], operator.add]


async def _security_node(state: ReviewState) -> dict:
    try:
        return {"security_issues": await security_agent.analyze(state["diff"])}
    except RateLimitError:
        raise  # bubble up — don't mask a rate limit as a clean result
    except Exception as exc:  # pragma: no cover - defensive
        return {"security_issues": [], "errors": [f"security_agent: {exc}"]}


async def _performance_node(state: ReviewState) -> dict:
    try:
        return {"performance_issues": await performance_agent.analyze(state["diff"])}
    except RateLimitError:
        raise
    except Exception as exc:  # pragma: no cover - defensive
        return {"performance_issues": [], "errors": [f"performance_agent: {exc}"]}


async def _style_node(state: ReviewState) -> dict:
    try:
        return {"style_issues": await style_agent.analyze(state["diff"])}
    except RateLimitError:
        raise
    except Exception as exc:  # pragma: no cover - defensive
        return {"style_issues": [], "errors": [f"style_agent: {exc}"]}


async def _aggregate_node(state: ReviewState) -> dict:
    report = await aggregate(
        state.get("security_issues", []),
        state.get("performance_issues", []),
        state.get("style_issues", []),
    )
    return {"report": report}


def build_graph():
    """Build and compile the review StateGraph."""
    graph = StateGraph(ReviewState)

    graph.add_node("security", _security_node)
    graph.add_node("performance", _performance_node)
    graph.add_node("style", _style_node)
    graph.add_node("aggregate", _aggregate_node)

    # Fan out from START to the three agents (run in parallel).
    graph.add_edge(START, "security")
    graph.add_edge(START, "performance")
    graph.add_edge(START, "style")

    # Fan in: aggregate waits for all three before running.
    graph.add_edge("security", "aggregate")
    graph.add_edge("performance", "aggregate")
    graph.add_edge("style", "aggregate")
    graph.add_edge("aggregate", END)

    return graph.compile()


# Compiled once at import; reused across requests.
review_graph = build_graph()


async def run_review(
    diff: str,
    repo_name: str = "",
    pr_number: int = 0,
    pr_url: str = "",
) -> ReviewReport:
    """Run the full review pipeline over ``diff`` and return the final report."""
    initial: ReviewState = {
        "pr_url": pr_url,
        "diff": diff,
        "repo_name": repo_name,
        "pr_number": pr_number,
        "errors": [],
    }
    final_state = await review_graph.ainvoke(initial)
    return final_state["report"]
