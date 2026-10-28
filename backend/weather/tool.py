from datetime import date, timedelta

from weather import openmeteo
from weather.places import home_place
from langchain_core.tools import tool

WEEKDAYS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"]


def pick_day(day: str, days: list[dict]) -> dict | None:
    """"today", "tomorrow", a weekday (the next one) or a YYYY-MM-DD date, from the 7-day list."""
    word = day.strip().lower()
    today = date.fromisoformat(days[0]["date"])
    if word in ("", "today"):
        target = today
    elif word == "tomorrow":
        target = today + timedelta(days=1)
    elif word in WEEKDAYS:
        target = today + timedelta(days=(WEEKDAYS.index(word) - today.weekday()) % 7)
    else:
        try:
            target = date.fromisoformat(word)
        except ValueError:
            return None
    return next((d for d in days if d["date"] == target.isoformat()), None)


@tool
def get_weather(place: str = "", day: str = "") -> str:
    """Weather forecast for the next 7 days. Use for any question about weather, rain or temperature.

    place: a town or city, like "Leicester"; empty means the user's Home place.
    day: "today", "tomorrow", a weekday like "saturday", or a date like "2026-11-02"; empty means now and today.
    """
    if place.strip():
        matches = openmeteo.search(place.strip())
        if not matches:
            return f'No place called "{place}" found.'
        spot = matches[0]
        name = ", ".join(p for p in (spot["name"], spot["region"], spot["country"]) if p)
    else:
        spot = home_place()
        if not spot:
            return "No Home place is set. Ask the user to add one on the Weather page, or give a place."
        name = spot["name"]
    f = openmeteo.forecast(spot["lat"], spot["lon"])
    chosen = pick_day(day, f["daily"])
    if chosen is None:
        return f'"{day}" is not within the 7-day forecast for {name}.'
    sky = openmeteo.CODES.get(chosen["code"], "mixed")
    lines = [
        f"{name}, {chosen['date']}: {sky}, {chosen['min']:.0f} to {chosen['max']:.0f} °C, "
        f"{chosen['rain']}% chance of rain, sunrise {chosen['sunrise'][11:16]}, sunset {chosen['sunset'][11:16]}."
    ]
    if chosen["date"] == f["daily"][0]["date"]:
        c = f["current"]
        lines.append(
            f"Now: {c['sky']}, {c['temp']:.0f} °C (feels {c['feels_like']:.0f}), wind {c['wind']:.0f} mph, gusts {c['gusts']:.0f} mph."
        )
        lines.append(f["summary"] + ".")
        if f["alert"]:
            lines.append(f["alert"] + ".")
    hours = [h for h in f["hourly"] if h["time"].startswith(chosen["date"])]
    if hours:
        lines.append(
            "Hourly: "
            + "; ".join(f"{h['time'][11:16]} {h['temp']:.0f}° {h['rain']}%" for h in hours[::3])
        )
    return "\n".join(lines)
