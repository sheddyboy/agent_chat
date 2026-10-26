"""Data for the Overview page widgets. Each function returns plain JSON-ready dicts."""

from datetime import datetime
from email.utils import parseaddr
from pathlib import Path
from urllib.parse import urlparse

import httpx
from briefing import MAIL_QUERY, WEATHER
from config import settings
from db import list_documents
from integrations.google_auth import has_scope

INBOX_ROWS = 5
HOURS = 8


def schedule() -> dict:
    if not has_scope("calendar.readonly"):
        return {"connected": False}
    from integrations import google_calendar

    rows, _ = google_calendar.list_events("today")
    slots = google_calendar.free_slots("today", 30)
    keep = ("id", "time", "title", "calendar", "location", "link", "busy", "declined")
    return {
        "connected": True,
        "events": [
            {**{k: r[k] for k in keep}, "start": r["start"].isoformat(), "end": r["end"].isoformat(), "all_day": r["time"].startswith("all day")}
            for r in rows
        ],
        "free": [{"start": s.isoformat(), "end": e.isoformat()} for s, e in slots],
    }


def inbox() -> dict:
    if not Path(settings.google_token).exists():
        return {"connected": False}
    from integrations import gmail

    label = gmail.service().users().labels().get(userId="me", id="INBOX").execute()
    rows, _ = gmail.search("7d", MAIL_QUERY, True, INBOX_ROWS)
    mails = []
    for r in rows:
        name, address = parseaddr(r["from"])
        mails.append({"id": r["id"], "from": name or address, "subject": r["subject"], "date": r["date"]})
    return {"connected": True, "unread": label.get("messagesUnread", 0), "mails": mails}


def weather() -> dict:
    if settings.weather_lat is None:
        return {"connected": False}
    resp = httpx.get(
        "https://api.open-meteo.com/v1/forecast",
        params={
            "latitude": settings.weather_lat,
            "longitude": settings.weather_lon,
            "current": "temperature_2m,weather_code",
            "hourly": "temperature_2m",
            "daily": "temperature_2m_max,temperature_2m_min,precipitation_probability_max",
            "timezone": "auto",
            "forecast_days": 2,
        },
        timeout=10,
    )
    resp.raise_for_status()
    d = resp.json()
    now = d["current"]
    # Hourly times are local and on the hour, so the current hour is where the strip starts
    hour = now["time"][:13] + ":00"
    times = d["hourly"]["time"]
    first = times.index(hour) if hour in times else 0
    return {
        "connected": True,
        "temp": now["temperature_2m"],
        "code": now["weather_code"],
        "sky": WEATHER.get(now["weather_code"], "mixed"),
        "min": d["daily"]["temperature_2m_min"][0],
        "max": d["daily"]["temperature_2m_max"][0],
        "rain": d["daily"]["precipitation_probability_max"][0],
        "hourly": [
            {"time": t[11:16], "temp": v}
            for t, v in zip(times[first : first + HOURS], d["hourly"]["temperature_2m"][first : first + HOURS])
        ],
    }


def reachable(url: str) -> bool:
    try:
        httpx.get(url, timeout=1)
        return True
    except httpx.HTTPError:
        return False


def status() -> dict:
    try:
        ps = httpx.get(f"{settings.ollama_url}/api/ps", timeout=1).json()
        ollama = {"up": True, "loaded": [m["name"] for m in ps.get("models", [])]}
    except httpx.HTTPError:
        ollama = {"up": False, "loaded": []}
    phoenix = urlparse(settings.phoenix_endpoint)
    docs = list_documents()
    return {
        "ollama": ollama,
        "default_model": settings.default_model,
        "phoenix": reachable(f"{phoenix.scheme}://{phoenix.netloc}"),
        "documents": sum(d["status"] == "ready" for d in docs),
        "google": {"gmail": Path(settings.google_token).exists(), "calendar": has_scope("calendar.readonly")},
        "checked_at": datetime.now().astimezone().isoformat(),
    }
