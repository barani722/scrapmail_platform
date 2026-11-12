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


def busy_worker(lag: int = 300, db: int = 100) -> dict:
    return {"running": 200, "concurrency": 220, "loop_lag_ms": lag, "db_latency_ms": db}


def test_pool_grows_only_when_workers_are_full_and_the_machine_has_room():
    from scrapmail_worker.supervisor import decide

    full = [busy_worker()]
    assert decide(full, cpu=55, memory=50, workers=1, max_workers=3, idle_streak=0)[0] == 1
    # Machine busy, memory short, database slow, or at the maximum: no new worker.
    assert decide(full, cpu=80, memory=50, workers=1, max_workers=3, idle_streak=0)[0] == 0
    assert decide(full, cpu=50, memory=80, workers=1, max_workers=3, idle_streak=0)[0] == 0
    assert decide([busy_worker(db=600)], 50, 50, 1, 3, 0)[0] == 0
    assert decide(full * 3, cpu=50, memory=50, workers=3, max_workers=3, idle_streak=0)[0] == 0
    # A worker with room left in its main thread does not need help.
    assert decide([busy_worker(lag=20)], 50, 50, 1, 3, 0)[0] == 0


def test_pool_shrinks_when_overloaded_or_out_of_work():
    from scrapmail_worker.supervisor import IDLE_CHECKS_TO_SHRINK, decide

    two = [busy_worker(), busy_worker()]
    assert decide(two, cpu=95, memory=50, workers=2, max_workers=3, idle_streak=0)[0] == -1
    assert decide(two, cpu=50, memory=90, workers=2, max_workers=3, idle_streak=0)[0] == -1
    assert decide([busy_worker(db=2000)] * 2, 50, 50, 2, 3, 0)[0] == -1
    assert decide(two, 50, 50, 2, 3, idle_streak=IDLE_CHECKS_TO_SHRINK)[0] == -1
    # The last worker is never removed.
    assert (
        decide([busy_worker()], cpu=99, memory=99, workers=1, max_workers=3, idle_streak=99)[0] == 0
    )
