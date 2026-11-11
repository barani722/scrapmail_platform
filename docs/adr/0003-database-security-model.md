# 3. Database security model

- Status: Accepted
- Date: 2026-11-11

## Context

Supabase exposes tables through its Data API. The publishable key is public by
design, so anyone can send requests directly to the database API. By default,
Supabase grants full access on every new table to logged-out (`anon`) and
logged-in (`authenticated`) users, leaving Row Level Security as the only
barrier. Client-owned data must never leak between workspaces.

## Decision

- **Row Level Security is mandatory** on every table. A pgTAP test fails CI if
  any table in `public`, `private` or `internal` has RLS disabled.
- **Default privileges are revoked** for `anon` and `authenticated`: every
  table, sequence and function must grant access explicitly.
- **Schemas:** `public` (exposed, protected by RLS), `private` (helper and
  trigger functions), `internal` (server/worker-only tables). `private` and
  `internal` are not exposed through the Data API.
- **Authorization is enforced in the database** (RLS policies), not only in
  page redirects or server code.
- **Audit log:** `internal.audit_log` is append-only (updates, deletes and
  truncates are blocked by triggers) and is filled by a generic trigger.
- The Supabase secret key is used only in server-only code; workers will use a
  dedicated database role with minimal privileges.

## Consequences

- A missing policy results in "no access", never in "too much access".
- Each new table needs an explicit grant, RLS policies and tests.
