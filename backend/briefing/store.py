import json
from contextlib import closing

from core.db import connect, now

SCHEMA = """
CREATE TABLE IF NOT EXISTS briefings (
    day        TEXT PRIMARY KEY,  -- local date, YYYY-MM-DD; regenerating replaces it
    thread_id  TEXT NOT NULL,     -- the chat that holds it, for follow-up questions
    data       TEXT NOT NULL,     -- JSON of compose.collect()
    text       TEXT NOT NULL,     -- what the model wrote
    created_at TEXT NOT NULL
);
"""


def init(conn):
    conn.executescript(SCHEMA)


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
