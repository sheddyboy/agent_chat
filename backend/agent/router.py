from core.config import settings
from fastapi import APIRouter
from agent.models import capabilities
from tools import ALL_TOOLS, SENSITIVE_TOOLS

# /models and /tools share no prefix, so this router has none
router = APIRouter(tags=["catalog"])


@router.get("/models")
def models():
    return {
        "models": [
            {
                "name": m,
                "thinking": "thinking" in capabilities(m),
                "vision": "vision" in capabilities(m),
            }
            for m in settings.chat_models
        ],
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
