-- =============================================================================
-- Agency database and scraping jobs
--
-- agencies        : one row per agency (company) in a workspace. Duplicates are
--                   prevented by (workspace_id, identity_key), where identity_key
--                   is the canonical website domain (or host for shared platforms).
-- agency_contacts : email addresses / people of an agency.
-- agency_sources  : provenance: every import row and scraped page that
--                   contributed data, with the original values in `raw`.
-- scrape_jobs     : a unit of work requested by a user (e.g. "enrich websites").
-- scrape_tasks    : queue of individual tasks processed by Python workers.
--
-- Members of a workspace can read its data. Writes happen through workers
-- (secret key) and security-definer functions that check membership.
-- =============================================================================

create type public.agency_relevance as enum ('A', 'B', 'C', 'D', 'E');
create type public.scrape_job_status as enum ('queued', 'running', 'completed', 'failed', 'cancelled');
create type public.scrape_task_status as enum ('queued', 'running', 'done', 'failed', 'cancelled');

-- Agencies --------------------------------------------------------------------
create table public.agencies (
  id               uuid primary key default gen_random_uuid(),
  workspace_id     uuid not null references public.workspaces (id) on delete cascade,
  name             text not null check (char_length(name) between 1 and 300),
  normalized_name  text not null,
  website_url      text,
  identity_key     text not null,
  country_code     char(2),
  country_name     text,
  region           text,
  city             text,
  address          text,
  phone            text,
  description      text,
  categories       text[] not null default '{}',
  relevance        public.agency_relevance,
  website_status   text check (website_status in ('ok', 'unreachable', 'blocked', 'not_found', 'error')),
  website_title    text,
  last_checked_at  timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  search_vector    tsvector generated always as (
    to_tsvector('simple',
      coalesce(name, '') || ' ' || coalesce(identity_key, '') || ' ' ||
      coalesce(country_name, '') || ' ' || coalesce(description, ''))
  ) stored,
  unique (workspace_id, identity_key)
);

comment on column public.agencies.identity_key is
  'Duplicate-detection key: canonical domain, full host for shared/franchise platforms, or "name:<normalized name>" when no website is known.';

create index agencies_workspace_created_idx on public.agencies (workspace_id, created_at desc, id);
create index agencies_workspace_country_idx on public.agencies (workspace_id, country_code);
create index agencies_search_idx on public.agencies using gin (search_vector);
create index agencies_name_trgm_idx on public.agencies using gin (normalized_name extensions.gin_trgm_ops);

alter table public.agencies enable row level security;

create trigger agencies_set_updated_at
  before update on public.agencies
  for each row execute function private.set_updated_at();

-- Contacts --------------------------------------------------------------------
create table public.agency_contacts (
  id                uuid primary key default gen_random_uuid(),
  workspace_id      uuid not null references public.workspaces (id) on delete cascade,
  agency_id         uuid not null references public.agencies (id) on delete cascade,
  full_name         text,
  job_title         text,
  email             text,
  email_normalized  text generated always as (lower(btrim(email))) stored,
  phone             text,
  is_role_address   boolean not null default false,
  source            text not null check (source in ('import', 'website', 'manual')),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (agency_id, email_normalized)
);

create index agency_contacts_agency_idx on public.agency_contacts (agency_id);
create index agency_contacts_email_idx on public.agency_contacts (workspace_id, email_normalized);

alter table public.agency_contacts enable row level security;

create trigger agency_contacts_set_updated_at
  before update on public.agency_contacts
  for each row execute function private.set_updated_at();

-- Sources (provenance) ---------------------------------------------------------
create table public.agency_sources (
  id            bigint generated always as identity primary key,
  workspace_id  uuid not null references public.workspaces (id) on delete cascade,
  agency_id     uuid not null references public.agencies (id) on delete cascade,
  source_type   text not null check (source_type in ('import', 'website', 'search', 'manual')),
  source_name   text not null,
  source_ref    text not null,
  raw           jsonb,
  observed_at   timestamptz not null default now(),
  unique (workspace_id, source_type, source_name, source_ref)
);

create index agency_sources_agency_idx on public.agency_sources (agency_id);

alter table public.agency_sources enable row level security;

