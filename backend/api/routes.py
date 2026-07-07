"""API routes: GitHub webhook, manual review, cached review lookup, health, demo."""

from __future__ import annotations

import hashlib
import hmac
import logging

from fastapi import APIRouter, Header, HTTPException, Request
from pydantic import BaseModel

from agents.base import RateLimitError
from core.config import settings
from core.github_client import GitHubClient, PRFetchError
from core.orchestrator import run_review
from core.redis_client import (
    cache_report,
    enqueue_job,
    get_cached_report,
    list_reviews,
    record_review,
)
from core.sample_diff import SAMPLE_DIFF

logger = logging.getLogger("code_review_agent")

RATE_LIMIT_MESSAGE = "Rate limited by the LLM provider — try again shortly."

router = APIRouter()

# Events we act on. Other PR actions (closed, labeled, ...) are ignored.
TRIGGER_ACTIONS = {"opened", "synchronize"}


class ReviewRequest(BaseModel):
    repo: str  # "owner/repo"
    pr_number: int


def _verify_signature(body: bytes, signature: str | None) -> bool:
    """Validate the GitHub HMAC-SHA256 webhook signature."""
    secret = settings.GITHUB_WEBHOOK_SECRET
    if not secret:
        # No secret configured -> reject signed-webhook verification explicitly.
        return False
    if not signature or not signature.startswith("sha256="):
        return False
    expected = "sha256=" + hmac.new(secret.encode(), body, hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected, signature)


@router.get("/health")
async def health() -> dict:
    return {"status": "ok"}


@router.post("/webhook/github")
async def github_webhook(
    request: Request,
    x_hub_signature_256: str | None = Header(default=None),
    x_github_event: str | None = Header(default=None),
) -> dict:
    """Receive a GitHub PR webhook, verify it, and queue qualifying reviews."""
    body = await request.body()
    if not _verify_signature(body, x_hub_signature_256):
        raise HTTPException(status_code=401, detail="Invalid signature")

    if x_github_event != "pull_request":
        return {"status": "ignored", "reason": f"event '{x_github_event}'"}

    payload = await request.json()
    action = payload.get("action")
    if action not in TRIGGER_ACTIONS:
        return {"status": "ignored", "reason": f"action '{action}'"}

    pr = payload.get("pull_request", {})
    repo = payload.get("repository", {}).get("full_name")
    pr_number = pr.get("number")
    pr_url = pr.get("html_url", "")
    if not repo or pr_number is None:
        raise HTTPException(status_code=400, detail="Missing repo or PR number")

    await enqueue_job(repo, pr_number, pr_url)
    return {"status": "queued", "repo": repo, "pr_number": pr_number}


@router.post("/review")
async def trigger_review(req: ReviewRequest) -> dict:
    """Manually run the full review pipeline and return the report."""
    logger.info("Review requested: %s#%s", req.repo, req.pr_number)

    client = GitHubClient()
    try:
        logger.debug("Fetching diff for %s#%s", req.repo, req.pr_number)
        diff = client.fetch_pr_diff(req.repo, req.pr_number)
        logger.debug("Fetched diff: %d chars", len(diff))
    except PRFetchError as exc:
        # Clear, status-aware error — never silently fall back to mock data.
        logger.warning("PRFetchError (%s): %s", exc.status_code, exc)
        raise HTTPException(status_code=exc.status_code, detail=str(exc))
    except Exception as exc:
        logger.exception("Unexpected error fetching diff for %s#%s", req.repo, req.pr_number)
        raise HTTPException(status_code=502, detail=f"Could not fetch diff: {exc}")

    # Fetch the PR title for display (best-effort; never fail the review on it).
    pr_title = ""
    try:
        meta = client.get_pr_metadata(req.repo, req.pr_number)
        pr_title = meta.get("title") or ""
    except Exception as exc:
        logger.debug("Could not fetch PR metadata for %s#%s: %s", req.repo, req.pr_number, exc)

    try:
        report = await run_review(
            diff=diff, repo_name=req.repo, pr_number=req.pr_number
        )
    except RateLimitError as exc:
        logger.warning("Rate limited during review of %s#%s: %s", req.repo, req.pr_number, exc)
        raise HTTPException(status_code=429, detail=RATE_LIMIT_MESSAGE)
    logger.info(
        "Review complete for %s#%s: %d issues, score %d/100",
        req.repo, req.pr_number, report.total_issues, report.overall_score,
    )
    await cache_report(req.repo, req.pr_number, report)
    await record_review(
        req.repo, req.pr_number, pr_title, report.overall_score, report.total_issues
    )

    # Return a superset of the report: the UI also needs the PR metadata and the
    # raw diff so it can render the real changed code with issue markers.
    return {
        **report.model_dump(),
        "repo": req.repo,
        "pr_number": req.pr_number,
        "pr_title": pr_title,
        "diff": diff,
    }


@router.get("/reviews")
async def list_review_history() -> list[dict]:
    """List summaries of all completed reviews, most recent first."""
    return await list_reviews()


@router.get("/reviews/{owner}/{repo}/{pr_number}")
async def get_review(owner: str, repo: str, pr_number: int) -> dict:
    """Fetch a previously-computed review from the Redis cache."""
    full_repo = f"{owner}/{repo}"
    cached = await get_cached_report(full_repo, pr_number)
    if cached is None:
        raise HTTPException(status_code=404, detail="No cached review found")
    return cached


@router.post("/demo")
async def demo() -> dict:
    """Run the review on a hardcoded sample diff (no GitHub repo required)."""
    try:
        report = await run_review(
            diff=SAMPLE_DIFF, repo_name="demo/sample", pr_number=1, pr_url=""
        )
    except RateLimitError:
        raise HTTPException(status_code=429, detail=RATE_LIMIT_MESSAGE)
    return report.model_dump()
