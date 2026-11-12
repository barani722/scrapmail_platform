"""Self-tuning for the worker: how many tasks to run at once, and a speed meter.

The worker's main thread does all downloading and bookkeeping. When it is
overloaded, every task waits on it (measured as event-loop lag), so running more
tasks makes everything slower. When it has room and all slots are busy, more
tasks finish more work. The autopilot moves the limit between those two states.
"""

from __future__ import annotations

import time
from collections import deque
from dataclasses import dataclass, field

LAG_HIGH = 0.5  # seconds: the main thread is overloaded, run fewer tasks
LAG_LOW = 0.1  # seconds: the main thread has room
STEP_UP = 16
STEP_DOWN = 0.75


@dataclass
class Autopilot:
    limit: int
    minimum: int = 16
    maximum: int = 300

    def __post_init__(self) -> None:
        self.limit = max(self.minimum, min(self.maximum, self.limit))

    def adjust(self, lag: float, busy: int) -> int:
        """New task limit from the measured loop lag and the number of busy slots."""
        if lag > LAG_HIGH:
            self.limit = max(self.minimum, int(self.limit * STEP_DOWN))
        elif lag < LAG_LOW and busy >= self.limit * 0.9:
            self.limit = min(self.maximum, self.limit + STEP_UP)
        return self.limit


@dataclass
class SpeedMeter:
    """Finished tasks per minute over a sliding window."""

    window: float = 60.0
    _times: deque[float] = field(default_factory=deque)

    def tick(self, count: int = 1, now: float | None = None) -> None:
        now = time.monotonic() if now is None else now
        self._times.extend([now] * count)
        self._trim(now)

    def per_minute(self, now: float | None = None) -> int:
        now = time.monotonic() if now is None else now
        self._trim(now)
        return round(len(self._times) * 60.0 / self.window)

    def _trim(self, now: float) -> None:
        while self._times and self._times[0] < now - self.window:
            self._times.popleft()
