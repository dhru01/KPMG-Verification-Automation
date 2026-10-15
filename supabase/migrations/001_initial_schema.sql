-- GHG Verification Hub
-- Apply this in the approved Supabase project before pointing the app at it.
-- The pilot build stores working papers locally until that connection is enabled.
-- Service-role credentials must stay on the server.

create extension if not exists pgcrypto;

create table if not exists profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null unique,
  name text not null,
  role text not null check (role in ('administrator', 'consultant', 'reviewer')),
  created_at timestamptz not null default now()
);

create or replace function app_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select role from profiles where id = auth.uid();
$$;

create table if not exists opcos (
  id text primary key,
  name text not null,
  region text,
  active boolean not null default true,
  methodology_id text not null
);

create table if not exists methodologies (
  id text primary key,
  name text not null,
  version text not null,
  configuration jsonb not null,
  approval_status text not null check (approval_status in ('pilot_not_approved', 'draft', 'approved'))
);

create table if not exists verification_runs (
  id uuid primary key default gen_random_uuid(),
  opco_id text not null references opcos (id),
  reporting_month text not null,
  reporting_year integer not null,
  methodology_version text not null,
  status text not null,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  created_by uuid references profiles (id)
);

create table if not exists consumption_records (
  id uuid primary key default gen_random_uuid(),
  verification_run_id uuid not null references verification_runs (id) on delete cascade,
  facility text not null,
  scope text not null,
  category text not null,
  consumption_type text not null,
  reported_value numeric,
  unit text,
  source_file_id text,
  source_reference text
);

create table if not exists evidence_documents (
  id uuid primary key default gen_random_uuid(),
  verification_run_id uuid not null references verification_runs (id) on delete cascade,
  filename text not null,
  file_type text not null,
  storage_path text not null,
  processing_status text not null
);

create table if not exists evidence_records (
  id uuid primary key default gen_random_uuid(),
  evidence_document_id uuid not null references evidence_documents (id) on delete cascade,
  facility text,
  consumption_type text,
  extracted_value numeric,
  unit text,
  reporting_period text,
  source_reference text,
  confidence numeric,
  extraction_reliable boolean not null default false
);

create table if not exists verification_results (
  id uuid primary key default gen_random_uuid(),
  consumption_record_id uuid not null references consumption_records (id) on delete cascade,
  rule_id text not null,
  reported_value numeric,
  evidence_value numeric,
  difference numeric,
  percentage_difference numeric,
  automated_status text not null,
  reviewer_status text,
  reviewer_comment text,
  explanation text not null,
  reviewed_by uuid references profiles (id),
  reviewed_at timestamptz,
  calculation jsonb
);

create table if not exists audit_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references profiles (id),
  action text not null,
  entity_type text not null,
  entity_id text not null,
  timestamp timestamptz not null default now(),
  change_details jsonb not null default '{}'::jsonb
);

create index if not exists verification_runs_period_idx on verification_runs (opco_id, reporting_year, reporting_month);
create index if not exists consumption_records_run_idx on consumption_records (verification_run_id);
create index if not exists evidence_documents_run_idx on evidence_documents (verification_run_id);
create index if not exists evidence_records_document_idx on evidence_records (evidence_document_id);
create index if not exists verification_results_record_idx on verification_results (consumption_record_id);
create index if not exists verification_results_status_idx on verification_results (automated_status);
create index if not exists audit_logs_entity_idx on audit_logs (entity_type, entity_id);

alter table profiles enable row level security;
alter table opcos enable row level security;
alter table methodologies enable row level security;
alter table verification_runs enable row level security;
alter table consumption_records enable row level security;
alter table evidence_documents enable row level security;
alter table evidence_records enable row level security;
alter table verification_results enable row level security;
alter table audit_logs enable row level security;

create policy profiles_self_read on profiles for select to authenticated using (id = auth.uid() or app_role() = 'administrator');
create policy opcos_read on opcos for select to authenticated using (true);
create policy opcos_admin_write on opcos for all to authenticated using (app_role() = 'administrator') with check (app_role() = 'administrator');
create policy methodologies_read on methodologies for select to authenticated using (true);
create policy methodologies_admin_write on methodologies for all to authenticated using (app_role() = 'administrator') with check (app_role() = 'administrator');

create policy runs_read on verification_runs for select to authenticated using (true);
create policy runs_write on verification_runs for insert to authenticated with check (app_role() in ('administrator', 'consultant'));
create policy runs_update on verification_runs for update to authenticated using (app_role() in ('administrator', 'consultant', 'reviewer'));

create policy consumption_read on consumption_records for select to authenticated using (true);
create policy consumption_write on consumption_records for all to authenticated using (app_role() in ('administrator', 'consultant')) with check (app_role() in ('administrator', 'consultant'));

create policy evidence_documents_read on evidence_documents for select to authenticated using (true);
create policy evidence_documents_write on evidence_documents for all to authenticated using (app_role() in ('administrator', 'consultant')) with check (app_role() in ('administrator', 'consultant'));

create policy evidence_records_read on evidence_records for select to authenticated using (true);
create policy evidence_records_write on evidence_records for all to authenticated using (app_role() in ('administrator', 'consultant')) with check (app_role() in ('administrator', 'consultant'));

create policy results_read on verification_results for select to authenticated using (true);
create policy results_consultant_insert on verification_results for insert to authenticated with check (app_role() in ('administrator', 'consultant'));
create policy results_reviewer_update on verification_results for update to authenticated using (app_role() in ('administrator', 'reviewer'));

create policy audit_admin_read on audit_logs for select to authenticated using (app_role() = 'administrator');
create policy audit_insert on audit_logs for insert to authenticated with check (user_id = auth.uid());

-- Store uploaded files in a private bucket named "verification-evidence".
-- Do not create a public bucket. Access files through a server route that checks the session.
insert into storage.buckets (id, name, public)
values ('verification-evidence', 'verification-evidence', false)
on conflict (id) do nothing;
