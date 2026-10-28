import uuid
from typing import Literal

from jobs import runner
from core.config import settings
from core.db import get_document, get_thread, touch_thread
from fastapi import APIRouter, HTTPException, Request
from images.store import image_path
from langchain_core.messages import HumanMessage
from langgraph.types import Command
from pydantic import BaseModel
from sse_starlette.sse import EventSourceResponse
from stream import stream_graph
from core.tracing import tracer

router = APIRouter(prefix="/chat", tags=["chat"])


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


class ResumeRequest(BaseModel):
    action: Literal["approve", "reject"]


def ready_attachments(doc_ids: list[str]) -> list[dict]:
    """Look up attached docs; names come from the library, never from the client."""
    attachments = []
    for doc_id in doc_ids:
        doc = get_document(doc_id)
        if not doc or doc["status"] != "ready":
            raise HTTPException(400, f"document {doc_id} is not ready")
        attachments.append({"doc_id": doc_id, "name": doc["name"]})
    return attachments


def stored_images(images: list[ImageRef]) -> list[dict]:
    for image in images:
        if not image_path(image.image_id):
            raise HTTPException(400, f"image {image.image_id} not found")
    return [image.model_dump() for image in images]


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


@router.post("")
async def chat(req: ChatRequest, request: Request):
    # Checked before streaming starts, so a bad id is a plain 400
    attachments = ready_attachments(req.attachments or [])
    images = stored_images(req.images or [])
    # Fixed here, so the job's first event can give a new chat its id (and URL) at once
    req = req.model_copy(update={"thread_id": req.thread_id or str(uuid.uuid4())})
    return start_turn(req.thread_id, stream_chat(request.app.state.graph, req, attachments, images))


@router.post("/{thread_id}/resume")
async def resume(thread_id: str, req: ResumeRequest, request: Request):
    graph = request.app.state.graph
    state = await graph.aget_state({"configurable": {"thread_id": thread_id}})
    if not state.interrupts:
        raise HTTPException(409, "no pending approval on this thread")
    return start_turn(thread_id, stream_resume(graph, thread_id, req.action))


def start_turn(thread_id: str, events) -> EventSourceResponse:
    """Run the turn as a job, so the answer keeps going if the page closes, and follow it."""
    if runner.running("chat", thread_id):
        raise HTTPException(409, "an answer is still being written in this chat")
    return EventSourceResponse(runner.follow(runner.start("chat", thread_id, events)))
