"""Discovery sources: OpenStreetMap (free) and Brave Search (free monthly credit).

Both return Candidate objects. Nothing here writes to the database.
"""

from __future__ import annotations

import asyncio
import time
from dataclasses import dataclass, field
from typing import Any

import httpx

from .normalize import (
    FREE_EMAIL_DOMAINS,
    clean_name,
    email_domain,
    extract_emails,
    identity_from_url,
    normalize_name,
    normalize_url,
)

# Public Overpass servers, tried in order when one is overloaded.
OVERPASS_URLS = [
    "https://overpass-api.de/api/interpreter",
    "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
    "https://overpass.private.coffee/api/interpreter",
]
OVERPASS_BUDGET_SECONDS = 480  # below the worker's 600 s task lease
OVERPASS_ROUND_PAUSE = 30
OSM_USER_AGENT = "ScrapMail/0.1 (travel agency directory research)"
BRAVE_URL = "https://api.search.brave.com/res/v1/web/search"

# Websites that are never agencies (platforms, social networks, media, reviews).
NOT_AGENCIES = {
    "facebook.com",
    "instagram.com",
    "linkedin.com",
    "twitter.com",
    "x.com",
    "youtube.com",
    "tiktok.com",
    "pinterest.com",
    "wikipedia.org",
    "wikimedia.org",
    "google.com",
    "apple.com",
    "tripadvisor.com",
    "tripadvisor.co.uk",
    "booking.com",
    "expedia.com",
    "airbnb.com",
    "yelp.com",
    "trustpilot.com",
    "amazon.com",
    "reddit.com",
    "quora.com",
    "medium.com",
    "bbc.co.uk",
    "bbc.com",
    "cnn.com",
    "nytimes.com",
    "theguardian.com",
    "forbes.com",
    "github.com",
    "wordpress.org",
    "w3.org",
    "mozilla.org",
    "microsoft.com",
    "adobe.com",
    "paypal.com",
    "visa.com",
    "mastercard.com",
    "stripe.com",
    "shopify.com",
    "wix.com",
    "squarespace.com",
    "godaddy.com",
    "cloudflare.com",
    "gov.uk",
    "europa.eu",
    "who.int",
    "linktr.ee",
    "whatsapp.com",
    "t.me",
    "vimeo.com",
    "spotify.com",
    "maps.google.com",
}


@dataclass
class Candidate:
    url: str
    identity_key: str
    source: str  # osm | link | search
    source_ref: str
    name: str | None = None
    country_code: str | None = None
    raw: dict[str, Any] = field(default_factory=dict)


def make_candidate(url: str | None, source: str, source_ref: str, **extra: Any) -> Candidate | None:
    """Normalized candidate, or None for unusable / never-agency websites."""
    normalized = normalize_url(url)
    key = identity_from_url(normalized)
    if not normalized or not key:
        return None
    base = key.split("/")[0]
    if base in NOT_AGENCIES or any(base.endswith("." + d) for d in NOT_AGENCIES):
        return None
    if base.endswith((".gov", ".gov.uk", ".edu", ".ac.uk", ".mil")):
        return None
    return Candidate(
        url=normalized, identity_key=key, source=source, source_ref=source_ref, **extra
    )


class RateLimiter:
    """At most one call per `interval` seconds (shared by all tasks of a worker)."""

    def __init__(self, interval: float) -> None:
        self.interval = interval
        self._lock = asyncio.Lock()
        self._last = 0.0

    async def wait(self) -> None:
        async with self._lock:
            delay = self._last + self.interval - time.monotonic()
            if delay > 0:
                await asyncio.sleep(delay)
            self._last = time.monotonic()


async def _overpass(
    client: httpx.AsyncClient,
    query: str,
    limiter: RateLimiter,
    *,
    budget_seconds: float = OVERPASS_BUDGET_SECONDS,
) -> dict[str, Any]:
    """Run an Overpass query. Public servers are often busy: cycle through them,
    pausing between rounds, until the time budget (kept below the task lease) is used."""
    deadline = time.monotonic() + budget_seconds
    last_error: Exception | None = None
    while True:
        for url in OVERPASS_URLS:
            remaining = deadline - time.monotonic()
            if remaining < 30:
                # Temporary: the task is retried later with backoff.
                raise last_error or httpx.TimeoutException("Overpass time budget used")
            await limiter.wait()
            try:
                response = await client.post(
                    url,
                    data={"data": query},
                    # Overpass requires a plain identifying User-Agent (browser-like ones get 406).
                    headers={"Accept": "application/json", "User-Agent": OSM_USER_AGENT},
                    timeout=min(330, remaining),
                )
                if response.status_code in (429, 502, 503, 504):
                    last_error = httpx.HTTPStatusError(
                        f"Overpass busy ({response.status_code})",
                        request=response.request,
                        response=response,
                    )
                    continue
                response.raise_for_status()
                return response.json()
            except (httpx.TimeoutException, httpx.ConnectError) as exc:
                last_error = exc
        await asyncio.sleep(min(OVERPASS_ROUND_PAUSE, max(0.0, deadline - time.monotonic())))


