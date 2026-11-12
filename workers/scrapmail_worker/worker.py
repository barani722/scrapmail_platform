"""Scraping worker: claims tasks from the database queue and processes them.

Run (from the workers/ folder):
    uv run python -m scrapmail_worker.worker

Task kinds
  enrich_website     visit a known agency's website, fill empty fields, rate relevance
  discover_osm       list travel agencies of one country from OpenStreetMap
  discover_links     collect links to other websites from a known agency's site
  discover_search    run one Google search (Serper), within the search budget
  qualify_candidate  visit a discovered website; create a new agency if it qualifies

Several workers can run at the same time: tasks are claimed atomically, and
tasks of a crashed worker are picked up again when their lease expires.
"""

from __future__ import annotations

import asyncio
import contextlib
import logging
import os
import signal
from concurrent.futures import ThreadPoolExecutor
from datetime import UTC, datetime
from typing import Any

import httpx

from .config import Settings, load_settings
from .crawler import Crawler, PermanentError, SiteResult
from .db import Db
from .extract import business_name
from .normalize import (
    country_code,
    country_from_domain,
    is_role_address,
    normalize_name,
)
from .relevance import rate
from .sources import (
    Candidate,
    RateLimiter,
    SearchCreditsExhausted,
    is_platform,
    make_candidate,
    osm_travel_agencies,
    serper_search,
)

log = logging.getLogger("scrapmail.worker")

IDLE_SECONDS = 5
LEASE_SECONDS = 600
FLUSH_SECONDS = 1.0  # finished tasks are reported in batches at this interval
COMPLETE_BATCH = 100
TASK_KINDS = [
    "enrich_website",
    "discover_osm",
    "discover_links",
    "discover_search",
    "qualify_candidate",
]
MAX_LINK_CANDIDATES_PER_SITE = 40


def _now() -> str:
    return datetime.now(UTC).isoformat()


def _site_country(site: SiteResult) -> str | None:
    """Country from the website's structured data, else from its domain ending."""
    if site.country:
        code = country_code(site.country) or (
            site.country.upper() if len(site.country) == 2 and site.country.isalpha() else None
        )
        if code:
            return code
    return country_from_domain(site.identity_key)


def _relevance_fields(site: SiteResult) -> dict[str, Any]:
    rating = rate(site.text, f"{site.title or ''} {site.site_name or ''} {site.description or ''}")
    return {
        "relevance": rating.level,
        "relevance_score": rating.score,
        "relevance_keywords": rating.keywords,
    }


