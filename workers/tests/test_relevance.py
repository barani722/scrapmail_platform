from scrapmail_worker.relevance import rate


def test_ticket_and_hospitality_seller_is_a():
    r = rate(
        "Buy Champions League and Premier League tickets. "
        "VIP hospitality packages for F1 Grand Prix.",
        "Football tickets & hospitality",
    )
    assert r.level == "A"
    assert "tickets" in r.keywords and "champions league" in r.keywords


def test_sports_travel_is_b():
    r = rate("Rugby tours and football trips for supporters. Travel to the match with us.")
    assert r.level == "B"


def test_general_travel_agency_is_c():
    r = rate("Your local travel agency for holidays and cruises.", "Smith Travel")
    assert r.level == "C"
    assert r.is_relevant


def test_multilingual_and_accents():
    assert (
        rate("Agence de voyages: billets pour concerts et festivals, Roland-Garros").level in "AB"
    )
    assert rate("Reisebüro für Urlaub und Städtereisen", "Reisebüro Müller").level in "CD"


def test_unrelated_business_is_e_and_rejected():
    r = rate("We repair cars and sell spare parts.", "Garage Dupont")
    assert r.level == "E"
    assert not r.is_relevant


def test_words_inside_other_words_do_not_match():
    # "tours" must not match "detours", "f1" must not match "f150".
    r = rate("Ford F150 parts and detours information")
    assert r.level == "E"


def test_theatre_and_comedy_ticket_seller_is_a():
    r = rate("Theatre tickets for West End musicals and stand-up comedy shows.", "Box office")
    assert r.level == "A"


def test_concierge_and_tourism_agency_is_c():
    assert rate("Luxury conciergerie and tourism agency in Monaco.").level == "C"
    assert rate("Agencia de turismo y viajes.").level == "C"


def test_local_language_agencies_are_rated():
    # Nordic football-trip agencies (compound words).
    assert rate("Fotbollsresor till Premier League. Köp biljetter och resor.").level == "A"
    assert rate("Fodboldrejser og billetter til Premier League kampe.").level == "A"
    # German sharp s, Polish, Japanese, Arabic, Hebrew.
    assert rate("Fußballreisen und Tickets für die Bundesliga.").level == "A"
    assert rate("Wyjazdy na mecze Premier League, bilety i wycieczki.").level == "A"
    assert rate("プレミアリーグ観戦ツアー、サッカー観戦チケット").level == "A"
    assert rate("وكالة سفر رحلات سياحة").level == "C"
    assert rate("סוכנות נסיעות וחבילות נופש").level == "C"


def test_repeated_keyword_counts_once():
    r = rate("liput")
    assert r.keywords == ["liput"]


def test_clubs_jobs_software_and_venues_are_not_agencies():
    text = "Buy tickets for football matches, concerts and VIP hospitality packages."
    not_agencies = [
        "Aston Villa | Official Website",
        "West Ham United Official Site",
        "Global Sports Jobs | Jobs in sport",
        "Goldstar Recruitment - sports recruitment",
        "Ticket Tailor - online ticketing platform",
        "Tourwriter - tour operator software",
        "The NEC Birmingham - exhibition centre",
        "The Destinations Show - travel show",
    ]
    for headline in not_agencies:
        r = rate(text, headline)
        assert r.level == "D", headline
        assert r.keywords[0].startswith("not an agency")


def test_real_ticket_and_travel_agencies_stay_relevant():
    text = "Buy tickets for football matches, concerts and VIP hospitality packages."
    agencies = [
        "Sportsevents365 - football tickets and hospitality",
        "LOVEtheatre - theatre tickets and breaks",
        "Arsenal Football Club tickets | Premier League hospitality",
        "Wembley Stadium concert tickets",
        "Official ticket agency | Official site",  # agency word wins over "official site"
        "College football tickets and travel packages",
    ]
    for headline in agencies:
        assert rate(text, headline).level == "A", headline
