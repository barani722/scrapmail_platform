from scrapmail_worker.extract import belongs_to_site, parse_page

HTML = """
<html lang="fr-FR"><head>
<title>Sports Tours International | Football trips</title>
<meta name="description" content="Football, rugby and F1 travel packages.">
<script type="application/ld+json">
{"@type":"TravelAgency","telephone":"+33 1 23 45 67 89",
 "address":{"addressCountry":"FR","addressLocality":"Paris","streetAddress":"1 rue X"}}
</script>
</head><body>
<a href="mailto:info@sportstours.fr?subject=Hi">Email us</a>
<a href="/contact-us">Contact</a>
<a href="https://other-site.com/contact">Partner</a>
<span class="__cf_email__" data-cfemail="4f2a392a213b3c0f3c3f203d3b3c3b203a3d3c61293d">x</span>
<p>Sales: Sales@SportsTours.fr — support@plumrocket.com</p>
<a href="tel:+33123456789">Call</a>
</body></html>
"""


def test_parse_page():
    data = parse_page(HTML, "https://www.sportstours.fr/")
    assert data.title == "Sports Tours International | Football trips"
    assert data.description == "Football, rugby and F1 travel packages."
    assert data.language == "fr"
    assert data.country == "FR"
    assert data.city == "Paris"
    assert "info@sportstours.fr" in data.emails
    assert "sales@sportstours.fr" in data.emails
    assert "sales@sportstours.fr" in data.emails
    assert data.contact_links == ["https://www.sportstours.fr/contact-us"]
    assert data.phones[0] == "+33123456789"


def test_cloudflare_email_is_decoded():
    data = parse_page(HTML, "https://www.sportstours.fr/")
    assert "events@sportstours.fr" in data.emails


def test_third_party_emails_are_dropped():
    assert belongs_to_site("info@sportstours.fr", "sportstours.fr")
    assert belongs_to_site("agency@gmail.com", "sportstours.fr")
    assert not belongs_to_site("support@plumrocket.com", "sportstours.fr")


def test_written_out_emails_are_found():
    from scrapmail_worker.extract import deobfuscated_emails

    assert deobfuscated_emails("Mail: info [at] agency [dot] com") == ["info@agency.com"]
    assert deobfuscated_emails("kontakt(at)reisen.de") == ["kontakt@reisen.de"]
    assert deobfuscated_emails("we meet at the stadium") == []
