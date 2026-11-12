-- Results per discovery job: accepted (new agencies), rejected, still pending.
-- SECURITY INVOKER: RLS on discovery_candidates applies.
create or replace function public.discovery_job_stats(p_job_ids uuid[])
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
  where c.job_id = any (p_job_ids)
  group by c.job_id;
$$;

revoke all on function public.discovery_job_stats(uuid[]) from public, anon;
grant execute on function public.discovery_job_stats(uuid[]) to authenticated;
