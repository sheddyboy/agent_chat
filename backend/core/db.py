import json
import sqlite3
from contextlib import closing
from datetime import UTC, datetime

from core.config import settings

# LangGraph's checkpoint tables live in the same file; these are only ours.
SCHEMA = """

CREATE TABLE IF NOT EXISTS briefings (
    day        TEXT PRIMARY KEY,  -- local date, YYYY-MM-DD; regenerating replaces it
    thread_id  TEXT NOT NULL,     -- the chat that holds it, for follow-up questions
    data       TEXT NOT NULL,     -- JSON of briefing.collect()
    text       TEXT NOT NULL,     -- what the model wrote
    created_at TEXT NOT NULL
);
"""


def connect() -> sqlite3.Connection:
    conn = sqlite3.connect(settings.db_path)
    conn.row_factory = sqlite3.Row
    return conn


def now() -> str:
    # Fixed width (isoformat drops zero microseconds) so strings sort by time
    return datetime.now(UTC).strftime("%Y-%m-%dT%H:%M:%S.%f")


def init_db(*inits):
    """Each area's init(conn) creates its tables and tidies up after a restart; main.py passes them in."""
    with closing(connect()) as conn, conn:
        conn.execute("PRAGMA journal_mode=WAL")
        conn.executescript(SCHEMA)
        for init in inits:
            init(conn)


def save_briefing(day: str, thread_id: str, data: dict, text: str):
    with closing(connect()) as conn, conn:
        conn.execute(
            "INSERT OR REPLACE INTO briefings VALUES (?, ?, ?, ?, ?)",
            (day, thread_id, json.dumps(data), text, now()),
        )


def get_briefing(day: str) -> dict | None:
    with closing(connect()) as conn:
        row = conn.execute("SELECT * FROM briefings WHERE day = ?", (day,)).fetchone()
    return {**dict(row), "data": json.loads(row["data"])} if row else None


def list_briefings(limit: int = 30) -> list[dict]:
    with closing(connect()) as conn:
        rows = conn.execute("SELECT day, created_at FROM briefings ORDER BY day DESC LIMIT ?", (limit,)).fetchall()
    return [dict(r) for r in rows]
