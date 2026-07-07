"""API route tests using a minimal app (avoids starting the Redis worker)."""

import hashlib
import hmac
import json

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from agents.aggregator_agent import ReviewReport
from agents.base import Issue, Severity
from api import routes


@pytest.fixture
def client(monkeypatch):
    app = FastAPI()
    app.include_router(routes.router)
    return TestClient(app)


def _sample_report() -> ReviewReport:
    return ReviewReport(
        summary="demo",
        total_issues=1,
        issues_by_severity={"critical": 1, "high": 0, "medium": 0, "low": 0},
        top_recommendations=["fix the SQLi"],
        overall_score=75,
        issues=[
            Issue(
                category="SQL Injection",
                severity=Severity.CRITICAL,
                line_number=14,
                file="app/db.py",
                description="d",
                fix_suggestion="f",
                agent="security",
            )
        ],
    )


def test_health(client):
    resp = client.get("/health")
    assert resp.status_code == 200
    assert resp.json() == {"status": "ok"}


def test_demo_runs_orchestrator(client, monkeypatch):
    async def fake_run_review(**kwargs):
        return _sample_report()

    monkeypatch.setattr(routes, "run_review", fake_run_review)

    resp = client.post("/demo")
    assert resp.status_code == 200
    body = resp.json()
    assert body["overall_score"] == 75
    assert body["total_issues"] == 1
    assert body["issues"][0]["category"] == "SQL Injection"


def test_reviews_history_records_and_dedupes():
    """record_review stores summaries; re-running a PR overwrites (latest wins)."""
    import asyncio

    from core import redis_client

    async def scenario():
        await redis_client.get_redis().delete(redis_client.HISTORY_KEY)
        await redis_client.record_review("o/api", 3, "First", 55, 4)
        await redis_client.record_review("o/web", 9, "Other", 90, 1)
        await redis_client.record_review("o/api", 3, "Re-run", 60, 2)  # overwrites
        return await redis_client.list_reviews()

    rows = asyncio.run(scenario())
    assert len(rows) == 2  # 3 records, deduped to 2 PRs
    api = next(r for r in rows if r["repo"] == "o/api")
    assert api["overall_score"] == 60 and api["pr_title"] == "Re-run"


def test_webhook_rejects_bad_signature(client, monkeypatch):
    monkeypatch.setattr(routes.settings, "GITHUB_WEBHOOK_SECRET", "topsecret")
    resp = client.post(
        "/webhook/github",
        content=b"{}",
        headers={
            "X-Hub-Signature-256": "sha256=deadbeef",
            "X-GitHub-Event": "pull_request",
        },
    )
    assert resp.status_code == 401


def test_webhook_queues_valid_opened_event(client, monkeypatch):
    secret = "topsecret"
    monkeypatch.setattr(routes.settings, "GITHUB_WEBHOOK_SECRET", secret)

    queued = {}

    async def fake_enqueue(repo, pr_number, pr_url=""):
        queued["repo"] = repo
        queued["pr_number"] = pr_number

    monkeypatch.setattr(routes, "enqueue_job", fake_enqueue)

    payload = {
        "action": "opened",
        "pull_request": {"number": 7, "html_url": "https://github.com/o/r/pull/7"},
        "repository": {"full_name": "o/r"},
    }
    body = json.dumps(payload).encode()
    sig = "sha256=" + hmac.new(secret.encode(), body, hashlib.sha256).hexdigest()

    resp = client.post(
        "/webhook/github",
        content=body,
        headers={"X-Hub-Signature-256": sig, "X-GitHub-Event": "pull_request"},
    )
    assert resp.status_code == 200
    assert resp.json()["status"] == "queued"
    assert queued == {"repo": "o/r", "pr_number": 7}
