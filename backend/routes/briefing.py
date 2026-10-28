import re
from datetime import datetime

from briefing import as_text, collect, render, save_as_thread, write_briefing
from db import delete_thread, get_briefing, list_briefings, save_briefing
from fastapi import APIRouter, HTTPException, Request
from fastapi.concurrency import run_in_threadpool
from tracing import tracer

router = APIRouter(prefix="/briefing", tags=["briefing"])

# save_as_thread writes 4 messages: the ask, the tool call, the data and the briefing
BRIEFING_MESSAGES = 4


def make_briefing() -> tuple[dict, str, str]:
    with tracer.start_as_current_span("briefing", openinference_span_kind="chain") as span:
        data = collect()
        text_in = as_text(data)
        span.set_input(text_in)
        text = write_briefing(text_in)
        span.set_output(text)
    return data, text_in, text


def shown(row: dict) -> dict:
    return render(row["day"], row["created_at"], row["thread_id"], row["data"], row["text"])


@router.post("")
async def briefing(request: Request):
    # Google and Ollama calls block, so they run off the event loop
    data, text_in, text = await run_in_threadpool(make_briefing)
    graph = request.app.state.graph
    thread_id = await save_as_thread(graph, text_in, text)
    day = f"{datetime.now():%Y-%m-%d}"
    replaced = get_briefing(day)
    save_briefing(day, thread_id, data, text)
    # A regenerated briefing's old chat goes too, unless it holds follow-up questions
    if replaced:
        state = await graph.aget_state({"configurable": {"thread_id": replaced["thread_id"]}})
        if len(state.values.get("messages", [])) <= BRIEFING_MESSAGES:
            await graph.checkpointer.adelete_thread(replaced["thread_id"])
            delete_thread(replaced["thread_id"])
    return shown(get_briefing(day))


@router.get("")
def briefings():
    return list_briefings()


@router.get("/{day}")
def one(day: str):
    if day == "today":
        day = f"{datetime.now():%Y-%m-%d}"
    if not re.fullmatch(r"\d{4}-\d{2}-\d{2}", day):
        raise HTTPException(400, "day is today or YYYY-MM-DD")
    row = get_briefing(day)
    if not row:
        raise HTTPException(404, "no briefing for that day")
    return shown(row)
