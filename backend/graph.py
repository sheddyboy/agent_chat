import logging
from typing import Annotated, TypedDict

from config import settings
from guard import injection_score
from langchain_core.messages import AIMessage, ToolMessage
from langchain_ollama import ChatOllama
from langgraph.config import get_stream_writer
from langgraph.graph import END, START, StateGraph
from langgraph.graph.message import add_messages
from langgraph.prebuilt import ToolNode, tools_condition
from langgraph.types import Command, interrupt
from tools import ALL_TOOLS, SENSITIVE_TOOLS

logger = logging.getLogger(__name__)


class ChatState(TypedDict, total=False):
    messages: Annotated[list, add_messages]
    model: str


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
    # reasoning=False keeps qwen3's thinking text out of the token stream
    llm = ChatOllama(
        model=state.get("model", settings.default_model),
        base_url=settings.ollama_url,
        reasoning=False,
    ).bind_tools(ALL_TOOLS)
    return {"messages": [llm.invoke(state.get("messages", []))]}


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
