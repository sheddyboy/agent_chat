from core.config import settings
from langchain_core.tools import tool
from tavily import TavilyClient

client = TavilyClient(api_key=settings.tavily_api_key)


@tool
def web_search(query: str) -> str:
    """Search the web for current information. Returns titles, links and snippets."""
    results = client.search(query, max_results=5)["results"]
    return "\n\n".join(f"{r['title']}\n{r['url']}\n{r['content']}" for r in results)
