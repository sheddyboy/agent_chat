import asyncio
from contextlib import asynccontextmanager

import core.tracing  # noqa: F401  registers Phoenix before any route runs
from core.config import settings
from core.db import init_db
from documents import store as documents_store
from documents.router import router as documents_router
from jobs import store as jobs_store
from images.router import router as images_router
from jobs.router import router as jobs_router
from resume.router import router as resume_router
from threads import store as threads_store
from threads.router import router as threads_router
from voice.router import router as voice_router
from weather import places
from weather.router import router as weather_router
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from graph import build_graph
from langgraph.checkpoint.sqlite.aio import AsyncSqliteSaver
import scheduler
from routes import briefing, catalog, chat, overview
from tools import ALL_TOOLS
from tools.mcp_loader import load_mcp_tools


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db(threads_store.init, documents_store.init, places.init, jobs_store.init)
    # MCP tools join ALL_TOOLS before the graph builds its ToolNode
    ALL_TOOLS.extend(await load_mcp_tools())
    async with AsyncSqliteSaver.from_conn_string(settings.db_path) as saver:
        # Routes read it from request.app.state.graph
        app.state.graph = build_graph(saver)
        # The scheduled morning briefing, checked once a minute
        tick = asyncio.create_task(scheduler.loop(app.state.graph))
        yield
        tick.cancel()


# FastAPI traces every request by default; we only want the LLM spans in Phoenix
app = FastAPI(lifespan=lifespan, telemetry={"tracing": False})
# The frontend calls the API directly; a Next proxy could buffer the SSE stream
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_methods=["*"],
    allow_headers=["*"],
)

ROUTERS = (
    chat.router,
    threads_router,
    documents_router,
    images_router,
    catalog.router,
    voice_router,
    briefing.router,
    overview.router,
    resume_router,
    weather_router,
    jobs_router,
)
for router in ROUTERS:
    app.include_router(router)
