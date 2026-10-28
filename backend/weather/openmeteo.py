"""Forecasts from Open-Meteo (no key): now, the next 24 hours, 7 days and 15-minute rain."""

import time

import httpx

FORECAST_URL = "https://api.open-meteo.com/v1/forecast"
SEARCH_URL = "https://geocoding-api.open-meteo.com/v1/search"
# Open-Meteo refreshes its models about hourly, so a few minutes of reuse loses nothing
CACHE_S = 600
HOURS = 24
DAYS = 7
# Look this far ahead for the summary line and for alerts
SUMMARY_HOURS = 12
ALERT_STEPS = 4  # 15-minute steps, so one hour
WET_CHANCE = 50  # % from which an hour counts as rainy
WET_MM = 0.1  # mm in 15 minutes from which it is raining

# WMO weather codes, as Open-Meteo returns them
CODES = {
    0: "clear", 1: "mostly clear", 2: "partly cloudy", 3: "overcast", 45: "fog", 48: "fog",
    51: "light drizzle", 53: "drizzle", 55: "heavy drizzle", 61: "light rain", 63: "rain",
    65: "heavy rain", 71: "light snow", 73: "snow", 75: "heavy snow", 80: "showers",
    81: "showers", 82: "heavy showers", 95: "thunderstorms", 96: "thunderstorms", 99: "thunderstorms",
}

_cache: dict[tuple[float, float], tuple[float, dict]] = {}


def fetch(lat: float, lon: float) -> dict:
    resp = httpx.get(
        FORECAST_URL,
        params={
            "latitude": lat,
            "longitude": lon,
            "current": "temperature_2m,apparent_temperature,weather_code,is_day,wind_speed_10m,wind_gusts_10m,relative_humidity_2m",
            "hourly": "temperature_2m,weather_code,precipitation_probability,precipitation,is_day,uv_index",
            "daily": "weather_code,temperature_2m_min,temperature_2m_max,precipitation_probability_max,sunrise,sunset,uv_index_max",
            "minutely_15": "precipitation",
            "forecast_minutely_15": 12,
            "wind_speed_unit": "mph",
            "timezone": "auto",
            "forecast_days": DAYS,
        },
        timeout=10,
    )
    resp.raise_for_status()
    return resp.json()


def hhmm(iso: str) -> str:
    return iso[11:16]


def summary(hourly: list[dict]) -> str:
    """One line for the next hours, worked out in code: "Rain likely 15:00 to 18:00"."""
    ahead = hourly[:SUMMARY_HOURS]
    wet = [h["rain"] >= WET_CHANCE for h in ahead]
    if True not in wet:
        top = max((h["rain"] for h in ahead), default=0)
        return "Dry for the next 12 hours" if top < 20 else f"Mostly dry, up to {top}% chance of showers"
    start = wet.index(True)
    end = start
    while end + 1 < len(wet) and wet[end + 1]:
        end += 1
    if end + 1 == len(wet):
        return "Rain likely for the next 12 hours" if start == 0 else f"Rain likely from {hhmm(ahead[start]['time'])}"
    until = hhmm(ahead[end + 1]["time"])
    return f"Rain likely until {until}" if start == 0 else f"Rain likely {hhmm(ahead[start]['time'])} to {until}"


def rain_alert(minutely: list[dict]) -> str | None:
    """A change in the next hour worth a banner: rain starting, or rain easing."""
    if not minutely:
        return None
    raining = minutely[0]["mm"] >= WET_MM
    for step in minutely[1 : ALERT_STEPS + 1]:
        if (step["mm"] >= WET_MM) != raining:
            return f"Rain easing around {hhmm(step['time'])}" if raining else f"Rain starting around {hhmm(step['time'])}"
    return None


def shape(d: dict) -> dict:
    now = d["current"]
    h = d["hourly"]
    # Times are local to the place and hourly ones are on the hour, so the current hour starts the strip
    first = next((i for i, t in enumerate(h["time"]) if t[:13] == now["time"][:13]), 0)
    hourly = [
        {
            "time": h["time"][i],
            "temp": h["temperature_2m"][i],
            "code": h["weather_code"][i],
            "rain": h["precipitation_probability"][i] or 0,
            "mm": h["precipitation"][i] or 0,
            "is_day": bool(h["is_day"][i]),
        }
        for i in range(first, min(first + HOURS, len(h["time"])))
    ]
    dd = d["daily"]
    daily = [
        {
            "date": dd["time"][i],
            "code": dd["weather_code"][i],
            "min": dd["temperature_2m_min"][i],
            "max": dd["temperature_2m_max"][i],
            "rain": dd["precipitation_probability_max"][i] or 0,
            "sunrise": dd["sunrise"][i],
            "sunset": dd["sunset"][i],
        }
        for i in range(len(dd["time"]))
    ]
    m = d.get("minutely_15", {})
    minutely = [
        {"time": t, "mm": mm or 0}
        for t, mm in zip(m.get("time", []), m.get("precipitation", []))
        if t >= now["time"][:16]
    ]
    return {
        "time": now["time"],
        "current": {
            "temp": now["temperature_2m"],
            "feels_like": now["apparent_temperature"],
            "code": now["weather_code"],
            "sky": CODES.get(now["weather_code"], "mixed"),
            "is_day": bool(now["is_day"]),
            "wind": now["wind_speed_10m"],
            "gusts": now["wind_gusts_10m"],
            "humidity": now["relative_humidity_2m"],
            "uv": dd["uv_index_max"][0],
        },
        "hourly": hourly,
        "daily": daily,
        "minutely": minutely,
        "summary": summary(hourly),
        "alert": rain_alert(minutely),
    }


def forecast(lat: float, lon: float) -> dict:
    key = (round(lat, 2), round(lon, 2))
    hit = _cache.get(key)
    if hit and time.monotonic() - hit[0] < CACHE_S:
        return hit[1]
    data = {**shape(fetch(lat, lon)), "fetched_at": time.time()}
    _cache[key] = (time.monotonic(), data)
    return data


def search(q: str) -> list[dict]:
    resp = httpx.get(SEARCH_URL, params={"name": q, "count": 8, "language": "en", "format": "json"}, timeout=10)
    resp.raise_for_status()
    return [
        {
            "name": r["name"],
            "region": r.get("admin1", ""),
            "country": r.get("country", ""),
            "lat": r["latitude"],
            "lon": r["longitude"],
        }
        for r in resp.json().get("results", [])
    ]
