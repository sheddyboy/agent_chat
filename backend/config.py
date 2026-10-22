from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env")

    ollama_url: str = "http://localhost:11434"
    default_model: str = "qwen3:8b"
    phoenix_endpoint: str = "http://localhost:6006/v1/traces"
    phoenix_project: str = "agent-chat"


settings = Settings()
