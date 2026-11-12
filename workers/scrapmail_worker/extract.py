"""Extract business information from agency web pages (HTML only)."""

from __future__ import annotations

import json
import re
from dataclasses import dataclass, field
from urllib.parse import urljoin, urlsplit

from bs4 import BeautifulSoup

from .normalize import (
    clean_text,
    email_domain,
    extract_emails,
    identity_from_url,
    is_free_email_domain,
)

# Link text / URL fragments that usually lead to contact details (multilingual).
CONTACT_HINTS = re.compile(
    r"contact|kontakt|contatt|contacto|contato|nous-contacter|impressum|imprint|legal|"
    r"about|a-propos|qui-sommes|chi-siamo|sobre|uber-uns|ueber-uns|over-ons|team|"
    r"who-we-are|company|enquir|inquir",
    re.IGNORECASE,
)

# Pages that usually list other businesses (partners, members, affiliates).
PARTNER_HINTS = re.compile(
    r"partner|affiliat|member|associat|links|friends|resellers|agents|agencies|"
    r"partenaire|socios|partners|kooperation",
    re.IGNORECASE,
)

# Pages that list emails most often; visited before about/team pages.
PRIMARY_CONTACT = re.compile(
    r"contact|kontakt|contatt|contacto|contato|impressum|imprint|legal|mentions", re.IGNORECASE
)

# Written-out emails: "info [at] agency [dot] com", "info(at)agency.com", "info (arroba) …".
_AT = re.compile(r"\s*[\[({<]\s*(?:at|@|arroba|chez|ät|at sign)\s*[\])}>]\s*", re.IGNORECASE)
_DOT = re.compile(r"\s*[\[({<]\s*(?:dot|punto|point|punkt|\.)\s*[\])}>]\s*", re.IGNORECASE)

MAX_TEXT_CHARS = 15_000


def deobfuscated_emails(text: str) -> list[str]:
    """Emails written out to avoid spam bots."""
    if not _AT.search(text):
        return []
    return extract_emails(_DOT.sub(".", _AT.sub("@", text)))


@dataclass
class PageData:
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
    contact_links: list[str] = field(default_factory=list)
    partner_links: list[str] = field(default_factory=list)
    # Links to other websites: {identity_key: url}
    external_links: dict[str, str] = field(default_factory=dict)


def _decode_cfemail(encoded: str) -> str | None:
    """Decode Cloudflare's email obfuscation (data-cfemail)."""
    try:
        key = int(encoded[:2], 16)
        return "".join(chr(int(encoded[i : i + 2], 16) ^ key) for i in range(2, len(encoded), 2))
    except ValueError:
        return None


def _clean_phone(raw: str) -> str | None:
    phone = re.sub(r"[^\d+()\-\s.]", "", raw).strip()
    digits = re.sub(r"\D", "", phone)
    return phone if 7 <= len(digits) <= 16 else None


def _json_ld_items(soup: BeautifulSoup):
    for tag in soup.find_all("script", type="application/ld+json"):
        try:
            data = json.loads(tag.string or "")
        except (json.JSONDecodeError, TypeError):
            continue
        stack = data if isinstance(data, list) else [data]
        while stack:
            item = stack.pop()
            if isinstance(item, dict):
                if "@graph" in item and isinstance(item["@graph"], list):
                    stack.extend(item["@graph"])
                yield item


