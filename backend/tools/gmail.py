from google.auth.exceptions import RefreshError
from googleapiclient.errors import HttpError
from integrations import gmail
from langchain_core.tools import tool

RELOGIN = "Gmail login has expired. Ask the user to run: uv run python -m integrations.google_auth"


@tool
def search_emails(
    since: str = "24h", query: str = "", unread_only: bool = False, max_results: int = 20
) -> str:
    """Search the user's Gmail. Use for any question about their email or inbox.

    since: how far back to look, like "24h", "48h", "7d", "2w", "1m", "3m", "1y",
    a date range like "2026-10-01..2026-10-15", or "" for any time.
    query: free text or Gmail search syntax, like "invoice", "from:amazon",
    "has:attachment", "category:primary", "-category:promotions". Empty means all mail.
    unread_only: only unread mail.
    Returns one line per mail with its id; pass the id to read_email for the full text.
    """
    try:
        rows, total = gmail.search(since, query, unread_only, max_results)
    except ValueError as e:
        return str(e)
    except RefreshError:
        return RELOGIN
    except HttpError as e:
        return f"Gmail error: {e.reason}"
    if not rows:
        return "No emails found."
    lines = [
        f"[{i}] {r['id']} | {r['date']} | {r['from']} | {r['subject']}"
        f"{' (unread)' if r['unread'] else ''} | {r['snippet']}"
        for i, r in enumerate(rows, 1)
    ]
    return "\n".join(lines) + f"\n\nShowing {len(rows)} of about {max(total, len(rows))}."


@tool
def read_email(message_id: str) -> str:
    """Read the full text of one email, by the id from search_emails."""
    try:
        m = gmail.read(message_id)
    except RefreshError:
        return RELOGIN
    except HttpError as e:
        return f"Gmail error: {e.reason}"
    return (
        f"From: {m['from']}\nTo: {m['to']}\nDate: {m['date']}\nSubject: {m['subject']}\n"
        f"Link: {m['link']}\n\n{m['body']}"
    )


# Lets the tools menu group these like an MCP server
for t in (search_emails, read_email):
    t.metadata = {"server": "gmail"}
