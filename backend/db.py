import sqlite3
from contextlib import closing
from datetime import UTC, datetime

from config import settings

# LangGraph's checkpoint tables live in the same file; these are only ours.
SCHEMA = """
CREATE TABLE IF NOT EXISTS threads (
    thread_id  TEXT PRIMARY KEY,
    title      TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS threads_recent ON threads(updated_at DESC, thread_id DESC);
"""


def connect() -> sqlite3.Connection:
    conn = sqlite3.connect(settings.db_path)
    conn.row_factory = sqlite3.Row
    return conn


def now() -> str:
    # Fixed width (isoformat drops zero microseconds) so strings sort by time
    return datetime.now(UTC).strftime("%Y-%m-%dT%H:%M:%S.%f")


def init_db():
    with closing(connect()) as conn, conn:
        conn.execute("PRAGMA journal_mode=WAL")
        conn.executescript(SCHEMA)


def touch_thread(thread_id: str, title: str):
    """Create the thread row, or just bump updated_at if it exists."""
    ts = now()
    with closing(connect()) as conn, conn:
        conn.execute(
            """INSERT INTO threads VALUES (?, ?, ?, ?)
               ON CONFLICT(thread_id) DO UPDATE SET updated_at = excluded.updated_at""",
            (thread_id, title, ts, ts),
        )


def get_thread(thread_id: str) -> dict | None:
    with closing(connect()) as conn:
        row = conn.execute("SELECT * FROM threads WHERE thread_id = ?", (thread_id,)).fetchone()
    return dict(row) if row else None


def list_threads(limit: int, before: str | None = None) -> dict:
    """Newest first. `before` is the `next` cursor of the previous page."""
    where, args = "", []
    if before:
        where = "WHERE (updated_at, thread_id) < (?, ?)"
        args = before.split("|", 1)
    with closing(connect()) as conn:
        rows = conn.execute(
            f"SELECT * FROM threads {where} ORDER BY updated_at DESC, thread_id DESC LIMIT ?",
            (*args, limit + 1),  # one extra row tells us another page exists
        ).fetchall()
    threads = [dict(r) for r in rows[:limit]]
    last = threads[-1] if len(rows) > limit else None
    return {"threads": threads, "next": f"{last['updated_at']}|{last['thread_id']}" if last else None}


def delete_thread(thread_id: str):
    with closing(connect()) as conn, conn:
        conn.execute("DELETE FROM threads WHERE thread_id = ?", (thread_id,))
