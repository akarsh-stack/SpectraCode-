from agents import aggregator_agent
from agents.aggregator_agent import _Narrative, aggregate
from agents.base import Issue, Severity


def _issue(category, severity, line, agent, file="app/db.py", desc="dup desc"):
    return Issue(
        category=category,
        severity=severity,
        line_number=line,
        file=file,
        description=desc,
        fix_suggestion="fix it",
        agent=agent,
    )


async def test_aggregate_dedupes_ranks_and_scores(monkeypatch, fake_llm):
    narrative = _Narrative(summary="ok", top_recommendations=["a", "b"])
    monkeypatch.setattr(
        aggregator_agent, "get_llm", lambda *a, **k: fake_llm(narrative)
    )

    security = [
        _issue("SQL Injection", Severity.CRITICAL, 14, "security"),
        _issue("Hardcoded Secret", Severity.HIGH, 11, "security"),
    ]
    # Exact duplicate of the critical issue (same file/line/category/desc).
    performance = [_issue("SQL Injection", Severity.CRITICAL, 14, "security")]
    style = [_issue("Missing Docstring", Severity.LOW, 13, "style", desc="no doc")]

    report = await aggregate(security, performance, style)

    # The duplicate was removed: 2 unique + 1 style = 3.
    assert report.total_issues == 3
    assert report.issues_by_severity["critical"] == 1
    assert report.issues_by_severity["high"] == 1
    assert report.issues_by_severity["low"] == 1
    # Score = 100 - (25 crit + 10 high + 2 low) = 63.
    assert report.overall_score == 63
    # Ranked most-severe first.
    assert report.issues[0].severity == Severity.CRITICAL
    assert report.summary == "ok"


async def test_aggregate_caps_recommendations_at_five(monkeypatch, fake_llm):
    narrative = _Narrative(
        summary="lots", top_recommendations=["1", "2", "3", "4", "5", "6", "7"][:5]
    )
    monkeypatch.setattr(
        aggregator_agent, "get_llm", lambda *a, **k: fake_llm(narrative)
    )
    report = await aggregate([_issue("Naming", Severity.LOW, 1, "style")], [], [])
    assert len(report.top_recommendations) <= 5


async def test_aggregate_clean_diff_scores_100(monkeypatch, fake_llm):
    monkeypatch.setattr(
        aggregator_agent,
        "get_llm",
        lambda *a, **k: fake_llm(_Narrative(summary="clean", top_recommendations=[])),
    )
    report = await aggregate([], [], [])
    assert report.overall_score == 100
    assert report.total_issues == 0
