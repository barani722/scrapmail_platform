-- Security baseline tests (pgTAP). Runs in a transaction that is rolled back.
--   pnpm exec supabase test db --linked     (or in CI against a local database)
begin;

create extension if not exists pgtap with schema extensions;

select plan(8);

-- 1. Every table in our schemas has Row Level Security enabled.
select is_empty(
  $$
    select c.oid::regclass::text
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where c.relkind in ('r', 'p')
      and n.nspname in ('public', 'private', 'internal')
      and not c.relrowsecurity
  $$,
  'every table in public, private and internal has RLS enabled'
);

-- 2. Logged-out users (anon) have no privileges on any of our tables.
select is_empty(
  $$
    select c.oid::regclass::text
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where c.relkind in ('r', 'p', 'v', 'm')
      and n.nspname in ('public', 'private', 'internal')
      and has_table_privilege('anon', c.oid, 'SELECT, INSERT, UPDATE, DELETE, TRUNCATE')
  $$,
  'anon has no table privileges'
);

-- 3. Signed-in users have no access to private/internal tables.
select is_empty(
  $$
    select c.oid::regclass::text
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where c.relkind in ('r', 'p', 'v', 'm')
      and n.nspname in ('private', 'internal')
      and has_table_privilege('authenticated', c.oid, 'SELECT, INSERT, UPDATE, DELETE, TRUNCATE')
  $$,
  'authenticated has no privileges on private/internal tables'
);

-- 4. New tables get no automatic grants (default privileges are locked down).
create table public._tap_default_privileges_check (id int);
select ok(
  not has_table_privilege('anon', 'public._tap_default_privileges_check', 'SELECT')
  and not has_table_privilege('authenticated', 'public._tap_default_privileges_check', 'SELECT'),
  'new public tables are not readable by anon/authenticated by default'
);

-- 5. Private/internal schemas are not usable by API roles.
select ok(
  not has_schema_privilege('anon', 'private', 'USAGE')
  and not has_schema_privilege('anon', 'internal', 'USAGE')
  and not has_schema_privilege('authenticated', 'internal', 'USAGE'),
  'private/internal schemas are closed to API roles'
);

-- 6. Changes to workspaces are written to the audit log.
insert into public.workspaces (name, slug) values ('TAP test', 'tap-test');
select is(
  (select count(*)::int
     from internal.audit_log
    where table_name = 'workspaces'
      and action = 'INSERT'
      and new_data ->> 'slug' = 'tap-test'),
  1,
  'inserting a workspace writes one audit row'
);

-- 7-8. The audit log is append-only.
select throws_ok(
  $$ update internal.audit_log set action = 'DELETE' $$,
  '42501',
  null,
  'audit log rows cannot be updated'
);
select throws_ok(
  $$ delete from internal.audit_log $$,
  '42501',
  null,
  'audit log rows cannot be deleted'
);

select * from finish();
rollback;
