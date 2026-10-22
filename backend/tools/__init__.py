from config import settings

from tools.calculator import calculator
from tools.datetime_tool import get_datetime
from tools.save_note import save_note
from tools.search_documents import search_documents

ALL_TOOLS = [get_datetime, calculator, search_documents, save_note]

# Calls to these pause the run in the approval node until the user decides
SENSITIVE_TOOLS = {"save_note"}

# TavilyClient raises without a key, so only register it when one is set
if settings.tavily_api_key:
    from tools.web_search import web_search

    ALL_TOOLS.append(web_search)
