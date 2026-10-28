from langchain_core.messages import AIMessage, HumanMessage, ToolMessage


def to_ui_messages(messages: list, interrupts, thread_id: str) -> list[dict]:
    """Rebuild the frontend's messages and SSE events from a checkpointed thread.

    Durations and trace ids are not in the checkpoint, so tool_end has no `ms`
    and done has no `trace_id`.
    """
    ui = []
    args = {}  # tool_call id -> args, so a search hit list can show its query
    for msg in messages:
        if isinstance(msg, HumanMessage):
            kwargs = msg.additional_kwargs
            ui.append(
                {
                    "role": "user",
                    "content": msg.text,
                    "events": [],
                    "attachments": kwargs.get("attachments", []),
                    "images": kwargs.get("images", []),
                }
            )
            # Warn guards let the turn through; their flag rides on the user message
            flag = kwargs.get("guard", {})
            warned = [] if flag.get("blocked") else [f for f in flag.get("findings", []) if f["flagged"]]
            events = [
                {"type": "guard", "blocked": False, "guard": f["guard"], "label": f["label"], "score": round(f["score"], 3)}
                for f in warned
            ]
            ui.append({"role": "assistant", "content": "", "events": events})
            continue
        if not ui:
            continue
        turn = ui[-1]
        events = turn["events"]
        if isinstance(msg, AIMessage):
            if reasoning := msg.additional_kwargs.get("reasoning_content"):
                events.append({"type": "reasoning", "text": reasoning})
            if "guard_score" in (meta := msg.response_metadata):
                # Threads blocked before guard names existed have only the score
                events.append(
                    {
                        "type": "guard",
                        "blocked": True,
                        "guard": meta.get("guard", "injection"),
                        "label": meta.get("guard_label", ""),
                        "score": meta["guard_score"],
                    }
                )
            for call in msg.tool_calls:
                args[call["id"]] = call["args"]
                events.append({"type": "tool_start", "id": call["id"], "name": call["name"], "args": call["args"]})
            turn["content"] += msg.text
        elif isinstance(msg, ToolMessage):
            if msg.name == "search_documents" and msg.artifact:
                query = args.get(msg.tool_call_id, {}).get("query", "")
                events.append({"type": "retrieval", "query": query, "hits": msg.artifact})
            if msg.name == "generate_image" and msg.artifact:
                events.append({"type": "image", **msg.artifact})
            events.append(
                {"type": "tool_end", "id": msg.tool_call_id, "name": msg.name, "output": msg.text[:500]}
            )

    for turn in ui:
        if turn["role"] == "assistant":
            turn["events"].append({"type": "done", "thread_id": thread_id})
    # A pending approval goes just before done, where the live stream puts it
    if interrupts and ui:
        ui[-1]["events"].insert(
            -1,
            {"type": "interrupt", "tool_calls": interrupts[0].value["tool_calls"], "thread_id": thread_id},
        )
    return ui
