-- Workers can skip task kinds they are busy with (e.g. one OpenStreetMap query at a
-- time), so those tasks wait in the queue instead of holding a lease while waiting.

drop function if exists public.claim_scrape_tasks(text, int, int);

create function public.claim_scrape_tasks(
  p_worker         text,
  p_limit          int default 5,
  p_lease_seconds  int default 300,
  p_exclude_kinds  text[] default '{}'
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
      and not (t.kind = any (coalesce(p_exclude_kinds, '{}')))
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

-- Give a claimed task back to the queue untouched (the attempt is not counted).
create function public.release_scrape_task(p_task_id bigint)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.scrape_tasks
     set status = 'queued',
         attempts = greatest(attempts - 1, 0),
         locked_by = null,
         locked_until = null
   where id = p_task_id and status = 'running';
$$;

revoke all on function public.claim_scrape_tasks(text, int, int, text[])
  from public, anon, authenticated;
revoke all on function public.release_scrape_task(bigint) from public, anon, authenticated;
grant execute on function public.claim_scrape_tasks(text, int, int, text[]) to service_role;
grant execute on function public.release_scrape_task(bigint) to service_role;
