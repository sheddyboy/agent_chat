import json
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

CREATE TABLE IF NOT EXISTS documents (
    doc_id     TEXT PRIMARY KEY,  -- sha256 of the file, same id as in Qdrant
    name       TEXT NOT NULL,
    path       TEXT NOT NULL,
    size_bytes INTEGER NOT NULL,
    pages      INTEGER,
    chunks     INTEGER,
    status     TEXT NOT NULL,     -- ingesting | ready | failed
    error      TEXT,
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS briefings (
    day        TEXT PRIMARY KEY,  -- local date, YYYY-MM-DD; regenerating replaces it
    thread_id  TEXT NOT NULL,     -- the chat that holds it, for follow-up questions
    data       TEXT NOT NULL,     -- JSON of briefing.collect()
    text       TEXT NOT NULL,     -- what the model wrote
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS places (
    id         INTEGER PRIMARY KEY,
    name       TEXT NOT NULL,
    region     TEXT NOT NULL DEFAULT '',
    country    TEXT NOT NULL DEFAULT '',
    lat        REAL NOT NULL,
    lon        REAL NOT NULL,
    is_home    INTEGER NOT NULL DEFAULT 0,  -- the one the Overview, briefing and alerts use
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


def init_db():
    with closing(connect()) as conn, conn:
        conn.execute("PRAGMA journal_mode=WAL")
        conn.executescript(SCHEMA)
        # The location from settings becomes Home the first time, so weather keeps working
        empty = conn.execute("SELECT count(*) FROM places").fetchone()[0] == 0
        if empty and settings.weather_lat is not None:
            conn.execute(
                "INSERT INTO places (name, lat, lon, is_home, created_at) VALUES (?, ?, ?, 1, ?)",
                (settings.weather_place, settings.weather_lat, settings.weather_lon, now()),
            )


def touch_thread(thread_id: str, title: str):
    """Create the thread row, or just bump updated_at if it exists."""
    ts = now()
    with closing(connect()) as conn, conn:
        conn.execute(
            """INSERT INTO threads VALUES (?, ?, ?, ?)
               ON CONFLICT(thread_id) DO UPDATE SET updated_at = excluded.updated_at""",
            (thread_id, title, ts, ts),
        )


def set_title(thread_id: str, title: str):
    with closing(connect()) as conn, conn:
        conn.execute("UPDATE threads SET title = ? WHERE thread_id = ?", (title, thread_id))


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


def upsert_document(doc_id: str, name: str, path: str, size_bytes: int):
    """Register an upload; a re-upload of the same file starts over as ingesting."""
    with closing(connect()) as conn, conn:
        conn.execute(
            """INSERT INTO documents (doc_id, name, path, size_bytes, status, created_at)
               VALUES (?, ?, ?, ?, 'ingesting', ?)
               ON CONFLICT(doc_id) DO UPDATE SET
                 name = excluded.name, path = excluded.path, status = 'ingesting',
                 pages = NULL, chunks = NULL, error = NULL""",
            (doc_id, name, path, size_bytes, now()),
        )


def set_document_status(doc_id: str, status: str, pages=None, chunks=None, error=None):
    with closing(connect()) as conn, conn:
        conn.execute(
            "UPDATE documents SET status = ?, pages = ?, chunks = ?, error = ? WHERE doc_id = ?",
            (status, pages, chunks, error, doc_id),
        )


def get_document(doc_id: str) -> dict | None:
    with closing(connect()) as conn:
        row = conn.execute("SELECT * FROM documents WHERE doc_id = ?", (doc_id,)).fetchone()
    return dict(row) if row else None


def list_documents() -> list[dict]:
    with closing(connect()) as conn:
        rows = conn.execute("SELECT * FROM documents ORDER BY created_at DESC").fetchall()
    return [dict(r) for r in rows]


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


def list_places() -> list[dict]:
    with closing(connect()) as conn:
        rows = conn.execute("SELECT * FROM places ORDER BY is_home DESC, created_at").fetchall()
    return [dict(r) for r in rows]


def get_place(place_id: int) -> dict | None:
    with closing(connect()) as conn:
        row = conn.execute("SELECT * FROM places WHERE id = ?", (place_id,)).fetchone()
    return dict(row) if row else None


def home_place() -> dict | None:
    with closing(connect()) as conn:
        row = conn.execute("SELECT * FROM places WHERE is_home = 1").fetchone()
    return dict(row) if row else None


def add_place(name: str, region: str, country: str, lat: float, lon: float) -> dict:
    with closing(connect()) as conn, conn:
        # The first place saved becomes Home
        home = conn.execute("SELECT count(*) FROM places WHERE is_home = 1").fetchone()[0] == 0
        cur = conn.execute(
            "INSERT INTO places (name, region, country, lat, lon, is_home, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
            (name, region, country, lat, lon, int(home), now()),
        )
    return get_place(cur.lastrowid)


def set_home(place_id: int):
    with closing(connect()) as conn, conn:
        conn.execute("UPDATE places SET is_home = (id = ?)", (place_id,))


def delete_place(place_id: int):
    with closing(connect()) as conn, conn:
        conn.execute("DELETE FROM places WHERE id = ? AND is_home = 0", (place_id,))