def parse_page(html: str, page_url: str) -> PageData:
    soup = BeautifulSoup(html, "lxml")
    data = PageData()

    for tag in soup(["script", "style", "noscript"]):
        if tag.name == "script" and tag.get("type") == "application/ld+json":
            continue
        tag.decompose()

    # Emails: mailto links, Cloudflare-protected addresses, visible text.
    found: list[str] = []
    for a in soup.select('a[href^="mailto:"]'):
        found += extract_emails(a["href"][7:].split("?")[0])
    for node in soup.select("[data-cfemail]"):
        decoded = _decode_cfemail(node["data-cfemail"])
        if decoded:
            found += extract_emails(decoded)
    visible_text = soup.get_text(" ")
    found += extract_emails(visible_text)
    found += deobfuscated_emails(visible_text)
    data.emails = list(dict.fromkeys(found))
    data.text = re.sub(r"\s+", " ", visible_text).strip()[:MAX_TEXT_CHARS]

    site_name = soup.find("meta", attrs={"property": "og:site_name"})
    if site_name and site_name.get("content"):
        data.site_name = clean_text(site_name["content"], 200)

    for a in soup.select('a[href^="tel:"]'):
        phone = _clean_phone(a["href"][4:])
        if phone and phone not in data.phones:
            data.phones.append(phone)

    if soup.title and soup.title.string:
        data.title = clean_text(soup.title.string, 300)
    meta = soup.find("meta", attrs={"name": "description"}) or soup.find(
        "meta", attrs={"property": "og:description"}
    )
    if meta and meta.get("content"):
        data.description = clean_text(meta["content"], 1000)
    html_tag = soup.find("html")
    if html_tag and html_tag.get("lang"):
        data.language = str(html_tag["lang"]).split("-")[0].lower()[:5]

    # Structured data (schema.org Organization / LocalBusiness / TravelAgency).
    for item in _json_ld_items(soup):
        item_type = str(item.get("@type", ""))
        if (
            not data.site_name
            and item.get("name")
            and any(t in item_type for t in ("Organization", "Business", "Agency", "Corporation"))
        ):
            data.site_name = clean_text(str(item["name"]), 200)
        if item.get("email"):
            data.emails += [e for e in extract_emails(str(item["email"])) if e not in data.emails]
        if item.get("telephone"):
            phone = _clean_phone(str(item["telephone"]))
            if phone and phone not in data.phones:
                data.phones.append(phone)
        address = item.get("address")
        if isinstance(address, dict):
            country = address.get("addressCountry")
            if isinstance(country, dict):
                country = country.get("name")
            data.country = data.country or (str(country) if country else None)
            data.city = data.city or address.get("addressLocality")
            street = ", ".join(
                str(address[k])
                for k in ("streetAddress", "postalCode", "addressLocality")
                if address.get(k)
            )
            data.address = data.address or (street or None)

    # Links: contact/partner pages on the same site, and links to other websites.
    site = identity_from_url(page_url)
    for a in soup.find_all("a", href=True):
        href = urljoin(page_url, a["href"]).split("#")[0]
        if not href.startswith("http"):
            continue
        target = identity_from_url(href)
        if not target:
            continue
        if target != site:
            data.external_links.setdefault(target, href)
            continue
        label = f"{a.get_text(' ', strip=True)} {urlsplit(href).path}"
        if CONTACT_HINTS.search(label) and href not in data.contact_links:
            data.contact_links.append(href)
        elif PARTNER_HINTS.search(label) and href not in data.partner_links:
            data.partner_links.append(href)

    data.contact_links.sort(key=lambda u: 0 if PRIMARY_CONTACT.search(urlsplit(u).path) else 1)
    return data


def business_name(page: PageData, fallback: str) -> str:
    """Best guess of the business name: site name, else the first part of the title."""
    if page.site_name:
        return page.site_name
    if page.title:
        first = re.split(r"\s+[|\-–—:·»]\s+", page.title)[0].strip()
        if 2 <= len(first) <= 120:
            return first
    return fallback


def belongs_to_site(email: str, site_identity: str) -> bool:
    """Keep emails on the agency's own domain (or free-mail used by small businesses)."""
    domain = email_domain(email)
    site_domain = site_identity.split("/")[0]
    return (
        domain == site_domain
        or domain.endswith("." + site_domain)
        or site_domain.endswith("." + domain)
        or is_free_email_domain(domain)
    )
