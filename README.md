# Scrap&Mail Platform

Agency discovery and database platform.

## Repository layout

| Path       | Purpose                                                |
| ---------- | ------------------------------------------------------ |
| `apps/web` | Next.js web app (deployed to Vercel)                   |
| `workers`  | Python background workers (run separately from Vercel) |
| `supabase` | Database migrations, config and tests (Supabase CLI)   |
| `docs/adr` | Architecture decision records                          |

`design/` (UI references) and the client files in `docs/` are kept locally and are not committed.

## Requirements

- Node.js 24 (see `.nvmrc`)
- pnpm 12 (`packageManager` field in `package.json`)

## Getting started

```bash
pnpm install
pnpm exec supabase --version
```

Full setup instructions will be added during Milestone 1.

## Database (Supabase)

- Migrations live in `supabase/migrations/`, tests in `supabase/tests/database/`.
- New migration: `pnpm exec supabase migration new <name>`
- Apply to the linked dev project: `pnpm exec supabase db push --linked`
- Tests (pgTAP) need Docker locally (`pnpm exec supabase test db`) and run automatically in CI on every pull request.
- Never edit the database schema in the Supabase dashboard; always use a migration.

## Continuous integration

`.github/workflows/ci.yml` runs on every pull request to `main`: formatting, lint, type check, build, database migrations + security tests, and a secret scan of the full git history.

## Workflow

Each feature is developed on its own branch named after the feature (e.g. `setup/project-foundation`), tested locally, then merged into `main` through a pull request.
