"""Normalization rules shared by the importer and the scraper.

identity_key decides when two records are the same agency:
  * normal websites            -> registrable domain   (www.abc-travel.co.uk/x -> abc-travel.co.uk)
  * shared / franchise hosts   -> full host            (cts.vacation.travelleaders.com)
  * social / link-in-bio pages -> domain + first path  (facebook.com/abctravel)
  * no website                 -> "name:" + normalized name
"""

from __future__ import annotations

import re
import unicodedata
from urllib.parse import urlsplit

import tldextract

# Offline: use the public suffix list bundled with tldextract (no network calls).
_extract = tldextract.TLDExtract(suffix_list_urls=())

# Many independent businesses share these domains via subdomains.
HOST_LEVEL_DOMAINS = {
    "travelleaders.com",
    "wixsite.com",
    "wordpress.com",
    "blogspot.com",
    "weebly.com",
    "squarespace.com",
    "godaddysites.com",
    "myshopify.com",
    "business.site",
    "webflow.io",
    "carrd.co",
    "github.io",
}

# Profile pages: the first path segment identifies the business.
PATH_LEVEL_DOMAINS = {
    "facebook.com",
    "instagram.com",
    "linkedin.com",
    "linktr.ee",
    "twitter.com",
    "x.com",
    "tiktok.com",
    "youtube.com",
}

FREE_EMAIL_DOMAINS = {
    "gmail.com",
    "googlemail.com",
    "yahoo.com",
    "yahoo.co.uk",
    "yahoo.fr",
    "hotmail.com",
    "hotmail.co.uk",
    "hotmail.fr",
    "outlook.com",
    "live.com",
    "msn.com",
    "icloud.com",
    "me.com",
    "aol.com",
    "gmx.de",
    "gmx.net",
    "web.de",
    "libero.it",
    "orange.fr",
    "wanadoo.fr",
    "free.fr",
    "qq.com",
    "163.com",
    "proton.me",
    "protonmail.com",
    "mail.com",
    "yandex.com",
    "yandex.ru",
    # More free-mail and internet-provider mail services (worldwide).
    "yahoo.es",
    "yahoo.it",
    "yahoo.de",
    "yahoo.com.ar",
    "yahoo.com.br",
    "yahoo.com.mx",
    "yahoo.co.jp",
    "yahoo.co.in",
    "yahoo.ca",
    "yahoo.com.au",
    "yahoo.gr",
    "ymail.com",
    "rocketmail.com",
    "hotmail.es",
    "hotmail.it",
    "hotmail.de",
    "hotmail.com.ar",
    "hotmail.com.br",
    "hotmail.be",
    "hotmail.nl",
    "outlook.es",
    "outlook.fr",
    "outlook.de",
    "outlook.it",
    "outlook.com.br",
    "live.co.uk",
    "live.fr",
    "live.it",
    "live.nl",
    "live.be",
    "live.com.ar",
    "live.ca",
    "mac.com",
    "aim.com",
    "zoho.com",
    "gmx.com",
    "gmx.at",
    "gmx.ch",
    "gmx.fr",
    "email.com",
    "inbox.com",
    "tutanota.com",
    "mail.ru",
    "bk.ru",
    "list.ru",
    "inbox.ru",
    "internet.ru",
    "ya.ru",
    "yandex.ua",
    "yandex.by",
    "yandex.kz",
    "rambler.ru",
    "ukr.net",
    "i.ua",
    "meta.ua",
    "bigmir.net",
    "tut.by",
    "abv.bg",
    "dir.bg",
    "mail.bg",
    "seznam.cz",
    "centrum.cz",
    "email.cz",
    "atlas.cz",
    "azet.sk",
    "centrum.sk",
    "wp.pl",
    "o2.pl",
    "onet.pl",
    "interia.pl",
    "op.pl",
    "gazeta.pl",
    "poczta.fm",
    "freemail.hu",
    "citromail.hu",
    "t-online.hu",
    "yahoo.ro",
    "inbox.lv",
    "mail.ee",
    "hot.ee",
    "t-online.de",
    "freenet.de",
    "arcor.de",
    "online.de",
    "posteo.de",
    "mailbox.org",
    "virgilio.it",
    "tiscali.it",
    "alice.it",
    "tin.it",
    "email.it",
    "fastwebnet.it",
    "sfr.fr",
    "laposte.net",
    "neuf.fr",
    "club-internet.fr",
    "bbox.fr",
    "aliceadsl.fr",
    "numericable.fr",
    "telefonica.net",
    "movistar.es",
    "terra.es",
    "ya.com",
    "sapo.pt",
    "netcabo.pt",
    "clix.pt",
    "bluewin.ch",
    "hispeed.ch",
    "sunrise.ch",
    "telenet.be",
    "skynet.be",
    "ziggo.nl",
    "home.nl",
    "planet.nl",
    "kpnmail.nl",
    "hetnet.nl",
    "xs4all.nl",
    "chello.nl",
    "btinternet.com",
    "sky.com",
    "virginmedia.com",
    "talktalk.net",
    "blueyonder.co.uk",
    "ntlworld.com",
    "tiscali.co.uk",
    "eircom.net",
    "comcast.net",
    "verizon.net",
    "att.net",
    "sbcglobal.net",
    "cox.net",
    "charter.net",
    "bellsouth.net",
    "earthlink.net",
    "shaw.ca",
    "rogers.com",
    "sympatico.ca",
    "videotron.ca",
    "telus.net",
    "bigpond.com",
    "bigpond.net.au",
    "optusnet.com.au",
    "iinet.net.au",
    "xtra.co.nz",
    "terra.com.br",
    "uol.com.br",
    "bol.com.br",
    "ig.com.br",
    "globo.com",
    "r7.com",
    "prodigy.net.mx",
    "fibertel.com.ar",
    "arnet.com.ar",
    "speedy.com.ar",
    "naver.com",
    "daum.net",
    "hanmail.net",
    "nate.com",
    "126.com",
    "yeah.net",
    "sina.com",
    "sina.cn",
    "sohu.com",
    "aliyun.com",
    "foxmail.com",
    "139.com",
    "rediffmail.com",
    "mynet.com",
    "walla.co.il",
    "netvision.net.il",
    "emirates.net.ae",
    "eim.ae",
    "batelco.com.bh",
    "qatar.net.qa",
    "omantel.net.om",
}


