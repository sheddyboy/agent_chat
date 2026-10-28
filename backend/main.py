import asyncio
from contextlib import asynccontextmanager

import core.tracing  # noqa: F401  registers Phoenix before any route runs
from core.config import settings
from core.db import init_db
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from graph import build_graph
from langgraph.checkpoint.sqlite.aio import AsyncSqliteSaver
import scheduler
from routes import briefing, catalog, chat, documents, images, jobs, overview, resume, threads, voice, weather
from tools import ALL_TOOLS
from tools.mcp_loader import load_mcp_tools


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
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

for module in (chat, threads, documents, images, catalog, voice, briefing, overview, resume, weather, jobs):
    app.include_router(module.router)
