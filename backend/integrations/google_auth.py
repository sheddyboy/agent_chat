from pathlib import Path

from config import settings
from google.auth.transport.requests import Request
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import InstalledAppFlow

SCOPES = ["https://www.googleapis.com/auth/gmail.readonly"]


def get_credentials() -> Credentials:
    """Load the saved token, refreshing it when it has expired."""
    token = Path(settings.google_token)
    creds = Credentials.from_authorized_user_file(token, SCOPES)
    if not creds.valid and creds.refresh_token:
        creds.refresh(Request())
        token.write_text(creds.to_json())
    return creds


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
