import shutil
import time
import uuid
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Literal

from config import settings
from events import event
from fastapi import FastAPI, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from graph import build_graph
from ingestion.pipeline import ingest
from ingestion.store import count
from langchain_core.messages import AIMessageChunk, HumanMessage
from langgraph.checkpoint.sqlite.aio import AsyncSqliteSaver
from langgraph.types import Command
from phoenix.otel import register
from pydantic import BaseModel
from sse_starlette.sse import EventSourceResponse
from tools import ALL_TOOLS, SENSITIVE_TOOLS
from tools.mcp_loader import load_mcp_tools

tracer_provider = register(
    project_name=settings.phoenix_project,
    endpoint=settings.phoenix_endpoint,
    auto_instrument=True,
)
tracer = tracer_provider.get_tracer(__name__)

graph = None  # built in lifespan once the checkpointer is open


@asynccontextmanager
async def lifespan(_app: FastAPI):
    global graph
    # MCP tools join ALL_TOOLS before the graph builds its ToolNode
    ALL_TOOLS.extend(await load_mcp_tools())
    async with AsyncSqliteSaver.from_conn_string(settings.checkpoint_db) as saver:
        graph = build_graph(saver)
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


class ChatRequest(BaseModel):
    message: str
    model: str | None = None
    thread_id: str | None = None
    enabled_tools: list[str] | None = None


class ResumeRequest(BaseModel):
    action: Literal["approve", "reject"]


async def stream_graph(input, thread_id: str, span):
    """Run the graph on a thread and turn its stream into SSE events."""
    trace_id = format(span.get_span_context().trace_id, "032x")
    # Groups a chat and its resumes into one Phoenix session
    span.set_attribute("session.id", thread_id)
    tool_starts = {}  # tool_call id -> monotonic start time
    # After a resume the tool_start happened in an earlier request
    stream_start = time.monotonic()
    answer = ""
    try:
        async for mode, chunk in graph.astream(  # pyright: ignore[reportOptionalMemberAccess]
            input=input,
            config={"configurable": {"thread_id": thread_id}},
            stream_mode=["messages", "updates", "custom", "tasks"],
        ):
            if mode == "tasks":
                # Task results also arrive here; only starts lack a "result" key
                if "result" not in chunk:
                    yield event("node_start", node=chunk["name"])  # pyright: ignore[reportArgumentType]
            elif mode == "custom":
                # Tools emit fully formed events via get_stream_writer()
                yield event(**chunk)  # pyright: ignore[reportCallIssue]
            elif mode == "messages":
                msg, _meta = chunk
                if not isinstance(msg, AIMessageChunk):
                    continue
                if reasoning := msg.additional_kwargs.get("reasoning_content"):
                    yield event("reasoning", text=reasoning)
                if msg.text:
                    answer += msg.text
                    yield event("token", text=msg.text)
            elif not isinstance(chunk, dict):
                continue
            elif "__interrupt__" in chunk:
                yield event(
                    "interrupt",
                    tool_calls=chunk["__interrupt__"][0].value["tool_calls"],
                    thread_id=thread_id,
                )
            elif "agent" in chunk:
                for call in chunk["agent"]["messages"][-1].tool_calls:
                    tool_starts[call["id"]] = time.monotonic()
                    yield event(
                        "tool_start",
                        id=call["id"],
                        name=call["name"],
                        args=call["args"],
                    )
            # "approval" only carries messages when the user rejected
            elif chunk.get("tools") or chunk.get("approval"):
                node = "tools" if "tools" in chunk else "approval"
                for msg in chunk[node]["messages"]:
                    start = tool_starts.pop(msg.tool_call_id, stream_start)
                    yield event(
                        "tool_end",
                        id=msg.tool_call_id,
                        name=msg.name,
                        output=msg.text[:500],  # .text also flattens MCP content blocks
                        ms=round((time.monotonic() - start) * 1000),
                    )
    except Exception as e:
        span.record_exception(e)
        yield event("error", message=str(e))
    span.set_output(answer)
    yield event("done", trace_id=trace_id, thread_id=thread_id)


async def stream_chat(req: ChatRequest):
    thread_id = req.thread_id or str(uuid.uuid4())
    with tracer.start_as_current_span("chat", openinference_span_kind="chain") as span:
        span.set_input(req.message)
        input = {
            "messages": [HumanMessage(req.message)],
            "model": req.model or settings.default_model,
        }
        # Left out when None so the thread keeps its earlier choice
        if req.enabled_tools is not None:
            input["enabled_tools"] = req.enabled_tools
        async for ev in stream_graph(input, thread_id, span):
            yield ev


async def stream_resume(thread_id: str, action: str):
    with tracer.start_as_current_span("resume", openinference_span_kind="chain") as span:
        span.set_input(action)
        async for ev in stream_graph(Command(resume=action), thread_id, span):
            yield ev


@app.get("/models")
def models():
    return {"models": settings.chat_models, "default": settings.default_model}


@app.get("/tools")
def tools():
    return [
        {
            "name": t.name,
            "description": t.description,
            "group": (t.metadata or {}).get("server", "local"),
            "sensitive": t.name in SENSITIVE_TOOLS,
        }
        for t in ALL_TOOLS
    ]


@app.post("/chat")
async def chat(req: ChatRequest):
    return EventSourceResponse(stream_chat(req))


@app.post("/chat/{thread_id}/resume")
async def resume(thread_id: str, req: ResumeRequest):
    state = await graph.aget_state({"configurable": {"thread_id": thread_id}})  # pyright: ignore[reportOptionalMemberAccess]
    if not state.interrupts:
        raise HTTPException(409, "no pending approval on this thread")
    return EventSourceResponse(stream_resume(thread_id, req.action))


async def stream_ingest(path: Path, doc_name: str):
    with tracer.start_as_current_span(
        "ingest", openinference_span_kind="chain"
    ) as span:
        span.set_input(doc_name)
        trace_id = format(span.get_span_context().trace_id, "032x")
        try:
            async for ev in ingest(str(path), doc_name):
                yield ev
        except Exception as e:
            span.record_exception(e)
            yield event("error", message=str(e))
        yield event("done", trace_id=trace_id)


@app.post("/documents")
async def upload_document(file: UploadFile):
    if not file.filename:
        raise HTTPException(400, "file has no filename")
    upload_dir = Path(settings.upload_dir)
    upload_dir.mkdir(exist_ok=True)
    path = upload_dir / Path(file.filename).name
    with path.open("wb") as out:
        shutil.copyfileobj(file.file, out)
    return EventSourceResponse(stream_ingest(path, path.name))


@app.get("/documents/{doc_id}")
def document_info(doc_id: str):
    return {"doc_id": doc_id, "chunks": count(doc_id)}
