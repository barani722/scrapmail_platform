-- Countries ranked for Google search: most agencies first, with whether a web
-- search was already queued there. Used by "Use remaining searches".
-- SECURITY INVOKER: RLS on agencies and scrape_tasks applies.
create or replace function public.search_country_ranking(p_workspace_id uuid)
returns table (country_code text, agencies bigint, searched boolean)
language sql
stable
security invoker
set search_path = ''
as $$
  select a.country_code,
         count(*),
         exists (
           select 1 from public.scrape_tasks t
           where t.workspace_id = p_workspace_id
             and t.kind = 'discover_search'
             and t.payload ->> 'country' = a.country_code
         )
  from public.agencies a
  where a.workspace_id = p_workspace_id
    and a.country_code ~ '^[A-Z]{2}$'
  group by a.country_code
  order by count(*) desc, a.country_code;
$$;

revoke all on function public.search_country_ranking(uuid) from public, anon;
grant execute on function public.search_country_ranking(uuid) to authenticated;
