"""Supervisor: runs a pool of workers, sized to what the machine can take.

Run (from the workers/ folder) instead of the worker itself:
    uv run python -m scrapmail_worker.supervisor      (or: pnpm worker)

One worker uses one CPU core for its main work (Python), so a single worker
cannot use a multi-core machine. The supervisor starts more workers while
  - the running workers are all at their limit (their main thread is full),
  - there is work in the queue,
  - and the machine and database have room (CPU, memory, database response time),
and stops one again when CPU, memory or the database are overloaded, or when there
is not enough work left. Checked every CHECK_SECONDS.

Each worker is also restarted when it exits, stops reporting (hung), or stays far
below its best speed while busy. Unfinished tasks of a stopped worker are handed
back at once. Stop everything with Ctrl+C.
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
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import psutil

from .config import load_settings
from .db import Db

log = logging.getLogger("scrapmail.supervisor")

CHECK_SECONDS = 15
STALE_SECONDS = 180  # no status for this long: the worker hangs
WARMUP_SECONDS = 300  # do not judge a worker's speed right after its start
SLOW_FRACTION = 0.3
SLOW_CHECKS = 8  # about 4 minutes of reports (every 30 s)
MIN_BEST = 60  # tasks/min; below this there is not enough work to judge speed

# Pool size limits (machine and database protection).
CPU_ADD_BELOW = 70.0  # % of all cores: room for one more worker
CPU_REMOVE_ABOVE = 90.0
MEMORY_ADD_BELOW = 75.0  # % of RAM
MEMORY_REMOVE_ABOVE = 85.0
DB_ADD_BELOW_MS = 400  # average database call time of the workers
DB_REMOVE_ABOVE_MS = 1500
SATURATED_LAG_MS = 150  # a worker's main thread is full above this lag
IDLE_FRACTION = 0.2  # a worker using less than this share of its slots has little work
SCALE_COOLDOWN = 90  # seconds between pool changes (let the new state settle)
IDLE_CHECKS_TO_SHRINK = 8  # about 2 minutes of little work before removing a worker

STATUS_DIR = Path(__file__).resolve().parent.parent


@dataclass
class Health:
    """Decides from one worker's status reports whether it needs a restart."""

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


def saturated(status: dict[str, Any]) -> bool:
    """The worker's main thread is full and its slots are busy: it cannot go faster."""
    running = int(status.get("running") or 0)
    limit = max(1, int(status.get("concurrency") or 1))
    return int(status.get("loop_lag_ms") or 0) >= SATURATED_LAG_MS and running >= 0.8 * limit


def idle(status: dict[str, Any]) -> bool:
    running = int(status.get("running") or 0)
    limit = max(1, int(status.get("concurrency") or 1))
    return running < IDLE_FRACTION * limit


def decide(
    statuses: list[dict[str, Any]],
    cpu: float,
    memory: float,
    workers: int,
    max_workers: int,
    idle_streak: int,
) -> tuple[int, str]:
    """+1 (add a worker), -1 (remove one) or 0, with the reason."""
    db_ms = max((int(s.get("db_latency_ms") or 0) for s in statuses), default=0)
    if workers > 1 and cpu > CPU_REMOVE_ABOVE:
        return -1, f"CPU {cpu:.0f}% is too high"
    if workers > 1 and memory > MEMORY_REMOVE_ABOVE:
        return -1, f"memory {memory:.0f}% is too high"
    if workers > 1 and db_ms > DB_REMOVE_ABOVE_MS:
        return -1, f"database answers slowly ({db_ms} ms)"
    if workers > 1 and idle_streak >= IDLE_CHECKS_TO_SHRINK:
        return -1, "little work left"
    if (
        workers < max_workers
        and statuses
        and len(statuses) == workers
        and all(saturated(s) for s in statuses)
        and cpu < CPU_ADD_BELOW
        and memory < MEMORY_ADD_BELOW
        and db_ms < DB_ADD_BELOW_MS
    ):
        return 1, f"all workers at their limit, CPU {cpu:.0f}%, memory {memory:.0f}%"
    return 0, ""


@dataclass
class WorkerProcess:
    slot: int
    worker_id: str
    status_file: Path
    child: subprocess.Popen[bytes]
    started: float = field(default_factory=time.monotonic)
    health: Health = field(default_factory=Health)

    def read_status(self) -> tuple[dict[str, Any] | None, float]:
        try:
            age = time.time() - self.status_file.stat().st_mtime
            return json.loads(self.status_file.read_text(encoding="utf-8")), age
        except (OSError, ValueError):
            return None, 0.0


