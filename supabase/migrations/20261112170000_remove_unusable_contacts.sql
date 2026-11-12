-- The one-time backup of the contacts is no longer needed.
drop table if exists internal.agency_contacts_backup_20261112;

-- Remove contacts that cannot be used (service role only; run on request with
-- `pnpm emails:check -- --remove`). Every deleted row is recorded in the audit log.
--   duplicate: the clean form of the address is a valid contact of the same
--              agency; its name, title and phone are copied there first.
--   invalid:   no email address, sample address, or the domain does not exist.
create function public.remove_unusable_contacts()
returns table (kind text, removed int)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_duplicates int;
  v_invalid int;
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

  -- Only duplicates whose clean twin exists are removed.
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

  return query values ('duplicate', v_duplicates), ('invalid', v_invalid);
end;
$$;

revoke all on function public.remove_unusable_contacts() from public, anon, authenticated;
grant execute on function public.remove_unusable_contacts() to service_role;
