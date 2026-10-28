from contextlib import asynccontextmanager

import tracing  # noqa: F401  registers Phoenix before any route runs
from config import settings
from db import init_db
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from graph import build_graph
from langgraph.checkpoint.sqlite.aio import AsyncSqliteSaver
from routes import briefing, catalog, chat, documents, images, overview, resume, threads, voice, weather
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
        yield


# FastAPI traces every request by default; we only want the LLM spans in Phoenix
app = FastAPI(lifespan=lifespan, telemetry={"tracing": False})
# The frontend calls the API directly; a Next proxy could buffer the SSE stream
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_methods=["*"],
    allow_headers=["*"],
)

for module in (chat, threads, documents, images, catalog, voice, briefing, overview, resume, weather):
    app.include_router(module.router)
