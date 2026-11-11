# Contributing

Development conventions for Scrap&Mail.

## Workflow

1. Update `main` and create a branch named after the feature:
   `git switch main && git pull && git switch -c <type>/<short-name>`
   - Types: `setup/`, `feat/`, `fix/`, `docs/`, `chore/`
   - Example: `feat/agency-search`
2. Work in small steps. Run the checks locally (see below) and commit locally.
3. When the feature is ready, push the branch and open a pull request to `main`.
4. Merge only when all CI checks and the Vercel preview are green.

## Commit messages

[Conventional Commits](https://www.conventionalcommits.org/), short and in English:

```
feat: add agency search filters
fix: handle empty country values in import
docs: describe deployment environments
ci: add database tests
chore: update dependencies
```

## Checks before pushing

```bash
pnpm format:check
pnpm lint
pnpm typecheck
pnpm build
```

Database tests (pgTAP) run in CI. Locally they need Docker: `pnpm exec supabase test db`.

## Code structure (web app)

| Path                         | Contents                                       |
| ---------------------------- | ---------------------------------------------- |
| `apps/web/src/app/`          | Routes (Next.js App Router)                    |
| `apps/web/src/components/ui` | shadcn/ui components                           |
| `apps/web/src/components/`   | Feature and brand components                   |
| `apps/web/src/lib/`          | Shared logic (Supabase clients, monitoring, …) |
| `apps/web/src/env/`          | Validated environment settings                 |

- TypeScript strict mode; no `any` without a comment explaining why.
- Server-only code imports `"server-only"` so it can never reach the browser.
- Read settings through `@/env/client` or `@/env/server`, not `process.env`.

## Environment variables and secrets

- Never commit `.env.local` or any real key. CI scans the full git history.
- `NEXT_PUBLIC_*` values are public (embedded in the browser bundle).
  Secrets never get that prefix.
- New setting: add it to the schema in `src/env/`, to `.env.example`,
  and to Vercel (Preview + Production).

## Database changes

- Only through migrations: `pnpm exec supabase migration new <name>`.
  Never change the schema in the Supabase dashboard.
- Every new table: enable RLS, grant access explicitly, add policies,
  and attach the audit trigger when its changes matter.
- Add or extend pgTAP tests in `supabase/tests/database/`.
- Apply to dev with `pnpm exec supabase db push --linked`. Staging and
  production are migrated by `.github/workflows/deploy-db.yml`
  (production only after manual approval).

## Dependencies

- Pin exact versions (no `^` or `~`).
- Prefer versions released at least 14 days ago.
- Packages may not run install scripts unless approved in
  `pnpm-workspace.yaml` (`allowBuilds`).
- Add a dependency only when it clearly earns its place.
