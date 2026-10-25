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
| I1 | Gmail | Own tools, Gmail API | Model local, mail via Google | Medium |
| I2 | Google Calendar | Own tools, reuses I1 auth | Model local, data via Google | Small |
| I3 | Google Drive / Docs | Own tools into Qdrant ingestion | Model local, data via Google | Medium |
| I4 | Memory / profile | Own tools plus SQLite | Yes | Small |
| I5 | Daily briefing | Scheduled run over I1, I2 and weather | Yes | Small |
| I6 | Obsidian / markdown notes | Existing ingestion plus filesystem MCP | Yes | Small |
| I7 | GitHub | Official MCP server | No | Small |
| I8 | Todoist / Apple Reminders | MCP or AppleScript | Mixed | Small |
| I9 | Spotify | Own tools, Web API | No | Medium |
| I10 | Home Assistant | Its MCP support | Yes | Small |
| I11 | Telegram bot | Bot that forwards to `/chat` | No | Medium |
| I12 | Slack / Discord | MCP servers | No | Small |
| I13 | Apple Health / Strava | Parse export files | Yes for Health | Medium |
| I14 | Bank CSV imports | Parse CSVs into SQLite | Yes | Small |

## Todos

- [ ] **I1. Gmail.** Pull mail from any time range, search it, list unread, get summaries and insights.
  - `search_emails(since, query, unread_only, max_results)`: one tool for date ranges, search and unread. `since` accepts `24h`, `48h`, `7d`, `1m`, `3m` or `2026-10-01..2026-10-15`, turned into Gmail `after:` / `before:` epoch seconds. `query` is free text or Gmail syntax (`from:bank`, `has:attachment`). Returns id, date, sender, subject and snippet per mail.
  - `read_email(id)`: one cleaned body. HTML stripped, quoted replies and signatures cut, length capped.
  - `email_insights(since, query, focus)`: stats in Python (counts, top senders, unread, categories, busiest days), then map-reduce with `llm.invoke` over batches of about 20 mails. `focus` is `summary`, `needs_reply`, `action_items`, `receipts`, `important` or free text.
  - Files: `integrations/google_auth.py`, `integrations/gmail.py`, `tools/gmail.py`.
  - Setup: Google Cloud project, Gmail API on, OAuth client of type Desktop app, `credentials.json` into `backend/secrets/`, one browser login. Scope `gmail.readonly`.
  - Gotcha: an OAuth app in Testing mode expires refresh tokens after 7 days. Set it to In production (unverified is fine for personal use).
  - Slices: 17a auth plus search and read, 17b insights, 17c UI connect status and a local cache for long ranges.
  - Later: `draft_reply` with the `gmail.compose` scope. Creates a draft, never sends, in `SENSITIVE_TOOLS`.

- [ ] **I2. Google Calendar.** "What does my day look like", free slots, meeting prep that pulls related emails from I1.
  - Same OAuth client as I1, adds the `calendar.readonly` scope. This is the second use that justifies sharing `google_auth.py`.

- [ ] **I3. Google Drive / Docs.** Pick files or a folder and ingest them into the Qdrant library like uploads.

- [ ] **I4. Memory / profile.** The agent saves facts about me (preferences, people, ongoing things) and gets them in every thread.
  - `remember(fact)` and `forget(fact)` tools, a SQLite table, top facts added to the system prompt.
  - Biggest personalization win for the effort. Integrations give data, memory makes it mine.

- [ ] **I5. Daily briefing.** A morning digest: mail from the last 24h, today's calendar, weather, open GitHub reviews.
  - Depends on I1 and I2. Runs on a schedule and saves the result as a thread.

- [ ] **I6. Obsidian / markdown notes.** Point ingestion at a notes folder and re-ingest on change.

- [ ] **I7. GitHub.** My PRs, issues and review requests through the official GitHub MCP server. Needs a token, opt in.

- [ ] **I8. Todoist / Apple Reminders.** "Add this to my list", "what's overdue". Todoist has an official MCP server, Reminders works through AppleScript on macOS.

- [ ] **I9. Spotify.** What I've been listening to, playback control, playlists for a mood.

- [ ] **I10. Home Assistant.** Lights and devices from chat. Local-first, fits the stack.

- [ ] **I11. Telegram bot.** Talk to the agent from my phone. Pairs with voice mode for voice notes.

- [ ] **I12. Slack / Discord.** Summaries of unread channels.

- [ ] **I13. Apple Health / Strava.** Sleep, steps and workout trends. Apple Health is a local XML export.

- [ ] **I14. Bank CSV imports.** Spending insights from exported statements, no live bank connection.
