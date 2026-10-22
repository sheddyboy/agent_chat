from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env")

    ollama_url: str = "http://localhost:11434"
    default_model: str = "qwen3:8b"
    phoenix_endpoint: str = "http://localhost:6006/v1/traces"
    phoenix_project: str = "agent-chat"
    tavily_api_key: str = ""

    qdrant_path: str = "qdrant_data"
    qdrant_collection: str = "documents"
    embedding_model: str = "qwen3-embedding:0.6b"
    sparse_model: str = "Qdrant/bm25"
    chunk_size: int = 1000
    chunk_overlap: int = 150
    upload_dir: str = "uploads"

    retrieval_k: int = 20
    rerank_top_n: int = 5
    rerank_model: str = "Xenova/ms-marco-MiniLM-L-6-v2"


settings = Settings()
