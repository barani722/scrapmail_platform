-- Page summary functions: recent discovery job stats and dashboard counts
-- (pgTAP). Rolled back at the end.
begin;

create extension if not exists pgtap with schema extensions;

select plan(6);

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000a7', 'stats-a@test.local'),
  ('00000000-0000-0000-0000-0000000000a8', 'stats-b@test.local');
update public.profiles set status = 'approved'
 where user_id in ('00000000-0000-0000-0000-0000000000a7', '00000000-0000-0000-0000-0000000000a8');
insert into public.workspaces (id, name, slug) values
  ('00000000-0000-0000-0000-0000000000b7', 'Stats A', 'stats-a'),
  ('00000000-0000-0000-0000-0000000000b8', 'Stats B', 'stats-b');
insert into public.workspace_members (workspace_id, user_id) values
  ('00000000-0000-0000-0000-0000000000b7', '00000000-0000-0000-0000-0000000000a7'),
  ('00000000-0000-0000-0000-0000000000b8', '00000000-0000-0000-0000-0000000000a8');
insert into public.scrape_jobs (id, workspace_id, kind, title) values
  ('00000000-0000-0000-0000-0000000000c7', '00000000-0000-0000-0000-0000000000b7', 'discover', 'Stats A job'),
  ('00000000-0000-0000-0000-0000000000c8', '00000000-0000-0000-0000-0000000000b8', 'discover', 'Stats B job');
insert into public.discovery_candidates (workspace_id, job_id, identity_key, url, source, status) values
  ('00000000-0000-0000-0000-0000000000b7', '00000000-0000-0000-0000-0000000000c7', 'stats-1.com', 'https://stats-1.com', 'osm', 'accepted'),
  ('00000000-0000-0000-0000-0000000000b7', '00000000-0000-0000-0000-0000000000c7', 'stats-2.com', 'https://stats-2.com', 'osm', 'rejected'),
  ('00000000-0000-0000-0000-0000000000b7', '00000000-0000-0000-0000-0000000000c7', 'stats-3.com', 'https://stats-3.com', 'osm', 'pending'),
  ('00000000-0000-0000-0000-0000000000b8', '00000000-0000-0000-0000-0000000000c8', 'stats-4.com', 'https://stats-4.com', 'osm', 'accepted');
insert into public.agencies (workspace_id, name, normalized_name, identity_key) values
  ('00000000-0000-0000-0000-0000000000b7', 'Stats Agency', 'stats agency', 'stats-agency.com');

set local role authenticated;
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-0000000000a7","role":"authenticated"}';

select results_eq(
  $$ select job_id, accepted, rejected, pending
       from public.recent_discovery_job_stats('00000000-0000-0000-0000-0000000000b7') $$,
  $$ values ('00000000-0000-0000-0000-0000000000c7'::uuid, 1::bigint, 1::bigint, 1::bigint) $$,
  'counts candidates of the workspace''s discovery jobs'
);
select is_empty(
  $$ select * from public.recent_discovery_job_stats('00000000-0000-0000-0000-0000000000b8') $$,
  'other workspaces'' jobs stay invisible'
);

select results_eq(
  $$ select agencies, active_jobs, pending_users
       from public.dashboard_counts('00000000-0000-0000-0000-0000000000b7') $$,
  $$ values (1::bigint, 1::bigint, 0::bigint) $$,
  'dashboard counts the workspace''s agencies and active jobs; non-admins see no pending users'
);
select results_eq(
  $$ select agencies, active_jobs
       from public.dashboard_counts('00000000-0000-0000-0000-0000000000b8') $$,
  $$ values (0::bigint, 0::bigint) $$,
  'other workspaces count as empty'
);

reset role;
select ok(
  not has_function_privilege('anon', 'public.recent_discovery_job_stats(uuid)', 'EXECUTE'),
  'signed-out visitors cannot call the job stats'
);
select ok(
  not has_function_privilege('anon', 'public.dashboard_counts(uuid)', 'EXECUTE'),
  'signed-out visitors cannot call the dashboard counts'
);

select * from finish();
rollback;
