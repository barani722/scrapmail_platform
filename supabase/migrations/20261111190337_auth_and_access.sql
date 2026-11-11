-- =============================================================================
-- Authentication and access control
--
-- profiles          : one row per auth user. Holds the account status
--                     (pending / approved / rejected / suspended) and the
--                     platform role. Users can read their own row but never
--                     change it; admins change it through admin_review_account.
-- workspace_members : which approved users belong to which workspace.
--
-- Access rule used everywhere: a signed-in user only sees data when their
-- account status is 'approved' (checked live, so suspension is immediate).
-- =============================================================================

create type public.account_status as enum ('pending', 'approved', 'rejected', 'suspended');
create type public.platform_role as enum ('user', 'admin');
create type public.workspace_role as enum ('owner', 'admin', 'member', 'viewer');

-- Profiles --------------------------------------------------------------------
create table public.profiles (
  user_id        uuid primary key references auth.users (id) on delete cascade,
  email          text not null,
  full_name      text not null default '' check (char_length(full_name) <= 200),
  status         public.account_status not null default 'pending',
  platform_role  public.platform_role not null default 'user',
  reviewed_by    uuid references auth.users (id) on delete set null,
  reviewed_at    timestamptz,
  review_note    text check (char_length(review_note) <= 1000),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index profiles_status_idx on public.profiles (status, created_at);

alter table public.profiles enable row level security;

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function private.set_updated_at();

-- Workspace membership --------------------------------------------------------
create table public.workspace_members (
  workspace_id  uuid not null references public.workspaces (id) on delete cascade,
  user_id       uuid not null references auth.users (id) on delete cascade,
  role          public.workspace_role not null default 'member',
  created_at    timestamptz not null default now(),
  primary key (workspace_id, user_id)
);

create index workspace_members_user_idx on public.workspace_members (user_id);

alter table public.workspace_members enable row level security;

-- Audit: record ids may be "id" or "user_id" ---------------------------------
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

  if tg_op = 'UPDATE' and v_old = v_new then
    return null;
  end if;

  v_record_id := coalesce(v_new ->> 'id', v_old ->> 'id',
                          v_new ->> 'user_id', v_old ->> 'user_id');
  v_workspace := coalesce(v_new ->> 'workspace_id', v_old ->> 'workspace_id');

  if tg_table_schema = 'public' and tg_table_name = 'workspaces' then
    v_workspace := v_record_id;
  end if;

  insert into internal.audit_log (
    actor_id, actor_role, workspace_id, action,
    table_schema, table_name, record_id, old_data, new_data
  )
  values (
    auth.uid(),
    coalesce(nullif(current_setting('role', true), 'none'), session_user),
    v_workspace::uuid,
    tg_op,
    tg_table_schema,
    tg_table_name,
    v_record_id,
    v_old,
    v_new
  );

  return null;
end;
$$;

revoke all on function private.audit_row_change() from public;

create trigger profiles_audit
  after insert or update or delete on public.profiles
  for each row execute function private.audit_row_change();

create trigger workspace_members_audit
  after insert or update or delete on public.workspace_members
  for each row execute function private.audit_row_change();

-- Access helpers (used by RLS policies) ---------------------------------------
-- SECURITY DEFINER so policies can read profiles without recursive RLS checks.

create or replace function private.is_approved()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles
    where user_id = (select auth.uid()) and status = 'approved'
  );
$$;

create or replace function private.is_platform_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles
    where user_id = (select auth.uid())
      and status = 'approved'
      and platform_role = 'admin'
  );
$$;

create or replace function private.is_workspace_member(p_workspace_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.workspace_members m
    join public.profiles p on p.user_id = m.user_id
    where m.workspace_id = p_workspace_id
      and m.user_id = (select auth.uid())
      and p.status = 'approved'
  );
$$;

revoke all on function private.is_approved() from public;
revoke all on function private.is_platform_admin() from public;
revoke all on function private.is_workspace_member(uuid) from public;

