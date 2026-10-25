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
        "qwen3-vl:8b",  # vision
    ]
    # Ollama defaults to 4096, which all tool schemas plus an image already overflow
    num_ctx: int = 8192
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
    image_dir: str = "uploads/images"  # chat images, sent to vision models, never ingested
    image_max_mb: int = 10
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

    stt_model: str = "nemo-parakeet-tdt-0.6b-v2"
    tts_voice: str = "af_heart"
    tts_speed: float = 1.0
    voice_dir: str = "voice_models"  # Kokoro files, downloaded on first /voice/speak

    image_model: str = "stabilityai/sdxl-turbo"  # about 7 GB, downloaded on first draw
    image_vae: str = "madebyollin/sdxl-vae-fp16-fix"  # stays in fp16, see imagegen.py
    image_steps: int = 2  # 1 to 4 for Turbo; 2 took about 1 s on an M4 Pro
    image_unload_after_s: int = 300  # free the memory once drawing goes idle

    # OAuth client from Google Cloud (Desktop app) and the token the login saves
    google_credentials: str = "secrets/credentials.json"
    google_token: str = "secrets/token.json"
    # Calendar free_slots only looks inside these hours, local time
    work_day_start: str = "09:00"
    work_day_end: str = "18:00"


settings = Settings()
