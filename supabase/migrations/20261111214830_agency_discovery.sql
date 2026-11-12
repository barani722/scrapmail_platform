-- =============================================================================
-- Agency discovery
--
-- Discovery jobs find candidate websites (OpenStreetMap, links on known agency
-- websites, web search). Every candidate is stored once per workspace in
-- discovery_candidates and checked by a worker ("qualify"): the website is
-- visited, scored for relevance, and only then turned into an agency.
-- Duplicates of existing agencies are never created (same identity_key).
-- =============================================================================

-- Task kinds -------------------------------------------------------------------
alter table public.scrape_tasks drop constraint scrape_tasks_kind_check;
alter table public.scrape_tasks add constraint scrape_tasks_kind_check check (
  kind in ('enrich_website', 'discover_osm', 'discover_links', 'discover_search', 'qualify_candidate')
);

-- Tasks added while a job runs (e.g. one qualify task per new candidate) use a
-- dedupe key so the same work is never queued twice in one job.
alter table public.scrape_tasks add column dedupe_key text;
create unique index scrape_tasks_job_dedupe_idx
  on public.scrape_tasks (job_id, dedupe_key) where dedupe_key is not null;

-- Source types for provenance ------------------------------------------------------
alter table public.agency_sources drop constraint agency_sources_source_type_check;
alter table public.agency_sources add constraint agency_sources_source_type_check check (
  source_type in ('import', 'website', 'search', 'manual', 'osm', 'link')
);

-- Agency relevance and origin --------------------------------------------------------
alter table public.agencies
  add column relevance_score    smallint,
  add column relevance_keywords text[] not null default '{}',
  add column origin             text not null default 'import'
    check (origin in ('import', 'osm', 'link', 'search', 'manual'));

comment on column public.agencies.relevance is
  'A = sells tickets / event hospitality, B = sports & event travel, C = travel / concierge / corporate events, D = weak signals, E = no match. Computed from website keywords.';

create index agencies_workspace_relevance_idx on public.agencies (workspace_id, relevance);
create index agencies_workspace_origin_idx on public.agencies (workspace_id, origin);

-- Candidates --------------------------------------------------------------------------
create table public.discovery_candidates (
  id            bigint generated always as identity primary key,
  workspace_id  uuid not null references public.workspaces (id) on delete cascade,
  job_id        uuid references public.scrape_jobs (id) on delete set null,
  identity_key  text not null,
  url           text not null,
  name          text,
  country_code  char(2),
  source        text not null check (source in ('osm', 'link', 'search')),
  source_ref    text,
  raw           jsonb,
  status        text not null default 'pending'
                check (status in ('pending', 'accepted', 'rejected')),
  reason        text,
  agency_id     uuid references public.agencies (id) on delete set null,
  created_at    timestamptz not null default now(),
  processed_at  timestamptz,
  unique (workspace_id, identity_key)
);

create index discovery_candidates_job_idx on public.discovery_candidates (job_id, status);

alter table public.discovery_candidates enable row level security;
grant select on public.discovery_candidates to authenticated;
create policy "discovery_candidates: workspace members" on public.discovery_candidates
  for select to authenticated using ((select private.is_workspace_member(workspace_id)));

-- Search API usage (monthly free-tier budget) and 30-day result cache ------------------
create table public.search_usage (
  provider  text not null,
  month     date not null,
  used      int not null default 0,
  primary key (provider, month)
);
alter table public.search_usage enable row level security;
grant select on public.search_usage to authenticated;
create policy "search_usage: approved users" on public.search_usage
  for select to authenticated using ((select private.is_approved()));

create table internal.search_cache (
  provider     text not null,
  query        text not null,
  country      char(2) not null,
  results      jsonb not null,
  executed_at  timestamptz not null default now(),
  primary key (provider, query, country)
);
alter table internal.search_cache enable row level security;

