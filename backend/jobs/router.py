from jobs import runner
from jobs.store import get_job, list_jobs
from fastapi import APIRouter, HTTPException
from sse_starlette.sse import EventSourceResponse

router = APIRouter(prefix="/jobs", tags=["jobs"])


@router.get("")
def find(kind: str | None = None, ref: str | None = None, status: str | None = None):
    """Recent jobs, newest first; `?kind=chat&ref={thread}&status=running` finds one to reattach to."""
    return list_jobs(kind, ref, status)


@router.get("/{job_id}")
def one(job_id: str):
    job = get_job(job_id)
    if not job:
        raise HTTPException(404, "no such job")
    return {**job, "followable": runner.live(job_id)}


@router.get("/{job_id}/events")
def events(job_id: str, after: int = 0):
    """Every event so far from `after`, then live ones until the job ends."""
    if not runner.live(job_id):
        raise HTTPException(404, "job finished too long ago or never ran here")
    return EventSourceResponse(runner.follow(job_id, after))
