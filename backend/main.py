import time

from config import settings
from events import event
from fastapi import FastAPI
from graph import build_graph
from langchain_core.messages import AIMessageChunk, HumanMessage
from phoenix.otel import register
from pydantic import BaseModel
from sse_starlette.sse import EventSourceResponse

tracer_provider = register(
    project_name=settings.phoenix_project,
    endpoint=settings.phoenix_endpoint,
    auto_instrument=True,
)
tracer = tracer_provider.get_tracer(__name__)

graph = build_graph()
# FastAPI traces every request by default; we only want the LLM spans in Phoenix
app = FastAPI(telemetry={"tracing": False})


class ChatRequest(BaseModel):
    message: str
    model: str | None = None
    thread_id: str | None = None  # unused until the checkpointer lands


async def stream_chat(req: ChatRequest):
    with tracer.start_as_current_span("chat", openinference_span_kind="chain") as span:
        span.set_input(req.message)
        trace_id = format(span.get_span_context().trace_id, "032x")
        state = {
            "messages": [HumanMessage(req.message)],
            "model": req.model or settings.default_model,
        }
        tool_starts = {}  # tool_call id -> monotonic start time
        answer = ""
        try:
            async for mode, chunk in graph.astream(
                input={"messages": state["messages"], "model": state["model"]},
                stream_mode=["messages", "updates"],
            ):
                if mode == "messages":
                    msg, _meta = chunk
                    if isinstance(msg, AIMessageChunk) and msg.text:
                        answer += msg.text
                        yield event("token", text=msg.text)
                elif not isinstance(chunk, dict):
                    continue
                elif "agent" in chunk:
                    for call in chunk["agent"]["messages"][-1].tool_calls:
                        tool_starts[call["id"]] = time.monotonic()
                        yield event(
                            "tool_start", id=call["id"], name=call["name"], args=call["args"]
                        )
                elif "tools" in chunk:
                    for msg in chunk["tools"]["messages"]:
                        start = tool_starts.pop(msg.tool_call_id, time.monotonic())
                        yield event(
                            "tool_end",
                            id=msg.tool_call_id,
                            name=msg.name,
                            output=str(msg.content)[:500],
                            ms=round((time.monotonic() - start) * 1000),
                        )
        except Exception as e:
            span.record_exception(e)
            yield event("error", message=str(e))
        span.set_output(answer)
        yield event("done", trace_id=trace_id)


@app.post("/chat")
async def chat(req: ChatRequest):
    return EventSourceResponse(stream_chat(req))
