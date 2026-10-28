import json
from pathlib import Path

from core.config import settings
from google.auth.transport.requests import Request
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import InstalledAppFlow

SCOPES = [
    "https://www.googleapis.com/auth/gmail.readonly",
    "https://www.googleapis.com/auth/calendar.readonly",
]


def get_credentials() -> Credentials:
    """Load the saved token, refreshing it when it has expired."""
    token = Path(settings.google_token)
    # The scopes saved in the token, so a token from before a new scope still refreshes
    creds = Credentials.from_authorized_user_file(token)
    if not creds.valid and creds.refresh_token:
        creds.refresh(Request())
        token.write_text(creds.to_json())
    return creds


def has_scope(scope: str) -> bool:
    """Whether the saved token was granted this scope, like "calendar.readonly"."""
    token = Path(settings.google_token)
    if not token.exists():
        return False
    scopes = json.loads(token.read_text()).get("scopes", [])
    return f"https://www.googleapis.com/auth/{scope}" in scopes


def login() -> None:
    """One-time browser login. Run with: uv run python -m integrations.google_auth"""
    flow = InstalledAppFlow.from_client_secrets_file(settings.google_credentials, SCOPES)
    creds = flow.run_local_server(port=0)
    token = Path(settings.google_token)
    token.parent.mkdir(exist_ok=True)
    token.write_text(creds.to_json())
    print(f"Saved token to {token}")


if __name__ == "__main__":
    login()
