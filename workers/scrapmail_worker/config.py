"""Worker settings, read from environment variables (or workers/.env)."""

from __future__ import annotations

import os
import socket
from dataclasses import dataclass
from pathlib import Path

from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parent.parent / ".env")


@dataclass(frozen=True)
class Settings:
    supabase_url: str
    supabase_secret_key: str
    worker_id: str
    concurrency: int
    user_agent: str
    brave_api_key: str | None
    brave_monthly_limit: int


def load_settings() -> Settings:
    missing = [k for k in ("SUPABASE_URL", "SUPABASE_SECRET_KEY") if not os.getenv(k)]
    if missing:
        raise SystemExit(
            f"Missing settings: {', '.join(missing)}. Copy workers/.env.example to workers/.env."
        )
    secret = os.environ["SUPABASE_SECRET_KEY"]
    if not secret.startswith("sb_secret_"):
        raise SystemExit("SUPABASE_SECRET_KEY must be a Supabase secret key (sb_secret_...).")

    return Settings(
        supabase_url=os.environ["SUPABASE_URL"].rstrip("/"),
        supabase_secret_key=secret,
        worker_id=os.getenv("WORKER_ID") or f"{socket.gethostname()}-{os.getpid()}",
        concurrency=max(1, int(os.getenv("WORKER_CONCURRENCY", "8"))),
        user_agent=os.getenv(
            "WORKER_USER_AGENT",
            "Mozilla/5.0 (compatible; ScrapMailBot/0.1; business directory research)",
        ),
        brave_api_key=os.getenv("BRAVE_API_KEY") or None,
        # Brave's free monthly credit covers ~1,000 searches; stay safely below it.
        brave_monthly_limit=max(0, int(os.getenv("BRAVE_MONTHLY_LIMIT", "950"))),
    )