class Supervisor:
    def __init__(self) -> None:
        self.db = Db(load_settings())
        self.host = socket.gethostname()
        cores = os.cpu_count() or 2
        self.max_workers = max(
            1, int(os.getenv("WORKER_PROCESSES_MAX") or max(1, (cores - 1) // 2))
        )
        # Parser processes per worker, so the whole pool shares the cores.
        self.parse_processes = max(1, (cores - 1) // self.max_workers)
        self.workers: list[WorkerProcess] = []
        self.restarts = 0
        self.last_scale = 0.0
        self.idle_streak = 0

    def start(self, slot: int) -> WorkerProcess:
        worker_id = f"{self.host}-sup-{os.getpid()}-w{slot}-{self.restarts}"
        status_file = STATUS_DIR / f".worker-status-{slot}.json"
        status_file.unlink(missing_ok=True)
        env = {
            **os.environ,
            "WORKER_ID": worker_id,
            "WORKER_RESTARTS": str(self.restarts),
            "WORKER_STATUS_FILE": str(status_file),
            "WORKER_PARSE_PROCESSES": str(self.parse_processes),
        }
        log.info("starting worker %s", worker_id)
        child = subprocess.Popen([sys.executable, "-m", "scrapmail_worker.worker"], env=env)
        return WorkerProcess(slot, worker_id, status_file, child)

    def stop(self, worker: WorkerProcess) -> None:
        """Stop a worker and give its unfinished tasks back."""
        if worker.child.poll() is None:
            worker.child.terminate()
            try:
                worker.child.wait(timeout=15)
            except subprocess.TimeoutExpired:
                worker.child.kill()
                worker.child.wait(timeout=15)
        try:
            released = self.db.rpc("release_worker_tasks", {"p_worker": worker.worker_id})
            log.info("handed back %s unfinished tasks of %s", released, worker.worker_id)
        except Exception:
            log.exception("could not hand back tasks of %s", worker.worker_id)
        with contextlib.suppress(Exception):
            self.db.update(
                "worker_status", {"worker_id": f"eq.{worker.worker_id}"}, {"state": "stopped"}
            )

    def check(self) -> None:
        statuses: list[dict[str, Any]] = []
        for i, worker in enumerate(list(self.workers)):
            uptime = time.monotonic() - worker.started
            status: dict[str, Any] | None = None
            if worker.child.poll() is not None:
                reason: str | None = f"worker exited (code {worker.child.returncode})"
            else:
                status, age = worker.read_status()
                reason = worker.health.check(status, age, uptime)
            if reason:
                log.warning("restarting %s: %s", worker.worker_id, reason)
                self.stop(worker)
                self.restarts += 1
                self.workers[i] = self.start(worker.slot)
                continue
            if status and uptime >= 60:
                statuses.append(status)

        cpu = psutil.cpu_percent(interval=None)
        memory = psutil.virtual_memory().percent
        busy_workers = statuses and not all(idle(s) for s in statuses)
        self.idle_streak = 0 if busy_workers or not statuses else self.idle_streak + 1
        if time.monotonic() - self.last_scale < SCALE_COOLDOWN:
            return
        change, why = decide(
            statuses, cpu, memory, len(self.workers), self.max_workers, self.idle_streak
        )
        if change > 0:
            log.info("adding worker %d (max %d): %s", len(self.workers) + 1, self.max_workers, why)
            self.workers.append(self.start(len(self.workers)))
        elif change < 0:
            newest = self.workers.pop()
            log.info("removing a worker (%d left): %s", len(self.workers), why)
            self.stop(newest)
        if change:
            self.last_scale = time.monotonic()
            self.idle_streak = 0

    def run(self) -> None:
        log.info(
            "supervisor started: up to %d workers, %d parser processes each",
            self.max_workers,
            self.parse_processes,
        )
        psutil.cpu_percent(interval=None)  # the first reading starts the measurement
        self.workers.append(self.start(0))
        self.last_scale = time.monotonic()
        try:
            while True:
                time.sleep(CHECK_SECONDS)
                self.check()
        except KeyboardInterrupt:
            log.info("stopping (Ctrl+C)")
            # Ctrl+C reaches the workers too; give them time to hand back their tasks.
            for worker in self.workers:
                with contextlib.suppress(subprocess.TimeoutExpired):
                    worker.child.wait(timeout=20)
            for worker in self.workers:
                self.stop(worker)


def main() -> None:
    logging.basicConfig(
        level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s"
    )
    Supervisor().run()


if __name__ == "__main__":
    main()
