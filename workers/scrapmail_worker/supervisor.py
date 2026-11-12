"""Supervisor: keeps the worker running and restarts it when it stops working well.

Run (from the workers/ folder) instead of the worker itself:
    uv run python -m scrapmail_worker.supervisor

It starts the worker and watches the status the worker writes every 30 seconds.
The worker is restarted when it
  - exits or crashes,
  - stops reporting (hung) for STALE_SECONDS,
  - slows down: busy, but finishing less than SLOW_FRACTION of its best speed for
    SLOW_CHECKS reports in a row (e.g. something inside it degraded over time).
Unfinished tasks of a stopped worker are handed back at once (no lease wait).
Stop with Ctrl+C.
"""

from __future__ import annotations

import contextlib
import json
import logging
import os
import socket
import subprocess
import sys
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from .config import load_settings
from .db import Db

log = logging.getLogger("scrapmail.supervisor")

CHECK_SECONDS = 15
STALE_SECONDS = 180  # no status for this long: the worker hangs
WARMUP_SECONDS = 300  # do not judge speed right after a start
SLOW_FRACTION = 0.3
SLOW_CHECKS = 8  # about 4 minutes of reports (every 30 s)
MIN_BEST = 60  # tasks/min; below this there is not enough work to judge speed
STATUS_FILE = Path(__file__).resolve().parent.parent / ".worker-status.json"


@dataclass
class Health:
    """Decides from the worker's status reports whether it needs a restart."""

    best: int = 0
    slow_streak: int = 0
    last_seen: str | None = None

    def check(self, status: dict[str, Any] | None, age: float, uptime: float) -> str | None:
        """Reason to restart, or None when the worker is fine."""
        if status is None:
            return "no status report" if uptime > STALE_SECONDS else None
        if age > STALE_SECONDS:
            return f"no status report for {int(age)} s"
        if status.get("updated_at") == self.last_seen:
            return None  # same report as last check
        self.last_seen = status.get("updated_at")

        speed = int(status.get("tasks_per_minute") or 0)
        busy = int(status.get("running") or 0) >= 0.8 * int(status.get("concurrency") or 1)
        self.best = max(self.best, speed)
        if uptime < WARMUP_SECONDS:
            return None
        if busy and self.best >= MIN_BEST and speed < SLOW_FRACTION * self.best:
            self.slow_streak += 1
        else:
            self.slow_streak = 0
        if self.slow_streak >= SLOW_CHECKS:
            return f"slowed down to {speed} tasks/min (best {self.best})"
        return None


def _read_status() -> tuple[dict[str, Any] | None, float]:
    try:
        age = time.time() - STATUS_FILE.stat().st_mtime
        return json.loads(STATUS_FILE.read_text(encoding="utf-8")), age
    except (OSError, ValueError):
        return None, 0.0


def _stop(child: subprocess.Popen[bytes], worker_id: str, db: Db) -> None:
    """Stop the worker and give its unfinished tasks back."""
    if child.poll() is None:
        child.terminate()
        try:
            child.wait(timeout=15)
        except subprocess.TimeoutExpired:
            child.kill()
            child.wait(timeout=15)
    try:
        released = db.rpc("release_worker_tasks", {"p_worker": worker_id})
        log.info("handed back %s unfinished tasks of %s", released, worker_id)
    except Exception:
        log.exception("could not hand back tasks of %s (their leases will expire)", worker_id)


def main() -> None:
    logging.basicConfig(
        level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s"
    )
    db = Db(load_settings())
    host = socket.gethostname()
    restarts = 0
    backoff = 5.0
    while True:
        worker_id = f"{host}-sup-{os.getpid()}-{restarts}"
        STATUS_FILE.unlink(missing_ok=True)
        env = {
            **os.environ,
            "WORKER_ID": worker_id,
            "WORKER_RESTARTS": str(restarts),
            "WORKER_STATUS_FILE": str(STATUS_FILE),
        }
        log.info("starting worker %s (restart #%d)", worker_id, restarts)
        child = subprocess.Popen([sys.executable, "-m", "scrapmail_worker.worker"], env=env)
        started = time.monotonic()
        health = Health()
        reason: str | None = None
        try:
            while reason is None:
                time.sleep(CHECK_SECONDS)
                if child.poll() is not None:
                    reason = f"worker exited (code {child.returncode})"
                    break
                status, age = _read_status()
                reason = health.check(status, age, time.monotonic() - started)
        except KeyboardInterrupt:
            log.info("stopping (Ctrl+C)")
            # Ctrl+C reaches the worker too; give it time to hand back its tasks.
            with contextlib.suppress(subprocess.TimeoutExpired):
                child.wait(timeout=20)
            _stop(child, worker_id, db)
            return

        log.warning("restarting worker: %s", reason)
        _stop(child, worker_id, db)
        restarts += 1
        # A worker that keeps crashing right after start is restarted more slowly.
        backoff = min(backoff * 2, 120.0) if time.monotonic() - started < 120 else 5.0
        time.sleep(backoff)


if __name__ == "__main__":
    main()
