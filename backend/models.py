from config import settings
from ollama import Client

_capabilities: dict[str, list[str]] = {}


def capabilities(model: str) -> list[str]:
    """What Ollama says a model can do, e.g. "tools", "thinking", "vision"."""
    if model not in _capabilities:
        try:
            caps = Client(host=settings.ollama_url).show(model).capabilities or []
        except Exception:  # not pulled, or Ollama is down: no extras, and ask again next time
            return []
        _capabilities[model] = list(caps)
    return _capabilities[model]
