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

## Environments and deployment

| Environment | Web app                    | Database (Supabase) | Migrations                      |
| ----------- | -------------------------- | ------------------- | ------------------------------- |
| Local       | `pnpm dev`                 | dev project         | `supabase db push --linked`     |
| Preview     | Vercel, every pull request | staging project     | automatic after merge to `main` |
| Production  | Vercel, `main` branch      | production project  | after manual approval in GitHub |

- Vercel project Root Directory: `apps/web`. Functions run in Paris (`cdg1`, see `apps/web/vercel.json`), next to the Supabase region (eu-west-3).
- Vercel environment variables: see `apps/web/.env.example`. Mark `SUPABASE_SECRET_KEY` as Sensitive.
- Database deployment: `.github/workflows/deploy-db.yml` (setup instructions at the top of the file).
- Error monitoring: Sentry, enabled by setting `NEXT_PUBLIC_SENTRY_DSN`.

## Continuous integration

`.github/workflows/ci.yml` runs on every pull request to `main`: formatting, lint, type check, build, database migrations + security tests, and a secret scan of the full git history.

## Workflow

Each feature is developed on its own branch named after the feature (e.g. `setup/project-foundation`), tested locally, then merged into `main` through a pull request.
