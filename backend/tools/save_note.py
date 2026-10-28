import re
from pathlib import Path

from core.config import settings
from langchain_core.tools import tool


@tool
def save_note(title: str, content: str) -> str:
    """Save a markdown note to the user's notes folder. Needs user approval."""
    slug = re.sub(r"[^a-z0-9]+", "-", title.lower()).strip("-") or "note"
    path = Path(settings.notes_dir) / f"{slug}.md"
    path.parent.mkdir(exist_ok=True)
    path.write_text(f"# {title}\n\n{content}\n")
    return f"Saved to {path}"
