# Integrations

Connections to my own accounts and data so the agent knows about my life, not just my documents. Each one becomes tools in `backend/tools/` (own code) or a server in `mcp_servers.json` (when an official one exists). Pick one, then move it into `PLAN.md` as a numbered slice.

Rules for every integration:
- Read-only first. Anything that writes or sends goes in `SENSITIVE_TOOLS`.
- Tokens and credentials live in `backend/secrets/`, gitignored.
- Content from outside (emails, messages, pages) is untrusted: run it through `guard.py` before the model sees it.
- Tools are registered only when their token exists, like `web_search` with the Tavily key.
- Keep tool output compact. The chat model has an 8K context.

## Summary

| # | Integration | How | Local? | Effort |
|---|---|---|---|---|
| I1 | Gmail (done, slice 17) | Own tools, Gmail API | Model local, mail via Google | Medium |
| I2 | Google Calendar (done, slice 18a) | Own tools, reuses I1 auth | Model local, data via Google | Small |
| I4 | Memory / profile | Own tools plus SQLite | Yes | Small |
| I5 | Daily briefing (on demand done, slice 18b) | One pipeline over I1, I2 and weather | Yes | Small |
| I7 | GitHub | Official MCP server | No | Small |

## Todos

- [x] **I1. Gmail (slice 17).** Read-only. The agent searches my mail by time range, sender or topic, lists unread, opens single emails and summarizes recent mail.
  - **What it does**
    - `search_emails(since, query, unread_only, max_results)`: one tool for time ranges, search and unread. `since` accepts `24h`, `48h`, `7d`, `2w`, `1m`, `3m`, `1y` (also spelled out, like `1mo` or `2 weeks`), a range like `2026-10-01..2026-10-15` (end day included), or `""` for any time. `query` is free text or Gmail syntax (`from:bank`, `has:attachment`, `-category:promotions`). Returns one line per mail: id, date, sender, subject, unread flag, snippet, and whether more match.
    - `read_email(message_id)`: one email with headers, a Gmail link that opens in a new tab, and a cleaned body (HTML to text, quoted replies and signatures cut, links shortened to `[link: domain]`, capped at 4000 characters).
    - Overviews ("what happened in my email in the last 48h") come from the model summarizing a `search_emails` result. No separate insights tool.
    - Subjects, snippets and bodies go through the injection guard; flagged ones are replaced with a short notice.
  - **Limitations**
    - One search returns at most 50 mails, newest first. About two days of my mail fits, so overviews of 24h or 48h see everything. A week or a month only sees the newest 50, and the model may summarize those as if they were the whole range. Narrow the query (a sender, `-category:promotions`) for longer ranges.
    - No exact stats (counts, top senders) over a range; the model only sees what one search returns.
    - Read-only: no replying, drafting, labeling or deleting. I reply in Gmail.
    - Links inside emails are only shown as their domain, so the model cannot give the real job or tracking URL. Open the email in Gmail for those.
    - Guard false positives: login-code emails get their snippet hidden. The input guard can also block my own message ("open my latest email ... and give me its Gmail link" scored 0.995); rewording works.
    - Time ranges use 30-day months and 365-day years, and Gmail filters by the second it received the mail.
    - Each turn takes the tool 0.3 to 2 s; the rest is the model.
  - **Setup:** Google Cloud project, Gmail API on, OAuth client of type Desktop app, `credentials.json` into `backend/secrets/`, then `uv run python -m integrations.google_auth` from `backend/` once. Scope `gmail.readonly`. The tools only appear when `secrets/token.json` exists.
  - **Gotcha:** an OAuth app in Testing mode expires refresh tokens after 7 days and the tools then ask me to log in again. Set the app to In production (unverified is fine for personal use).
  - Files: `integrations/google_auth.py`, `integrations/gmail.py`, `tools/gmail.py`.
  - **Skipped:** an `email_insights` tool (stats plus map-reduce summaries over long ranges) and a UI connect status with a local cache. Recent overviews already work through `search_emails`, and searches are fast without a cache. Revisit if month-long overviews turn out to matter.

