import sqlite3
from contextlib import closing
from datetime import UTC, datetime

from core.config import settings


def connect() -> sqlite3.Connection:
    conn = sqlite3.connect(settings.db_path)
    conn.row_factory = sqlite3.Row
    return conn


def now() -> str:
    # Fixed width (isoformat drops zero microseconds) so strings sort by time
    return datetime.now(UTC).strftime("%Y-%m-%dT%H:%M:%S.%f")


def init_db(*inits):
    """Each area's init(conn) creates its tables and tidies up after a restart; main.py passes them in.
    LangGraph's checkpoint tables live in the same file."""
    with closing(connect()) as conn, conn:
        conn.execute("PRAGMA journal_mode=WAL")
        for init in inits:
            init(conn)
