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
their 5-minute lease expires.

## Modules

| Module      | Purpose                                                         |
| ----------- | --------------------------------------------------------------- |
| `normalize` | Duplicate-detection keys, name/country/email normalization      |
| `importer`  | Idempotent import of the April / Giovani / Naeem spreadsheets   |
| `crawler`   | Polite fetching (robots.txt, timeouts, size limits, no evasion) |
| `extract`   | Emails, phones, description, location from HTML and schema.org  |
| `worker`    | Queue loop: claim tasks, enrich agencies, record results        |

Tests: `uv run pytest`. Lint: `uv run ruff check . && uv run ruff format --check .`
