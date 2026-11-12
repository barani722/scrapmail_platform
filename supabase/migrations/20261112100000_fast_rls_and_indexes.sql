-- Page speed: workspace policies were evaluated once per row, because the
-- membership check took the row's workspace_id as an argument. Look up the
-- signed-in user's workspaces once per query instead (same rule: approved
-- members only), and add the indexes the pages sort and filter by.

-- Workspaces of the signed-in, approved user (evaluated once per query).
create or replace function private.my_workspace_ids()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select m.workspace_id
  from public.workspace_members m
  join public.profiles p on p.user_id = m.user_id
  where m.user_id = (select auth.uid())
    and p.status = 'approved';
$$;

revoke all on function private.my_workspace_ids() from public;
grant execute on function private.my_workspace_ids() to authenticated;

drop policy "agencies: workspace members" on public.agencies;
create policy "agencies: workspace members" on public.agencies
  for select to authenticated using (workspace_id in (select private.my_workspace_ids()));

drop policy "agency_contacts: workspace members" on public.agency_contacts;
create policy "agency_contacts: workspace members" on public.agency_contacts
  for select to authenticated using (workspace_id in (select private.my_workspace_ids()));

drop policy "agency_sources: workspace members" on public.agency_sources;
create policy "agency_sources: workspace members" on public.agency_sources
  for select to authenticated using (workspace_id in (select private.my_workspace_ids()));

drop policy "scrape_jobs: workspace members" on public.scrape_jobs;
create policy "scrape_jobs: workspace members" on public.scrape_jobs
  for select to authenticated using (workspace_id in (select private.my_workspace_ids()));

drop policy "scrape_tasks: workspace members" on public.scrape_tasks;
create policy "scrape_tasks: workspace members" on public.scrape_tasks
  for select to authenticated using (workspace_id in (select private.my_workspace_ids()));

drop policy "discovery_candidates: workspace members" on public.discovery_candidates;
create policy "discovery_candidates: workspace members" on public.discovery_candidates
  for select to authenticated using (workspace_id in (select private.my_workspace_ids()));

-- Live updates: the scraper writes thousands of agency, contact and candidate rows;
-- streaming each one through Realtime (with an RLS check per change) overloaded the
-- database. Pages now follow job progress (scrape_jobs) instead.
alter publication supabase_realtime
  drop table public.agencies, public.agency_contacts, public.discovery_candidates;

-- Indexes for the default sorts and lookups of the pages.
create index if not exists agencies_workspace_name_idx
  on public.agencies (workspace_id, name, id);
create index if not exists agency_contacts_workspace_email_sort_idx
  on public.agency_contacts (workspace_id, email, id);
create index if not exists scrape_tasks_search_country_idx
  on public.scrape_tasks (workspace_id, (payload ->> 'country'))
  where kind = 'discover_search';

-- Agencies per country for the country filter. (The earlier migration file for
-- this function was empty, so the filter never showed counts.)
-- SECURITY INVOKER: RLS on agencies applies.
create or replace function public.agency_country_counts(p_workspace_id uuid)
returns table (country_code text, total bigint)
language sql
stable
security invoker
set search_path = ''
as $$
  select a.country_code, count(*)
  from public.agencies a
  where a.workspace_id = p_workspace_id
  group by a.country_code;
$$;

revoke all on function public.agency_country_counts(uuid) from public, anon;
grant execute on function public.agency_country_counts(uuid) to authenticated;

-- Same result as before; the searched countries are read once (index) instead of
-- once per country.
create or replace function public.search_country_ranking(p_workspace_id uuid)
returns table (country_code text, agencies bigint, searched boolean)
language sql
stable
security invoker
set search_path = ''
as $$
  with searched as (
    select distinct t.payload ->> 'country' as country_code
    from public.scrape_tasks t
    where t.workspace_id = p_workspace_id
      and t.kind = 'discover_search'
  )
  select a.country_code,
         count(*),
         bool_or(s.country_code is not null)
  from public.agencies a
  left join searched s on s.country_code = a.country_code
  where a.workspace_id = p_workspace_id
    and a.country_code ~ '^[A-Z]{2}$'
  group by a.country_code
  order by count(*) desc, a.country_code;
$$;
