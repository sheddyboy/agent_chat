import logging
from typing import Annotated, TypedDict

from core.config import settings
from guardrails.check import check_input
from images.store import image_block, image_path
from langchain_core.messages import AIMessage, HumanMessage, SystemMessage, ToolMessage
from langchain_ollama import ChatOllama
from langgraph.config import get_stream_writer
from langgraph.graph import END, START, StateGraph
from langgraph.graph.message import add_messages
from langgraph.prebuilt import ToolNode, tools_condition
from langgraph.types import Command, interrupt
from tools import ALL_TOOLS, SENSITIVE_TOOLS

from agent.models import capabilities

logger = logging.getLogger(__name__)


def merge_attachments(old: list[dict], new: list[dict]) -> list[dict]:
    """Attachments only accumulate on a thread; the same doc twice is kept once."""
    seen = {a["doc_id"] for a in old}
    return old + [a for a in new if a["doc_id"] not in seen]


class ChatState(TypedDict, total=False):
    messages: Annotated[list, add_messages]
    model: str
    enabled_tools: list[str]
    think: bool
    attachments: Annotated[list[dict], merge_attachments]  # [{doc_id, name}]


def attachment_note(attachments: list[dict]) -> SystemMessage:
    names = ", ".join(a["name"] for a in attachments)
    # Small models skip the tool on vague asks ("what is this about?") unless told plainly
    return SystemMessage(
        f"The user attached these files to this chat: {names}. "
        "You cannot see their contents directly: the only way to read them is the search_documents tool. "
        "For any question about the files, call search_documents first, even for broad requests like "
        '"what is this about" or "summarize this" (search for the main topics, e.g. the file name or "overview"). '
        "Never say you lack access to the files. Cite sources inline as [n]."
    )


def with_images(messages: list, vision: bool) -> list:
    """Swap image ids on user messages for the images, or for placeholders if the model can't see.

    Only the copies sent to the model change; the checkpoint keeps the ids.
    """
    out = []
    for msg in messages:
        images = (
            msg.additional_kwargs.get("images")
            if isinstance(msg, HumanMessage)
            else None
        )
        if not images:
            out.append(msg)
            continue
        blocks, missing = [], []
        for image in images:
            path = image_path(image["image_id"])
            if vision and path:
                blocks.append(image_block(path))
            else:
                missing.append(f"[image: {image['name']}]")
        text = "\n".join([msg.text, *missing])
        content = [{"type": "text", "text": text}, *blocks] if blocks else text
        out.append(msg.model_copy(update={"content": content}))
    return out


def without_blocked(messages: list) -> list:
    """Drop blocked user messages and their refusals, so the model never reads them.

    Only the copies sent to the model change; the checkpoint keeps them for history.
    """
    return [
        msg
        for msg in messages
        if not (isinstance(msg, HumanMessage) and msg.additional_kwargs.get("guard", {}).get("blocked"))
        and not (isinstance(msg, AIMessage) and "guard_score" in msg.response_metadata)
    ]


def with_redactions(messages: list) -> list:
    """Swap user messages for their redacted text, so the model sees [CREDITCARDNUMBER], not the number.

    Only the copies sent to the model change; the checkpoint keeps what the user typed.
    """
    return [
        msg.model_copy(update={"content": redacted})
        if isinstance(msg, HumanMessage) and (redacted := msg.additional_kwargs.get("guard", {}).get("redacted"))
        else msg
        for msg in messages
    ]


def guard_event(finding: dict, blocked: bool) -> dict:
    return {
        "type": "guard",
        "blocked": blocked,
        "guard": finding["guard"],
        "action": finding["action"],
        "label": finding["label"],
        "score": round(finding["score"], 3),
    }


