-- Live worker health for the Scraping Jobs page: each worker reports every 30 s
-- (speed, tasks at once, main-thread lag, restarts by the supervisor).
create table public.worker_status (
  worker_id           text primary key,
  host                text,
  state               text not null default 'running' check (state in ('running', 'stopped')),
  started_at          timestamptz,
  updated_at          timestamptz not null default now(),
  concurrency         int,
  running             int,
  tasks_per_minute    int,
  loop_lag_ms         int,
  oldest_task_seconds int,
  restarts            int not null default 0
);

create index worker_status_updated_idx on public.worker_status (updated_at desc);

alter table public.worker_status enable row level security;

-- Approved users can see worker health (no workspace data in it). Only the worker
-- (service role) writes.
create policy "worker_status: approved users" on public.worker_status
  for select to authenticated using ((select private.is_approved()));

revoke all on public.worker_status from anon, authenticated;
grant select on public.worker_status to authenticated;
