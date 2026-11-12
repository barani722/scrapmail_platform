-- Discovery jobs, candidates and search budget (pgTAP). Rolled back at the end.
begin;

create extension if not exists pgtap with schema extensions;

select plan(11);

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000e1', 'disc-a@test.local'),
  ('00000000-0000-0000-0000-0000000000e2', 'disc-b@test.local');
update public.profiles set status = 'approved'
 where user_id in ('00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-0000000000e2');
insert into public.workspaces (id, name, slug) values
  ('00000000-0000-0000-0000-0000000000f1', 'Disc A', 'disc-a'),
  ('00000000-0000-0000-0000-0000000000f2', 'Disc B', 'disc-b');
insert into public.workspace_members (workspace_id, user_id) values
  ('00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-0000000000e1'),
  ('00000000-0000-0000-0000-0000000000f2', '00000000-0000-0000-0000-0000000000e2');
insert into public.discovery_candidates (workspace_id, identity_key, url, source) values
  ('00000000-0000-0000-0000-0000000000f2', 'other-ws.com', 'https://other-ws.com', 'osm');

set local role authenticated;
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-0000000000e1","role":"authenticated"}';

select isnt(
  public.create_discovery_job('00000000-0000-0000-0000-0000000000f1', 'osm', array['GB', 'FR', 'gb']),
  null,
  'members can start an OpenStreetMap discovery job'
);
select is(
  (select total_tasks from public.scrape_jobs where workspace_id = '00000000-0000-0000-0000-0000000000f1'),
  2,
  'one task per country, duplicates removed'
);
select throws_ok(
  $$ select public.create_discovery_job('00000000-0000-0000-0000-0000000000f2', 'osm', array['GB']) $$,
  '42501', null, 'members cannot start jobs in other workspaces'
);
select is(
  (select count(*)::int from public.discovery_candidates),
  0,
  'candidates of other workspaces are invisible'
);

reset role;
select ok(
  not has_function_privilege('authenticated', 'public.reserve_search_quota(text, integer)', 'EXECUTE'),
  'signed-in users cannot use the search budget directly'
);

select is(
  (select array_agg(public.reserve_search_quota('test-provider', 2)) from generate_series(1, 3)),
  array[true, true, false],
  'the monthly search budget stops at its limit'
);

select throws_ok(
  $$ insert into public.discovery_candidates (workspace_id, identity_key, url, source)
     values ('00000000-0000-0000-0000-0000000000f2', 'other-ws.com', 'https://www.other-ws.com', 'link') $$,
  '23505', null, 'a website is a candidate only once per workspace'
);

-- Workers can skip a busy task kind and give a claimed task back.
select ok(
  not has_function_privilege('authenticated', 'public.release_scrape_task(bigint)', 'EXECUTE'),
  'signed-in users cannot release tasks'
);
create temp table tap_claimed as
  select * from public.claim_scrape_tasks('tap-worker', 100000, 60, array['discover_osm']);
select is(
  (select count(*)::int from tap_claimed where kind = 'discover_osm'),
  0,
  'excluded task kinds are not claimed'
);
create temp table tap_claimed_all as
  select * from public.claim_scrape_tasks('tap-worker', 100000, 60);
select lives_ok(
  $$ select public.release_scrape_task((select min(id) from tap_claimed_all
       where workspace_id = '00000000-0000-0000-0000-0000000000f1')) $$,
  'a claimed task can be released'
);
select is(
  (select array_agg(status::text || ':' || attempts order by id) from public.scrape_tasks
    where workspace_id = '00000000-0000-0000-0000-0000000000f1'),
  array['queued:0', 'running:1'],
  'a released task is queued again without using an attempt'
);

select * from finish();
rollback;
