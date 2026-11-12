# workers

Python background workers for Scrap&Mail. They run separately from Vercel and
talk to Supabase with the secret key (server-side only).

## Setup (once per machine)

1. Install [uv](https://docs.astral.sh/uv/) (`winget install astral-sh.uv` on Windows).
2. `cd workers && uv sync`
3. Copy `.env.example` to `.env` and fill in `SUPABASE_URL` and `SUPABASE_SECRET_KEY`.

## Commands (from the repository root)

| Command              | What it does                                                         |
| -------------------- | -------------------------------------------------------------------- |
| `pnpm worker`        | Start a scraping worker (keeps running; stop with Ctrl+C)            |
| `pnpm import:client` | Dry run of the client spreadsheet import (`docs/`); add `-- --write` |

Several workers can run at once; each claims tasks atomically from the
database queue. Tasks of a stopped or crashed worker are picked up again after
their 10-minute lease expires. Raise `WORKER_CONCURRENCY` (default 8) in `.env` for big jobs.

## Modules

| Module      | Purpose                                                         |
| ----------- | --------------------------------------------------------------- |
| `normalize` | Duplicate-detection keys, name/country/email normalization      |
| `importer`  | Idempotent import of the April / Giovani / Naeem spreadsheets   |
| `crawler`   | Polite fetching (robots.txt, timeouts, size limits, no evasion) |
| `extract`   | Emails, phones, description, location from HTML and schema.org  |
| `relevance` | Free keyword-based A–E rating (multilingual)                    |
| `sources`   | Discovery sources: OpenStreetMap (Overpass) and Brave Search    |
| `worker`    | Queue loop: discovery, qualification, enrichment                |

Tests: `uv run pytest`. Lint: `uv run ruff check . && uv run ruff format --check .`

## Discovery (finding new agencies)

1. A discovery job finds candidate websites (OpenStreetMap per country: travel agencies,
   tour operators, ticket offices, concierges; links on
   known agency websites; or Brave web searches).
2. Each candidate is stored once per workspace (`discovery_candidates`); websites
   already in the agency database are skipped.
3. A `qualify_candidate` task visits the website and rates it. OpenStreetMap
   places are always added (also places with only an email and no website);
   link/search results only when rated A–C. A = sells tickets for live events.
4. New agencies get emails, phone, country, relevance and full provenance.

Web search uses `BRAVE_API_KEY` and stops at `BRAVE_MONTHLY_LIMIT` searches per
month (default 950, inside Brave's free credit). Results are cached 30 days.

### Monthly routine (suggested)

1. Find new agencies → OpenStreetMap → All countries
2. Find new agencies → Links on known agency websites
3. Find new agencies → Web search → main markets (uses the free monthly credit)
4. Update existing agencies → All agencies with a website (refreshes data and ratings)
