-- Candidate counts of the workspace's latest discovery jobs in one call, so the
-- Scraping Jobs page loads them together with its other data (no second round trip).
create function public.recent_discovery_job_stats(p_workspace_id uuid)
returns table (job_id uuid, accepted bigint, rejected bigint, pending bigint)
language sql
stable
security invoker
set search_path = ''
as $$
  select c.job_id,
         count(*) filter (where c.status = 'accepted'),
         count(*) filter (where c.status = 'rejected'),
         count(*) filter (where c.status = 'pending')
  from public.discovery_candidates c
  where c.job_id in (
    select j.id
    from public.scrape_jobs j
    where j.workspace_id = p_workspace_id
      and j.kind = 'discover'
    order by j.created_at desc
    limit 50
  )
  group by c.job_id;
$$;

revoke all on function public.recent_discovery_job_stats(uuid) from public, anon;
grant execute on function public.recent_discovery_job_stats(uuid) to authenticated;