def guard_input(state: ChatState) -> Command:
    last = state.get("messages", [])[-1]
    result = check_input(last.text)
    hits = [f for f in result["findings"] if f["flagged"]]
    if not hits:
        return Command(goto="agent")
    # Stored on the message; a copy with the same id replaces it via add_messages
    flag = {"blocked": result["blocked"], "findings": result["findings"]}
    if result["text"] != last.text:
        flag["redacted"] = result["text"]
    writer = get_stream_writer()
    if not result["blocked"]:
        # Warn and redact guards only: the model still answers, the UI and history show the flag
        for hit in hits:
            logger.info("flagged by %s guard (%s %.3f)", hit["guard"], hit["label"], hit["score"])
            writer(guard_event(hit, blocked=False))
        flagged = last.model_copy(update={"additional_kwargs": {**last.additional_kwargs, "guard": flag}})
        return Command(goto="agent", update={"messages": [flagged]})
    hit = next(f for f in hits if f["action"] == "block")
    score = round(hit["score"], 3)
    logger.warning("blocked by %s guard (score %.3f): %r", hit["guard"], score, last.text[:200])
    writer(guard_event(hit, blocked=True))
    flagged = last.model_copy(
        update={"additional_kwargs": {**last.additional_kwargs, "guard": {**flag, "score": score}}}
    )
    # The refusal keeps thread history coherent: every user turn gets a reply.
    # guard_score is what history and without_blocked look for
    refusal = AIMessage(
        f"Blocked: this message was flagged by the {hit['guard']} guard ({hit['label']}).",
        response_metadata={"guard_score": score, "guard": hit["guard"], "guard_label": hit["label"]},
    )
    return Command(goto=END, update={"messages": [flagged, refusal]})


def agent(state: ChatState) -> dict:
    # reasoning=True moves thinking out of the answer into reasoning_content;
    # the frontend only sends think for models with Ollama's thinking capability
    model = state.get("model", settings.default_model)
    llm = ChatOllama(
        model=model,
        base_url=settings.ollama_url,
        num_ctx=settings.num_ctx,
        reasoning=state.get("think", False),
    )
    # No enabled_tools in state means the chat never chose, so all tools are on
    enabled = state.get("enabled_tools")
    tools = (
        ALL_TOOLS if enabled is None else [t for t in ALL_TOOLS if t.name in enabled]
    )
    messages = with_images(with_redactions(without_blocked(state.get("messages", []))), "vision" in capabilities(model))
    attachments = state.get("attachments", [])
    if attachments:
        messages = [attachment_note(attachments), *messages]
    elif settings.search_scope == "attachments":
        # Nothing to search in this chat, so don't offer the tool at all
        tools = [t for t in tools if t.name != "search_documents"]
    if tools:
        llm = llm.bind_tools(tools)
    return {"messages": [llm.invoke(messages)]}


def approval(state: ChatState) -> Command:
    calls = state.get("messages", [])[-1].tool_calls
    sensitive = [c for c in calls if c["name"] in SENSITIVE_TOOLS]
    if not sensitive:
        return Command(goto="tools")
    # Pauses the run; the value passed to Command(resume=...) comes back here
    if interrupt({"tool_calls": sensitive}) == "approve":
        return Command(goto="tools")
    # Every tool call needs a reply, so a reject answers all calls in the message
    rejected = [
        ToolMessage(
            "User rejected this tool call.", tool_call_id=c["id"], name=c["name"]
        )
        for c in calls
    ]
    return Command(goto="agent", update={"messages": rejected})


def build_graph(checkpointer=None):
    builder = StateGraph(ChatState)
    builder.add_node("guard_input", guard_input, destinations=("agent", END))
    builder.add_node("agent", agent)
    builder.add_node("approval", approval, destinations=("tools", "agent"))
    builder.add_node("tools", ToolNode(ALL_TOOLS))
    builder.add_edge(START, "guard_input")
    builder.add_conditional_edges(
        "agent", tools_condition, {"tools": "approval", END: END}
    )
    builder.add_edge("tools", "agent")
    return builder.compile(checkpointer=checkpointer)
