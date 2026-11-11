-- =============================================================================
-- Security baseline
--
-- 1. Search extensions (used by agency search and duplicate matching later).
-- 2. Schemas that are NOT exposed through the Supabase Data API:
--      private  - helper functions (RLS helpers, trigger functions)
--      internal - tables that only the server / workers may touch
-- 3. Lock down default privileges: by default Supabase grants ALL on every new
--    public table, sequence and function to `anon` and `authenticated`.
--    We revoke that, so every object must grant access explicitly.
-- =============================================================================

-- 1. Extensions --------------------------------------------------------------
create extension if not exists pg_trgm with schema extensions;
create extension if not exists unaccent with schema extensions;

-- 2. Non-exposed schemas -----------------------------------------------------
create schema if not exists private;
create schema if not exists internal;

comment on schema private is
  'Helper functions (RLS helpers, triggers). Not exposed through the Data API.';
comment on schema internal is
  'Server/worker-only tables. Not exposed through the Data API.';

revoke all on schema private from public, anon, authenticated;
revoke all on schema internal from public, anon, authenticated;

-- 3. Default privileges for objects created by migrations (role: postgres) ----
alter default privileges for role postgres in schema public
  revoke all on tables from anon, authenticated;
alter default privileges for role postgres in schema public
  revoke all on sequences from anon, authenticated;
alter default privileges for role postgres in schema public
  revoke all on functions from public, anon, authenticated;

alter default privileges for role postgres in schema private
  revoke all on functions from public;
alter default privileges for role postgres in schema internal
  revoke all on tables from public;
alter default privileges for role postgres in schema internal
  revoke all on functions from public;
