"""Polite website fetching: robots.txt, timeouts, size limits, no evasion."""

from __future__ import annotations

import asyncio
from concurrent.futures import ProcessPoolExecutor
from concurrent.futures.process import BrokenProcessPool
from dataclasses import dataclass, field
from urllib.parse import urlsplit
from urllib.robotparser import RobotFileParser

import httpx

from .extract import PageData, belongs_to_site, parse_page
from .normalize import identity_from_url

MAX_BYTES = 2_000_000
MAX_EXTRA_PAGES = 5
PAGE_DELAY_SECONDS = 1.0


class PermanentError(Exception):
    """The site cannot be processed (unreachable, blocked, not found)."""

    def __init__(self, status: str, message: str) -> None:
        super().__init__(message)
        self.status = status


MAX_SITE_TEXT = 40_000


@dataclass
class SiteResult:
    final_url: str
    identity_key: str = ""
    status: str = "ok"
    pages: list[str] = field(default_factory=list)
    emails: list[str] = field(default_factory=list)
    phones: list[str] = field(default_factory=list)
    title: str | None = None
    site_name: str | None = None
    description: str | None = None
    language: str | None = None
    country: str | None = None
    city: str | None = None
    address: str | None = None
    text: str = ""
    # Links to other websites found on the visited pages: {identity_key: url}
    external_links: dict[str, str] = field(default_factory=dict)
    home: PageData | None = None


class Crawler:
    def __init__(
        self, user_agent: str, max_connections: int = 50, parse_processes: int = 0
    ) -> None:
        self._user_agent = user_agent
        # Parsing HTML is CPU work: spread it over several processes (cores).
        self._pool = ProcessPoolExecutor(parse_processes) if parse_processes > 1 else None
        self._client = httpx.AsyncClient(
            follow_redirects=True,
            timeout=httpx.Timeout(15.0, connect=10.0),
            headers={
                "User-Agent": user_agent,
                "Accept": "text/html,application/xhtml+xml",
                "Accept-Language": "en;q=1.0, *;q=0.5",
            },
            limits=httpx.Limits(
                max_connections=max(50, max_connections), max_keepalive_connections=20
            ),
        )

    @property
    def client(self) -> httpx.AsyncClient:
        return self._client

    async def close(self) -> None:
        await self._client.aclose()
        if self._pool:
            self._pool.shutdown(cancel_futures=True)

    async def _parse(self, html: str, url: str) -> PageData:
        if self._pool is None:
            return parse_page(html, url)
        try:
            return await asyncio.get_running_loop().run_in_executor(
                self._pool, parse_page, html, url
            )
        except BrokenProcessPool:
            return parse_page(html, url)  # a parser process died: parse here instead

    async def _robots(self, url: str) -> RobotFileParser:
        parts = urlsplit(url)
        robots = RobotFileParser()
        try:
            response = await self._client.get(f"{parts.scheme}://{parts.netloc}/robots.txt")
            robots.parse(response.text.splitlines() if response.status_code == 200 else [])
        except httpx.HTTPError:
            robots.parse([])
        return robots

    async def _get(self, url: str) -> tuple[str, str]:
        async with self._client.stream("GET", url) as response:
            if response.status_code in (401, 403, 429):
                raise PermanentError("blocked", f"HTTP {response.status_code}")
            if response.status_code in (404, 410):
                raise PermanentError("not_found", f"HTTP {response.status_code}")
            response.raise_for_status()
            if "html" not in response.headers.get("content-type", "html"):
                raise PermanentError("error", "Not an HTML page")
            body = b""
            async for chunk in response.aiter_bytes():
                body += chunk
                if len(body) > MAX_BYTES:
                    break
            return str(response.url), body.decode(response.encoding or "utf-8", "replace")

    async def crawl(self, url: str, *, partner_pages: bool = False) -> SiteResult:
        """Visit the homepage plus contact/about pages (and partner pages if asked)."""
        try:
            final_url, html = await self._get(url)
        except httpx.ConnectError as exc:
            raise PermanentError("unreachable", f"Cannot connect: {exc}") from exc
        except httpx.TooManyRedirects as exc:
            raise PermanentError("error", "Too many redirects") from exc

        robots = await self._robots(final_url)
        if not robots.can_fetch(self._user_agent, final_url):
            raise PermanentError("blocked", "Disallowed by robots.txt")

        site = identity_from_url(final_url) or identity_from_url(url) or ""
        result = SiteResult(final_url=final_url, identity_key=site, pages=[final_url])
        home = await self._parse(html, final_url)
        result.home = home
        self._merge(result, home)

        extra = home.contact_links[:MAX_EXTRA_PAGES]
        if partner_pages:
            extra += home.partner_links[:3]
        for link in extra:
            if not robots.can_fetch(self._user_agent, link):
                continue
            await asyncio.sleep(PAGE_DELAY_SECONDS)
            try:
                page_url, page_html = await self._get(link)
            except (httpx.HTTPError, PermanentError):
                continue
            result.pages.append(page_url)
            self._merge(result, await self._parse(page_html, page_url))

        result.emails = [e for e in result.emails if belongs_to_site(e, site)]
        return result

    @staticmethod
    def _merge(result: SiteResult, page: PageData) -> None:
        for email in page.emails:
            if email not in result.emails:
                result.emails.append(email)
        for phone in page.phones:
            if phone not in result.phones:
                result.phones.append(phone)
        for attr in ("title", "site_name", "description", "language", "country", "city", "address"):
            if not getattr(result, attr) and getattr(page, attr):
                setattr(result, attr, getattr(page, attr))
        if len(result.text) < MAX_SITE_TEXT:
            result.text = f"{result.text} {page.text}"[:MAX_SITE_TEXT]
        for key, link in page.external_links.items():
            result.external_links.setdefault(key, link)
