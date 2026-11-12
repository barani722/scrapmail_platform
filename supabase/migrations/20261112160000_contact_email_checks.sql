-- Email quality: cleaned addresses and a status per contact. Nothing is deleted:
-- the address as scraped is kept in email_original whenever it was changed, and
-- addresses that cannot be used stay in the table with a status and a note.

-- Full copy of the contacts before the first cleanup (service role only).
create table if not exists internal.agency_contacts_backup_20261112 as
  table public.agency_contacts;
alter table internal.agency_contacts_backup_20261112 enable row level security;
revoke all on internal.agency_contacts_backup_20261112 from public, anon, authenticated;

alter table public.agency_contacts
  add column email_original   text,
  add column email_status     text check (
    email_status in ('valid', 'unverified', 'no_mail_server', 'invalid', 'duplicate')
  ),
  add column email_note       text,
  add column email_checked_at timestamptz;

comment on column public.agency_contacts.email_original is
  'The address exactly as scraped, when the cleanup changed it.';
comment on column public.agency_contacts.email_status is
  'valid: domain accepts mail. unverified: DNS did not answer. no_mail_server: domain takes no mail. invalid: not a usable address (kept). duplicate: same address as another contact of the agency (kept). Null: not checked yet.';

create index agency_contacts_status_idx
  on public.agency_contacts (workspace_id, email_status);

-- Apply check results in batches (worker / cleanup script, service role only).
-- p_rows: [{id, email?, email_original?, status, note}]; email is only changed when given.
create function public.apply_email_checks(p_rows jsonb)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count int;
begin
  update public.agency_contacts c
     set email            = coalesce(r.email, c.email),
         email_original   = coalesce(c.email_original, r.email_original),
         email_status     = r.status,
         email_note       = r.note,
         email_checked_at = now()
    from jsonb_to_recordset(p_rows)
         as r(id uuid, email text, email_original text, status text, note text)
   where c.id = r.id;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function public.apply_email_checks(jsonb) from public, anon, authenticated;
grant execute on function public.apply_email_checks(jsonb) to service_role;
