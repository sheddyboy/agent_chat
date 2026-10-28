"""Starts the morning briefing at `briefing_at`, so it is ready before any page opens (18c)."""

import asyncio
import logging
from datetime import datetime

from jobs import runner
from briefing.compose import run, today_key
from core.config import settings
from briefing.store import get_briefing

logger = logging.getLogger(__name__)

TICK_S = 60


def due(now: datetime) -> bool:
    return bool(settings.briefing_at) and f"{now:%H:%M}" >= settings.briefing_at


async def loop(graph):
    """Checks once a minute; after `briefing_at`, writes today's briefing unless one exists or runs."""
    while True:
        try:
            day = today_key()
            if due(datetime.now()) and not get_briefing(day) and not runner.running("briefing", day):
                logger.info("scheduler: writing the briefing for %s", day)
                runner.start("briefing", day, run(graph))
        except Exception:
            logger.exception("scheduler tick failed")
        await asyncio.sleep(TICK_S)
