-- Shared pilot on Supabase: private bucket for uploads + workspace JSON (_workspace/database.json).
-- Run this in Supabase → SQL. The app uses Storage (service role), not the optional table below.

insert into storage.buckets (id, name, public)
values ('ghg-hub-uploads', 'ghg-hub-uploads', false)
on conflict (id) do nothing;

-- Optional legacy table (not used by current app builds). Safe to skip.
create table if not exists public.workspace_snapshots (
  id text primary key default 'default',
  payload jsonb not null default '{}'::jsonb,
  version bigint not null default 0,
  updated_at timestamptz not null default now()
);

grant all on table public.workspace_snapshots to postgres, service_role;
