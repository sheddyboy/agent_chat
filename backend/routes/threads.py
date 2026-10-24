from db import delete_thread, get_thread, list_threads
from fastapi import APIRouter, HTTPException, Request
from history import to_ui_messages

router = APIRouter(prefix="/threads", tags=["threads"])


@router.get("")
def threads(limit: int = 30, before: str | None = None):
    return list_threads(limit, before)


@router.get("/{thread_id}")
async def thread(thread_id: str, request: Request):
    row = get_thread(thread_id)
    if not row:
        raise HTTPException(404, "thread not found")
    state = await request.app.state.graph.aget_state({"configurable": {"thread_id": thread_id}})
    values = state.values
    return {
        **row,
        "model": values.get("model"),
        "enabled_tools": values.get("enabled_tools"),
        "think": values.get("think", False),
        "messages": to_ui_messages(values.get("messages", []), state.interrupts, thread_id),
    }


@router.delete("/{thread_id}")
async def remove_thread(thread_id: str, request: Request):
    await request.app.state.graph.checkpointer.adelete_thread(thread_id)
    delete_thread(thread_id)
    return {"deleted": thread_id}
