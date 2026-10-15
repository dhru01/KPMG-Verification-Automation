-- Atomic shared workspace (recommended on Vercel). Run in Supabase SQL editor if template upload says "run not found".

create table if not exists public.workspace_snapshots (
  id text primary key default 'default',
  payload jsonb not null default '{}'::jsonb,
  version bigint not null default 0,
  updated_at timestamptz not null default now()
);

alter table public.workspace_snapshots disable row level security;

grant usage on schema public to service_role;
grant select, insert, update, delete on table public.workspace_snapshots to service_role;
grant all on table public.workspace_snapshots to postgres;

insert into public.workspace_snapshots (id, payload, version)
values (
  'default',
  '{"runs":[],"auditLogs":[],"notifications":[],"settings":{"tolerance":{"mode":"exact","approvalStatus":"pilot_default","label":"Exact match (pilot default)"},"opcoRegions":{"ayoba":"South Africa"}}}'::jsonb,
  0
)
on conflict (id) do nothing;
