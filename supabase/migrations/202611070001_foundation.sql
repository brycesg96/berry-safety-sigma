-- Berry Safety · Paso 1: estructura y permisos. Ejecutar en SQL Editor.
-- Las escrituras de inspecciones y el acceso de usuarios se conectan en los
-- siguientes pasos. Este script no importa, borra ni envía inspecciones.
begin;

-- Do not roll back the access checks installed by a later migration.
do $$ begin
  if exists(select 1 from information_schema.columns where table_schema = 'public' and table_name = 'berry_profiles' and column_name = 'must_change_password') then
    raise exception 'Ya está instalada la etapa de usuarios. No repita el script inicial; use la migración correspondiente.' using errcode = '55000';
  end if;
end; $$;

create schema if not exists berry_private;
revoke all on schema berry_private from public;
grant usage on schema berry_private to authenticated;

create table if not exists public.berry_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null unique check (email = lower(btrim(email)) and length(email) between 3 and 254),
  full_name text not null default '' check (length(full_name) <= 250),
  area text not null default '' check (length(area) <= 250),
  job_title text not null default '' check (length(job_title) <= 250),
  role text not null default 'inspector' check (role in ('admin', 'inspector')),
  enabled boolean not null default false,
  supervisor_emails text[] not null default '{}' check (cardinality(supervisor_emails) <= 50),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.berry_inspections (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references auth.users(id),
  workflow text not null default 'draft' check (workflow in ('draft', 'sent', 'closed')),
  revision bigint not null default 1 check (revision > 0),
  data jsonb not null default '{}' check (jsonb_typeof(data) = 'object'),
  sent_at timestamptz,
  closed_at timestamptz,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (workflow = 'draft' or sent_at is not null),
  check (workflow <> 'closed' or closed_at is not null)
);
create index if not exists berry_inspections_author_idx on public.berry_inspections(author_id, updated_at desc);

create table if not exists public.berry_recipients (
  inspection_id uuid not null references public.berry_inspections(id),
  user_id uuid not null references auth.users(id),
  assigned_by uuid not null references auth.users(id),
  assigned_at timestamptz not null default now(),
  primary key (inspection_id, user_id)
);
create index if not exists berry_recipients_user_idx on public.berry_recipients(user_id, inspection_id);

create table if not exists public.berry_corrections (
  inspection_id uuid not null references public.berry_inspections(id),
  observation_id uuid not null,
  actor_id uuid not null references auth.users(id),
  responsible_name text not null default '' check (length(responsible_name) <= 250),
  state text not null default 'Pendiente' check (state in ('Pendiente', 'Ejecutado')),
  decision text not null default 'draft' check (decision in ('draft', 'review', 'approved', 'changes')),
  revision bigint not null default 1 check (revision > 0),
  data jsonb not null default '{}' check (jsonb_typeof(data) = 'object'),
  reviewer_id uuid references auth.users(id),
  reviewer_note text not null default '' check (length(reviewer_note) <= 5000),
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (inspection_id, observation_id),
  check (decision <> 'approved' or state = 'Ejecutado')
);

