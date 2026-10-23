from typing import Literal

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env")

    ollama_url: str = "http://localhost:11434"
    default_model: str = "qwen3:8b"
    # Ollama models with tool support, offered in the model switcher
    chat_models: list[str] = [
        "qwen3:8b",
        "gpt-oss:latest",
        "llama3.1:8b",
    ]
    phoenix_endpoint: str = "http://localhost:6006/v1/traces"
    phoenix_project: str = "agent-chat"
    tavily_api_key: str = ""
    cors_origins: list[str] = ["http://localhost:3000"]

    qdrant_path: str = "qdrant_data"
    qdrant_collection: str = "documents"
    embedding_model: str = "qwen3-embedding:0.6b"
    sparse_model: str = "Qdrant/bm25"
    chunk_size: int = 1000
    chunk_overlap: int = 150
    upload_dir: str = "uploads"
    notes_dir: str = "notes"
    db_path: str = "app.db"  # LangGraph checkpoints plus our own tables

    mcp_config: str = "mcp_servers.json"
    mcp_workspace: str = (
        "workspace"  # must match the filesystem root in mcp_servers.json
    )

    # "attachments": a chat searches only its attached files (and has no search tool
    # without any). Evals use "all" to search the whole collection.
    search_scope: Literal["attachments", "all"] = "attachments"
    retrieval_k: int = 20
    rerank_top_n: int = 5
    rerank_model: str = "Xenova/ms-marco-MiniLM-L-6-v2"

    guard_model: str = "protectai/deberta-v3-base-prompt-injection-v2"
    guard_threshold: float = 0.9


settings = Settings()
