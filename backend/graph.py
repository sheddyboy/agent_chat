from typing import Annotated, TypedDict

from config import settings
from langchain_ollama import ChatOllama
from langgraph.graph import START, StateGraph
from langgraph.graph.message import add_messages
from langgraph.prebuilt import ToolNode, tools_condition
from tools import ALL_TOOLS


class ChatState(TypedDict, total=False):
    messages: Annotated[list, add_messages]
    model: str


def agent(state: ChatState) -> dict:
    # reasoning=False keeps qwen3's thinking text out of the token stream
    llm = ChatOllama(
        model=state.get("model", settings.default_model),
        base_url=settings.ollama_url,
        reasoning=False,
    ).bind_tools(ALL_TOOLS)
    return {"messages": [llm.invoke(state.get("messages", []))]}


def build_graph():
    builder = StateGraph(ChatState)
    builder.add_node("agent", agent)
    builder.add_node("tools", ToolNode(ALL_TOOLS))
    builder.add_edge(START, "agent")
    builder.add_conditional_edges("agent", tools_condition)
    builder.add_edge("tools", "agent")
    return builder.compile()
