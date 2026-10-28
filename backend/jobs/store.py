from contextlib import closing

from core.db import connect, now

SCHEMA = """
CREATE TABLE IF NOT EXISTS jobs (
    id          TEXT PRIMARY KEY,
    kind        TEXT NOT NULL,     -- chat | ingest | briefing
    ref         TEXT NOT NULL,     -- the thread, document or day it works on
    status      TEXT NOT NULL,     -- running | done | failed | interrupted
    error       TEXT,
    created_at  TEXT NOT NULL,
    finished_at TEXT
);
CREATE INDEX IF NOT EXISTS jobs_ref ON jobs(kind, ref, created_at DESC);
"""


def init(conn):
    conn.executescript(SCHEMA)
    # Jobs run inside this process, so none survive a restart
    conn.execute("UPDATE jobs SET status = 'interrupted', finished_at = ? WHERE status = 'running'", (now(),))


def create_job(job_id: str, kind: str, ref: str):
    with closing(connect()) as conn, conn:
        conn.execute("INSERT INTO jobs (id, kind, ref, status, created_at) VALUES (?, ?, ?, 'running', ?)", (job_id, kind, ref, now()))


def finish_job(job_id: str, status: str, error: str | None):
    with closing(connect()) as conn, conn:
        conn.execute("UPDATE jobs SET status = ?, error = ?, finished_at = ? WHERE id = ?", (status, error, now(), job_id))


def list_jobs(kind: str | None, ref: str | None, status: str | None, limit: int = 20) -> list[dict]:
    where, args = [], []
    for column, value in (("kind", kind), ("ref", ref), ("status", status)):
        if value:
            where.append(f"{column} = ?")
            args.append(value)
    sql = "SELECT * FROM jobs" + (" WHERE " + " AND ".join(where) if where else "") + " ORDER BY created_at DESC LIMIT ?"
    with closing(connect()) as conn:
        rows = conn.execute(sql, (*args, limit)).fetchall()
    return [dict(r) for r in rows]


def get_job(job_id: str) -> dict | None:
    with closing(connect()) as conn:
        row = conn.execute("SELECT * FROM jobs WHERE id = ?", (job_id,)).fetchone()
    return dict(row) if row else None
