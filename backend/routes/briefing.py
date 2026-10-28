import re

from jobs import runner
from briefing import run, shown, today_key
from core.db import get_briefing, list_briefings
from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import JSONResponse
from sse_starlette.sse import EventSourceResponse

router = APIRouter(prefix="/briefing", tags=["briefing"])


@router.post("")
async def briefing(request: Request):
    """Write today's briefing as a job and follow it; a second call joins the running one."""
    day = today_key()
    job_id = runner.running("briefing", day) or runner.start("briefing", day, run(request.app.state.graph))
    return EventSourceResponse(runner.follow(job_id))


@router.get("")
def briefings():
    return list_briefings()


@router.get("/{day}")
def one(day: str):
    if day == "today":
        day = today_key()
    if not re.fullmatch(r"\d{4}-\d{2}-\d{2}", day):
        raise HTTPException(400, "day is today or YYYY-MM-DD")
    job_id = runner.running("briefing", day)
    row = get_briefing(day)
    if row:
        # job_id is set while a regenerate is running
        return {**shown(row), "job_id": job_id}
    if job_id:
        # Being written right now: follow the job instead of starting another
        return JSONResponse({"job_id": job_id}, status_code=202)
    raise HTTPException(404, "no briefing for that day")
