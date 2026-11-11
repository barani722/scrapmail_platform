-- When an administrator last set the user's password (shown in User management).
-- Passwords themselves are never stored readable: Supabase Auth keeps only a hash.
alter table public.profiles
  add column if not exists password_changed_at timestamptz;

comment on column public.profiles.password_changed_at is
  'Last time an administrator set this user''s password.';
