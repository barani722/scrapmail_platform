-- Task completion counters, added tasks and released tasks (pgTAP). Rolled back.
begin;

create extension if not exists pgtap with schema extensions;

select plan(6);

insert into public.workspaces (id, name, slug) values
  ('00000000-0000-0000-0000-0000000000c1', 'Completion', 'completion');
insert into public.scrape_jobs (id, workspace_id, kind, title, status, total_tasks) values
  ('00000000-0000-0000-0000-0000000000c2', '00000000-0000-0000-0000-0000000000c1',
   'discover', 'Completion test', 'running', 2);
insert into public.scrape_tasks
  (job_id, workspace_id, kind, payload, status, attempts, max_attempts, locked_by, dedupe_key)
values
  ('00000000-0000-0000-0000-0000000000c2', '00000000-0000-0000-0000-0000000000c1',
   'qualify_candidate', '{}', 'running', 1, 3, 'tap-w1', 'a'),
  ('00000000-0000-0000-0000-0000000000c2', '00000000-0000-0000-0000-0000000000c1',
   'qualify_candidate', '{}', 'running', 3, 3, 'tap-w1', 'b');

create temp table tap_task as
  select dedupe_key, id from public.scrape_tasks
  where job_id = '00000000-0000-0000-0000-0000000000c2';

select public.complete_scrape_task((select id from tap_task where dedupe_key = 'a'), true);
select is(
  (select done_tasks from public.scrape_jobs where id = '00000000-0000-0000-0000-0000000000c2'),
  1,
  'a finished task adds one to the done count'
);

select is(
  public.add_job_tasks('00000000-0000-0000-0000-0000000000c2',
    '[{"kind": "qualify_candidate", "dedupe_key": "c"},
      {"kind": "qualify_candidate", "dedupe_key": "a"}]'),
  1,
  'tasks already in the job are not added again'
);
select is(
  (select total_tasks from public.scrape_jobs where id = '00000000-0000-0000-0000-0000000000c2'),
  3,
  'the total grows by the added tasks'
);

select is(
  public.release_worker_tasks('tap-w1'),
  1,
  'a stopped worker gives its unfinished tasks back'
);

update public.scrape_tasks set status = 'running', attempts = 3
 where id = (select id from tap_task where dedupe_key = 'b');
select public.complete_scrape_task((select id from tap_task where dedupe_key = 'b'), false, null, 'x');
select is(
  (select failed_tasks from public.scrape_jobs where id = '00000000-0000-0000-0000-0000000000c2'),
  1,
  'a task out of attempts adds one to the failed count'
);

update public.scrape_tasks set status = 'running'
 where job_id = '00000000-0000-0000-0000-0000000000c2' and dedupe_key = 'c';
select public.complete_scrape_task(
  (select id from public.scrape_tasks
    where job_id = '00000000-0000-0000-0000-0000000000c2' and dedupe_key = 'c'),
  true
);
select is(
  (select done_tasks || ':' || failed_tasks || ':' || status
     from public.scrape_jobs where id = '00000000-0000-0000-0000-0000000000c2'),
  '2:1:completed',
  'the job completes when its last task finishes'
);

select * from finish();
rollback;
