"""Free, rule-based relevance rating (A–E) from website text.

A  sells tickets / hospitality for live events (sports, concerts, theatre, comedy, shows)
B  sports & live-event travel (packages, tours to matches, festivals …)
C  travel or tourism agency, tour operator, concierge, DMC, corporate events
D  weak signals only
E  no signal

The matched keywords are stored with the rating so a person can see why.
"""

from __future__ import annotations

import re
import unicodedata
from dataclasses import dataclass, field

# Keyword groups (multilingual). Matched on whole words, accent-insensitive.
TICKETS = [
    "ticket",
    "tickets",
    "ticketing",
    "hospitality",
    "hospitality packages",
    "vip package",
    "vip packages",
    "vip experience",
    "vip experiences",
    "corporate hospitality",
    "premium seating",
    "skybox",
    "debenture",
    "billet",
    "billets",
    "billetterie",
    "entradas",
    "boletos",
    "biglietti",
    "biglietteria",
    "eintrittskarten",
    "karten",
    "tickets kaufen",
    "ingressos",
    "kaartjes",
    "event tickets",
    "concert tickets",
    "theatre tickets",
    "theater tickets",
    "show tickets",
    "match tickets",
    "football tickets",
    "sports tickets",
    "festival tickets",
    "box office",
    "ticket office",
    "ticket agency",
    "kartenvorverkauf",
    "vorverkauf",
    "taquilla",
    "billetes",
    "bilhetes",
    "entrades",
    "biljetter",
    "billetter",
    "liput",
    "bilety",
    "bilete",
    "vstupenky",
    "jegyek",
    "bilet",
    "biletler",
    "билеты",
    "تذاكر",
    "チケット",
    "门票",
    "票务",
]
EVENTS = [
    "football",
    "soccer",
    "rugby",
    "tennis",
    "golf",
    "cricket",
    "formula 1",
    "formula one",
    "f1",
    "grand prix",
    "motogp",
    "nfl",
    "nba",
    "nhl",
    "mlb",
    "super bowl",
    "champions league",
    "premier league",
    "la liga",
    "serie a",
    "bundesliga",
    "world cup",
    "euro 2028",
    "olympic",
    "olympics",
    "wimbledon",
    "roland garros",
    "us open",
    "australian open",
    "ryder cup",
    "six nations",
    "marathon",
    "ufc",
    "boxing",
    "horse racing",
    "concert",
    "concerts",
    "festival",
    "festivals",
    "live events",
    "live event",
    "sporting events",
    "sports events",
    "sports travel",
    "sport travel",
    "sports tours",
    "match",
    "matches",
    "stadium",
    "opera",
    "theatre",
    "theater",
    "musical",
    "fussball",
    "futbol",
    "calcio",
    "voetbal",
    "partido",
    "partita",
    "spiel",
    "concierto",
    "concerto",
    "konzert",
    "comedy",
    "comedy show",
    "comedy shows",
    "stand-up",
    "stand up comedy",
    "live show",
    "live shows",
    "live music",
    "live entertainment",
    "gig",
    "gigs",
    "tour dates",
    "west end",
    "broadway",
    "musicals",
    "cabaret",
    "ballet",
    "circus",
    "spectacle",
    "spectacles",
    "spettacolo",
    "spettacoli",
    "espectaculo",
    "espectaculos",
    "teatro",
    "kabarett",
    "konzerte",
    "veranstaltungen",
    "schouwburg",
    "humour",
    "basketball",
    "ice hockey",
    "baseball",
    "motorsport",
    "tour de france",
    "darts",
    "snooker",
    "athletics",
    "euroleague",
    "europa league",
    "fa cup",
    "el clasico",
]
TRAVEL = [
    "travel",
    "travel agency",
    "travel agent",
    "tour operator",
    "tours",
    "holiday",
    "holidays",
    "vacation",
    "vacations",
    "trip",
    "trips",
    "luxury travel",
    "concierge",
    "lifestyle management",
    "dmc",
    "destination management",
    "incentive",
    "incentives",
    "corporate events",
    "event management",
    "event planner",
    "events agency",
    "mice",
    "group travel",
    "voyage",
    "voyages",
    "agence de voyages",
    "viajes",
    "agencia de viajes",
    "viaggi",
    "agenzia viaggi",
    "reisen",
    "reiseburo",
    "reisebuero",
    "reisbureau",
    "reizen",
    "viagens",
    "travel agencies",
    "tour operators",
    "touroperator",
    "conciergerie",
    "concierge service",
    "concierge services",
    "lifestyle concierge",
    "tourism",
    "tourism agency",
    "tourist agency",
    "reiseveranstalter",
    "touristik",
    "voyagiste",
    "agence de tourisme",
    "turismo",
    "agencia de turismo",
    "operador turistico",
    "agenzia turistica",
    "biuro podrozy",
    "cestovni kancelar",
    "utazasi iroda",
    "agentie de turism",
    "resebyra",
    "rejsebureau",
    "reisebyra",
    "matkatoimisto",
    "seyahat acentesi",
    "турагентство",
    "туроператор",
]


def _plain(text: str) -> str:
    text = unicodedata.normalize("NFKD", text)
    return "".join(c for c in text if not unicodedata.combining(c)).lower()


def _compile(words: list[str]) -> list[tuple[str, re.Pattern[str]]]:
    return [(w, re.compile(rf"(?<![a-z0-9]){re.escape(_plain(w))}(?![a-z0-9])")) for w in words]


_GROUPS = {"tickets": _compile(TICKETS), "events": _compile(EVENTS), "travel": _compile(TRAVEL)}


@dataclass
class Relevance:
    level: str
    score: int
    keywords: list[str] = field(default_factory=list)

    @property
    def is_relevant(self) -> bool:
        """Good enough to add a discovered website as a new agency."""
        return self.level in ("A", "B", "C")


def rate(text: str, headline: str = "") -> Relevance:
    """Rate a website from its visible text and headline (title + description)."""
    body, head = _plain(text), _plain(headline)
    hits: dict[str, list[str]] = {}
    score = 0
    weights = {"tickets": 10, "events": 5, "travel": 3}
    for group, patterns in _GROUPS.items():
        found = [word for word, pattern in patterns if pattern.search(body) or pattern.search(head)]
        hits[group] = found
        # Words in the title/description count double: they describe the business.
        in_head = sum(1 for word, pattern in patterns if pattern.search(head))
        score += weights[group] * (len(found) + in_head)

    tickets, events, travel = (len(hits[g]) for g in ("tickets", "events", "travel"))
    if tickets >= 1 and events >= 2 or tickets >= 3 and events >= 1:
        level = "A"
    elif events >= 2 and (travel >= 1 or tickets >= 1):
        level = "B"
    elif travel >= 2 or (travel >= 1 and events >= 1):
        level = "C"
    elif travel or events or tickets:
        level = "D"
    else:
        level = "E"

    keywords = hits["tickets"] + hits["events"] + hits["travel"]
    return Relevance(level=level, score=min(score, 1000), keywords=keywords[:30])
