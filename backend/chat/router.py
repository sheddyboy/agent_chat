import uuid
from typing import Literal

from documents.store import get_document
from fastapi import APIRouter, HTTPException, Request
from images.store import image_path
from jobs import runner
from pydantic import BaseModel
from sse_starlette.sse import EventSourceResponse

from chat.turn import ChatRequest, ImageRef, stream_chat, stream_resume

router = APIRouter(prefix="/chat", tags=["chat"])


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
