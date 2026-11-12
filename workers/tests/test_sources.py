from scrapmail_worker.extract import business_name, parse_page
from scrapmail_worker.normalize import country_from_domain
from scrapmail_worker.sources import make_candidate


def test_platform_and_public_sites_are_never_candidates():
    assert make_candidate("https://www.facebook.com/agency", "link", "x") is None
    assert make_candidate("https://en.wikipedia.org/wiki/F1", "link", "x") is None
    assert make_candidate("https://www.tripadvisor.co.uk/x", "link", "x") is None
    assert make_candidate("https://www.gov.uk/visas", "link", "x") is None


def test_candidate_uses_identity_key():
    c = make_candidate("https://www.sportstours.co.uk/about", "search", "q")
    assert c is not None and c.identity_key == "sportstours.co.uk"


def test_country_from_domain():
    assert country_from_domain("agency.co.uk") == "GB"
    assert country_from_domain("reisen.de") == "DE"
    assert country_from_domain("startup.io") is None
    assert country_from_domain("agency.com") is None


def test_external_links_and_business_name():
    html = """<html><head><title>Elite Sports Tours | Football trips</title>
    <meta property="og:site_name" content="Elite Sports Tours"></head><body>
    <a href="https://partner-travel.com/">Partner</a>
    <a href="/our-partners">Partners</a>
    <a href="https://www.facebook.com/elite">FB</a></body></html>"""
    page = parse_page(html, "https://elitesportstours.com/")
    assert "partner-travel.com" in page.external_links
    assert page.partner_links == ["https://elitesportstours.com/our-partners"]
    assert business_name(page, "fallback") == "Elite Sports Tours"


def _osm(**tags):
    return {"type": "node", "id": 1, "tags": {"name": "Reisebüro Sonne", **tags}}


def test_osm_place_with_website():
    from scrapmail_worker.sources import osm_candidate

    c = osm_candidate(_osm(website="https://www.sonne-reisen.de", shop="travel_agency"), "DE")
    assert c and c.identity_key == "sonne-reisen.de" and c.raw["category"] == "shop=travel_agency"


def test_osm_website_from_business_email():
    from scrapmail_worker.sources import osm_candidate

    c = osm_candidate(_osm(email="info@sonne-reisen.de"), "DE")
    assert c and c.identity_key == "sonne-reisen.de" and c.raw["emails"] == ["info@sonne-reisen.de"]


def test_osm_email_only_place_is_kept():
    from scrapmail_worker.sources import osm_candidate

    c = osm_candidate(_osm(email="sonne.reisen@gmail.com"), "DE")
    assert c and c.raw["no_website"] and c.identity_key.startswith("name:reiseburo sonne|")


def test_osm_place_without_website_or_email_is_skipped():
    from scrapmail_worker.sources import osm_candidate

    assert osm_candidate(_osm(phone="+49 30 123"), "DE") is None


def _serper_client(status, body):
    import httpx

    def handler(request):
        assert request.headers["X-API-KEY"] == "key"
        assert b'"gl":"fr"' in request.content.replace(b" ", b"")
        return httpx.Response(status, json=body)

    return httpx.AsyncClient(transport=httpx.MockTransport(handler))


def test_serper_search_returns_organic_results():
    import asyncio

    from scrapmail_worker.sources import RateLimiter, serper_search

    body = {"organic": [{"link": "https://agence.fr", "title": "Agence", "snippet": "Billets"}]}
    results = asyncio.run(
        serper_search(_serper_client(200, body), "key", "q", "FR", RateLimiter(0))
    )
    assert results == [{"url": "https://agence.fr", "title": "Agence", "description": "Billets"}]


def test_serper_without_credits_stops_searching():
    import asyncio

    import pytest

    from scrapmail_worker.sources import RateLimiter, SearchCreditsExhausted, serper_search

    client = _serper_client(400, {"message": "Not enough credits", "statusCode": 400})
    with pytest.raises(SearchCreditsExhausted):
        asyncio.run(serper_search(client, "key", "q", "FR", RateLimiter(0)))


def test_free_mail_domains_are_never_websites():
    from scrapmail_worker.normalize import is_free_email_domain
    from scrapmail_worker.sources import osm_candidate

    for domain in ("mail.ru", "bk.ru", "ukr.net", "wp.pl", "mail.example.am", "rediffmail.com"):
        assert is_free_email_domain(domain), domain
    assert not is_free_email_domain("sonne-reisen.de")
    # A mail.ru address gives an email-only agency, not the website mail.ru.
    c = osm_candidate(_osm(email="yama.tour@mail.ru"), "AM")
    assert c and c.raw["no_website"] and c.identity_key.startswith("name:")
    assert make_candidate("https://maps.app.goo.gl/x", "osm", "r") is None
    assert make_candidate("https://bk.ru", "osm", "r") is None


def test_email_only_place_with_non_latin_name_is_kept():
    from scrapmail_worker.sources import osm_candidate

    element = {"type": "node", "id": 2, "tags": {"name": "Յամա Տուր", "email": "x@mail.ru"}}
    c = osm_candidate(element, "AM")
    assert c and c.identity_key == "name:յամա տուր|x@mail.ru"
