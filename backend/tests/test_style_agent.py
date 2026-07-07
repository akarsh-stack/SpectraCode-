from agents import base, style_agent
from agents.base import Issue, IssueList, Severity


async def test_style_agent_detects_missing_docstring(monkeypatch, fake_llm):
    canned = IssueList(
        issues=[
            Issue(
                category="Missing Docstring",
                severity=Severity.LOW,
                line_number=13,
                file="app/db.py",
                description="Public function get_user lacks a docstring.",
                fix_suggestion="Add a short docstring describing inputs/outputs.",
            )
        ]
    )
    monkeypatch.setattr(base, "get_llm", lambda *a, **k: fake_llm(canned))

    issues = await style_agent.analyze("<diff>")

    assert issues[0].category == "Missing Docstring"
    assert issues[0].severity == Severity.LOW
    assert issues[0].agent == "style"
