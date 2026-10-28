from documents.ingestion.store import vector_store
from langchain_core.documents import Document
from qdrant_client import models


def hybrid_search(query: str, k: int, doc_ids: list[str] | None = None) -> list[tuple[Document, float]]:
    """Dense + BM25 in one Qdrant query, fused with RRF (the store is in HYBRID mode).
    With doc_ids, only chunks of those documents are searched."""
    only = None
    if doc_ids is not None:
        only = models.Filter(
            must=[models.FieldCondition(key="metadata.doc_id", match=models.MatchAny(any=doc_ids))]
        )
    return vector_store().similarity_search_with_score(query, k=k, filter=only)
