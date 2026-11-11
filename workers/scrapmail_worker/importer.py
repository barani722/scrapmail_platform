"""Import the client's agency spreadsheets into Supabase.

Usage (from the workers/ folder):
    uv run python -m scrapmail_worker.importer --workspace scrapmail ../docs            # dry run
    uv run python -m scrapmail_worker.importer --workspace scrapmail ../docs --write    # import

Safe to run repeatedly: existing agencies are never overwritten, and every
source row is stored once in agency_sources (with its original values).
The merged spreadsheet is NOT imported (it has no source column); it is only
used as a reference to check that nothing was missed.
"""

from __future__ import annotations

import argparse
from collections import Counter
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from openpyxl import load_workbook

from .config import load_settings
from .db import Db
from .normalize import (
    clean_name,
    clean_text,
    country_code,
    extract_emails,
    identity_from_url,
    is_role_address,
    normalize_name,
    normalize_url,
)

# Source priority when several files describe the same agency (best data first).
SOURCES = [
    ("April", "April - Travel agencies & Concierges.xlsx", "Sheet1"),
    ("Giovani", "Giovani - Travel agencies & Concierges.xlsx", "Sheet1"),
    ("Naeem", "Naeem - Travel agencies & Concierges.xlsx", "Sheet1"),
    ("Naeem Maps", "Naeem - Travel agencies & Concierges.xlsx", "Sheet3"),
]
MERGED_FILE = "Merged_Email_Marketing_Contacts_REVISED.xlsx"


@dataclass
class SourceRow:
    source: str
    file: str
    sheet: str
    row_number: int
    raw: dict[str, Any]
    name: str
    website: str | None
    country: str | None
    description: str | None
    emails: list[str]
    contact_name: str | None
    contact_title: str | None


@dataclass
class Agency:
    identity_key: str
    name: str
    website: str | None = None
    country: str | None = None
    description: str | None = None
    rows: list[SourceRow] = field(default_factory=list)


def _read_sheet(path: Path, sheet: str) -> list[tuple[int, dict[str, Any]]]:
    workbook = load_workbook(path, read_only=True, data_only=True)
    rows = workbook[sheet].iter_rows(values_only=True)
    header = [str(h).strip() if h is not None else "" for h in next(rows)]
    result = []
    for index, values in enumerate(rows, start=2):
        record = {
            header[i]: (str(v).strip() if v is not None else "")
            for i, v in enumerate(values)
            if i < len(header) and header[i]
        }
        if any(record.values()):
            result.append((index, record))
    workbook.close()
    return result


def read_source(folder: Path, source: str, file: str, sheet: str) -> list[SourceRow]:
    rows = []
    for row_number, raw in _read_sheet(folder / file, sheet):
        if sheet == "Sheet3":  # Google Maps export: name + website only
            name, website = raw.get("OSrXXb", ""), raw.get("yYlJEf href", "")
            country = description = contact = title = None
            emails: list[str] = []
        else:
            name = raw.get("Agency name", "")
            website = raw.get("Website", "")
            country = raw.get("Country") or None
            description = raw.get("Selling") or None
            emails = extract_emails(raw.get("Email contact"))
            contact = raw.get("Contact Name") or None
            title = raw.get("Title") or raw.get("Title ") or None
        rows.append(
            SourceRow(
                source=source,
                file=file,
                sheet=sheet,
                row_number=row_number,
                raw=raw,
                name=clean_name(name),
                website=normalize_url(website),
                country=country,
                description=clean_text(description),
                emails=emails,
                contact_name=clean_name(contact) or None,
                contact_title=clean_name(title) or None,
            )
        )
    return rows


def group_agencies(rows: list[SourceRow]) -> tuple[dict[str, Agency], Counter]:
    """Merge rows that describe the same agency (same identity key)."""
    agencies: dict[str, Agency] = {}
    skipped: Counter = Counter()
    for row in rows:
        key = identity_from_url(row.website)
        if not key:
            if not row.name:
                skipped["no name and no website"] += 1
                continue
            key = f"name:{normalize_name(row.name)}"
        agency = agencies.get(key)
        if agency is None:
            agency = agencies[key] = Agency(identity_key=key, name=row.name or key)
        # Rows arrive in source-priority order: keep the first non-empty value.
        agency.website = agency.website or row.website
        agency.country = agency.country or row.country
        agency.description = agency.description or row.description
        agency.rows.append(row)
    return agencies, skipped


def _workspace_id(db: Db, slug: str) -> str:
    found = db.select("workspaces", {"select": "id", "slug": f"eq.{slug}"})
    if not found:
        raise SystemExit(f"Workspace '{slug}' not found")
    return found[0]["id"]


def _chunks(items: list, size: int = 500):
    for i in range(0, len(items), size):
        yield items[i : i + size]


