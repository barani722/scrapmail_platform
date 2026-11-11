# 2. Technology stack and repository layout

- Status: Accepted
- Date: 2026-11-11

## Context

Scrap&Mail discovers agencies, maintains a large searchable agency database and
will later support email marketing. It needs a fast web app, a secure managed
database, and long-running scraping work that cannot run inside web requests.

## Decision

- **Web app:** Next.js (App Router), TypeScript (strict), Tailwind CSS,
  shadcn/ui; hosted on **Vercel** in region `cdg1` (Paris).
- **Database and auth:** **Supabase** (PostgreSQL, Auth, Row Level Security),
  region eu-west-3 (Paris), next to the web functions.
- **Background work:** **Python workers** running on a separate host (not on
  Vercel), connecting directly to PostgreSQL. Jobs are queued in PostgreSQL.
- **Not used** until a concrete need appears: FastAPI, Redis, Celery,
  microservices.
- **One repository** (pnpm workspace):
  `apps/web` (Next.js), `workers/` (Python), `supabase/` (migrations, tests),
  `docs/adr/` (decisions). The database schema is the contract between the
  web app and the workers.
- **Error monitoring:** Sentry, disabled until a DSN is configured.

## Consequences

- One place for all code, one CI pipeline, consistent tooling.
- Vercel and the worker host deploy independently from the same repository.
- Fewer moving parts; a separate API service or queue can be added later
  without restructuring.
