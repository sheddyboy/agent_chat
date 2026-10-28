import json


def event(type: str, **data) -> dict:
    """One SSE message for sse-starlette. Every event is JSON with a `type` field."""
    return {"data": json.dumps({"type": type, **data})}
