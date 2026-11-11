-- =============================================================================
-- Workspaces and audit log
--
-- workspaces         : tenant boundary. Every workspace-owned row will carry a
--                      workspace_id. Access policies arrive with authentication
--                      (Milestone 2); until then only server-side roles can
--                      read or write (RLS on, no policies, no grants).
-- internal.audit_log : append-only history of data changes, written by a
--                      generic trigger. Not exposed through the Data API.
-- =============================================================================

-- Shared trigger: keep updated_at current -------------------------------------
create or replace function private.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- Workspaces ------------------------------------------------------------------
create table public.workspaces (
  id          uuid primary key default gen_random_uuid(),
  name        text not null
              check (char_length(btrim(name)) between 1 and 200),
  slug        text not null unique
              check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(slug) <= 63),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

comment on table public.workspaces is
  'Tenant boundary: client-owned data belongs to exactly one workspace.';

alter table public.workspaces enable row level security;

create trigger workspaces_set_updated_at
  before update on public.workspaces
  for each row execute function private.set_updated_at();

-- Audit log -------------------------------------------------------------------
create table internal.audit_log (
  id            bigint generated always as identity primary key,
  occurred_at   timestamptz not null default now(),
  actor_id      uuid,          -- auth.uid() of the signed-in user, if any
  actor_role    text not null, -- database role, e.g. authenticated / service_role
  workspace_id  uuid,
  action        text not null check (action in ('INSERT', 'UPDATE', 'DELETE')),
  table_schema  text not null,
  table_name    text not null,
  record_id     text,
  old_data      jsonb,
  new_data      jsonb
);

comment on table internal.audit_log is
  'Append-only history of data changes. Rows cannot be updated or deleted.';

create index audit_log_workspace_time_idx
  on internal.audit_log (workspace_id, occurred_at desc);
create index audit_log_record_idx
  on internal.audit_log (table_schema, table_name, record_id);

-- Defence in depth: RLS on, no policies, no grants to API roles.
alter table internal.audit_log enable row level security;
revoke all on internal.audit_log from public, anon, authenticated;

-- Append-only guard: block UPDATE, DELETE and TRUNCATE for every role.
create or replace function private.prevent_audit_log_change()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'internal.audit_log is append-only (% is not allowed)', tg_op
    using errcode = 'insufficient_privilege';
end;
$$;

create trigger audit_log_no_update_delete
  before update or delete on internal.audit_log
  for each row execute function private.prevent_audit_log_change();

create trigger audit_log_no_truncate
  before truncate on internal.audit_log
  for each statement execute function private.prevent_audit_log_change();

-- Generic audit trigger: attach to any table with
--   create trigger <table>_audit after insert or update or delete on <table>
--     for each row execute function private.audit_row_change();
-- Uses the row's "id" and "workspace_id" columns when present.
create or replace function private.audit_row_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old       jsonb;
  v_new       jsonb;
  v_record_id text;
  v_workspace text;
begin
  if tg_op in ('UPDATE', 'DELETE') then
    v_old := to_jsonb(old);
  end if;
  if tg_op in ('INSERT', 'UPDATE') then
    v_new := to_jsonb(new);
  end if;

  -- Skip updates that change nothing.
  if tg_op = 'UPDATE' and v_old = v_new then
    return null;
  end if;

  v_record_id := coalesce(v_new ->> 'id', v_old ->> 'id');
  v_workspace := coalesce(v_new ->> 'workspace_id', v_old ->> 'workspace_id');

  -- A workspace row is its own workspace.
  if tg_table_schema = 'public' and tg_table_name = 'workspaces' then
    v_workspace := v_record_id;
  end if;

  insert into internal.audit_log (
    actor_id, actor_role, workspace_id, action,
    table_schema, table_name, record_id, old_data, new_data
  )
  values (
    auth.uid(),
    -- current_user is the function owner here; the SET ROLE value is the caller.
    coalesce(nullif(current_setting('role', true), 'none'), session_user),
    v_workspace::uuid,
    tg_op,
    tg_table_schema,
    tg_table_name,
    v_record_id,
    v_old,
    v_new
  );

  return null; -- AFTER trigger: return value is ignored
end;
$$;

create trigger workspaces_audit
  after insert or update or delete on public.workspaces
  for each row execute function private.audit_row_change();

-- Trigger functions are never called directly.
revoke all on function private.set_updated_at() from public;
revoke all on function private.prevent_audit_log_change() from public;
revoke all on function private.audit_row_change() from public;