class Worker:
    def __init__(self, settings: Settings) -> None:
        self.settings = settings
        self.db = Db(settings)
        self.crawler = Crawler(
            settings.user_agent,
            max_connections=settings.concurrency * 2,
            parse_processes=max(1, (os.cpu_count() or 2) - 1),
        )
        self.stopping = asyncio.Event()
        # Shared, polite limits for external services.
        self.osm_limiter = RateLimiter(5.0)
        self.osm_slots = asyncio.Semaphore(1)
        self.search_limiter = RateLimiter(0.5)
        self.search_exhausted = False  # set when Serper reports no credits left
        self.finished: list[dict[str, Any]] = []  # task results waiting to be sent

    async def _db(self, method: str, *args: Any, **kwargs: Any) -> Any:
        """Run a (blocking) database call without blocking the event loop."""
        return await asyncio.to_thread(getattr(self.db, method), *args, **kwargs)

    async def run(self) -> None:
        # Database calls run in threads: one per task, so no task waits for a free thread
        # (the default pool has only cpu_count + 4 threads).
        asyncio.get_running_loop().set_default_executor(
            ThreadPoolExecutor(max_workers=self.settings.concurrency, thread_name_prefix="db")
        )
        log.info(
            "worker %s started (concurrency %d, web search %s)",
            self.settings.worker_id,
            self.settings.concurrency,
            "enabled" if self.settings.serper_api_key else "not configured",
        )
        # Continuous pool: claim new tasks as soon as slots free up. At most one
        # OpenStreetMap query runs at a time; others stay queued (no lease held).
        running: dict[asyncio.Task[None], str] = {}
        self.finished = []
        flusher = asyncio.create_task(self._flush_loop())
        while not self.stopping.is_set():
            free = self.settings.concurrency - len(running)
            tasks: list[dict[str, Any]] = []
            if free > 0:
                osm_busy = "discover_osm" in running.values()
                # Found websites are checked first, so new agencies appear right away
                # instead of after every discovery task of a large job.
                tasks = await self._claim(free, [k for k in TASK_KINDS if k != "qualify_candidate"])
                if len(tasks) < free:
                    tasks += await self._claim(
                        free - len(tasks), ["discover_osm"] if osm_busy else []
                    )
                # Claimed several OpenStreetMap tasks at once: run one, release the rest.
                osm = [t for t in tasks if t["kind"] == "discover_osm"]
                for extra in osm[0 if osm_busy else 1 :]:
                    tasks.remove(extra)
                    try:
                        await self._db("rpc", "release_scrape_task", {"p_task_id": extra["id"]})
                    except Exception:
                        log.exception("could not release task %s (lease will expire)", extra["id"])
                for task in tasks:
                    running[asyncio.create_task(self.process(task))] = task["kind"]

            if not running:
                with contextlib.suppress(TimeoutError):
                    await asyncio.wait_for(self.stopping.wait(), IDLE_SECONDS)
                continue
            # Wait for a task to finish; with free slots, look for new tasks every few seconds.
            full = len(running) >= self.settings.concurrency
            done, _ = await asyncio.wait(
                running,
                timeout=None if full else IDLE_SECONDS,
                return_when=asyncio.FIRST_COMPLETED,
            )
            for finished in done:
                running.pop(finished, None)
        if running:
            await asyncio.wait(running)
        flusher.cancel()
        await self._flush_results()
        await self.crawler.close()
        self.db.close()
        log.info("worker stopped")

    async def _claim(self, limit: int, exclude_kinds: list[str]) -> list[dict[str, Any]]:
        try:
            return (
                await self._db(
                    "rpc",
                    "claim_scrape_tasks",
                    {
                        "p_worker": self.settings.worker_id,
                        "p_limit": limit,
                        "p_lease_seconds": LEASE_SECONDS,
                        "p_exclude_kinds": exclude_kinds,
                    },
                )
                or []
            )
        except Exception:
            log.exception("could not claim tasks; retrying")
            return []

    # -- dispatch ---------------------------------------------------------------------

    async def process(self, task: dict[str, Any]) -> None:
        task_id = task["id"]
        handlers = {
            "enrich_website": self.enrich_website,
            "discover_osm": self.discover_osm,
            "discover_links": self.discover_links,
            "discover_search": self.discover_search,
            "qualify_candidate": self.qualify_candidate,
        }
        try:
            handler = handlers.get(task["kind"])
            if handler is None:
                raise ValueError(f"Unknown task kind {task['kind']}")
            result = await handler(task)
            await self._complete(task_id, True, result)
        except PermanentError as exc:
            # The site cannot be processed: record it and do not retry.
            if task["kind"] == "enrich_website" and task.get("agency_id"):
                await self._mark_agency(
                    task["agency_id"], {"website_status": exc.status, "last_checked_at": _now()}
                )
            await self._complete(task_id, True, {"status": exc.status, "error": str(exc)})
        except (httpx.HTTPError, TimeoutError) as exc:
            log.warning("task %s temporary error: %s", task_id, exc)
            await self._complete(task_id, False, None, f"{type(exc).__name__}: {exc}")
        except Exception as exc:
            log.exception("task %s failed", task_id)
            await self._complete(task_id, False, None, f"{type(exc).__name__}: {exc}")

    # -- enrichment ----------------------------------------------------------------------

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
            "last_checked_at": _now(),
            **_relevance_fields(site),
        }
        if not agency["description"] and site.description:
            updates["description"] = site.description
        if not agency["phone"] and site.phones:
            updates["phone"] = site.phones[0]
        if not agency["country_code"] and (code := _site_country(site)):
            updates["country_code"] = code
        if not agency["city"] and site.city:
            updates["city"] = str(site.city)[:200]
        if not agency["address"] and site.address:
            updates["address"] = site.address[:500]
        await self._mark_agency(agency_id, updates)
        await self._save_site_data(workspace_id, agency_id, site)

        log.info(
            "enriched %s: %d emails, relevance %s",
            site.final_url,
            len(site.emails),
            updates["relevance"],
        )
        return {"status": "ok", "emails": len(site.emails), "relevance": updates["relevance"]}

    # -- discovery: find candidate websites ------------------------------------------------

    async def discover_osm(self, task: dict[str, Any]) -> dict[str, Any]:
        country = task["payload"]["country"]
        async with self.osm_slots:
            candidates = await osm_travel_agencies(self.crawler.client, country, self.osm_limiter)
        counts = await self._register_candidates(task, candidates)
        log.info("OpenStreetMap %s: %s", country, counts)
        return {"status": "ok", "country": country, **counts}

    async def discover_links(self, task: dict[str, Any]) -> dict[str, Any]:
        site = await self.crawler.crawl(task["payload"]["url"], partner_pages=True)
        if task.get("agency_id"):
            await self._mark_agency(task["agency_id"], _relevance_fields(site))
        candidates = [
            c
            for key, url in list(site.external_links.items())[: MAX_LINK_CANDIDATES_PER_SITE * 3]
            if (c := make_candidate(url, "link", f"link:{site.final_url}"))
            and c.identity_key == key
        ][:MAX_LINK_CANDIDATES_PER_SITE]
        counts = await self._register_candidates(task, candidates)
        return {"status": "ok", "links": len(site.external_links), **counts}

    async def discover_search(self, task: dict[str, Any]) -> dict[str, Any]:
        query, country = task["payload"]["query"], task["payload"]["country"]
        results = await self._db(
            "rpc",
            "get_search_cache",
            {"p_provider": "serper", "p_query": query, "p_country": country},
        )
        cached = results is not None
        if not cached:
            if not self.settings.serper_api_key:
                raise PermanentError("error", "SERPER_API_KEY is not set in workers/.env")
            if self.search_exhausted:
                return {"status": "no_credits", "query": query, "country": country}
            allowed = await self._db(
                "rpc",
                "reserve_search_quota",
                {"p_provider": "serper", "p_monthly_limit": self.settings.search_monthly_limit},
            )
            if not allowed:
                return {"status": "budget_exhausted", "query": query, "country": country}
            try:
                results = await serper_search(
                    self.crawler.client,
                    self.settings.serper_api_key,
                    query,
                    country,
                    self.search_limiter,
                )
            except SearchCreditsExhausted as exc:
                self.search_exhausted = True
                log.warning("web search stopped: %s", exc)
                return {"status": "no_credits", "query": query, "country": country}
            await self._db(
                "rpc",
                "put_search_cache",
                {
                    "p_provider": "serper",
                    "p_query": query,
                    "p_country": country,
                    "p_results": results,
                },
            )
        candidates = [
            c
            for r in results
            if (
                c := make_candidate(
                    r["url"],
                    "search",
                    f"serper:{country}:{query}",
                    country_code=country,
                    raw={"title": r["title"], "description": r["description"]},
                )
            )
        ]
        counts = await self._register_candidates(task, candidates)
        return {"status": "ok", "cached": cached, "results": len(results), **counts}

    async def _register_candidates(
        self, task: dict[str, Any], candidates: list[Candidate]
    ) -> dict[str, int]:
        """Store new candidates (skipping known agencies) and queue a qualify task for each."""
        workspace_id, job_id = task["workspace_id"], task["job_id"]
        unique = list({c.identity_key: c for c in candidates}.values())
        known = await self._existing_agencies(workspace_id, [c.identity_key for c in unique])
        fresh = [c for c in unique if c.identity_key not in known]

        inserted: list[dict[str, Any]] = []
        for i in range(0, len(fresh), 200):
            inserted += await self._db(
                "insert",
                "discovery_candidates",
                [
                    {
                        "workspace_id": workspace_id,
                        "job_id": job_id,
                        "identity_key": c.identity_key,
                        "url": c.url,
                        "name": c.name,
                        "country_code": c.country_code,
                        "source": c.source,
                        "source_ref": c.source_ref,
                        "raw": c.raw,
                    }
                    for c in fresh[i : i + 200]
                ],
                on_conflict="workspace_id,identity_key",
                ignore_duplicates=True,
                returning="id",
            )
        if inserted:
            await self._db(
                "rpc",
                "add_job_tasks",
                {
                    "p_job_id": job_id,
                    "p_tasks": [
                        {
                            "kind": "qualify_candidate",
                            "payload": {"candidate_id": row["id"]},
                            "dedupe_key": f"qualify:{row['id']}",
                        }
                        for row in inserted
                    ],
                },
            )
        return {
            "found": len(unique),
            "already_known": len(known),
            "new_candidates": len(inserted),
        }

    async def _existing_agencies(self, workspace_id: str, keys: list[str]) -> set[str]:
        found: set[str] = set()
        for i in range(0, len(keys), 80):
            chunk = keys[i : i + 80]
            values = ",".join(f'"{k}"' for k in chunk)
            rows = await self._db(
                "select",
                "agencies",
                {
                    "select": "identity_key",
                    "workspace_id": f"eq.{workspace_id}",
                    "identity_key": f"in.({values})",
                },
            )
            found |= {r["identity_key"] for r in rows}
        return found

    # -- discovery: check a candidate and create the agency ----------------------------------

    async def qualify_candidate(self, task: dict[str, Any]) -> dict[str, Any]:
        rows = await self._db(
            "select",
            "discovery_candidates",
            {"select": "*", "id": f"eq.{task['payload']['candidate_id']}"},
        )
        if not rows or rows[0]["status"] != "pending":
            return {"status": "skipped"}
        cand = rows[0]
        workspace_id = cand["workspace_id"]
        raw = cand.get("raw") or {}

        if raw.get("no_website"):
            # OpenStreetMap place with an email but no website: nothing to visit.
            return await self._accept(cand, None, website_status=None)

        try:
            site = await self.crawler.crawl(cand["url"])
        except PermanentError as exc:
            # OpenStreetMap lists it as an agency: keep it if the site blocks us, or if
            # the site is down but OpenStreetMap has its email.
            if cand["source"] == "osm" and (exc.status == "blocked" or raw.get("emails")):
                return await self._accept(cand, None, website_status=exc.status)
            return await self._reject(cand, f"website {exc.status}")

        # Redirected to a website we already have?
        redirected = site.identity_key and site.identity_key != cand["identity_key"]
        if redirected and is_platform(site.identity_key.split("/")[0]):
            # Expired site sent to a portal/webmail/maps: its content is not the agency's.
            if cand["source"] == "osm" and raw.get("emails"):
                return await self._accept(cand, None, website_status="error")
            return await self._reject(cand, f"website redirects to {site.identity_key}")
        if redirected and await self._existing_agencies(workspace_id, [site.identity_key]):
            return await self._reject(cand, f"duplicate of {site.identity_key}")

        relevance = _relevance_fields(site)
        accepted = cand["source"] == "osm" or relevance["relevance"] in ("A", "B", "C")
        if not accepted:
            return await self._reject(
                cand, f"not relevant (rated {relevance['relevance']})", relevance
            )
        return await self._accept(cand, site, website_status="ok", relevance=relevance)

    async def _accept(
        self,
        cand: dict[str, Any],
        site: SiteResult | None,
        *,
        website_status: str | None,
        relevance: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        workspace_id, raw = cand["workspace_id"], cand.get("raw") or {}
        name = (
            cand["name"]
            or (business_name(site.home, cand["identity_key"]) if site and site.home else None)
            or cand["identity_key"]
        )
        country = (
            (cand["country_code"] if cand["source"] == "osm" else None)
            or (_site_country(site) if site else None)
            or country_from_domain(cand["identity_key"])
            or cand["country_code"]
        )
        address = ", ".join(
            p
            for p in (
                " ".join(x for x in (raw.get("street"), raw.get("housenumber")) if x),
                raw.get("postcode"),
                raw.get("city"),
            )
            if p
        ) or (site.address if site else None)

        agency = {
            "workspace_id": workspace_id,
            "name": name[:300],
            "normalized_name": normalize_name(name),
            "website_url": None if raw.get("no_website") else cand["url"],
            "identity_key": cand["identity_key"],
            "country_code": country,
            "city": (raw.get("city") or (site.city if site else None) or None),
            "address": (address or None) and address[:500],
            "phone": raw.get("phone") or (site.phones[0] if site and site.phones else None),
            "description": site.description if site else None,
            "website_status": website_status,
            "website_title": site.title if site else None,
            "last_checked_at": None if raw.get("no_website") else _now(),
            "origin": cand["source"],
            **(relevance or {}),
        }
        created = await self._db(
            "insert",
            "agencies",
            agency,
            on_conflict="workspace_id,identity_key",
            ignore_duplicates=True,
            returning="id",
        )
        if not created:
            return await self._reject(cand, "duplicate (added meanwhile)")
        agency_id = created[0]["id"]

        await self._db(
            "insert",
            "agency_sources",
            {
                "workspace_id": workspace_id,
                "agency_id": agency_id,
                "source_type": cand["source"],
                "source_name": {
                    "osm": "OpenStreetMap",
                    "link": "link on agency website",
                    "search": "Google search (Serper)",
                }[cand["source"]],
                "source_ref": cand["source_ref"] or cand["url"],
                "raw": raw,
            },
            on_conflict="workspace_id,source_type,source_name,source_ref",
            ignore_duplicates=True,
        )
        osm_emails = [e for e in raw.get("emails", []) if isinstance(e, str)]
        if osm_emails:
            await self._save_contacts(workspace_id, agency_id, osm_emails)
        if site:
            await self._save_site_data(workspace_id, agency_id, site)

        await self._db(
            "update",
            "discovery_candidates",
            {"id": f"eq.{cand['id']}"},
            {"status": "accepted", "agency_id": agency_id, "processed_at": _now()},
        )
        log.info("new agency: %s (%s, %s)", name, cand["identity_key"], cand["source"])
        return {"status": "accepted", "agency_id": agency_id}

    async def _reject(
        self, cand: dict[str, Any], reason: str, relevance: dict[str, Any] | None = None
    ) -> dict[str, Any]:
        await self._db(
            "update",
            "discovery_candidates",
            {"id": f"eq.{cand['id']}"},
            {
                "status": "rejected",
                "reason": reason[:200],
                "processed_at": _now(),
                "raw": {
                    **(cand.get("raw") or {}),
                    **({"relevance": relevance} if relevance else {}),
                },
            },
        )
        return {"status": "rejected", "reason": reason}

    # -- shared writes --------------------------------------------------------------------

    async def _save_contacts(self, workspace_id: str, agency_id: str, emails: list[str]) -> None:
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
                for email in emails[:20]
            ],
            on_conflict="agency_id,email_normalized",
            ignore_duplicates=True,
        )

    async def _save_site_data(self, workspace_id: str, agency_id: str, site: SiteResult) -> None:
        if site.emails:
            await self._save_contacts(workspace_id, agency_id, site.emails)
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

    async def _mark_agency(self, agency_id: str, values: dict[str, Any]) -> None:
        await self._db("update", "agencies", {"id": f"eq.{agency_id}"}, values)

    async def _complete(
        self, task_id: int, success: bool, result: dict[str, Any] | None, error: str | None = None
    ) -> None:
        """Queue the result; results are sent in batches (see _flush_results)."""
        self.finished.append({"id": task_id, "success": success, "result": result, "error": error})

    async def _flush_results(self) -> None:
        """Send finished tasks to the database, up to COMPLETE_BATCH per call."""
        while self.finished:
            batch = self.finished[:COMPLETE_BATCH]
            try:
                await self._db("rpc", "complete_scrape_tasks", {"p_results": batch})
            except Exception:
                log.exception("could not record %d task results; retrying", len(batch))
                return
            del self.finished[: len(batch)]

    async def _flush_loop(self) -> None:
        while True:
            await asyncio.sleep(FLUSH_SECONDS)
            await self._flush_results()


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
        # Report finished tasks, and give unfinished ones back so the next worker can
        # start on them at once.
        try:
            if getattr(worker, "finished", None):
                worker.db.rpc("complete_scrape_tasks", {"p_results": worker.finished})
            released = worker.db.rpc(
                "release_worker_tasks", {"p_worker": worker.settings.worker_id}
            )
            log.info("released %s unfinished tasks", released)
        except Exception:
            log.exception("could not release tasks (their leases will expire)")
    finally:
        loop.close()


if __name__ == "__main__":
    main()
