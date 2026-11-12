import asyncio
from types import SimpleNamespace

from scrapmail_worker.autopilot import Autopilot, SpeedMeter
from scrapmail_worker.worker import Worker


def make_worker(concurrency: int) -> Worker:
    """Worker without network or database (those are replaced per test)."""
    worker = Worker.__new__(Worker)
    worker.settings = SimpleNamespace(
        worker_id="t",
        concurrency=concurrency,
        max_concurrency=concurrency,
        serper_api_key=None,
        restarts=0,
        status_file=None,
    )
    worker.stopping = asyncio.Event()
    worker.crawler = SimpleNamespace(close=lambda: asyncio.sleep(0))
    worker.db = SimpleNamespace(close=lambda: None)
    worker.autopilot = Autopilot(concurrency, minimum=1, maximum=concurrency)
    worker.speed = SpeedMeter()
    worker.loop_lag = 0.0
    worker.db_ms = 0.0
    worker.running = {}
    worker.finished = []
    worker.started_at = "now"
    return worker


class FakeQueue:
    """In-memory stand-in for claim_scrape_tasks / release_scrape_task."""

    def __init__(self, kinds: list[str]) -> None:
        self.queued = [{"id": i, "kind": k} for i, k in enumerate(kinds)]
        self.released = 0

    def rpc(self, name, params):
        if name == "release_scrape_task":
            task = next(t for t in self.claimed if t["id"] == params["p_task_id"])
            self.queued.insert(0, task)
            self.released += 1
            return None
        excluded = set(params["p_exclude_kinds"])
        picked = [t for t in self.queued if t["kind"] not in excluded][: params["p_limit"]]
        for t in picked:
            self.queued.remove(t)
        self.claimed = getattr(self, "claimed", []) + picked
        return picked


def test_pool_runs_one_osm_query_at_a_time_and_every_task_once(monkeypatch):
    queue = FakeQueue(["discover_osm"] * 4 + ["qualify_candidate"] * 6)
    worker = make_worker(3)
    processed: list[int] = []
    active = {"osm": 0, "max_osm": 0, "all": 0, "max_all": 0}

    async def fake_db(method, name, params):
        return queue.rpc(name, params)

    async def fake_process(task):
        osm = task["kind"] == "discover_osm"
        active["all"] += 1
        active["osm"] += osm
        active["max_osm"] = max(active["max_osm"], active["osm"])
        active["max_all"] = max(active["max_all"], active["all"])
        await asyncio.sleep(0.02)
        processed.append(task["id"])
        active["all"] -= 1
        active["osm"] -= osm
        if len(processed) == 10:
            worker.stopping.set()

    worker._db = fake_db
    worker.process = fake_process

    monkeypatch.setattr("scrapmail_worker.worker.IDLE_SECONDS", 0.01)
    asyncio.run(worker.run())

    assert sorted(processed) == list(range(10))
    assert active["max_osm"] == 1
    assert active["max_all"] == 3


def test_found_websites_are_checked_before_other_tasks(monkeypatch):
    queue = FakeQueue(["discover_links"] * 5 + ["qualify_candidate"] * 2)
    worker = make_worker(2)
    order: list[str] = []

    async def fake_db(method, name, params):
        return queue.rpc(name, params)

    async def fake_process(task):
        order.append(task["kind"])
        await asyncio.sleep(0.01)
        if len(order) == 7:
            worker.stopping.set()

    worker._db = fake_db
    worker.process = fake_process
    monkeypatch.setattr("scrapmail_worker.worker.IDLE_SECONDS", 0.01)
    asyncio.run(worker.run())

    assert order[:2] == ["qualify_candidate", "qualify_candidate"]
    assert len(order) == 7


def test_task_results_are_sent_in_batches(monkeypatch):
    monkeypatch.setattr("scrapmail_worker.worker.COMPLETE_BATCH", 2)
    worker = make_worker(2)
    calls: list[list[int]] = []

    async def fake_db(method, name, params):
        assert name == "complete_scrape_tasks"
        calls.append([r["id"] for r in params["p_results"]])

    worker._db = fake_db

    async def scenario():
        for task_id in (1, 2, 3):
            await worker._complete(task_id, True, {"status": "ok"})
        await worker._flush_results()

    asyncio.run(scenario())
    assert calls == [[1, 2], [3]]
    assert worker.finished == []


def test_autopilot_runs_fewer_tasks_when_overloaded_and_more_when_idle():
    pilot = Autopilot(100, minimum=16, maximum=200)
    assert pilot.adjust(lag=1.2, busy=100) == 75  # main thread overloaded
    assert pilot.adjust(lag=0.05, busy=75) == 91  # room left and all slots busy
    assert pilot.adjust(lag=0.05, busy=10) == 91  # idle slots: no reason to grow
    for _ in range(20):
        pilot.adjust(lag=2.0, busy=100)
    assert pilot.limit == 16  # never below the minimum


def test_speed_meter_counts_the_last_minute():
    meter = SpeedMeter()
    meter.tick(30, now=0.0)
    meter.tick(10, now=50.0)
    assert meter.per_minute(now=55.0) == 40
    assert meter.per_minute(now=100.0) == 10


def test_only_new_contacts_with_a_mail_domain_are_saved():
    worker = make_worker(2)
    saved: list[dict] = []

    class Domains:
        async def check(self, domain):
            return {"agency.com": "ok", "nomail.com": "no_mail_server"}.get(domain, "no_domain")

    async def fake_db(method, table, rows, **kwargs):
        saved.extend(rows)

    worker.domains = Domains()
    worker._db = fake_db
    asyncio.run(
        worker._save_contacts("ws", "ag", ["info@agency.com", "info@gone.com", "a@nomail.com"])
    )
    # Only the address whose domain accepts email is saved.
    assert [(r["email"], r["email_status"]) for r in saved] == [("info@agency.com", "valid")]
