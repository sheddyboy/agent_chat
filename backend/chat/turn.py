from core.config import settings
from core.tracing import tracer
from langchain_core.messages import HumanMessage
from langgraph.types import Command
from pydantic import BaseModel
from threads.store import get_thread, touch_thread

from chat.stream import stream_graph


class ImageRef(BaseModel):
    image_id: str
    name: str


class ChatRequest(BaseModel):
    message: str
    model: str | None = None
    thread_id: str | None = None
    enabled_tools: list[str] | None = None
    think: bool = False
    attachments: list[str] | None = None  # doc_ids from the library, added to the thread
    images: list[ImageRef] | None = None  # from POST /images, belong to this message only


async def stream_chat(graph, req: ChatRequest, attachments: list[dict], images: list[dict]):
    thread_id = req.thread_id
    is_new = get_thread(thread_id) is None
    touch_thread(thread_id, req.message[:60])  # placeholder title until make_title's
    with tracer.start_as_current_span("chat", openinference_span_kind="chain") as span:
        span.set_input(req.message)
        input = {
            # The turn's attachments ride on the message so history can show them per turn.
            # Images are only ids here; the agent node reads the files just before the model call
            "messages": [
                HumanMessage(req.message, additional_kwargs={"attachments": attachments, "images": images})
            ],
            "attachments": attachments,
            "model": req.model or settings.default_model,
            "think": req.think,
        }
        # Left out when None so the thread keeps its earlier choice
        if req.enabled_tools is not None:
            input["enabled_tools"] = req.enabled_tools
        async for ev in stream_graph(graph, input, thread_id, span, req.message if is_new else None):
            yield ev


async def stream_resume(graph, thread_id: str, action: str):
    touch_thread(thread_id, "")  # the row exists, so this only bumps updated_at
    with tracer.start_as_current_span("resume", openinference_span_kind="chain") as span:
        span.set_input(action)
        async for ev in stream_graph(graph, Command(resume=action), thread_id, span):
            yield ev
