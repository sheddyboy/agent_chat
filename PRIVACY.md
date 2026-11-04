# Privacy policy

agent_chat is a personal, local-first assistant. It runs on the owner's own machine and has no hosted service, accounts or analytics.

## Google data

When the owner connects a Google account, the app asks for two read-only scopes:

- `gmail.readonly`, to search and read mail
- `calendar.readonly`, to list events and find free time

The app never sends, changes or deletes mail or events.

## Where data goes

- The OAuth token is stored only in `backend/data/secrets/token.json` on the owner's machine.
- Mail and calendar data is fetched on demand and processed by language models that run locally through Ollama. It is not sent to any third party.
- Chats, briefings and other app data are stored locally in `backend/data/`.

## Removing access

Revoke access at [myaccount.google.com](https://myaccount.google.com) → Security → Third-party access, or delete `backend/data/secrets/token.json`.

## Contact

Open an issue at [github.com/sheddyboy/agent_chat](https://github.com/sheddyboy/agent_chat/issues).
