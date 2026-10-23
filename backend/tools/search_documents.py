from typing import Annotated

from config import settings
from langchain_core.tools import tool
from langgraph.config import get_stream_writer
from langgraph.prebuilt import InjectedState
from retrieval.hybrid import hybrid_search
from retrieval.rerank import rerank


@tool(response_format="content_and_artifact")
def search_documents(
    query: str, state: Annotated[dict, InjectedState]
) -> tuple[str, list[dict]]:
    """Search the user's uploaded documents. Use this for any question about their files or PDFs."""
    # The chat's attachments come from graph state; the model never sees this argument
    doc_ids = None
    if settings.search_scope == "attachments":
        doc_ids = [a["doc_id"] for a in state.get("attachments", [])]
        if not doc_ids:
            return "No documents are attached to this chat.", []
    candidates = [doc for doc, _score in hybrid_search(query, settings.retrieval_k, doc_ids)]
    if not candidates:
        return "No documents found.", []

    hits = []
    for doc, score in rerank(query, candidates, settings.rerank_top_n):
        page = doc.metadata.get("page")
        hits.append(
            {
                "doc": doc.metadata.get("doc"),
                "doc_id": doc.metadata.get("doc_id"),
                # pymupdf4llm pages are 0-indexed
                "page": page + 1 if page is not None else None,
                "score": round(float(score), 3),
                "text": doc.page_content,
            }
        )
    get_stream_writer()({"type": "retrieval", "query": query, "hits": hits})

    blocks = [f"[{i}] {h['doc']} p.{h['page']}\n{h['text']}" for i, h in enumerate(hits, 1)]
    content = "\n\n".join(blocks) + "\n\nCite sources inline as [n]."
    return content, hits
