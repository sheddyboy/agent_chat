from briefing import gather, save_as_thread, write_briefing
from fastapi import APIRouter, Request
from fastapi.concurrency import run_in_threadpool
from tracing import tracer

router = APIRouter(prefix="/briefing", tags=["briefing"])


def make_briefing() -> tuple[str, str]:
    with tracer.start_as_current_span("briefing", openinference_span_kind="chain") as span:
        data = gather()
        span.set_input(data)
        text = write_briefing(data)
        span.set_output(text)
    return data, text


@router.post("")
async def briefing(request: Request):
    # Google and Ollama calls block, so they run off the event loop
    data, text = await run_in_threadpool(make_briefing)
    return {"thread_id": await save_as_thread(request.app.state.graph, data, text)}
