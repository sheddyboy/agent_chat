from datetime import datetime

from langchain_core.tools import tool


@tool
def get_datetime() -> str:
    """Get the current local date and time, including the weekday."""
    now = datetime.now().astimezone()
    return f"{now.strftime('%A')}, {now.isoformat(timespec='seconds')}"
