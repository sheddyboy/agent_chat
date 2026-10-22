from typing import Annotated, TypedDict

from config import settings
from langchain_ollama import ChatOllama
from langgraph.graph import END, START, StateGraph
from langgraph.graph.message import add_messages


class ChatState(TypedDict):
    messages: Annotated[list, add_messages]
    model: str


def agent(state: ChatState) -> dict:
    # reasoning=False keeps qwen3's thinking text out of the token stream
    llm = ChatOllama(
        model=state["model"], base_url=settings.ollama_url, reasoning=False
    )
    return {"messages": [llm.invoke(state["messages"])]}


def build_graph():
    builder = StateGraph(ChatState)
    builder.add_node("agent", agent)
    builder.add_edge(START, "agent")
    builder.add_edge("agent", END)
    return builder.compile()
