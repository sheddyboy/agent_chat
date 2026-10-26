import logging

import overview
from fastapi import APIRouter, HTTPException
from fastapi.concurrency import run_in_threadpool

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/overview", tags=["overview"])


async def run(widget):
    # Google and HTTP calls block, so they run off the event loop
    try:
        return await run_in_threadpool(widget)
    except Exception as e:
        logger.warning("overview: %s failed: %s", widget.__name__, e)
        raise HTTPException(502, f"{widget.__name__} unavailable ({type(e).__name__})")


@router.get("/schedule")
async def schedule():
    return await run(overview.schedule)


@router.get("/inbox")
async def inbox():
    return await run(overview.inbox)


@router.get("/weather")
async def weather():
    return await run(overview.weather)


@router.get("/status")
async def status():
    return await run(overview.status)
