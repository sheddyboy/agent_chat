import logging
from typing import Annotated, TypedDict

from config import settings
from guard import injection_score
from langchain_core.messages import AIMessage, SystemMessage, ToolMessage
from langchain_ollama import ChatOllama
from langgraph.config import get_stream_writer
from langgraph.graph import END, START, StateGraph
from langgraph.graph.message import add_messages
from langgraph.prebuilt import ToolNode, tools_condition
from langgraph.types import Command, interrupt
from tools import ALL_TOOLS, SENSITIVE_TOOLS

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
    return SystemMessage(
        f"The user attached these files to this chat: {names}. "
        "Use search_documents to answer questions about them, and cite sources inline as [n]."
    )


def guard_input(state: ChatState) -> Command:
    text = state.get("messages", [])[-1].text
    score = injection_score(text)
    if score < settings.guard_threshold:
        return Command(goto="agent")
    logger.warning("blocked prompt injection (score %.3f): %r", score, text[:200])
    get_stream_writer()({"type": "guard", "blocked": True, "score": round(score, 3)})
    # The refusal keeps thread history coherent: every user turn gets a reply
    refusal = AIMessage(
        "Blocked: this message looks like a prompt-injection attempt.",
        response_metadata={"guard_score": round(score, 3)},
    )
    return Command(goto=END, update={"messages": [refusal]})


def agent(state: ChatState) -> dict:
    # reasoning=True moves thinking out of the answer into reasoning_content;
    # the frontend only sends think for models with Ollama's thinking capability
    llm = ChatOllama(
        model=state.get("model", settings.default_model),
        base_url=settings.ollama_url,
        reasoning=state.get("think", False),
    )
    # No enabled_tools in state means the chat never chose, so all tools are on
    enabled = state.get("enabled_tools")
    tools = ALL_TOOLS if enabled is None else [t for t in ALL_TOOLS if t.name in enabled]
    messages = state.get("messages", [])
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
        ToolMessage("User rejected this tool call.", tool_call_id=c["id"], name=c["name"])
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
    builder.add_conditional_edges("agent", tools_condition, {"tools": "approval", END: END})
    builder.add_edge("tools", "agent")
    return builder.compile(checkpointer=checkpointer)