-- Scraping jobs and tasks --------------------------------------------------------
create table public.scrape_jobs (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references public.workspaces (id) on delete cascade,
  kind          text not null check (kind in ('enrich_websites', 'discover')),
  title         text not null,
  status        public.scrape_job_status not null default 'queued',
  params        jsonb not null default '{}',
  total_tasks   int not null default 0,
  done_tasks    int not null default 0,
  failed_tasks  int not null default 0,
  created_by    uuid references auth.users (id) on delete set null,
  started_at    timestamptz,
  finished_at   timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index scrape_jobs_workspace_idx on public.scrape_jobs (workspace_id, created_at desc);

alter table public.scrape_jobs enable row level security;

create trigger scrape_jobs_set_updated_at
  before update on public.scrape_jobs
  for each row execute function private.set_updated_at();

create table public.scrape_tasks (
  id            bigint generated always as identity primary key,
  job_id        uuid not null references public.scrape_jobs (id) on delete cascade,
  workspace_id  uuid not null references public.workspaces (id) on delete cascade,
  kind          text not null check (kind in ('enrich_website', 'search_query')),
  agency_id     uuid references public.agencies (id) on delete cascade,
  payload       jsonb not null default '{}',
  status        public.scrape_task_status not null default 'queued',
  attempts      int not null default 0,
  max_attempts  int not null default 3,
  run_after     timestamptz not null default now(),
  locked_by     text,
  locked_until  timestamptz,
  last_error    text,
  result        jsonb,
  created_at    timestamptz not null default now(),
  finished_at   timestamptz
);

create index scrape_tasks_claim_idx on public.scrape_tasks (run_after, id)
  where status in ('queued', 'running');
create index scrape_tasks_job_idx on public.scrape_tasks (job_id, status);

alter table public.scrape_tasks enable row level security;

-- Audit important tables
create trigger agencies_audit
  after insert or update or delete on public.agencies
  for each row execute function private.audit_row_change();
create trigger agency_contacts_audit
  after insert or update or delete on public.agency_contacts
  for each row execute function private.audit_row_change();

-- Read access for workspace members ---------------------------------------------
grant select on public.agencies, public.agency_contacts, public.agency_sources,
               public.scrape_jobs, public.scrape_tasks to authenticated;

create policy "agencies: workspace members" on public.agencies
  for select to authenticated using ((select private.is_workspace_member(workspace_id)));
create policy "agency_contacts: workspace members" on public.agency_contacts
  for select to authenticated using ((select private.is_workspace_member(workspace_id)));
create policy "agency_sources: workspace members" on public.agency_sources
  for select to authenticated using ((select private.is_workspace_member(workspace_id)));
create policy "scrape_jobs: workspace members" on public.scrape_jobs
  for select to authenticated using ((select private.is_workspace_member(workspace_id)));
create policy "scrape_tasks: workspace members" on public.scrape_tasks
  for select to authenticated using ((select private.is_workspace_member(workspace_id)));

-- Job creation (users) -------------------------------------------------------------
-- p_filter: 'missing_email' | 'never_checked' | 'all'
create or replace function public.create_enrich_job(
  p_workspace_id uuid,
  p_filter       text default 'missing_email'
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_job_id uuid;
  v_count  int;
begin
  if not private.is_workspace_member(p_workspace_id) then
    raise exception 'Not a member of this workspace' using errcode = 'insufficient_privilege';
  end if;
  if p_filter not in ('missing_email', 'never_checked', 'all') then
    raise exception 'Unknown filter %', p_filter;
  end if;

  insert into public.scrape_jobs (workspace_id, kind, title, params, created_by)
  values (
    p_workspace_id,
    'enrich_websites',
    case p_filter
      when 'missing_email' then 'Enrich agencies without email'
      when 'never_checked' then 'Enrich agencies never checked'
      else 'Enrich all agency websites'
    end,
    jsonb_build_object('filter', p_filter),
    auth.uid()
  )
  returning id into v_job_id;

  insert into public.scrape_tasks (job_id, workspace_id, kind, agency_id, payload)
  select v_job_id, a.workspace_id, 'enrich_website', a.id,
         jsonb_build_object('url', a.website_url)
  from public.agencies a
  where a.workspace_id = p_workspace_id
    and a.website_url is not null
    and (
      p_filter = 'all'
      or (p_filter = 'never_checked' and a.last_checked_at is null)
      or (p_filter = 'missing_email' and not exists (
            select 1 from public.agency_contacts c
            where c.agency_id = a.id and c.email is not null))
    );

  get diagnostics v_count = row_count;
  update public.scrape_jobs
     set total_tasks = v_count,
         status = case when v_count = 0 then 'completed'::public.scrape_job_status else status end,
         finished_at = case when v_count = 0 then now() end
   where id = v_job_id;

  return v_job_id;
end;
$$;

create or replace function public.cancel_scrape_job(p_job_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_workspace uuid;
begin
  select workspace_id into v_workspace from public.scrape_jobs where id = p_job_id;
  if v_workspace is null or not private.is_workspace_member(v_workspace) then
    raise exception 'Job not found' using errcode = 'insufficient_privilege';
  end if;

  update public.scrape_jobs
     set status = 'cancelled', finished_at = now()
   where id = p_job_id and status in ('queued', 'running');

  update public.scrape_tasks
     set status = 'cancelled', finished_at = now()
   where job_id = p_job_id and status = 'queued';
end;
$$;

revoke all on function public.create_enrich_job(uuid, text) from public, anon;
revoke all on function public.cancel_scrape_job(uuid) from public, anon;
grant execute on function public.create_enrich_job(uuid, text) to authenticated;
grant execute on function public.cancel_scrape_job(uuid) to authenticated;

-- Worker queue (service role only) -------------------------------------------------
-- Atomically claim up to p_limit tasks. Expired leases (crashed workers) are
-- reclaimed automatically. FOR UPDATE SKIP LOCKED: no task is given to two workers.
create or replace function public.claim_scrape_tasks(
  p_worker        text,
  p_limit         int default 5,
  p_lease_seconds int default 300
)
returns setof public.scrape_tasks
language sql
security definer
set search_path = ''
as $$
  with candidates as (
    select t.id
    from public.scrape_tasks t
    join public.scrape_jobs j on j.id = t.job_id
    where j.status in ('queued', 'running')
      and t.run_after <= now()
      and (t.status = 'queued' or (t.status = 'running' and t.locked_until < now()))
    order by t.run_after, t.id
    limit p_limit
    for update of t skip locked
  ), claimed as (
    update public.scrape_tasks t
       set status = 'running',
           locked_by = p_worker,
           locked_until = now() + make_interval(secs => p_lease_seconds),
           attempts = t.attempts + 1
      from candidates c
     where t.id = c.id
    returning t.*
  ), started as (
    update public.scrape_jobs j
       set status = 'running', started_at = coalesce(j.started_at, now())
     where j.status = 'queued' and j.id in (select job_id from claimed)
  )
  select * from claimed;
$$;

-- Record a task result and update job progress. Failed tasks are retried with
-- backoff until max_attempts is reached.
create or replace function public.complete_scrape_task(
  p_task_id bigint,
  p_success boolean,
  p_result  jsonb default null,
  p_error   text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_task public.scrape_tasks;
begin
  select * into v_task from public.scrape_tasks where id = p_task_id for update;
  if not found or v_task.status <> 'running' then
    return;
  end if;

  if p_success then
    update public.scrape_tasks
       set status = 'done', result = p_result, last_error = null,
           locked_by = null, locked_until = null, finished_at = now()
     where id = p_task_id;
  elsif v_task.attempts < v_task.max_attempts then
    update public.scrape_tasks
       set status = 'queued', last_error = left(p_error, 2000),
           locked_by = null, locked_until = null,
           run_after = now() + make_interval(secs => 30 * power(2, v_task.attempts)::int)
     where id = p_task_id;
    return;
  else
    update public.scrape_tasks
       set status = 'failed', last_error = left(p_error, 2000), result = p_result,
           locked_by = null, locked_until = null, finished_at = now()
     where id = p_task_id;
  end if;

  update public.scrape_jobs j
     set done_tasks   = s.done,
         failed_tasks = s.failed,
         status = case
                    when j.status = 'running' and s.open = 0 then 'completed'::public.scrape_job_status
                    else j.status
                  end,
         finished_at = case when j.status = 'running' and s.open = 0 then now() else j.finished_at end
    from (
      select count(*) filter (where status = 'done')                  as done,
             count(*) filter (where status = 'failed')                as failed,
             count(*) filter (where status in ('queued', 'running'))  as open
      from public.scrape_tasks where job_id = v_task.job_id
    ) s
   where j.id = v_task.job_id;
end;
$$;

revoke all on function public.claim_scrape_tasks(text, int, int) from public, anon, authenticated;
revoke all on function public.complete_scrape_task(bigint, boolean, jsonb, text) from public, anon, authenticated;
grant execute on function public.claim_scrape_tasks(text, int, int) to service_role;
grant execute on function public.complete_scrape_task(bigint, boolean, jsonb, text) to service_role;
