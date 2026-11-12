"""Clean and check every contact email (dry run unless --write).

    uv run python -m scrapmail_worker.check_contacts            # report only
    uv run python -m scrapmail_worker.check_contacts --write    # save results
    uv run python -m scrapmail_worker.check_contacts --write --all   # re-check all
    uv run python -m scrapmail_worker.check_contacts --remove   # delete unusable ones

Checking deletes nothing. For each contact:
  - the address is cleaned (URL codes like %20, stray symbols, text glued to the
    ending); the original is kept in email_original when it changes,
  - the domain is checked in DNS (exists and accepts mail),
  - email_status is set: valid, unverified, no_mail_server, invalid or duplicate,
    with a short note saying why.
A cleaned address that another contact of the same agency already has is not
changed (the database allows each address once per agency); it is marked duplicate.

--remove (on request) deletes the contacts marked invalid, and the duplicates after
copying their name, title and phone to the clean contact they repeat. Deleted rows
are recorded in the audit log.
"""

from __future__ import annotations

import argparse
import asyncio
import collections
from dataclasses import dataclass
from typing import Any

from .config import load_settings
from .db import Db
from .email_check import MAIL_STATUS, OK, UNKNOWN, DomainChecker
from .normalize import clean_email, email_domain, is_placeholder_email

PAGE = 1000
BATCH = 500


@dataclass
class Result:
    id: str
    status: str
    note: str
    email: str | None = None  # new address, when it changes
    email_original: str | None = None


def _norm(email: str | None) -> str:
    return (email or "").strip().lower()


def load_contacts(db: Db) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    last = "00000000-0000-0000-0000-000000000000"
    while True:
        params = {
            "select": "id,agency_id,email,email_status",
            "id": f"gt.{last}",
            "order": "id",
            "limit": str(PAGE),
        }
        batch = db.select("agency_contacts", params)
        if not batch:
            return [r for r in rows if r["email"]]
        rows += batch
        last = batch[-1]["id"]


async def plan(contacts: list[dict[str, Any]], every: list[dict[str, Any]]) -> list[Result]:
    """Decide the cleaned address and status of each contact."""
    # Addresses per agency (all contacts), to avoid creating duplicates.
    taken: dict[str, set[str]] = collections.defaultdict(set)
    for c in every:
        taken[c["agency_id"]].add(_norm(c["email"]))

    cleaned = {c["id"]: clean_email(c["email"]) for c in contacts}
    checker = DomainChecker()
    domains = {email_domain(e) for e, _ in cleaned.values() if e}
    print(f"checking {len(domains):,} domains in DNS …")
    await asyncio.gather(*(checker.check(d) for d in domains))
    # A guessed ending that DNS does not confirm: check the original ending too.
    results: list[Result] = []
    for c in contacts:
        raw = c["email"]
        email, notes = cleaned[c["id"]]
        if email is None:
            results.append(Result(c["id"], "invalid", "; ".join(notes)))
            continue
        guessed = any(n.startswith("check ending") for n in notes)
        mail = checker.cache.get(email_domain(email), UNKNOWN)
        if guessed and mail != OK:
            results.append(Result(c["id"], "invalid", "unknown domain ending (not repairable)"))
            continue
        notes = [n.replace("check ending", "repaired ending") for n in notes]
        if is_placeholder_email(email):
            results.append(Result(c["id"], "invalid", "sample or technical address"))
            continue
        status, note = MAIL_STATUS[mail]
        note = "; ".join(x for x in [*notes, note] if x)
        changed = _norm(email) != _norm(raw)
        if changed and _norm(email) in taken[c["agency_id"]]:
            results.append(Result(c["id"], "duplicate", f"same address as {email} of this agency"))
            continue
        if changed:
            taken[c["agency_id"]].add(_norm(email))
            results.append(Result(c["id"], status, note, email=email, email_original=raw))
        else:
            results.append(Result(c["id"], status, note))
    return results


def report(results: list[Result], contacts: list[dict[str, Any]]) -> None:
    by_id = {c["id"]: c["email"] for c in contacts}
    counts = collections.Counter(r.status for r in results)
    fixed = [r for r in results if r.email]
    print(f"\ncontacts checked: {len(results):,}")
    for status, n in counts.most_common():
        print(f"  {status:15} {n:7,}")
    print(f"  addresses cleaned: {len(fixed):,}")
    for r in fixed[:12]:
        print(f"    {by_id[r.id]}  ->  {r.email}")
    for status in ("invalid", "duplicate", "no_mail_server", "unverified"):
        sample = [r for r in results if r.status == status][:6]
        if sample:
            print(f"  {status} e.g.:")
            for r in sample:
                print(f"    {by_id[r.id]}  ({r.note})")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--write", action="store_true", help="save the results")
    parser.add_argument("--all", action="store_true", help="re-check contacts checked before")
    parser.add_argument(
        "--remove",
        action="store_true",
        help="delete invalid contacts and duplicates (merged into their clean twin first)",
    )
    args = parser.parse_args()

    db = Db(load_settings())
    if args.remove:
        for row in db.rpc("remove_unusable_contacts", {}) or []:
            print(f"removed {row['removed']:,} {row['kind']} contacts")
        return
    every = load_contacts(db)
    # Not checked yet, or DNS did not answer last time.
    contacts = (
        every if args.all else [c for c in every if c["email_status"] in (None, "unverified")]
    )
    print(f"{len(every):,} contacts in total, {len(contacts):,} to check")
    results = asyncio.run(plan(contacts, every))
    report(results, contacts)
    if not args.write:
        print("\nDry run: nothing saved. Add --write to save.")
        return
    saved = 0
    for i in range(0, len(results), BATCH):
        rows = [
            {k: v for k, v in r.__dict__.items() if v is not None} for r in results[i : i + BATCH]
        ]
        saved += db.rpc("apply_email_checks", {"p_rows": rows}) or 0
    print(f"\nsaved: {saved:,} contacts updated (none deleted)")


if __name__ == "__main__":
    main()
