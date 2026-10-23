from config import settings
from langchain_ollama import ChatOllama

PROMPT = """Write a short title (3 to 6 words) for a chat that starts with the message below.
Reply with the title only: no quotes, no trailing punctuation.

Message:
{message}"""


async def make_title(message: str) -> str:
    """A short sidebar title from the first user message; empty if the model fails."""
    llm = ChatOllama(model=settings.default_model, base_url=settings.ollama_url, reasoning=False)
    try:
        reply = await llm.ainvoke(PROMPT.format(message=message[:2000]))
    except Exception:
        return ""
    lines = reply.text.strip().splitlines()
    return lines[0].strip(" \"'*#.").strip()[:60] if lines else ""
