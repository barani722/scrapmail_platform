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
| `pnpm worker`        | Start the worker under the supervisor (auto-restart; stop: Ctrl+C)   |
| `pnpm worker:single` | Start one worker without the supervisor                              |
| `pnpm import:client` | Dry run of the client spreadsheet import (`docs/`); add `-- --write` |

Several workers can run at once; each claims tasks atomically from the
database queue. Tasks of a stopped or crashed worker are picked up again after
their 10-minute lease expires; a worker stopped with Ctrl+C or by the supervisor
hands its tasks back at once.

**Autopilot.** Every 5 s the worker measures how busy its main thread is and
adjusts how many tasks run at once, between 16 and `WORKER_MAX_CONCURRENCY`
(default 300), starting at `WORKER_CONCURRENCY`. A task running over 4 minutes is
stopped and retried later. Every 30 s it reports speed and health; the Scraping
Jobs page shows it.

**Supervisor.** `pnpm worker` runs `scrapmail_worker.supervisor`. One worker uses
one CPU core for its main work, so the supervisor runs a **pool of workers** sized
to the machine: it adds a worker (up to `WORKER_PROCESSES_MAX`, default
(cores − 1) / 2) while all workers are at their limit, there is work queued, CPU is
below 70 %, memory below 75 % and the database answers within 400 ms. It removes
one when CPU is above 90 %, memory above 85 %, the database takes over 1.5 s, or
little work is left. Each worker is restarted when it exits, stops reporting for
3 minutes, or stays below 30 % of its best speed for about 4 minutes while busy.

## Modules

| Module      | Purpose                                                         |
| ----------- | --------------------------------------------------------------- |
| `normalize` | Duplicate-detection keys, name/country/email normalization      |
| `importer`  | Idempotent import of the April / Giovani / Naeem spreadsheets   |
| `crawler`   | Polite fetching (robots.txt, timeouts, size limits, no evasion) |
| `extract`   | Emails, phones, description, location from HTML and schema.org  |
| `relevance` | Free keyword-based A–E rating (multilingual)                    |
| `sources`   | Discovery sources: OpenStreetMap (Overpass) and Serper (Google) |
| `worker`    | Queue loop: discovery, qualification, enrichment                |

Tests: `uv run pytest`. Lint: `uv run ruff check . && uv run ruff format --check .`

## Discovery (finding new agencies)

1. A discovery job finds candidate websites (OpenStreetMap per country: travel agencies,
   tour operators, ticket offices, concierges; links on
   known agency websites; or Google searches via Serper).
2. Each candidate is stored once per workspace (`discovery_candidates`); websites
   already in the agency database are skipped.
3. A `qualify_candidate` task visits the website and rates it. OpenStreetMap
   places are always added (also places with only an email and no website);
   link/search results only when rated A–C. A = sells tickets for live events.
4. New agencies get emails, phone, country, relevance and full provenance.

Web search uses `SERPER_API_KEY` (Google results per country) and stops at
`SEARCH_MONTHLY_LIMIT` searches per month (default 2,400, inside Serper's 2,500
free credits). When the credits run out, the remaining searches are skipped.
Results are cached 30 days, so repeating a search costs nothing.

### Monthly routine (suggested)

1. Find new agencies → OpenStreetMap → All countries
2. Find new agencies → Links on known agency websites
3. Find new agencies → Web search → main markets (uses the free monthly credit)
4. Update existing agencies → All agencies with a website (refreshes data and ratings)
