"""Scraping worker: claims tasks from the database queue and processes them.

Run (from the workers/ folder):
    uv run python -m scrapmail_worker.worker

Several workers can run at the same time: tasks are claimed atomically, and
tasks of a crashed worker are picked up again when their lease expires.
"""

from __future__ import annotations

import asyncio
import contextlib
import logging
import signal
from datetime import UTC, datetime
from typing import Any

import httpx

from .config import Settings, load_settings
from .crawler import Crawler, PermanentError
from .db import Db
from .normalize import country_code, is_role_address

log = logging.getLogger("scrapmail.worker")

IDLE_SECONDS = 5
LEASE_SECONDS = 300


class Worker:
    def __init__(self, settings: Settings) -> None:
        self.settings = settings
        self.db = Db(settings)
        self.crawler = Crawler(settings.user_agent)
        self.stopping = asyncio.Event()

    async def _db(self, method: str, *args: Any, **kwargs: Any) -> Any:
        """Run a (blocking) database call without blocking the event loop."""
        return await asyncio.to_thread(getattr(self.db, method), *args, **kwargs)

    async def run(self) -> None:
        log.info(
            "worker %s started (concurrency %d)", self.settings.worker_id, self.settings.concurrency
        )
        while not self.stopping.is_set():
            try:
                tasks = await self._db(
                    "rpc",
                    "claim_scrape_tasks",
                    {
                        "p_worker": self.settings.worker_id,
                        "p_limit": self.settings.concurrency,
                        "p_lease_seconds": LEASE_SECONDS,
                    },
                )
            except Exception:
                log.exception("could not claim tasks; retrying")
                tasks = []
            if not tasks:
                with contextlib.suppress(TimeoutError):
                    await asyncio.wait_for(self.stopping.wait(), IDLE_SECONDS)
                continue
            await asyncio.gather(*(self.process(task) for task in tasks))
        await self.crawler.close()
        self.db.close()
        log.info("worker stopped")

    async def process(self, task: dict[str, Any]) -> None:
        task_id = task["id"]
        try:
            if task["kind"] == "enrich_website":
                result = await self.enrich_website(task)
            else:
                raise ValueError(f"Unknown task kind {task['kind']}")
            await self._complete(task_id, True, result)
        except PermanentError as exc:
            # The site cannot be processed: record it and do not retry.
            await self._mark_agency(
                task["agency_id"],
                {"website_status": exc.status, "last_checked_at": datetime.now(UTC).isoformat()},
            )
            await self._complete(task_id, True, {"status": exc.status, "error": str(exc)})
        except (httpx.HTTPError, TimeoutError) as exc:
            log.warning("task %s temporary error: %s", task_id, exc)
            await self._complete(task_id, False, None, f"{type(exc).__name__}: {exc}")
        except Exception as exc:
            log.exception("task %s failed", task_id)
            await self._complete(task_id, False, None, f"{type(exc).__name__}: {exc}")

    async def enrich_website(self, task: dict[str, Any]) -> dict[str, Any]:
        agency_id, workspace_id = task["agency_id"], task["workspace_id"]
        agencies = await self._db(
            "select",
            "agencies",
            {
                "select": "id,website_url,description,phone,country_code,city,address",
                "id": f"eq.{agency_id}",
            },
        )
        if not agencies or not agencies[0]["website_url"]:
            return {"status": "skipped", "reason": "no website"}
        agency = agencies[0]

        site = await self.crawler.crawl(agency["website_url"])

        # Fill only empty fields: imported client data is never overwritten.
        updates: dict[str, Any] = {
            "website_status": "ok",
            "website_title": site.title,
            "last_checked_at": datetime.now(UTC).isoformat(),
        }
        if not agency["description"] and site.description:
            updates["description"] = site.description
        if not agency["phone"] and site.phones:
            updates["phone"] = site.phones[0]
        if not agency["country_code"] and site.country:
            code = country_code(site.country) or (
                site.country.upper() if len(site.country) == 2 else None
            )
            if code:
                updates["country_code"] = code
        if not agency["city"] and site.city:
            updates["city"] = str(site.city)[:200]
        if not agency["address"] and site.address:
            updates["address"] = site.address[:500]
        await self._mark_agency(agency_id, updates)

        if site.emails:
            await self._db(
                "insert",
                "agency_contacts",
                [
                    {
                        "workspace_id": workspace_id,
                        "agency_id": agency_id,
                        "email": email,
                        "is_role_address": is_role_address(email),
                        "source": "website",
                    }
                    for email in site.emails[:20]
                ],
                on_conflict="agency_id,email_normalized",
                ignore_duplicates=True,
            )

        await self._db(
            "insert",
            "agency_sources",
            {
                "workspace_id": workspace_id,
                "agency_id": agency_id,
                "source_type": "website",
                "source_name": "website crawl",
                "source_ref": f"{site.final_url}@{datetime.now(UTC).date().isoformat()}",
                "raw": {
                    "pages": site.pages,
                    "emails": site.emails,
                    "phones": site.phones,
                    "title": site.title,
                    "language": site.language,
                },
            },
            on_conflict="workspace_id,source_type,source_name,source_ref",
            ignore_duplicates=True,
        )
        log.info(
            "enriched %s: %d emails, %d pages", site.final_url, len(site.emails), len(site.pages)
        )
        return {"status": "ok", "emails": len(site.emails), "pages": len(site.pages)}

    async def _mark_agency(self, agency_id: str, values: dict[str, Any]) -> None:
        await self._db("update", "agencies", {"id": f"eq.{agency_id}"}, values)

    async def _complete(
        self, task_id: int, success: bool, result: dict[str, Any] | None, error: str | None = None
    ) -> None:
        try:
            await self._db(
                "rpc",
                "complete_scrape_task",
                {"p_task_id": task_id, "p_success": success, "p_result": result, "p_error": error},
            )
        except Exception:
            log.exception("could not record result of task %s (lease will expire)", task_id)


def main() -> None:
    logging.basicConfig(
        level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s"
    )
    logging.getLogger("httpx").setLevel(logging.WARNING)
    worker = Worker(load_settings())

    loop = asyncio.new_event_loop()
    for sig in (signal.SIGINT, signal.SIGTERM):
        # Not supported on Windows: there Ctrl+C raises KeyboardInterrupt instead.
        with contextlib.suppress(NotImplementedError):
            loop.add_signal_handler(sig, worker.stopping.set)
    try:
        loop.run_until_complete(worker.run())
    except KeyboardInterrupt:
        log.info("stopping (Ctrl+C)")
    finally:
        loop.close()


if __name__ == "__main__":
    main()
