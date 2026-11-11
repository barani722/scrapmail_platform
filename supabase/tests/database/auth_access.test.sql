-- Authentication / approval access tests (pgTAP). Rolled back at the end.
begin;

create extension if not exists pgtap with schema extensions;

select plan(9);

-- Test users (the sign-up trigger creates pending profiles).
insert into auth.users (id, email, raw_user_meta_data)
values
  ('00000000-0000-0000-0000-0000000000a1', 'admin@test.local', '{"full_name":"Admin"}'),
  ('00000000-0000-0000-0000-0000000000b1', 'pending@test.local', '{"full_name":"Pending"}'),
  ('00000000-0000-0000-0000-0000000000c1', 'member@test.local', '{"full_name":"Member"}');

select is(
  (select status::text from public.profiles where user_id = '00000000-0000-0000-0000-0000000000b1'),
  'pending',
  'new sign-ups start as pending'
);

insert into public.workspaces (id, name, slug)
values ('00000000-0000-0000-0000-00000000aaaa', 'Test WS', 'test-ws');

update public.profiles set status = 'approved', platform_role = 'admin'
 where user_id = '00000000-0000-0000-0000-0000000000a1';
update public.profiles set status = 'approved'
 where user_id = '00000000-0000-0000-0000-0000000000c1';
insert into public.workspace_members (workspace_id, user_id, role)
values ('00000000-0000-0000-0000-00000000aaaa', '00000000-0000-0000-0000-0000000000c1', 'member');

-- Act as a pending user.
set local role authenticated;
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-0000000000b1","role":"authenticated"}';

select is((select count(*)::int from public.workspaces), 0, 'pending user sees no workspaces');
select is((select count(*)::int from public.profiles), 1, 'pending user sees only their own profile');
select throws_ok(
  $$ update public.profiles set status = 'approved' $$,
  '42501', null, 'users cannot change their own status'
);
select throws_ok(
  $$ select public.admin_review_account('00000000-0000-0000-0000-0000000000b1', 'approved') $$,
  '42501', null, 'non-admins cannot approve accounts'
);

-- Act as an approved member.
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-0000000000c1","role":"authenticated"}';
select is((select count(*)::int from public.workspaces), 1, 'approved member sees their workspace');

-- Admin suspends the member: access disappears immediately.
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}';
select lives_ok(
  $$ select public.admin_review_account('00000000-0000-0000-0000-0000000000c1', 'suspended') $$,
  'admin can suspend an account'
);
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-0000000000c1","role":"authenticated"}';
select is((select count(*)::int from public.workspaces), 0, 'suspended member immediately loses access');

-- Logged-out users cannot call the admin function.
reset role;
select ok(
  not has_function_privilege('anon',
    'public.admin_review_account(uuid, public.account_status, uuid, public.workspace_role, text)',
    'EXECUTE'),
  'anon cannot execute admin_review_account'
);

select * from finish();
rollback;
