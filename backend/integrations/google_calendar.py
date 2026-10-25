import re
from datetime import date, datetime, time, timedelta

from config import settings
from googleapiclient.discovery import build

from integrations.gmail import INVISIBLE, safe
from integrations.google_auth import get_credentials

WHEN_HELP = (
    'Use "today", "tomorrow", "this week", "next week", a weekday like "friday", '
    'a count like "3d" or "2w", a date like "2026-10-27", or a range like "2026-10-27..2026-10-29".'
)
WEEKDAYS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"]
MAX_EVENTS = 60  # across all calendars, to fit the 8K context


def service():
    # Built per call: the client's HTTP layer is not thread-safe and tools run in parallel
    return build("calendar", "v3", credentials=get_credentials(), cache_discovery=False)


def midnight(d: date) -> datetime:
    return datetime.combine(d, time()).astimezone()


def parse_when(when: str) -> tuple[datetime, datetime]:
    """Turn "today", "next week", "3d" or "2026-10-27..2026-10-29" into a local start and end."""
    when = " ".join(when.strip().lower().split())
    now = datetime.now().astimezone()
    today = now.date()
    monday = today - timedelta(days=today.weekday())
    if when in ("", "today"):
        return midnight(today), midnight(today + timedelta(days=1))
    if when == "tomorrow":
        return midnight(today + timedelta(days=1)), midnight(today + timedelta(days=2))
    if when == "this week":
        return midnight(today), midnight(monday + timedelta(weeks=1))
    if when == "next week":
        return midnight(monday + timedelta(weeks=1)), midnight(monday + timedelta(weeks=2))
    if when in WEEKDAYS:
        # The next one after today; on a Sunday, "sunday" means next week's
        day = today + timedelta(days=(WEEKDAYS.index(when) - today.weekday() - 1) % 7 + 1)
        return midnight(day), midnight(day + timedelta(days=1))
    # Models also write "next 3 days" or "2 weeks"
    if m := re.fullmatch(r"(?:next )?(\d+)\s*(d|days?|w|weeks?)", when):
        days = int(m[1]) * (7 if m[2][0] == "w" else 1)
        return now, now + timedelta(days=days)
    if m := re.fullmatch(r"(\d{4}-\d{2}-\d{2})(?:\s*\.\.\s*(\d{4}-\d{2}-\d{2}))?", when):
        # The end day is included
        first = date.fromisoformat(m[1])
        last = date.fromisoformat(m[2]) if m[2] else first
        return midnight(first), midnight(last + timedelta(days=1))
    raise ValueError(f'Unknown time "{when}". {WHEN_HELP}')


def calendars(cal) -> list[dict]:
    return cal.calendarList().list().execute().get("items", [])


def clean(text: str) -> str:
    return safe(" ".join(INVISIBLE.sub("", text).split()))


def to_row(ev: dict, calendar: str) -> dict:
    start, end = ev["start"], ev["end"]
    all_day = "date" in start
    if all_day:
        first = date.fromisoformat(start["date"])
        last = date.fromisoformat(end["date"]) - timedelta(days=1)  # Google's end date is exclusive
        when = "all day" if last == first else f"all day until {last:%a %Y-%m-%d}"
        begins, ends = midnight(first), midnight(last + timedelta(days=1))
    else:
        begins = datetime.fromisoformat(start["dateTime"]).astimezone()
        ends = datetime.fromisoformat(end["dateTime"]).astimezone()
        when = f"{begins:%H:%M}-{ends:%H:%M}"
    people = ev.get("attendees", [])
    me = next((a for a in people if a.get("self")), {})
    declined = me.get("responseStatus") == "declined"
    return {
        "id": ev["id"],
        "start": begins,
        "end": ends,
        # All-day events are mostly reminders and birthdays, so only timed ones block time
        "busy": not all_day and ev.get("transparency") != "transparent" and not declined,
        "day": begins.strftime("%a %Y-%m-%d"),
        "time": when,
        "title": clean(ev.get("summary", "(no title)")),
        "calendar": calendar,
        "location": clean(ev["location"]) if ev.get("location") else "",
        "link": ev.get("hangoutLink", ""),
        "attendees": [a["email"] for a in people if not a.get("self") and "email" in a],
        "declined": declined,
    }


def events(start: datetime, end: datetime) -> list[dict]:
    """Events from all my calendars in the range, by start time."""
    cal = service()
    cals = calendars(cal)

    # One HTTP round trip for every calendar instead of one each
    results = {}
    batch = cal.new_batch_http_request(
        callback=lambda rid, resp, err: results.update({rid: resp}) if err is None else None
    )
    for i, c in enumerate(cals):
        batch.add(
            cal.events().list(
                calendarId=c["id"],
                timeMin=start.isoformat(),
                timeMax=end.isoformat(),
                singleEvents=True,  # one row per repeat of a recurring event
                orderBy="startTime",
                maxResults=MAX_EVENTS,
            ),
            request_id=str(i),  # calendar ids contain # and @
        )
    batch.execute()

    rows = []
    for i, c in enumerate(cals):
        name = c.get("summaryOverride") or c.get("summary", "")
        for ev in results.get(str(i), {}).get("items", []):
            if ev.get("status") != "cancelled":
                rows.append(to_row(ev, name))
    rows.sort(key=lambda r: r["start"])
    return rows


def list_events(when: str) -> tuple[list[dict], bool]:
    """Events in the range, by start time, and whether more were cut."""
    rows = events(*parse_when(when))  # parsed first, so a bad range fails before any API call
    return rows[:MAX_EVENTS], len(rows) > MAX_EVENTS


def free_slots(when: str, min_minutes: int) -> list[tuple[datetime, datetime]]:
    """Gaps of at least min_minutes inside working hours, between busy events on any calendar."""
    # Not Google's freebusy: it counts all-day events marked busy, which blocked whole days
    start, end = parse_when(when)
    busy = [(r["start"], r["end"]) for r in events(start, end) if r["busy"]]

    day_start = time.fromisoformat(settings.work_day_start)
    day_end = time.fromisoformat(settings.work_day_end)
    need = timedelta(minutes=min_minutes)
    now = datetime.now().astimezone()
    slots = []
    day = start.date()
    while midnight(day) < end:
        # Working hours, minus the past and anything outside the asked range
        cursor = max(datetime.combine(day, day_start).astimezone(), start, now)
        close = min(datetime.combine(day, day_end).astimezone(), end)
        for b_start, b_end in busy:
            if b_end <= cursor or b_start >= close:
                continue
            if b_start - cursor >= need:
                slots.append((cursor, b_start))
            cursor = max(cursor, b_end)
        if close - cursor >= need:
            slots.append((cursor, close))
        day += timedelta(days=1)
    return slots