create table if not exists public.berry_documents (
  id uuid primary key default gen_random_uuid(),
  inspection_id uuid not null references public.berry_inspections(id),
  kind text not null check (kind in ('excel', 'pdf')),
  revision bigint not null check (revision > 0),
  filename text not null check (length(filename) between 1 and 250),
  storage_path text not null unique,
  mime_type text not null,
  byte_size bigint not null check (byte_size between 1 and 15728640),
  sha256 text not null check (sha256 ~ '^[a-f0-9]{64}$'),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  unique (inspection_id, kind, revision),
  check ((kind = 'excel' and mime_type = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet') or (kind = 'pdf' and mime_type = 'application/pdf'))
);

create table if not exists public.berry_audit (
  id bigint generated always as identity primary key,
  inspection_id uuid,
  actor_id uuid,
  entity_type text not null,
  entity_id text not null,
  action text not null,
  before_data jsonb,
  after_data jsonb,
  occurred_at timestamptz not null default now()
);
create index if not exists berry_audit_inspection_idx on public.berry_audit(inspection_id, occurred_at, id);

create table if not exists public.berry_shared_texts (
  singleton boolean primary key default true check (singleton),
  inspection_id uuid references public.berry_inspections(id),
  objective text not null default '' check (length(objective) <= 560),
  unfavorable_cause text not null default '' check (length(unfavorable_cause) <= 1200),
  closing_remarks text not null default '' check (length(closing_remarks) <= 1200),
  submitted_at timestamptz not null default now()
);

create or replace function berry_private.is_enabled()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.berry_profiles p where p.id = (select auth.uid()) and p.enabled);
$$;

create or replace function berry_private.can_read_inspection(p_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select berry_private.is_enabled() and exists (
    select 1 from public.berry_inspections i where i.id = p_id and i.deleted_at is null
      and (i.author_id = (select auth.uid()) or (i.workflow <> 'draft' and exists (
        select 1 from public.berry_recipients r where r.inspection_id = i.id and r.user_id = (select auth.uid())
      )))
  );
$$;

create or replace function berry_private.asset_inspection_id(p_name text)
returns uuid language sql immutable set search_path = '' as $$
  select case when split_part(p_name, '/', 1) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    then split_part(p_name, '/', 1)::uuid else null end;
$$;

create or replace function berry_private.initialize_profile()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.email is not null and btrim(new.email) <> '' then
    insert into public.berry_profiles (id, email, full_name)
    values (new.id, lower(btrim(new.email)), left(coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name', ''), 250))
    on conflict (id) do nothing;
  end if;
  return new;
end;
$$;
drop trigger if exists berry_initialize_profile on auth.users;
create trigger berry_initialize_profile after insert on auth.users for each row execute function berry_private.initialize_profile();
insert into public.berry_profiles (id, email, full_name)
select id, lower(btrim(email)), left(coalesce(raw_user_meta_data ->> 'full_name', raw_user_meta_data ->> 'name', ''), 250)
from auth.users where email is not null and btrim(email) <> '' on conflict (id) do nothing;

create or replace function berry_private.touch_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin new.updated_at = now(); return new; end;
$$;

create or replace function berry_private.record_change()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_before jsonb := case when tg_op = 'INSERT' then null else to_jsonb(old) end;
  v_after jsonb := case when tg_op = 'DELETE' then null else to_jsonb(new) end;
  v_row jsonb := coalesce(v_after, v_before);
  v_inspection_id uuid;
  v_entity_id text;
begin
  v_inspection_id := case when tg_table_name = 'berry_inspections' then (v_row ->> 'id')::uuid else (v_row ->> 'inspection_id')::uuid end;
  v_entity_id := coalesce(v_row ->> 'id', concat_ws('/', v_row ->> 'inspection_id', v_row ->> 'observation_id', v_row ->> 'user_id'));
  insert into public.berry_audit (inspection_id, actor_id, entity_type, entity_id, action, before_data, after_data)
  values (v_inspection_id, auth.uid(), tg_table_name, v_entity_id, lower(tg_op), v_before, v_after);
  return null;
end;
$$;

do $$
declare name text;
begin
  foreach name in array array['berry_profiles', 'berry_inspections', 'berry_corrections'] loop
    execute format('drop trigger if exists berry_touch_updated_at on public.%I', name);
    execute format('create trigger berry_touch_updated_at before update on public.%I for each row execute function berry_private.touch_updated_at()', name);
  end loop;
  foreach name in array array['berry_profiles', 'berry_inspections', 'berry_recipients', 'berry_corrections', 'berry_documents', 'berry_shared_texts'] loop
    execute format('drop trigger if exists berry_record_change on public.%I', name);
    execute format('create trigger berry_record_change after insert or update or delete on public.%I for each row execute function berry_private.record_change()', name);
  end loop;
  foreach name in array array['berry_profiles', 'berry_inspections', 'berry_recipients', 'berry_corrections', 'berry_documents', 'berry_audit', 'berry_shared_texts'] loop
    execute format('alter table public.%I enable row level security', name);
    execute format('revoke all on table public.%I from public, anon, authenticated', name);
    execute format('grant select on table public.%I to authenticated', name);
  end loop;
end;
$$;

revoke all on all functions in schema berry_private from public, anon, authenticated;
grant execute on function berry_private.is_enabled(), berry_private.can_read_inspection(uuid), berry_private.asset_inspection_id(text) to authenticated;
grant usage on schema public to authenticated, anon;
grant update (full_name, area, job_title) on public.berry_profiles to authenticated;

drop policy if exists berry_profiles_read on public.berry_profiles;
create policy berry_profiles_read on public.berry_profiles for select to authenticated
  using (id = (select auth.uid()) or (enabled and berry_private.is_enabled()));
drop policy if exists berry_profiles_update_own on public.berry_profiles;
create policy berry_profiles_update_own on public.berry_profiles for update to authenticated
  using (id = (select auth.uid()) and berry_private.is_enabled())
  with check (id = (select auth.uid()) and berry_private.is_enabled());

drop policy if exists berry_inspections_read on public.berry_inspections;
create policy berry_inspections_read on public.berry_inspections for select to authenticated using (berry_private.can_read_inspection(id));
drop policy if exists berry_recipients_read on public.berry_recipients;
create policy berry_recipients_read on public.berry_recipients for select to authenticated using (berry_private.can_read_inspection(inspection_id));
drop policy if exists berry_corrections_read on public.berry_corrections;
create policy berry_corrections_read on public.berry_corrections for select to authenticated using (berry_private.can_read_inspection(inspection_id));
drop policy if exists berry_documents_read on public.berry_documents;
create policy berry_documents_read on public.berry_documents for select to authenticated using (berry_private.can_read_inspection(inspection_id));
drop policy if exists berry_audit_read on public.berry_audit;
create policy berry_audit_read on public.berry_audit for select to authenticated
  using (berry_private.can_read_inspection(inspection_id) or (entity_type = 'berry_profiles' and entity_id = (select auth.uid())::text));
drop policy if exists berry_shared_texts_read on public.berry_shared_texts;
create policy berry_shared_texts_read on public.berry_shared_texts for select to authenticated using (berry_private.is_enabled());

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('berry-evidence', 'berry-evidence', false, 15728640, array['image/jpeg', 'image/png', 'image/webp', 'image/gif']),
  ('berry-documents', 'berry-documents', false, 15728640, array['application/pdf', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;
drop policy if exists berry_private_files_read on storage.objects;
create policy berry_private_files_read on storage.objects for select to authenticated
  using (bucket_id in ('berry-evidence', 'berry-documents') and berry_private.can_read_inspection(berry_private.asset_inspection_id(name)));

create or replace function public.berry_schema_status()
returns jsonb language sql stable set search_path = '' as $$
  select jsonb_build_object('schema_version', '202611070001', 'stage', 'foundation', 'sync_ready', false);
$$;
revoke all on function public.berry_schema_status() from public;
grant execute on function public.berry_schema_status() to anon, authenticated;

notify pgrst, 'reload schema';
commit;
