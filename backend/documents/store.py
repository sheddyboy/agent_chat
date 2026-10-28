from contextlib import closing

from core.db import connect, now

SCHEMA = """
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
"""


def init(conn):
    conn.executescript(SCHEMA)
    # Ingestion runs inside this process, so one cut off by a restart never finishes
    conn.execute(
        "UPDATE documents SET status = 'failed', error = 'Interrupted, upload it again' WHERE status = 'ingesting'"
    )


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
