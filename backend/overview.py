"""Data for the Overview page widgets. Each function returns plain JSON-ready dicts."""

from datetime import datetime
from email.utils import parseaddr
from pathlib import Path
from urllib.parse import urlparse

import httpx
from briefing import MAIL_QUERY
from core.config import settings
from core.db import list_documents
from weather.places import home_place
from integrations.google_auth import has_scope

INBOX_ROWS = 5
HOURS = 8


def event(r: dict) -> dict:
    """A calendar row from google_calendar as JSON."""
    keep = ("id", "time", "title", "calendar", "location", "link", "busy", "declined")
    return {
        **{k: r[k] for k in keep},
        "start": r["start"].isoformat(),
        "end": r["end"].isoformat(),
        "all_day": r["time"].startswith("all day"),
    }


def schedule() -> dict:
    if not has_scope("calendar.readonly"):
        return {"connected": False}
    from integrations import google_calendar

    rows, _ = google_calendar.list_events("today")
    slots = google_calendar.free_slots("today", 30)
    return {
        "connected": True,
        "events": [event(r) for r in rows],
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
    """Home's forecast, in the compact shape the Overview card and the briefing use."""
    from weather import openmeteo

    place = home_place()
    if not place:
        return {"connected": False}
    f = openmeteo.forecast(place["lat"], place["lon"])
    today = f["daily"][0]
    return {
        "connected": True,
        "place": place["name"],
        "temp": f["current"]["temp"],
        "code": f["current"]["code"],
        "sky": f["current"]["sky"],
        "min": today["min"],
        "max": today["max"],
        "rain": today["rain"],
        "summary": f["summary"],
        "alert": f["alert"],
        "is_day": f["current"]["is_day"],
        "hourly": [
            {"time": h["time"][11:16], "temp": h["temp"], "code": h["code"], "rain": h["rain"], "is_day": h["is_day"]}
            for h in f["hourly"][:HOURS]
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
