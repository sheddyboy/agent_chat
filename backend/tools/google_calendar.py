from google.auth.exceptions import RefreshError
from googleapiclient.errors import HttpError
from integrations import google_calendar
from langchain_core.tools import tool

RELOGIN = "Google login has expired. Ask the user to run: uv run python -m integrations.google_auth"


@tool
def list_events(when: str = "today") -> str:
    """List the user's events from all their Google calendars. Use for any question about
    their schedule, meetings or plans.

    when: "today", "tomorrow", "this week", "next week", a weekday like "friday",
    a count like "3d" or "2w", a date like "2026-10-27", or a range like "2026-10-27..2026-10-29".
    To prep for a meeting, call this first, then search_emails with the attendees or title words.
    """
    try:
        rows, more = google_calendar.list_events(when)
    except ValueError as e:
        return str(e)
    except RefreshError:
        return RELOGIN
    except HttpError as e:
        return f"Calendar error: {e.reason}"
    if not rows:
        return f"No events for {when or 'today'}."
    lines = []
    for i, r in enumerate(rows, 1):
        people = r["attendees"][:3]
        with_ = f"with {', '.join(people)}" + (f" +{len(r['attendees']) - 3}" if len(r["attendees"]) > 3 else "")
        parts = [r["day"], r["time"], r["title"], r["calendar"], r["location"], r["link"], with_ if people else ""]
        line = f"[{i}] " + " | ".join(p for p in parts if p)
        lines.append(line + (" (declined)" if r["declined"] else ""))
    if more:
        return "\n".join(lines) + f"\n\nShowing the first {len(rows)}. More exist; ask for a shorter range."
    return "\n".join(lines) + f"\n\nThat is all {len(rows)}."


@tool
def free_slots(when: str = "today", min_minutes: int = 30) -> str:
    """Find free time in the user's calendars during working hours.

    when: same values as list_events, like "tomorrow" or "this week".
    min_minutes: shortest gap worth listing, like 60 for an hour.
    """
    try:
        slots = google_calendar.free_slots(when, min_minutes)
    except ValueError as e:
        return str(e)
    except RefreshError:
        return RELOGIN
    except HttpError as e:
        return f"Calendar error: {e.reason}"
    if not slots:
        return f"No free slots of {min_minutes} minutes or more for {when or 'today'}."
    return "\n".join(
        f"{s:%a %Y-%m-%d} {s:%H:%M}-{e:%H:%M} ({int((e - s).total_seconds() // 60)} min)" for s, e in slots
    )


# Lets the tools menu group these like an MCP server
for t in (list_events, free_slots):
    t.metadata = {"server": "calendar"}
