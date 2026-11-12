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
    concurrency: int  # tasks at once at start; the autopilot adjusts it
    max_concurrency: int
    restarts: int  # set by the supervisor
    status_file: str | None  # heartbeat file read by the supervisor
    parse_processes: int  # HTML parser processes (set lower when several workers run)
    user_agent: str
    serper_api_key: str | None
    search_monthly_limit: int


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
        max_concurrency=max(1, int(os.getenv("WORKER_MAX_CONCURRENCY", "300"))),
        restarts=int(os.getenv("WORKER_RESTARTS", "0")),
        status_file=os.getenv("WORKER_STATUS_FILE") or None,
        parse_processes=max(
            1, int(os.getenv("WORKER_PARSE_PROCESSES") or max(1, (os.cpu_count() or 2) - 1))
        ),
        user_agent=os.getenv(
            "WORKER_USER_AGENT",
            "Mozilla/5.0 (compatible; ScrapMailBot/0.1; business directory research)",
        ),
        serper_api_key=os.getenv("SERPER_API_KEY") or None,
        # Serper gives 2,500 free credits once; this cap stays below them.
        search_monthly_limit=max(0, int(os.getenv("SEARCH_MONTHLY_LIMIT", "2400"))),
    )
