"""Orchestrator tests: agents run and the graph survives a failing agent."""

from agents import aggregator_agent, performance_agent, security_agent, style_agent
from agents.aggregator_agent import _Narrative
from agents.base import Issue, Severity
from core import orchestrator


def _issue(category, severity, agent):
    return Issue(
        category=category,
        severity=severity,
        line_number=1,
        file="app/db.py",
        description=f"{category} desc",
        fix_suggestion="fix",
        agent=agent,
    )


async def test_orchestrator_aggregates_all_agents(monkeypatch, fake_llm):
    async def sec(_diff):
        return [_issue("SQL Injection", Severity.CRITICAL, "security")]

    async def perf(_diff):
        return [_issue("N+1 Query", Severity.HIGH, "performance")]

    async def sty(_diff):
        return [_issue("Naming", Severity.LOW, "style")]

    monkeypatch.setattr(security_agent, "analyze", sec)
    monkeypatch.setattr(performance_agent, "analyze", perf)
    monkeypatch.setattr(style_agent, "analyze", sty)
    monkeypatch.setattr(
        aggregator_agent,
        "get_llm",
        lambda *a, **k: fake_llm(_Narrative(summary="s", top_recommendations=[])),
    )

    report = await orchestrator.run_review("<diff>", "owner/repo", 1)

    assert report.total_issues == 3
    assert report.issues_by_severity["critical"] == 1


async def test_orchestrator_survives_failing_agent(monkeypatch, fake_llm):
    async def boom(_diff):
        raise RuntimeError("agent exploded")

    async def perf(_diff):
        return [_issue("Blocking I/O", Severity.MEDIUM, "performance")]

    async def sty(_diff):
        return []

    # Security agent fails; the others should still produce a report.
    monkeypatch.setattr(security_agent, "analyze", boom)
    monkeypatch.setattr(performance_agent, "analyze", perf)
    monkeypatch.setattr(style_agent, "analyze", sty)
    monkeypatch.setattr(
        aggregator_agent,
        "get_llm",
        lambda *a, **k: fake_llm(_Narrative(summary="partial", top_recommendations=[])),
    )

    report = await orchestrator.run_review("<diff>", "owner/repo", 2)

    # Only the performance issue survived; the failure did not crash the graph.
    assert report.total_issues == 1
    assert report.issues[0].category == "Blocking I/O"
