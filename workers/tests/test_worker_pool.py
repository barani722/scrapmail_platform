import asyncio
from types import SimpleNamespace

from scrapmail_worker.worker import Worker


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
    worker = Worker.__new__(Worker)
    worker.settings = SimpleNamespace(worker_id="t", concurrency=3, brave_api_key=None)
    worker.stopping = asyncio.Event()
    worker.crawler = SimpleNamespace(close=lambda: asyncio.sleep(0))
    worker.db = SimpleNamespace(close=lambda: None)
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
