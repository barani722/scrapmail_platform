-- The dashboard's four numbers in one call (was four separate count requests).
-- Security invoker: RLS applies, so pending approvals count only for admins
-- (other users see only their own profile, which is approved).
create function public.dashboard_counts(p_workspace_id uuid)
returns table (agencies bigint, contacts bigint, active_jobs bigint, pending_users bigint)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    (select count(*) from public.agencies a where a.workspace_id = p_workspace_id),
    (select count(*) from public.agency_contacts c
      where c.workspace_id = p_workspace_id
        and (c.email_status is null or c.email_status = 'valid')),
    (select count(*) from public.scrape_jobs j
      where j.workspace_id = p_workspace_id and j.status in ('queued', 'running')),
    (select count(*) from public.profiles p where p.status = 'pending');
$$;

revoke all on function public.dashboard_counts(uuid) from public, anon;
grant execute on function public.dashboard_counts(uuid) to authenticated;
