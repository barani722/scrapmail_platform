-- Agency data isolation and scraping queue tests (pgTAP). Rolled back at the end.
begin;

create extension if not exists pgtap with schema extensions;

select plan(8);

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000d1', 'member-a@test.local'),
  ('00000000-0000-0000-0000-0000000000d2', 'member-b@test.local');
update public.profiles set status = 'approved'
 where user_id in ('00000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-0000000000d2');

insert into public.workspaces (id, name, slug) values
  ('00000000-0000-0000-0000-0000000000a0', 'Workspace A', 'ws-a'),
  ('00000000-0000-0000-0000-0000000000b0', 'Workspace B', 'ws-b');
insert into public.workspace_members (workspace_id, user_id) values
  ('00000000-0000-0000-0000-0000000000a0', '00000000-0000-0000-0000-0000000000d1'),
  ('00000000-0000-0000-0000-0000000000b0', '00000000-0000-0000-0000-0000000000d2');

insert into public.agencies (id, workspace_id, name, normalized_name, identity_key, website_url) values
  ('00000000-0000-0000-0000-00000000ac01', '00000000-0000-0000-0000-0000000000a0', 'Alpha Tours', 'alpha tours', 'alphatours.com', 'https://alphatours.com'),
  ('00000000-0000-0000-0000-00000000bc01', '00000000-0000-0000-0000-0000000000b0', 'Beta Travel', 'beta travel', 'betatravel.com', 'https://betatravel.com');

select throws_ok(
  $$ insert into public.agencies (workspace_id, name, normalized_name, identity_key)
     values ('00000000-0000-0000-0000-0000000000a0', 'Alpha Tours Ltd', 'alpha tours ltd', 'alphatours.com') $$,
  '23505', null, 'the same domain cannot be added twice to a workspace'
);

-- Member of workspace A.
set local role authenticated;
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-0000000000d1","role":"authenticated"}';

select is((select count(*)::int from public.agencies), 1, 'member sees only their workspace agencies');
select is((select name from public.agencies limit 1), 'Alpha Tours', 'member sees the right agency');
select throws_ok(
  $$ insert into public.agencies (workspace_id, name, normalized_name, identity_key)
     values ('00000000-0000-0000-0000-0000000000a0', 'X', 'x', 'x.com') $$,
  '42501', null, 'members cannot write agencies directly'
);
select throws_ok(
  $$ select public.create_enrich_job('00000000-0000-0000-0000-0000000000b0', 'all') $$,
  '42501', null, 'members cannot create jobs in other workspaces'
);
select isnt(
  public.create_enrich_job('00000000-0000-0000-0000-0000000000a0', 'all'),
  null,
  'members can create an enrich job in their workspace'
);
select is(
  (select total_tasks from public.scrape_jobs where workspace_id = '00000000-0000-0000-0000-0000000000a0'),
  1,
  'the enrich job has one task per agency website'
);

reset role;
select ok(
  not has_function_privilege('authenticated', 'public.claim_scrape_tasks(text, integer, integer, text[])', 'EXECUTE'),
  'signed-in users cannot claim worker tasks'
);

select * from finish();
rollback;