# OpenStreetMap business types searched: travel agencies, tour operators,
# ticket offices (events and transport) and concierge services.
OSM_FILTERS = [
    '["shop"="travel_agency"]',
    '["office"="travel_agent"]',
    '["office"="tour_operator"]',
    '["shop"="ticket"]',
    '["office"="concierge"]',
    '["amenity"="concierge"]',
]
OSM_CATEGORIES = ("shop", "office", "amenity")


def osm_query(country: str) -> str:
    lines = "\n".join(f"  nwr{f}(area.country);" for f in OSM_FILTERS)
    return f"""
[out:json][timeout:300];
area["ISO3166-1"="{country}"][admin_level=2]->.country;
(
{lines}
);
out tags center;
"""


def osm_candidate(element: dict[str, Any], country: str) -> Candidate | None:
    """Candidate from one OpenStreetMap element.

    Website from the website tags, else from a business email domain. Places
    without a website but with an email are kept too (identity by name), because
    the email is what the campaigns need.
    """
    tags = element.get("tags", {})
    name = clean_name(tags.get("name") or tags.get("brand") or tags.get("operator"))
    emails = extract_emails(
        " ".join(tags.get(k, "") for k in ("email", "contact:email", "operator:email"))
    )
    ref = f"osm:{element.get('type')}/{element.get('id')}"
    raw = {
        "name": tags.get("name"),
        "category": next((f"{k}={tags[k]}" for k in OSM_CATEGORIES if k in tags), None),
        "phone": tags.get("phone") or tags.get("contact:phone"),
        "emails": emails,
        "city": tags.get("addr:city"),
        "street": tags.get("addr:street"),
        "housenumber": tags.get("addr:housenumber"),
        "postcode": tags.get("addr:postcode"),
    }
    website = tags.get("website") or tags.get("contact:website") or tags.get("url")
    business_emails = [e for e in emails if email_domain(e) not in FREE_EMAIL_DOMAINS]
    if not website and business_emails:
        website = f"https://{email_domain(business_emails[0])}"
    candidate = make_candidate(
        website, "osm", ref, name=name or None, country_code=country, raw=raw
    )
    if candidate:
        return candidate
    if emails and normalize_name(name):
        # Email-only place (free-mail address, or a social page as "website").
        # Name + email keeps agencies with generic names ("Reisebüro") apart.
        return Candidate(
            url=f"https://www.openstreetmap.org/{element.get('type')}/{element.get('id')}",
            identity_key=f"name:{normalize_name(name)}|{emails[0]}",
            source="osm",
            source_ref=ref,
            name=name,
            country_code=country,
            raw={**raw, "no_website": True},
        )
    return None


async def osm_travel_agencies(
    client: httpx.AsyncClient, country: str, limiter: RateLimiter
) -> list[Candidate]:
    """Agencies mapped in OpenStreetMap for one country (with a website or an email)."""
    data = await _overpass(client, osm_query(country), limiter)
    return [c for element in data.get("elements", []) if (c := osm_candidate(element, country))]


async def brave_search(
    client: httpx.AsyncClient, api_key: str, query: str, country: str, limiter: RateLimiter
) -> list[dict[str, str]]:
    """One Brave web search (up to 20 results). Returns [{url, title, description}]."""
    await limiter.wait()
    response = await client.get(
        BRAVE_URL,
        params={"q": query, "country": country.lower(), "count": 20, "safesearch": "moderate"},
        headers={"X-Subscription-Token": api_key, "Accept": "application/json"},
        timeout=30,
    )
    response.raise_for_status()
    results = response.json().get("web", {}).get("results", [])
    return [
        {
            "url": r.get("url", ""),
            "title": r.get("title", ""),
            "description": r.get("description", ""),
        }
        for r in results
        if r.get("url")
    ]
