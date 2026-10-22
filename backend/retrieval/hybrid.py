from ingestion.store import vector_store
from langchain_core.documents import Document


def hybrid_search(query: str, k: int) -> list[tuple[Document, float]]:
    """Dense + BM25 in one Qdrant query, fused with RRF (the store is in HYBRID mode)."""
    return vector_store().similarity_search_with_score(query, k=k)
