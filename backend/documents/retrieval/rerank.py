from functools import lru_cache

from core.config import settings
from fastembed.rerank.cross_encoder import TextCrossEncoder
from langchain_core.documents import Document


@lru_cache
def reranker() -> TextCrossEncoder:
    return TextCrossEncoder(settings.rerank_model)


def rerank(query: str, docs: list[Document], top_n: int) -> list[tuple[Document, float]]:
    scores = reranker().rerank(query, [d.page_content for d in docs])
    ranked = sorted(zip(docs, scores), key=lambda pair: pair[1], reverse=True)
    return ranked[:top_n]
