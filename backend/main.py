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
app = FastAPI()


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
        try:
            async for chunk, _meta in graph.astream(
                input={"messages": state["messages"], "model": state["model"]},
                stream_mode="messages",
            ):
                if isinstance(chunk, AIMessageChunk) and chunk.content:
                    yield event("token", text=chunk.content)
        except Exception as e:
            span.record_exception(e)
            yield event("error", message=str(e))
        yield event("done", trace_id=trace_id)


@app.post("/chat")
async def chat(req: ChatRequest):
    return EventSourceResponse(stream_chat(req))
