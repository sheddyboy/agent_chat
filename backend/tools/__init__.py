import shutil
from pathlib import Path

from core.config import settings
from integrations.google_auth import has_scope

from tools.calculator import calculator
from tools.datetime_tool import get_datetime
from images.tool import generate_image
from tools.save_note import save_note
from tools.search_documents import search_documents
from weather.tool import get_weather

ALL_TOOLS = [get_datetime, calculator, search_documents, save_note, generate_image, get_weather]

# Calls to these pause the run in the approval node until the user decides
SENSITIVE_TOOLS = {
    "save_note",
    "generate_image",  # slow and memory hungry
    "edit_resume",
    # Filesystem MCP tools that change files
    "write_file",
    "edit_file",
    "move_file",
    "create_directory",
}

# TavilyClient raises without a key, so only register it when one is set
if settings.tavily_api_key:
    from tools.web_search import web_search

    ALL_TOOLS.append(web_search)

# Gmail needs the one-time login (integrations/google_auth.py) to have saved a token
if Path(settings.google_token).exists():
    from tools.gmail import read_email, search_emails

    ALL_TOOLS += [search_emails, read_email]

# A token saved before the calendar scope was added keeps Gmail but gets no calendar tools
if has_scope("calendar.readonly"):
    from tools.google_calendar import free_slots, list_events

    ALL_TOOLS += [list_events, free_slots]

# The resume compiles with Tectonic (brew install tectonic)
if shutil.which("tectonic"):
    from resume.tool import edit_resume, read_resume

    ALL_TOOLS += [read_resume, edit_resume]
