from scrapmail_worker.normalize import (
    clean_name,
    country_code,
    extract_emails,
    identity_from_url,
    is_role_address,
    normalize_name,
)


def test_identity_uses_registrable_domain():
    assert identity_from_url("https://www.cuttingedgeme.com/") == "cuttingedgeme.com"
    assert identity_from_url("masarra.com/trade/sports-and-events") == "masarra.com"
    assert identity_from_url("http://shop.abc-travel.co.uk/x") == "abc-travel.co.uk"
    assert identity_from_url("astsports.com.au") == "astsports.com.au"


def test_franchise_subdomains_stay_separate():
    a = identity_from_url("cts.vacation.travelleaders.com")
    b = identity_from_url("plymouthmi.vacation.travelleaders.com")
    assert a == "cts.vacation.travelleaders.com"
    assert a != b


def test_social_profiles_use_path():
    assert identity_from_url("https://m.facebook.com/abctravel/") == "facebook.com/abctravel"
    assert identity_from_url("https://facebook.com") is None


def test_invalid_websites():
    assert identity_from_url("") is None
    assert identity_from_url("info@agency.com") is None
    assert identity_from_url("not a website") is None


def test_names():
    assert clean_name("Sports Trips · Visited link") == "Sports Trips"
    assert normalize_name("Exceed Tours & Travels") == "exceed tours and travels"
    assert normalize_name("Agence Évasion") == "agence evasion"


def test_emails():
    text = "info@exceedtourism.com\r\nreservation@exceedtourism.com logo@2x.png"
    assert extract_emails(text) == ["info@exceedtourism.com", "reservation@exceedtourism.com"]
    assert is_role_address("info@x.com")
    assert not is_role_address("melissa@x.com")


def test_countries():
    assert country_code("UK") == "GB"
    assert country_code("Netherland") == "NL"
    assert country_code("USA/International") == "US"
    assert country_code("Atlantis") is None
