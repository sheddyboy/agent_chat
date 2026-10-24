from config import settings
from fastapi import APIRouter
from ollama import Client
from tools import ALL_TOOLS, SENSITIVE_TOOLS

# /models and /tools share no prefix, so this router has none
router = APIRouter(tags=["catalog"])


def can_think(client: Client, model: str) -> bool:
    try:
        return "thinking" in (client.show(model).capabilities or [])
    except Exception:  # not pulled, or Ollama is down: offer the model without thinking
        return False


@router.get("/models")
def models():
    client = Client(host=settings.ollama_url)
    return {
        "models": [{"name": m, "thinking": can_think(client, m)} for m in settings.chat_models],
        "default": settings.default_model,
    }


@router.get("/tools")
def tools():
    return [
        {
            "name": t.name,
            "description": t.description,
            "group": (t.metadata or {}).get("server", "local"),
            "sensitive": t.name in SENSITIVE_TOOLS,
        }
        for t in ALL_TOOLS
    ]
