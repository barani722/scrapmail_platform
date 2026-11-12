-- "Remove unusable contacts" keeps only valid addresses: besides invalid ones and
-- duplicates it now also removes addresses whose domain takes no email
-- (no_mail_server) and whose domain does not answer in DNS (unverified).
create or replace function public.remove_unusable_contacts()
returns table (kind text, removed int)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_duplicates int;
  v_invalid int;
  v_no_mail int;
  v_unverified int;
begin
  with d as (
    select d.full_name, d.job_title, d.phone, c.id as twin
    from public.agency_contacts d
    join public.agency_contacts c
      on c.agency_id = d.agency_id
     and c.email_normalized =
         lower(substring(d.email_note from 'same address as (\S+) of this agency'))
     and c.id <> d.id
    where d.email_status = 'duplicate'
  )
  update public.agency_contacts c
     set full_name = coalesce(c.full_name, d.full_name),
         job_title = coalesce(c.job_title, d.job_title),
         phone     = coalesce(c.phone, d.phone)
    from d
   where c.id = d.twin;

  delete from public.agency_contacts d
   where d.email_status = 'duplicate'
     and exists (
       select 1 from public.agency_contacts c
       where c.agency_id = d.agency_id
         and c.id <> d.id
         and c.email_normalized =
             lower(substring(d.email_note from 'same address as (\S+) of this agency'))
     );
  get diagnostics v_duplicates = row_count;

  delete from public.agency_contacts where email_status = 'invalid';
  get diagnostics v_invalid = row_count;

  delete from public.agency_contacts where email_status = 'no_mail_server';
  get diagnostics v_no_mail = row_count;

  delete from public.agency_contacts where email_status = 'unverified';
  get diagnostics v_unverified = row_count;

  return query values
    ('duplicate', v_duplicates),
    ('invalid', v_invalid),
    ('no_mail_server', v_no_mail),
    ('unverified', v_unverified);
end;
$$;
