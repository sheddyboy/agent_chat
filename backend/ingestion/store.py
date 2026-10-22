from functools import lru_cache

from config import settings
from langchain_ollama import OllamaEmbeddings
from langchain_qdrant import FastEmbedSparse, QdrantVectorStore, RetrievalMode
from qdrant_client import QdrantClient, models

DENSE = "dense"
SPARSE = "sparse"


@lru_cache
def client() -> QdrantClient:
    # Local mode: data lives in a folder, locked to this one process
    return QdrantClient(path=settings.qdrant_path)


@lru_cache
def vector_store() -> QdrantVectorStore:
    embedding = OllamaEmbeddings(
        model=settings.embedding_model, base_url=settings.ollama_url
    )
    if not client().collection_exists(settings.qdrant_collection):
        client().create_collection(
            settings.qdrant_collection,
            vectors_config={
                DENSE: models.VectorParams(
                    size=len(embedding.embed_query("dimension probe")),
                    distance=models.Distance.COSINE,
                )
            },
            # BM25 needs IDF applied by Qdrant at query time
            sparse_vectors_config={
                SPARSE: models.SparseVectorParams(modifier=models.Modifier.IDF)
            },
        )
    return QdrantVectorStore(
        client=client(),
        collection_name=settings.qdrant_collection,
        embedding=embedding,
        sparse_embedding=FastEmbedSparse(model_name=settings.sparse_model),
        retrieval_mode=RetrievalMode.HYBRID,
        vector_name=DENSE,
        sparse_vector_name=SPARSE,
    )


def count(doc_id: str) -> int:
    vector_store()  # make sure the collection exists
    doc_filter = models.Filter(
        must=[
            models.FieldCondition(
                key="metadata.doc_id", match=models.MatchValue(value=doc_id)
            )
        ]
    )
    return client().count(settings.qdrant_collection, count_filter=doc_filter).count
