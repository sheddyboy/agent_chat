from config import settings

from tools.calculator import calculator
from tools.datetime_tool import get_datetime

ALL_TOOLS = [get_datetime, calculator]

# TavilyClient raises without a key, so only register it when one is set
if settings.tavily_api_key:
    from tools.web_search import web_search

    ALL_TOOLS.append(web_search)
