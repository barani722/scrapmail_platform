-- Removing unusable contacts (pgTAP). Rolled back at the end.
begin;

create extension if not exists pgtap with schema extensions;

select plan(4);

insert into public.workspaces (id, name, slug) values
  ('00000000-0000-0000-0000-0000000000d1', 'Cleanup', 'cleanup');
insert into public.agencies (id, workspace_id, name, normalized_name, identity_key) values
  ('00000000-0000-0000-0000-0000000000d2', '00000000-0000-0000-0000-0000000000d1',
   'Cleanup Travel', 'cleanup travel', 'cleanup-travel.test');
insert into public.agency_contacts
  (workspace_id, agency_id, email, full_name, source, email_status, email_note)
values
  ('00000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-0000000000d2',
   'info@cleanup-travel.test', null, 'website', 'valid', null),
  ('00000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-0000000000d2',
   '%20info@cleanup-travel.test', 'Ana Lopez', 'website', 'duplicate',
   'same address as info@cleanup-travel.test of this agency'),
  ('00000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-0000000000d2',
   'sales@gone-domain.test', null, 'website', 'invalid', 'domain does not exist'),
  ('00000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-0000000000d2',
   'ops@cleanup-travel.test', null, 'website', 'no_mail_server', 'domain does not accept email');

select ok(
  not has_function_privilege('authenticated', 'public.remove_unusable_contacts()', 'EXECUTE'),
  'signed-in users cannot remove contacts'
);
create temp table tap_expected as
  select array[
    'duplicate:' || count(*) filter (where email_status = 'duplicate'),
    'invalid:' || count(*) filter (where email_status = 'invalid')
  ] as kinds
  from public.agency_contacts;
select is(
  (select array_agg(kind || ':' || removed order by kind) from public.remove_unusable_contacts()),
  (select kinds from tap_expected),
  'every duplicate (with a clean twin) and every invalid contact is removed'
);
select is(
  (select array_agg(email order by email) from public.agency_contacts
    where agency_id = '00000000-0000-0000-0000-0000000000d2'),
  array['info@cleanup-travel.test', 'ops@cleanup-travel.test'],
  'the clean address and the not-invalid one stay'
);
select is(
  (select full_name from public.agency_contacts where email = 'info@cleanup-travel.test'),
  'Ana Lopez',
  'details of the duplicate are copied to its clean twin'
);

select * from finish();
rollback;
