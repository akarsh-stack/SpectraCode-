from agents import base, performance_agent
from agents.base import Issue, IssueList, Severity


async def test_performance_agent_detects_n_plus_one(monkeypatch, fake_llm):
    canned = IssueList(
        issues=[
            Issue(
                category="N+1 Query",
                severity=Severity.HIGH,
                line_number=22,
                file="app/db.py",
                description="Query executed inside a loop over users.",
                fix_suggestion="Batch with a single IN query.",
            )
        ]
    )
    monkeypatch.setattr(base, "get_llm", lambda *a, **k: fake_llm(canned))

    issues = await performance_agent.analyze("<diff>")

    assert len(issues) == 1
    assert issues[0].category == "N+1 Query"
    assert issues[0].agent == "performance"