def is_free_email_domain(domain: str) -> bool:
    """Free-mail / internet-provider address (not the business's own domain).

    Also catches unknown mail services by name ("mail.xx", "…mail.com").
    """
    domain = domain.lower()
    return (
        domain in FREE_EMAIL_DOMAINS
        or domain.startswith(("mail.", "email.", "post.", "webmail."))
        or bool(re.search(r"(^|[.-])(\w*mail|yahoo|hotmail|outlook|yandex|gmx)\.", domain))
    )


ROLE_PREFIXES = (
    "info",
    "sales",
    "contact",
    "hello",
    "reservation",
    "reservations",
    "booking",
    "bookings",
    "enquiries",
    "enquiry",
    "inquiries",
    "inquiry",
    "support",
    "admin",
    "office",
    "travel",
    "events",
    "event",
    "tickets",
    "ticket",
    "concierge",
    "team",
    "mail",
    "service",
    "help",
    "groups",
    "group",
    "hospitality",
    "vip",
    "marketing",
    "partners",
    "partnerships",
)

EMAIL_RE = re.compile(r"[A-Za-z0-9._%+'-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,24}")

# Values that look like emails but are not real contacts.
_EMAIL_JUNK = re.compile(
    r"(\.(png|jpe?g|gif|webp|svg)$)|(@(example|domain|email|sentry|wixpress)\.)|"
    r"(@sentry)|(^(user|name|your|email|test)@)",
    re.IGNORECASE,
)


def normalize_url(raw: str | None) -> str | None:
    """Return an absolute https URL, or None if the value is not a usable website."""
    if not raw:
        return None
    value = str(raw).strip().split()[0] if str(raw).strip() else ""
    if not value or "@" in value.split("/")[0]:
        return None
    if not re.match(r"^[a-z]+://", value, re.IGNORECASE):
        value = "https://" + value
    parts = urlsplit(value)
    host = (parts.hostname or "").lower().strip(".")
    if "." not in host or " " in host:
        return None
    return value


def identity_from_url(url: str | None) -> str | None:
    """Canonical duplicate-detection key for a website, or None."""
    normalized = normalize_url(url)
    if not normalized:
        return None
    parts = urlsplit(normalized)
    host = (parts.hostname or "").lower()
    host = re.sub(r"^(www\d?|m)\.", "", host)
    ext = _extract(host)
    if not ext.suffix or not ext.domain:
        return None
    registrable = f"{ext.domain}.{ext.suffix}"

    if registrable in PATH_LEVEL_DOMAINS:
        segment = next((s for s in parts.path.split("/") if s), "")
        return f"{registrable}/{segment.lower()}" if segment else None
    if registrable in HOST_LEVEL_DOMAINS:
        return host
    return registrable


def clean_name(raw: str | None) -> str:
    """Display name with copy-paste artefacts removed."""
    name = str(raw or "").replace(" ", " ")
    name = re.sub(r"\s*·\s*Visited link\s*$", "", name, flags=re.IGNORECASE)
    return re.sub(r"\s+", " ", name).strip()


