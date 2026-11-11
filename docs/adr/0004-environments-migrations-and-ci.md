# 4. Environments, migrations and CI

- Status: Accepted
- Date: 2026-11-11

## Context

Schema changes must be repeatable, reviewed and tested before they reach real
data. Production changes require the owner's explicit approval.

## Decision

- **Environments:** local (dev Supabase project, no Docker), preview (Vercel,
  every pull request), production (Vercel, `main`). A separate production
  Supabase project is created before real client data is imported; a staging
  project is optional.
- **Schema changes only through Supabase CLI migrations** in
  `supabase/migrations/`; never through the dashboard.
- **Deployment of migrations:** dev manually (`supabase db push --linked`);
  staging automatically after a merge to `main`; production only after manual
  approval in GitHub (`.github/workflows/deploy-db.yml`).
- **CI on every pull request** (`.github/workflows/ci.yml`): formatting, lint,
  type check, production build, all migrations applied to a fresh database plus
  pgTAP tests, and a gitleaks secret scan of the full history.
- **Settings are validated** at build and server start (`apps/web/src/env/`);
  invalid or missing values stop the build with a clear message.
- **Dependencies:** exact versions, preferably released at least 14 days ago;
  install scripts only when approved in `pnpm-workspace.yaml`.

## Consequences

- A broken migration or missing setting is caught before merge.
- Local database tests need Docker; without it they run in CI.
