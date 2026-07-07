from agents import base, security_agent
from agents.base import Issue, IssueList, Severity


async def test_security_agent_tags_and_returns_issues(monkeypatch, fake_llm):
    canned = IssueList(
        issues=[
            Issue(
                category="SQL Injection",
                severity=Severity.CRITICAL,
                line_number=14,
                file="app/db.py",
                description="User input concatenated into SQL.",
                fix_suggestion="Use parameterized queries.",
            ),
            Issue(
                category="Hardcoded Secret",
                severity=Severity.HIGH,
                line_number=11,
                file="app/db.py",
                description="API key checked into source.",
                fix_suggestion="Load from environment.",
            ),
        ]
    )
    monkeypatch.setattr(base, "get_llm", lambda *a, **k: fake_llm(canned))

    issues = await security_agent.analyze("<diff>")

    assert len(issues) == 2
    assert {i.category for i in issues} == {"SQL Injection", "Hardcoded Secret"}
    # Every issue is stamped with the agent name.
    assert all(i.agent == "security" for i in issues)


async def test_security_agent_handles_no_findings(monkeypatch, fake_llm):
    monkeypatch.setattr(base, "get_llm", lambda *a, **k: fake_llm(IssueList(issues=[])))
    assert await security_agent.analyze("<clean diff>") == []
