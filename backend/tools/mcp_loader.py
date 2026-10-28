import json
import logging
from pathlib import Path

from core.config import settings
from langchain_mcp_adapters.client import MultiServerMCPClient

log = logging.getLogger(__name__)


async def load_mcp_tools() -> list:
    """Load tools from every server in mcp_servers.json, skipping any that fail."""
    # The filesystem server refuses to start if its root folder is missing
    Path(settings.mcp_workspace).mkdir(exist_ok=True)
    servers = json.loads(Path(settings.mcp_config).read_text())
    client = MultiServerMCPClient(servers)
    tools = []
    for name in servers:
        try:
            server_tools = await client.get_tools(server_name=name)
        except Exception as e:
            log.warning("MCP server %s failed to load: %s", name, e)
            continue
        # Lets the UI group tools by the server they came from
        for t in server_tools:
            t.metadata = {**(t.metadata or {}), "server": name}
        tools += server_tools
    return tools