def _agency_ids(db: Db, workspace_id: str) -> dict[str, str]:
    ids: dict[str, str] = {}
    offset = 0
    while True:
        page = db.select(
            "agencies",
            {
                "select": "id,identity_key",
                "workspace_id": f"eq.{workspace_id}",
                "order": "id",
                "limit": "1000",
                "offset": str(offset),
            },
        )
        ids.update({r["identity_key"]: r["id"] for r in page})
        if len(page) < 1000:
            return ids
        offset += 1000


def write(db: Db, workspace_id: str, agencies: dict[str, Agency]) -> None:
    agency_rows = [
        {
            "workspace_id": workspace_id,
            "name": a.name[:300],
            "normalized_name": normalize_name(a.name),
            "website_url": a.website,
            "identity_key": a.identity_key,
            "country_name": a.country,
            "country_code": country_code(a.country),
            "description": a.description,
        }
        for a in agencies.values()
    ]
    for chunk in _chunks(agency_rows):
        db.insert(
            "agencies", chunk, on_conflict="workspace_id,identity_key", ignore_duplicates=True
        )

    ids = _agency_ids(db, workspace_id)
    contacts, sources = [], []
    for agency in agencies.values():
        agency_id = ids[agency.identity_key]
        seen: set[str] = set()
        for row in agency.rows:
            for email in row.emails:
                if email in seen:
                    continue
                seen.add(email)
                person = row.contact_name if len(row.emails) == 1 else None
                contacts.append(
                    {
                        "workspace_id": workspace_id,
                        "agency_id": agency_id,
                        "email": email,
                        "full_name": person,
                        "job_title": row.contact_title if person else None,
                        "is_role_address": is_role_address(email),
                        "source": "import",
                    }
                )
            sources.append(
                {
                    "workspace_id": workspace_id,
                    "agency_id": agency_id,
                    "source_type": "import",
                    "source_name": row.source,
                    "source_ref": f"{row.file}#{row.sheet}!{row.row_number}",
                    "raw": row.raw,
                }
            )
    for chunk in _chunks(contacts):
        db.insert(
            "agency_contacts",
            chunk,
            on_conflict="agency_id,email_normalized",
            ignore_duplicates=True,
        )
    for chunk in _chunks(sources):
        db.insert(
            "agency_sources",
            chunk,
            on_conflict="workspace_id,source_type,source_name,source_ref",
            ignore_duplicates=True,
        )


def reconcile(folder: Path, agencies: dict[str, Agency]) -> None:
    """Check that every email and website in the merged file was imported."""
    path = folder / MERGED_FILE
    if not path.exists():
        print("Merged file not found: reconciliation skipped.")
        return
    our_emails = {e for a in agencies.values() for r in a.rows for e in r.emails}
    our_keys = set(agencies)
    missing_emails, missing_sites = set(), set()
    for _, raw in _read_sheet(path, "Merged Contacts"):
        for email in extract_emails(raw.get("Email contact")):
            if email not in our_emails:
                missing_emails.add(email)
        key = identity_from_url(normalize_url(raw.get("Website")))
        if key and key not in our_keys:
            missing_sites.add(key)
    print(
        f"Reconciliation with merged file: {len(missing_emails)} emails and "
        f"{len(missing_sites)} websites not found in the source files."
    )
    for item in sorted(missing_emails)[:10] + sorted(missing_sites)[:10]:
        print(f"  missing: {item}")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument("folder", type=Path, help="Folder with the client spreadsheets")
    parser.add_argument("--workspace", default="scrapmail", help="Workspace slug")
    parser.add_argument("--write", action="store_true", help="Write to the database")
    args = parser.parse_args()

    rows: list[SourceRow] = []
    for source, file, sheet in SOURCES:
        source_rows = read_source(args.folder, source, file, sheet)
        print(f"{source:<11} {len(source_rows):>5} rows")
        rows += source_rows

    agencies, skipped = group_agencies(rows)
    with_site = sum(1 for k in agencies if not k.startswith("name:"))
    emails = {e for a in agencies.values() for r in a.rows for e in r.emails}
    print(
        f"\n{len(rows)} rows -> {len(agencies)} unique agencies "
        f"({with_site} with website, {len(agencies) - with_site} name-only), "
        f"{len(emails)} unique emails"
    )
    countries = Counter(country_code(a.country) or "(unknown)" for a in agencies.values())
    print("Top countries:", ", ".join(f"{c} {n}" for c, n in countries.most_common(8)))
    for reason, count in skipped.items():
        print(f"Skipped {count} rows: {reason}")
    reconcile(args.folder, agencies)

    if not args.write:
        print("\nDry run only. Add --write to import.")
        return

    settings = load_settings()
    db = Db(settings)
    try:
        workspace_id = _workspace_id(db, args.workspace)
        write(db, workspace_id, agencies)
        total = db.select(
            "agencies", {"select": "id", "workspace_id": f"eq.{workspace_id}", "limit": "1"}
        )
        print(f"\nImport finished into workspace '{args.workspace}'. ({bool(total)})")
    finally:
        db.close()


if __name__ == "__main__":
    main()
