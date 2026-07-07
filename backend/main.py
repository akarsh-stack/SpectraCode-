"""FastAPI application entrypoint.

Wires up CORS, the API routes, and a background worker that drains the Redis
review queue, runs the orchestrator, caches the result, and posts the review
back to the PR.
"""

from __future__ import annotations

import asyncio
import contextlib
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from api.routes import router
from core.github_client import GitHubClient
from core.orchestrator import run_review
from core.redis_client import cache_report, dequeue_job, record_review

logger = logging.getLogger("code_review_agent")
logging.basicConfig(level=logging.INFO)


async def _process_job(job: dict) -> None:
    """Run a single queued review job end to end."""
    repo = job["repo"]
    pr_number = job["pr_number"]
    pr_url = job.get("pr_url", "")
    logger.info("Processing review job: %s#%s", repo, pr_number)

    client = GitHubClient()
    try:
        diff = client.fetch_pr_diff(repo, pr_number)
    except Exception as exc:
        logger.error("Failed to fetch diff for %s#%s: %s", repo, pr_number, exc)
        return

    pr_title = ""
    try:
        pr_title = client.get_pr_metadata(repo, pr_number).get("title") or ""
    except Exception as exc:
        logger.debug("Could not fetch PR title for %s#%s: %s", repo, pr_number, exc)

    report = await run_review(
        diff=diff, repo_name=repo, pr_number=pr_number, pr_url=pr_url
    )
    await cache_report(repo, pr_number, report)
    await record_review(
        repo, pr_number, pr_title, report.overall_score, report.total_issues
    )

    try:
        url = client.post_review_comment(repo, pr_number, report)
        logger.info("Posted review comment: %s", url)
    except Exception as exc:
        logger.error("Failed to post comment for %s#%s: %s", repo, pr_number, exc)


async def _worker_loop() -> None:
    """Continuously drain the Redis queue until cancelled."""
    logger.info("Review worker started")
    while True:
        try:
            job = await dequeue_job(timeout=5)
            if job is not None:
                await _process_job(job)
        except asyncio.CancelledError:
            raise
        except Exception as exc:  # pragma: no cover - keep the worker alive
            logger.error("Worker error: %s", exc)
            await asyncio.sleep(1)


@asynccontextmanager
async def lifespan(app: FastAPI):
    worker = asyncio.create_task(_worker_loop())
    try:
        yield
    finally:
        worker.cancel()
        with contextlib.suppress(asyncio.CancelledError):
            await worker


app = FastAPI(title="Code Review Agent", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(router)


@app.get("/")
async def root() -> dict:
    return {"service": "code-review-agent", "docs": "/docs"}
