"""Saved places for the forecast; the Home one feeds the Overview, the briefing and rain alerts."""

from contextlib import closing

from core.config import settings
from core.db import connect, now

SCHEMA = """
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


def init(conn):
    conn.executescript(SCHEMA)
    # The location from settings becomes Home the first time, so weather keeps working
    empty = conn.execute("SELECT count(*) FROM places").fetchone()[0] == 0
    if empty and settings.weather_lat is not None:
        conn.execute(
            "INSERT INTO places (name, lat, lon, is_home, created_at) VALUES (?, ?, ?, 1, ?)",
            (settings.weather_place, settings.weather_lat, settings.weather_lon, now()),
        )


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
