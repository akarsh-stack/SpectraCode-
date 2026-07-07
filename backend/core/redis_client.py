"""Async Redis helpers: a simple review job queue and a report cache."""

from __future__ import annotations

import json
from datetime import datetime, timezone

import fakeredis.aioredis as aioredis

from agents.aggregator_agent import ReviewReport
from core.config import settings

QUEUE_KEY = "review:queue"
HISTORY_KEY = "review:history"  # hash: field "repo#pr" -> summary JSON
CACHE_TTL_SECONDS = 60 * 60 * 24 * 7  # 7 days

_redis: aioredis.FakeRedis | None = None


def get_redis() -> aioredis.FakeRedis:
    """Return a lazily-created shared async (fake) Redis client.

    Uses an in-process fakeredis server so the app runs without a real Redis
    instance installed. The queue and cache behave identically.
    """
    global _redis
    if _redis is None:
        _redis = aioredis.FakeRedis(decode_responses=True)
    return _redis


def _cache_key(repo: str, pr_number: int) -> str:
    return f"review:result:{repo}:{pr_number}"


async def enqueue_job(repo: str, pr_number: int, pr_url: str = "") -> None:
    """Push a review job onto the queue for the background worker."""
    payload = json.dumps({"repo": repo, "pr_number": pr_number, "pr_url": pr_url})
    await get_redis().rpush(QUEUE_KEY, payload)


async def dequeue_job(timeout: int = 5) -> dict | None:
    """Block-pop the next job from the queue, or return None on timeout."""
    item = await get_redis().blpop(QUEUE_KEY, timeout=timeout)
    if item is None:
        return None
    _key, raw = item
    return json.loads(raw)


async def cache_report(repo: str, pr_number: int, report: ReviewReport) -> None:
    """Store a report JSON blob with a TTL."""
    await get_redis().set(
        _cache_key(repo, pr_number),
        report.model_dump_json(),
        ex=CACHE_TTL_SECONDS,
    )


async def get_cached_report(repo: str, pr_number: int) -> dict | None:
    """Return a cached report as a dict, or None if not present."""
    raw = await get_redis().get(_cache_key(repo, pr_number))
    return json.loads(raw) if raw else None


async def record_review(
    repo: str,
    pr_number: int,
    pr_title: str,
    overall_score: int,
    total_issues: int,
) -> None:
    """Record a one-line summary of a completed review for the history page.

    Stored in a hash keyed by ``repo#pr`` so re-running a PR overwrites the
    previous entry (latest wins) rather than piling up duplicates.
    """
    summary = {
        "repo": repo,
        "pr_number": pr_number,
        "pr_title": pr_title,
        "overall_score": overall_score,
        "total_issues": total_issues,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await get_redis().hset(HISTORY_KEY, f"{repo}#{pr_number}", json.dumps(summary))


async def list_reviews() -> list[dict]:
    """Return all recorded review summaries, most recent first."""
    entries = await get_redis().hgetall(HISTORY_KEY)
    reviews = [json.loads(v) for v in entries.values()]
    reviews.sort(key=lambda r: r.get("created_at", ""), reverse=True)
    return reviews
