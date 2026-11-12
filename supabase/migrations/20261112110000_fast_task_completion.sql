-- Scraper speed: every finished task recounted all tasks of its job while holding
-- the job row lock. With many tasks finishing at once they queued on that lock,
-- holding API connections that pages also need, and each recount grew with the job.
-- Counters are now incremented instead (the lock is held for microseconds).

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

  update public.scrape_jobs
     set done_tasks   = done_tasks + case when p_success then 1 else 0 end,
         failed_tasks = failed_tasks + case when p_success then 0 else 1 end
   where id = v_task.job_id;

  -- Last open task finished: the job is complete (index lookup, not a count).
  if not exists (
    select 1 from public.scrape_tasks
    where job_id = v_task.job_id and status in ('queued', 'running')
  ) then
    update public.scrape_jobs
       set status = 'completed', finished_at = now()
     where id = v_task.job_id and status = 'running';
  end if;
end;
$$;

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

  if v_inserted > 0 then
    update public.scrape_jobs
       set total_tasks = total_tasks + v_inserted
     where id = p_job_id;
  end if;
  return v_inserted;
end;
$$;

-- Make the counters exact once (from now on they are kept up to date).
update public.scrape_jobs j
   set total_tasks  = s.total,
       done_tasks   = s.done,
       failed_tasks = s.failed
  from (
    select job_id,
           count(*) as total,
           count(*) filter (where status = 'done')   as done,
           count(*) filter (where status = 'failed') as failed
    from public.scrape_tasks
    group by job_id
  ) s
 where s.job_id = j.id;

-- Job progress changes with every finished task: streaming each change through
-- Realtime cost the database more than the pages need. Pages poll job progress.
alter publication supabase_realtime drop table public.scrape_jobs;

-- A stopped worker gives its tasks back at once, instead of them waiting for the
-- lease to expire (up to 10 minutes) after every restart.
create function public.release_worker_tasks(p_worker text)
returns int
language sql
security definer
set search_path = ''
as $$
  with released as (
    update public.scrape_tasks
       set status = 'queued',
           attempts = greatest(attempts - 1, 0),
           locked_by = null,
           locked_until = null
     where status = 'running' and locked_by = p_worker
    returning 1
  )
  select count(*)::int from released;
$$;

revoke all on function public.release_worker_tasks(text) from public, anon, authenticated;
grant execute on function public.release_worker_tasks(text) to service_role;
