-- Shared pilot workspace (single JSON document). Used when SUPABASE_SERVICE_ROLE_KEY is set on the server.
-- Run this in the Supabase SQL editor if you have not applied migrations yet.

create table if not exists public.workspace_snapshots (
  id text primary key default 'default',
  payload jsonb not null default '{}'::jsonb,
  version bigint not null default 0,
  updated_at timestamptz not null default now()
);

insert into public.workspace_snapshots (id, payload, version)
values ('default', '{}'::jsonb, 0)
on conflict (id) do nothing;

insert into storage.buckets (id, name, public)
values ('ghg-hub-uploads', 'ghg-hub-uploads', false)
on conflict (id) do nothing;