- [x] **I2. Google Calendar (slice 18a).** Read-only. "What does my day look like", free slots, and meeting prep that pulls related emails from I1.
  - **What it does**
    - `list_events(when)`: events from all my calendars (including shared and holiday ones), one line each: day, time or "all day", title, calendar, location, meet link, up to 3 attendees plus a count, and "(declined)". `when` accepts `today`, `tomorrow`, `this week` (to Sunday), `next week`, a weekday like `friday` (the next one after today), `3d` or `2w` from now, a date, or a range like `2026-10-27..2026-10-29` (end day included).
    - `free_slots(when, min_minutes)`: gaps inside working hours (`work_day_start` and `work_day_end` in `config.py`, 09:00 to 18:00) between timed events on every calendar. Computed in Python, not by the model.
    - Meeting prep is the model chaining `list_events`, `search_emails` (a month of all mail) and `read_email`. No separate tool.
    - Titles and locations go through the injection guard.
  - **Limitations**
    - At most 60 events per call, so a busy month gets cut; ask for a shorter range.
    - All-day events never block time in `free_slots`, even when marked busy (they are mostly reminders and birthdays). Weekends get working hours like weekdays.
    - Events on a shared calendar block my time too, so a partner's appointment shows me as busy.
    - No event descriptions, only the fields above. Read-only: no creating, accepting or moving events.
  - **Setup:** turn on the Google Calendar API in the same Cloud project as I1, then run the login again (`uv run python -m integrations.google_auth` from `backend/`). The token keeps the scopes it was saved with, so an old Gmail-only token still works for Gmail; the calendar tools only appear once the token has `calendar.readonly`.
  - Files: `integrations/google_calendar.py`, `tools/google_calendar.py`.

- [ ] **I4. Memory / profile.** The agent saves facts about me (preferences, people, ongoing things) and gets them in every thread.
  - `remember(fact)` and `forget(fact)` tools, a SQLite table, top facts added to the system prompt.
  - Biggest personalization win for the effort. Integrations give data, memory makes it mine.

- [ ] **I5. Daily briefing (on demand done in slice 18b, schedule still to do).** A morning digest of today's calendar, the last 24h of mail and the weather, saved as a chat.
  - **What it does**
    - The Briefing button in the sidebar calls `POST /briefing`, which opens a new chat titled "Briefing, Sun 25 Oct" in about 15 s.
    - `briefing.py` is a pipeline, not an agent: it fetches the data directly, then makes one model call with fixed sections (Today, Mail worth a look, Weather). Overlapping events are found in code and marked as clashes, since the model missed them.
    - Mail is the last 24h without promotions and social, at most 30, snippets cut to 80 characters, to fit the 8K context. Weather is today's sky, low and high, and rain chance from Open-Meteo (no key).
    - The gathered data is saved in the chat as a `daily_briefing` tool step with email ids, so follow-ups like "tell me more about the Fathom recap" open the right email with `read_email`.
    - A part that is not connected or fails becomes a short note; the rest of the briefing still renders.
  - **Limitations**
    - The model picks "mail worth a look" and sometimes keeps notifications (Slack, Otter.ai) or leaves out why an email matters.
    - Only today's events, so a 04:30 start tomorrow is not mentioned in an evening briefing.
    - No GitHub reviews until I7 exists.
  - **Setup:** set `WEATHER_LAT` and `WEATHER_LON` in `backend/.env` for the weather; without them the briefing skips it.
  - Files: `briefing.py`, `routes/briefing.py`, the button in `components/sidebar.tsx`.
  - **Next (18c):** run it on a schedule from the backend at a set time, skip if today's briefing exists, and open it on first load.

- [ ] **I7. GitHub.** My PRs, issues and review requests through the official GitHub MCP server. Needs a token, opt in.