def normalize_name(raw: str | None) -> str:
    """Lower-case, accent-free, punctuation-free name for similarity matching."""
    text = unicodedata.normalize("NFKD", clean_name(raw))
    text = "".join(c for c in text if not unicodedata.combining(c)).lower()
    text = text.replace("&", " and ")
    text = re.sub(r"[^a-z0-9]+", " ", text)
    return re.sub(r"\s+", " ", text).strip()


def extract_emails(raw: str | None) -> list[str]:
    """All valid-looking email addresses in a text, lower-cased, de-duplicated."""
    found: list[str] = []
    for match in EMAIL_RE.findall(str(raw or "")):
        email = match.strip(".'").lower()
        if not _EMAIL_JUNK.search(email) and email not in found:
            found.append(email)
    return found


def is_role_address(email: str) -> bool:
    local = email.split("@", 1)[0]
    return local in ROLE_PREFIXES or any(local.startswith(p + ".") for p in ROLE_PREFIXES)


def email_domain(email: str) -> str:
    return email.rsplit("@", 1)[-1].lower()


_COUNTRIES = {
    "united kingdom": "GB",
    "uk": "GB",
    "england": "GB",
    "scotland": "GB",
    "great britain": "GB",
    "united states": "US",
    "usa": "US",
    "us": "US",
    "u.s.": "US",
    "usa/international": "US",
    "united states of america": "US",
    "united arab emirates": "AE",
    "uae": "AE",
    "france": "FR",
    "spain": "ES",
    "italy": "IT",
    "germany": "DE",
    "switzerland": "CH",
    "netherlands": "NL",
    "netherland": "NL",
    "the netherlands": "NL",
    "holland": "NL",
    "portugal": "PT",
    "israel": "IL",
    "china": "CN",
    "korea": "KR",
    "south korea": "KR",
    "sweden": "SE",
    "denmark": "DK",
    "norway": "NO",
    "finland": "FI",
    "australia": "AU",
    "india": "IN",
    "canada": "CA",
    "ireland": "IE",
    "romania": "RO",
    "pakistan": "PK",
    "brazil": "BR",
    "lebanon": "LB",
    "singapore": "SG",
    "south africa": "ZA",
    "czech republic": "CZ",
    "czechia": "CZ",
    "greece": "GR",
    "belgium": "BE",
    "austria": "AT",
    "poland": "PL",
    "japan": "JP",
    "mexico": "MX",
    "argentina": "AR",
    "qatar": "QA",
    "saudi arabia": "SA",
    "turkey": "TR",
    "new zealand": "NZ",
    "hong kong": "HK",
    "luxembourg": "LU",
    "monaco": "MC",
    "hungary": "HU",
    "croatia": "HR",
    "cyprus": "CY",
    "malta": "MT",
    "egypt": "EG",
    "morocco": "MA",
    "thailand": "TH",
    "malaysia": "MY",
    "indonesia": "ID",
    "philippines": "PH",
    "vietnam": "VN",
    "kuwait": "KW",
    "bahrain": "BH",
    "oman": "OM",
    "georgia": "GE",
    "iceland": "IS",
    "estonia": "EE",
    "latvia": "LV",
    "lithuania": "LT",
    "slovenia": "SI",
    "slovakia": "SK",
    "bulgaria": "BG",
    "serbia": "RS",
    "chile": "CL",
    "colombia": "CO",
    "peru": "PE",
    "nigeria": "NG",
    "kenya": "KE",
}


def country_code(raw: str | None) -> str | None:
    """ISO 3166-1 alpha-2 code for a country name, or None if unknown."""
    key = re.sub(r"\s+", " ", str(raw or "")).strip().lower()
    return _COUNTRIES.get(key)


# Country-code domains used as generic names (".io", ".co", ".tv", …): no country.
_GENERIC_CC_TLDS = {
    "io",
    "co",
    "tv",
    "me",
    "ai",
    "fm",
    "am",
    "ly",
    "to",
    "cc",
    "ws",
    "gg",
    "vc",
    "la",
    "nu",
    "tk",
    "ag",
    "sh",
    "ac",
    "eu",
    "app",
    "dev",
}


def country_from_domain(identity_key: str | None) -> str | None:
    """ISO country code from a country-code domain ("abc.co.uk" -> "GB", "x.de" -> "DE")."""
    if not identity_key:
        return None
    tld = identity_key.split("/")[0].rsplit(".", 1)[-1].lower()
    if tld == "uk":
        return "GB"
    if len(tld) == 2 and tld.isalpha() and tld not in _GENERIC_CC_TLDS:
        return tld.upper()
    return None


def clean_text(raw: str | None, limit: int = 2000) -> str | None:
    """Single-line text without embedded email addresses; None if empty."""
    text = EMAIL_RE.sub("", str(raw or ""))
    text = re.sub(r"\s+", " ", text).strip(" ,;\t")
    return text[:limit] or None
