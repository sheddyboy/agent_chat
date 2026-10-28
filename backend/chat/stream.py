import time

from threads.store import set_title
from core.events import event
from langchain_core.messages import AIMessageChunk
from openinference.instrumentation import using_session
from chat.titles import make_title


async def stream_graph(graph, input, thread_id: str, span, first_message: str | None = None):
    """Run the graph on a thread and turn its stream into SSE events.

    `first_message` is set on a thread's first turn, which also gets a title.
    """
    trace_id = format(span.get_span_context().trace_id, "032x")
    # Groups a chat and its resumes into one Phoenix session
    span.set_attribute("session.id", thread_id)
    tool_starts = {}  # tool_call id -> monotonic start time
    # After a resume the tool_start happened in an earlier request
    stream_start = time.monotonic()
    answer = ""
    blocked = False
    redacted = False
    try:
        # Root span is already open, so this tags the LLM and tool spans under it
        with using_session(thread_id):
            async for mode, chunk in graph.astream(
                input=input,
                config={"configurable": {"thread_id": thread_id}},
                stream_mode=["messages", "updates", "custom", "tasks"],
            ):
                if mode == "tasks":
                    # Task results also arrive here; only starts lack a "result" key
                    if "result" not in chunk:
                        yield event("node_start", node=chunk["name"])
                elif mode == "custom":
                    # Tools emit fully formed events via get_stream_writer()
                    blocked = blocked or (chunk.get("type") == "guard" and chunk.get("blocked"))
                    redacted = redacted or (chunk.get("type") == "guard" and chunk.get("action") == "redact")
                    yield event(**chunk)
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
    # Before done, which the frontend expects to be last (an interrupt sits right before it)
    if first_message and redacted:
        # The title model reads what the agent read, not the raw numbers
        state = await graph.aget_state({"configurable": {"thread_id": thread_id}})
        first_message = state.values["messages"][0].additional_kwargs["guard"]["redacted"]
    if first_message and blocked:
        # The title model must not read it, and the placeholder title would echo it
        set_title(thread_id, "Blocked message")
        yield event("title", title="Blocked message", thread_id=thread_id)
    elif first_message and (title := await make_title(first_message)):
        set_title(thread_id, title)
        yield event("title", title=title, thread_id=thread_id)
    yield event("done", trace_id=trace_id, thread_id=thread_id)
