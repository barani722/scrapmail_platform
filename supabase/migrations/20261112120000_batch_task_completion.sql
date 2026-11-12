-- Scraper speed: the worker reports finished tasks in batches. One call and one
-- job-counter update per batch, instead of per task (the job row was the hot spot).

create function public.complete_scrape_tasks(p_results jsonb)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  r         jsonb;
  v_task    public.scrape_tasks;
  v_success boolean;
  v_jobs    uuid[] := '{}';
  v_ok      boolean[] := '{}';
begin
  for r in select value from jsonb_array_elements(p_results) loop
    select * into v_task from public.scrape_tasks where id = (r ->> 'id')::bigint for update;
    continue when not found or v_task.status <> 'running';
    v_success := coalesce((r ->> 'success')::boolean, false);

    if v_success then
      update public.scrape_tasks
         set status = 'done', result = nullif(r -> 'result', 'null'::jsonb), last_error = null,
             locked_by = null, locked_until = null, finished_at = now()
       where id = v_task.id;
    elsif v_task.attempts < v_task.max_attempts then
      update public.scrape_tasks
         set status = 'queued', last_error = left(r ->> 'error', 2000),
             locked_by = null, locked_until = null,
             run_after = now() + make_interval(secs => 30 * power(2, v_task.attempts)::int)
       where id = v_task.id;
      continue;
    else
      update public.scrape_tasks
         set status = 'failed', last_error = left(r ->> 'error', 2000),
             result = nullif(r -> 'result', 'null'::jsonb),
             locked_by = null, locked_until = null, finished_at = now()
       where id = v_task.id;
    end if;
    v_jobs := v_jobs || v_task.job_id;
    v_ok := v_ok || v_success;
  end loop;

  update public.scrape_jobs j
     set done_tasks = j.done_tasks + s.done,
         failed_tasks = j.failed_tasks + s.failed
    from (
      select job_id, count(*) filter (where ok) as done, count(*) filter (where not ok) as failed
      from unnest(v_jobs, v_ok) as u(job_id, ok)
      group by job_id
    ) s
   where j.id = s.job_id;

  -- Jobs whose last open task just finished are complete.
  update public.scrape_jobs j
     set status = 'completed', finished_at = now()
   where j.id = any (v_jobs)
     and j.status = 'running'
     and not exists (
       select 1 from public.scrape_tasks t
       where t.job_id = j.id and t.status in ('queued', 'running')
     );

  return cardinality(v_jobs);
end;
$$;

revoke all on function public.complete_scrape_tasks(jsonb) from public, anon, authenticated;
grant execute on function public.complete_scrape_tasks(jsonb) to service_role;

-- No page listens to Realtime any more (account changes are polled too). Without
-- listeners Realtime stops reading the database change log.
alter publication supabase_realtime drop table public.profiles;