-- Signed-in users need the private schema only to evaluate these helpers.
-- The schema is not exposed through the Data API.
grant usage on schema private to authenticated;
grant execute on function private.is_approved() to authenticated;
grant execute on function private.is_platform_admin() to authenticated;
grant execute on function private.is_workspace_member(uuid) to authenticated;

-- Grants + RLS policies -------------------------------------------------------
grant select on public.profiles to authenticated;
grant select on public.workspaces to authenticated;
grant select on public.workspace_members to authenticated;

create policy "profiles: read own row or admin reads all"
  on public.profiles for select to authenticated
  using (user_id = (select auth.uid()) or (select private.is_platform_admin()));

create policy "workspaces: approved members or admins"
  on public.workspaces for select to authenticated
  using ((select private.is_workspace_member(id)) or (select private.is_platform_admin()));

create policy "workspace_members: own memberships or admins"
  on public.workspace_members for select to authenticated
  using (
    (user_id = (select auth.uid()) and (select private.is_approved()))
    or (select private.is_platform_admin())
  );

-- New sign-up => pending profile ----------------------------------------------
create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (user_id, email, full_name)
  values (
    new.id,
    coalesce(new.email, ''),
    left(btrim(coalesce(new.raw_user_meta_data ->> 'full_name', '')), 200)
  );
  return new;
end;
$$;

revoke all on function private.handle_new_user() from public;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function private.handle_new_user();

-- Admin action: approve / reject / suspend / reactivate -----------------------
create or replace function public.admin_review_account(
  p_user_id      uuid,
  p_status       public.account_status,
  p_workspace_id uuid default null,
  p_role         public.workspace_role default 'member',
  p_note         text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.is_platform_admin() then
    raise exception 'Only platform administrators can review accounts'
      using errcode = 'insufficient_privilege';
  end if;

  if p_user_id = auth.uid() then
    raise exception 'Administrators cannot change their own account status'
      using errcode = 'insufficient_privilege';
  end if;

  update public.profiles
     set status      = p_status,
         reviewed_by = auth.uid(),
         reviewed_at = now(),
         review_note = p_note
   where user_id = p_user_id;

  if not found then
    raise exception 'Account not found' using errcode = 'no_data_found';
  end if;

  if p_status = 'approved' and p_workspace_id is not null then
    insert into public.workspace_members (workspace_id, user_id, role)
    values (p_workspace_id, p_user_id, p_role)
    on conflict (workspace_id, user_id) do update set role = excluded.role;
  end if;
end;
$$;

revoke all on function public.admin_review_account(uuid, public.account_status, uuid, public.workspace_role, text) from public, anon;
grant execute on function public.admin_review_account(uuid, public.account_status, uuid, public.workspace_role, text) to authenticated;

-- First administrator ----------------------------------------------------------
-- Run once as the database owner (SQL editor / supabase db query), never via the API:
--   select private.bootstrap_admin('admin@example.com', 'Scrap&Mail', 'scrapmail');
-- Works only while no platform admin exists.
create or replace function private.bootstrap_admin(
  p_email          text,
  p_workspace_name text,
  p_workspace_slug text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id      uuid;
  v_workspace_id uuid;
begin
  if exists (select 1 from public.profiles where platform_role = 'admin') then
    raise exception 'A platform administrator already exists';
  end if;

  select user_id into v_user_id
    from public.profiles where lower(email) = lower(p_email);
  if v_user_id is null then
    raise exception 'No account found for %', p_email;
  end if;

  update public.profiles
     set status = 'approved', platform_role = 'admin',
         reviewed_at = now(), review_note = 'Bootstrap administrator'
   where user_id = v_user_id;

  insert into public.workspaces (name, slug)
  values (p_workspace_name, p_workspace_slug)
  on conflict (slug) do update set name = excluded.name
  returning id into v_workspace_id;

  insert into public.workspace_members (workspace_id, user_id, role)
  values (v_workspace_id, v_user_id, 'owner')
  on conflict (workspace_id, user_id) do update set role = 'owner';

  return v_user_id;
end;
$$;

revoke all on function private.bootstrap_admin(text, text, text) from public, authenticated;