-- Job creation ---------------------------------------------------------------------------
-- p_source: 'osm' | 'links' | 'search'. p_countries: ISO codes. p_queries: search phrases.
create or replace function public.create_discovery_job(
  p_workspace_id uuid,
  p_source       text,
  p_countries    text[] default '{}',
  p_queries      text[] default '{}'
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_job_id uuid;
  v_count  int;
  v_title  text;
begin
  if not private.is_workspace_member(p_workspace_id) then
    raise exception 'Not a member of this workspace' using errcode = 'insufficient_privilege';
  end if;
  if p_source not in ('osm', 'links', 'search') then
    raise exception 'Unknown discovery source %', p_source;
  end if;
  if p_source in ('osm', 'search') and coalesce(cardinality(p_countries), 0) = 0 then
    raise exception 'Choose at least one country';
  end if;
  if p_source = 'search' and coalesce(cardinality(p_queries), 0) = 0 then
    raise exception 'Choose at least one search phrase';
  end if;

  v_title := case p_source
    when 'osm' then 'Discover: OpenStreetMap · ' || cardinality(p_countries) || ' countries'
    when 'links' then 'Discover: links on known agency websites'
    else 'Discover: web search · ' || cardinality(p_countries) || ' countries'
  end;

  insert into public.scrape_jobs (workspace_id, kind, title, params, created_by)
  values (
    p_workspace_id, 'discover', v_title,
    jsonb_build_object('source', p_source, 'countries', p_countries, 'queries', p_queries),
    auth.uid()
  )
  returning id into v_job_id;

  if p_source = 'osm' then
    insert into public.scrape_tasks (job_id, workspace_id, kind, payload, dedupe_key)
    select v_job_id, p_workspace_id, 'discover_osm', jsonb_build_object('country', upper(c)),
           'osm:' || upper(c)
    from unnest(p_countries) as c
    on conflict do nothing;
  elsif p_source = 'links' then
    insert into public.scrape_tasks (job_id, workspace_id, kind, agency_id, payload, dedupe_key)
    select v_job_id, a.workspace_id, 'discover_links', a.id,
           jsonb_build_object('url', a.website_url), 'links:' || a.id
    from public.agencies a
    where a.workspace_id = p_workspace_id
      and a.website_url is not null
      and coalesce(a.website_status, 'ok') = 'ok';
  else
    insert into public.scrape_tasks (job_id, workspace_id, kind, payload, dedupe_key)
    select v_job_id, p_workspace_id, 'discover_search',
           jsonb_build_object('query', q, 'country', upper(c)),
           'search:' || upper(c) || ':' || lower(q)
    from unnest(p_countries) as c cross join unnest(p_queries) as q
    on conflict do nothing;
  end if;

  select count(*) into v_count from public.scrape_tasks where job_id = v_job_id;
  update public.scrape_jobs set total_tasks = v_count where id = v_job_id;
  return v_job_id;
end;
$$;

revoke all on function public.create_discovery_job(uuid, text, text[], text[]) from public, anon;
grant execute on function public.create_discovery_job(uuid, text, text[], text[]) to authenticated;

-- Worker helpers (service role only) -------------------------------------------------------
-- Add tasks to a running job (e.g. one qualify task per new candidate).
create or replace function public.add_job_tasks(p_job_id uuid, p_tasks jsonb)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_inserted int;
begin
  insert into public.scrape_tasks (job_id, workspace_id, kind, agency_id, payload, dedupe_key)
  select p_job_id, j.workspace_id, t ->> 'kind', (t ->> 'agency_id')::uuid,
         coalesce(t -> 'payload', '{}'::jsonb), t ->> 'dedupe_key'
  from jsonb_array_elements(p_tasks) as t
  cross join public.scrape_jobs j
  where j.id = p_job_id and j.status in ('queued', 'running')
  on conflict do nothing;
  get diagnostics v_inserted = row_count;

  update public.scrape_jobs
     set total_tasks = (select count(*) from public.scrape_tasks where job_id = p_job_id)
   where id = p_job_id;
  return v_inserted;
end;
$$;

-- Atomically use one search from the monthly budget. Returns false when exhausted.
create or replace function public.reserve_search_quota(p_provider text, p_monthly_limit int)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_month date := date_trunc('month', now())::date;
  v_used  int;
begin
  insert into public.search_usage (provider, month, used)
  values (p_provider, v_month, 0)
  on conflict (provider, month) do nothing;

  update public.search_usage
     set used = used + 1
   where provider = p_provider and month = v_month and used < p_monthly_limit
  returning used into v_used;
  return v_used is not null;
end;
$$;

-- 30-day search result cache (same query + country is never paid for twice).
create or replace function public.get_search_cache(p_provider text, p_query text, p_country text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select results from internal.search_cache
  where provider = p_provider and query = p_query and country = upper(p_country)
    and executed_at > now() - interval '30 days';
$$;

create or replace function public.put_search_cache(
  p_provider text, p_query text, p_country text, p_results jsonb
)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into internal.search_cache (provider, query, country, results)
  values (p_provider, p_query, upper(p_country), p_results)
  on conflict (provider, query, country)
  do update set results = excluded.results, executed_at = now();
$$;

revoke all on function public.add_job_tasks(uuid, jsonb) from public, anon, authenticated;
revoke all on function public.reserve_search_quota(text, int) from public, anon, authenticated;
revoke all on function public.get_search_cache(text, text, text) from public, anon, authenticated;
revoke all on function public.put_search_cache(text, text, text, jsonb) from public, anon, authenticated;
grant execute on function public.add_job_tasks(uuid, jsonb) to service_role;
grant execute on function public.reserve_search_quota(text, int) to service_role;
grant execute on function public.get_search_cache(text, text, text) to service_role;
grant execute on function public.put_search_cache(text, text, text, jsonb) to service_role;

-- Live updates for the discovery results.
alter publication supabase_realtime add table public.discovery_candidates;
