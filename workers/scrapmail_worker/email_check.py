"""Does an email domain exist and accept mail? (DNS only: no mail is sent.)

A domain accepts mail when it has MX records, or (by the mail standard) an address
record when it has none. Mailboxes themselves are not probed: mail servers do not
answer that reliably, and probing many of them gets a server blocklisted.
"""

from __future__ import annotations

import asyncio

import dns.asyncresolver
import dns.exception
import dns.resolver

OK = "ok"  # the domain accepts mail
NO_DOMAIN = "no_domain"  # the domain does not exist
NO_MAIL = "no_mail_server"  # the domain exists but does not accept mail
UNKNOWN = "unknown"  # DNS did not answer in time; try again later

# Contact email_status and note for each DNS result.
MAIL_STATUS = {
    OK: ("valid", ""),
    NO_DOMAIN: ("invalid", "domain does not exist"),
    NO_MAIL: ("no_mail_server", "domain does not accept email"),
    UNKNOWN: ("unverified", "DNS did not answer; check again later"),
}


class DomainChecker:
    def __init__(self, concurrency: int = 64, timeout: float = 6.0) -> None:
        self.resolver = dns.asyncresolver.Resolver()
        self.resolver.lifetime = timeout
        self.cache: dict[str, str] = {}
        self._slots = asyncio.Semaphore(concurrency)

    async def check(self, domain: str) -> str:
        domain = domain.lower().strip(".")
        if domain not in self.cache:
            async with self._slots:
                self.cache[domain] = await self._lookup(domain)
        return self.cache[domain]

    async def _lookup(self, domain: str) -> str:
        try:
            answer = await self.resolver.resolve(domain, "MX")
            # "Null MX" (a single "." exchange) means: this domain takes no mail.
            hosts = [str(r.exchange).rstrip(".") for r in answer]
            return NO_MAIL if hosts == [""] else OK
        except dns.resolver.NXDOMAIN:
            return NO_DOMAIN
        except dns.resolver.NoAnswer:
            pass  # no MX: the domain's own address may receive mail
        except (dns.exception.Timeout, dns.resolver.NoNameservers):
            return UNKNOWN
        except dns.exception.DNSException:
            return UNKNOWN
        for record in ("A", "AAAA"):
            try:
                await self.resolver.resolve(domain, record)
                return OK
            except dns.resolver.NoAnswer:
                continue
            except dns.resolver.NXDOMAIN:
                return NO_DOMAIN
            except dns.exception.DNSException:
                return UNKNOWN
        return NO_MAIL
