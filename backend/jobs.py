"""Long tasks that keep running when the page that started them goes away.

A job runs one of the existing event generators (a chat turn, an ingestion, a briefing) in
its own asyncio task and keeps every event it yields. Pages follow a job: they get the events
so far, then live ones, and can leave and come back. Leaving only stops the watching.
Jobs live in this process; a restart marks unfinished ones as interrupted (db.init_db).
"""

import asyncio
import json
import logging
import time
import uuid
from collections.abc import AsyncIterator

from core.db import create_job, finish_job
from core.events import event

logger = logging.getLogger(__name__)

# Finished jobs stay followable this long, for a page that comes back late
KEEP_S = 600

_jobs: dict[str, dict] = {}


def start(kind: str, ref: str, events: AsyncIterator[dict]) -> str:
    """Run `events` in the background; the first event every follower sees names the job."""
    job_id = str(uuid.uuid4())
    _prune()
    _jobs[job_id] = {
        "kind": kind,
        "ref": ref,
        "events": [event("job", job_id=job_id, kind=kind, ref=ref)],
        "done": False,
        "finished": None,
        "changed": asyncio.Condition(),
    }
    create_job(job_id, kind, ref)
    # Kept on the job, so the task is not garbage collected while it runs
    _jobs[job_id]["task"] = asyncio.create_task(_run(job_id, events))
    return job_id


async def _run(job_id: str, events: AsyncIterator[dict]):
    job = _jobs[job_id]
    status, error = "done", None
    try:
        async for ev in events:
            await _push(job, ev)
            if json.loads(ev["data"])["type"] == "error":
                status, error = "failed", json.loads(ev["data"]).get("message")
    except Exception as e:
        logger.exception("job %s failed", job_id)
        status, error = "failed", str(e)
        await _push(job, event("error", message=str(e)))
    finally:
        job["done"] = True
        job["finished"] = time.monotonic()
        async with job["changed"]:
            job["changed"].notify_all()
        finish_job(job_id, status, error)


async def _push(job: dict, ev: dict):
    async with job["changed"]:
        job["events"].append(ev)
        job["changed"].notify_all()


async def follow(job_id: str, after: int = 0) -> AsyncIterator[dict]:
    """The job's events from index `after`, then live ones until it ends."""
    job = _jobs.get(job_id)
    if not job:
        yield event("error", message="This job is no longer available.")
        return
    i = after
    while True:
        async with job["changed"]:
            while i >= len(job["events"]) and not job["done"]:
                await job["changed"].wait()
            batch = job["events"][i:]
        for ev in batch:
            yield ev
        i += len(batch)
        if job["done"] and i >= len(job["events"]):
            return


def running(kind: str, ref: str) -> str | None:
    """The id of a live job of this kind for `ref`, if one is running."""
    return next((jid for jid, j in _jobs.items() if j["kind"] == kind and j["ref"] == ref and not j["done"]), None)


def live(job_id: str) -> bool:
    return job_id in _jobs


def _prune():
    now = time.monotonic()
    for jid in [jid for jid, j in _jobs.items() if j["done"] and now - j["finished"] > KEEP_S]:
        del _jobs[jid]
