from scrapmail_worker.supervisor import SLOW_CHECKS, STALE_SECONDS, WARMUP_SECONDS, Health


def report(n: int, speed: int, running: int = 100, concurrency: int = 100) -> dict:
    return {
        "updated_at": f"t{n}",
        "tasks_per_minute": speed,
        "running": running,
        "concurrency": concurrency,
    }


def test_hung_worker_is_restarted():
    health = Health()
    assert health.check(None, 0, uptime=10) is None  # just started
    assert health.check(None, 0, uptime=STALE_SECONDS + 1) == "no status report"
    assert "no status report" in health.check(report(1, 500), STALE_SECONDS + 5, uptime=900)


def test_slow_worker_is_restarted_after_a_streak():
    health = Health()
    up = WARMUP_SECONDS + 1
    assert health.check(report(0, 600), 1, uptime=up) is None  # best speed 600
    reasons = [health.check(report(i, 100), 1, uptime=up) for i in range(1, SLOW_CHECKS + 1)]
    assert reasons[:-1] == [None] * (SLOW_CHECKS - 1)
    assert reasons[-1] == "slowed down to 100 tasks/min (best 600)"


def test_little_work_is_not_a_slowdown():
    health = Health()
    up = WARMUP_SECONDS + 1
    health.check(report(0, 600), 1, uptime=up)
    # Few tasks running: the queue is just emptying, not a slowdown.
    for i in range(1, SLOW_CHECKS * 2):
        assert health.check(report(i, 20, running=5), 1, uptime=up) is None


def test_same_report_is_counted_once():
    health = Health()
    up = WARMUP_SECONDS + 1
    health.check(report(0, 600), 1, uptime=up)
    for _ in range(SLOW_CHECKS * 2):
        assert health.check(report(1, 100), 1, uptime=up) is None
