import base64
import html
import re
from datetime import datetime, timedelta

from bs4 import BeautifulSoup
from core.config import settings
from googleapiclient.discovery import build
from core.guard import injection_score

from integrations.google_auth import get_credentials

SINCE_HELP = 'Use "24h", "48h", "7d", "2w", "1m", "3m", "1y", a date like "2026-10-01" (that day to now), a range like "2026-10-01..2026-10-15", or "" for any time.'
UNITS = {
    "h": timedelta(hours=1),
    "d": timedelta(days=1),
    "w": timedelta(weeks=1),
    "m": timedelta(days=30),
    "y": timedelta(days=365),
}
MAX_RESULTS = 50  # Gmail suggests batches of 50 or fewer
MAX_BODY = 4000
HIDDEN = "[hidden: this content looked like a prompt injection]"
# Marketing mail pads previews with invisible characters, which the guard reads as an attack
INVISIBLE = re.compile(r"[͏­​-‏⁠-⁤﻿]")


def service():
    # Built per call: the client's HTTP layer is not thread-safe and tools run in parallel
    return build("gmail", "v1", credentials=get_credentials(), cache_discovery=False)


def parse_since(since: str) -> str:
    """Turn "48h", "1m" or "2026-10-01..2026-10-15" into Gmail after:/before: terms."""
    since = since.strip().lower()
    if not since:
        return ""
    # Models also write "1mo", "2 weeks" or "3days"; the first letter picks the unit
    if m := re.fullmatch(r"(\d+)\s*(h|hours?|d|days?|w|weeks?|m|mo|months?|y|years?)", since):
        start = datetime.now().astimezone() - int(m[1]) * UNITS[m[2][0]]
        return f"after:{int(start.timestamp())}"
    if m := re.fullmatch(r"(\d{4}-\d{2}-\d{2})\s*\.\.\s*(\d{4}-\d{2}-\d{2})", since):
        # Naive dates are local midnight; the end day is included
        start = datetime.fromisoformat(m[1]).astimezone()
        end = datetime.fromisoformat(m[2]).astimezone() + timedelta(days=1)
        return f"after:{int(start.timestamp())} before:{int(end.timestamp())}"
    if re.fullmatch(r"\d{4}-\d{2}-\d{2}", since):
        return f"after:{int(datetime.fromisoformat(since).astimezone().timestamp())}"
    raise ValueError(f'Unknown time range "{since}". {SINCE_HELP}')


def build_query(since: str, query: str, unread_only: bool) -> str:
    parts = [parse_since(since), "is:unread" if unread_only else "", query.strip()]
    return " ".join(p for p in parts if p)


def safe(text: str) -> str:
    """Hide text the guard flags. It reads 512 tokens, so long text is checked in pieces."""
    pieces = [text[i : i + 2000] for i in range(0, len(text), 2000)]
    if any(injection_score(p) >= settings.guard_threshold for p in pieces):
        return HIDDEN
    return text


def to_row(msg: dict) -> dict:
    headers = {h["name"]: h["value"] for h in msg["payload"].get("headers", [])}
    sent = datetime.fromtimestamp(int(msg["internalDate"]) / 1000).astimezone()
    # Checked separately so a flagged snippet (a login code, say) keeps its subject
    subject = safe(" ".join(INVISIBLE.sub("", headers.get("Subject", "(no subject)")).split()))
    snippet = safe(" ".join(INVISIBLE.sub("", html.unescape(msg.get("snippet", ""))).split()))
    return {
        "id": msg["id"],
        "date": sent.strftime("%Y-%m-%d %H:%M"),
        "from": headers.get("From", ""),
        "subject": subject,
        "snippet": snippet,
        "unread": "UNREAD" in msg.get("labelIds", []),
    }


def search(since: str, query: str, unread_only: bool, max_results: int) -> tuple[list[dict], bool]:
    """Matching mails, newest first, and whether more match than were returned."""
    q = build_query(since, query, unread_only)  # first, so a bad range fails before any API call
    gmail = service()
    resp = gmail.users().messages().list(
        userId="me", q=q, maxResults=min(max_results, MAX_RESULTS)
    ).execute()
    ids = [m["id"] for m in resp.get("messages", [])]
    if not ids:
        return [], 0

    # One HTTP round trip for all the metadata instead of one per mail
    msgs = {}
    batch = gmail.new_batch_http_request(
        callback=lambda rid, msg, err: msgs.update({rid: msg}) if err is None else None
    )
    for i in ids:
        batch.add(
            gmail.users().messages().get(
                userId="me", id=i, format="metadata", metadataHeaders=["From", "Subject"]
            ),
            request_id=i,
        )
    batch.execute()
    rows = [to_row(msgs[i]) for i in ids if i in msgs]
    # resultSizeEstimate is too rough to show, but a next page means there is more
    return rows, "nextPageToken" in resp


def find_part(payload: dict, mime: str) -> str | None:
    """First part of this type anywhere in the MIME tree, decoded."""
    data = payload.get("body", {}).get("data")
    if payload.get("mimeType") == mime and data:
        return base64.urlsafe_b64decode(data).decode("utf-8", errors="replace")
    for part in payload.get("parts", []):
        if (found := find_part(part, mime)) is not None:
            return found
    return None


def html_to_text(markup: str) -> str:
    soup = BeautifulSoup(markup, "html.parser")
    for tag in soup(["script", "style", "head"]):
        tag.decompose()
    # Line breaks after block tags only, so inline tags like <b> stay in their sentence
    for tag in soup(["p", "br", "div", "tr", "li", "h1", "h2", "h3", "h4", "h5", "h6"]):
        tag.append("\n")
    for tag in soup(["td", "th"]):
        tag.append(" ")
    return soup.get_text()


def clean_body(text: str) -> str:
    """Cut quoted replies and signatures, squeeze whitespace, cap the length."""
    text = INVISIBLE.sub("", text.replace("\r\n", "\n"))
    # Tracking links are long noise to the model and trip the guard; the domain is enough
    text = re.sub(r"https?://(?:www\.)?([^/\s?#>]+)[^\s>)\]]*", r"[link: \1]", text)
    for marker in (r"\nOn [^\n]{0,200}?(\n[^\n]{0,200})?wrote:", r"\n-{2,} ?Original Message", r"\n-- \n"):
        if m := re.search(marker, text):
            text = text[: m.start()]
    lines = [" ".join(line.split()) for line in text.split("\n") if not line.lstrip().startswith(">")]
    text = re.sub(r"\n{3,}", "\n\n", "\n".join(lines)).strip()
    if len(text) > MAX_BODY:
        text = text[:MAX_BODY] + "\n... [truncated]"
    return text


def read(message_id: str) -> dict:
    msg = service().users().messages().get(userId="me", id=message_id, format="full").execute()
    headers = {h["name"]: h["value"] for h in msg["payload"].get("headers", [])}
    body = find_part(msg["payload"], "text/plain")
    if body is None:
        body = html_to_text(find_part(msg["payload"], "text/html") or "")
    return {
        **to_row(msg),
        "to": headers.get("To", ""),
        "body": safe(clean_body(body)),
        "link": f"https://mail.google.com/mail/u/0/#all/{msg['id']}",
    }
