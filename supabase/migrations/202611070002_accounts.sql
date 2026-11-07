-- Berry Safety · Paso 2: altas desde la app y cambio de contraseña obligatorio.
-- Ejecutar después de 202611070001_foundation.sql. No cambia la contraseña
-- ni retira el acceso de las cuentas que ya existen.
begin;

alter table public.berry_profiles add column if not exists must_change_password boolean not null default false;
alter table public.berry_profiles alter column must_change_password set default true;
alter table public.berry_profiles add column if not exists credentials_valid_after bigint not null default 0;

create table if not exists berry_private.account_requests (
  request_id uuid primary key,
  actor_id uuid not null references auth.users(id),
  email text not null unique,
  input jsonb not null,
  user_id uuid references auth.users(id),
  created_at timestamptz not null default now(),
  completed_at timestamptz
);
create table if not exists berry_private.password_operations (
  user_id uuid primary key references auth.users(id),
  operation_id uuid not null,
  state text not null check (state in ('pending', 'complete', 'failed')),
  started_at timestamptz not null default now()
);
revoke all on berry_private.account_requests, berry_private.password_operations from public, anon, authenticated;
alter table berry_private.account_requests enable row level security;
alter table berry_private.password_operations enable row level security;

create or replace function berry_private.is_enabled()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.berry_profiles p
    where p.id = (select auth.uid()) and p.enabled and not p.must_change_password
      and (p.credentials_valid_after = 0 or coalesce(((select auth.jwt()) ->> 'iat')::bigint, 0) > p.credentials_valid_after)
  );
$$;

create or replace function berry_private.require_admin()
returns uuid language plpgsql stable security definer set search_path = '' as $$
begin
  if not berry_private.is_enabled() or not exists (
    select 1 from public.berry_profiles where id = (select auth.uid()) and role = 'admin'
  ) then raise exception 'ADMIN_REQUIRED' using errcode = '42501'; end if;
  return auth.uid();
end;
$$;

create or replace function public.berry_admin_accounts()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  perform berry_private.require_admin();
  return (select coalesce(jsonb_agg(to_jsonb(p) - 'credentials_valid_after' order by p.created_at, p.id), '[]'::jsonb) from public.berry_profiles p);
end;
$$;

create or replace function public.berry_prepare_account(p_request_id uuid, p_input jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid := berry_private.require_admin();
  v_request berry_private.account_requests;
  v_email text := lower(btrim(p_input ->> 'email'));
begin
  if p_request_id is null or p_input is null or jsonb_typeof(p_input) <> 'object'
    or not (p_input ?& array['email', 'full_name', 'area', 'job_title', 'role', 'supervisor_emails'])
    or (p_input - array['email', 'full_name', 'area', 'job_title', 'role', 'supervisor_emails']) <> '{}'::jsonb
    or jsonb_typeof(p_input -> 'email') <> 'string' or length(v_email) not between 3 and 254
    or v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
    or jsonb_typeof(p_input -> 'full_name') <> 'string' or length(btrim(p_input ->> 'full_name')) not between 1 and 250
    or jsonb_typeof(p_input -> 'area') <> 'string' or length(p_input ->> 'area') > 250
    or jsonb_typeof(p_input -> 'job_title') <> 'string' or length(p_input ->> 'job_title') > 250
    or coalesce(p_input ->> 'role', '') not in ('admin', 'inspector')
    or jsonb_typeof(p_input -> 'supervisor_emails') <> 'array'
  then raise exception 'INVALID_ACCOUNT' using errcode = '22023'; end if;
  if jsonb_array_length(p_input -> 'supervisor_emails') > 50 or exists (
    select 1 from jsonb_array_elements(p_input -> 'supervisor_emails') e
    where jsonb_typeof(e) <> 'string' or length(e #>> '{}') > 254 or (e #>> '{}') !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
  ) then raise exception 'INVALID_ACCOUNT' using errcode = '22023'; end if;

  p_input := jsonb_set(p_input, '{email}', to_jsonb(v_email));
  insert into berry_private.account_requests(request_id, actor_id, email, input)
    values(p_request_id, v_actor, v_email, p_input) on conflict do nothing;
  select * into v_request from berry_private.account_requests where email = v_email for update;
  if not found or v_request.actor_id <> v_actor or v_request.input <> p_input then
    raise exception 'ACCOUNT_CONFLICT' using errcode = '23505';
  end if;
  if v_request.user_id is null and exists(select 1 from public.berry_profiles where email = v_email) then
    -- A timed-out Auth create may already exist, but it must belong to this
    -- exact server-assigned request. Never adopt or reset an existing account.
    if not exists(select 1 from auth.users u where lower(u.email) = v_email and u.raw_app_meta_data ->> 'berry_request_id' = v_request.request_id::text) then
      raise exception 'ACCOUNT_EXISTS' using errcode = '23505';
    end if;
  end if;
  return to_jsonb(v_request);
end;
$$;

create or replace function public.berry_finish_account(p_request_id uuid, p_user_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid := berry_private.require_admin();
  v_request berry_private.account_requests;
  v_profile public.berry_profiles;
begin
  select * into v_request from berry_private.account_requests where request_id = p_request_id and actor_id = v_actor for update;
  if not found then raise exception 'ACCOUNT_REQUEST_NOT_FOUND' using errcode = '42501'; end if;
  if v_request.user_id is not null then
    if v_request.user_id <> p_user_id then raise exception 'ACCOUNT_CONFLICT' using errcode = '23505'; end if;
    return (select to_jsonb(p) - 'credentials_valid_after' from public.berry_profiles p where id = p_user_id);
  end if;
  if not exists (
    select 1 from auth.users u where u.id = p_user_id and lower(u.email) = v_request.email
      and u.raw_app_meta_data ->> 'berry_request_id' = p_request_id::text
  ) then raise exception 'ACCOUNT_IDENTITY_MISMATCH' using errcode = '42501'; end if;
  update public.berry_profiles set
    full_name = btrim(v_request.input ->> 'full_name'), area = btrim(v_request.input ->> 'area'),
    job_title = btrim(v_request.input ->> 'job_title'), role = v_request.input ->> 'role',
    supervisor_emails = array(select jsonb_array_elements_text(v_request.input -> 'supervisor_emails')),
    enabled = true, must_change_password = true
    where id = p_user_id and email = v_request.email returning * into v_profile;
  if not found then raise exception 'ACCOUNT_PROFILE_NOT_FOUND' using errcode = '42501'; end if;
  update berry_private.account_requests set user_id = p_user_id, completed_at = now() where request_id = p_request_id;
  return to_jsonb(v_profile) - 'credentials_valid_after';
end;
$$;

-- These two RPCs are callable only by the API's server-only Secret key.
create or replace function public.berry_find_account_request(p_request_id uuid)
returns uuid language sql stable security definer set search_path = '' as $$
  select u.id from berry_private.account_requests r join auth.users u on lower(u.email) = r.email
    and u.raw_app_meta_data ->> 'berry_request_id' = r.request_id::text where r.request_id = p_request_id;
$$;

create or replace function public.berry_password_operation(p_user_id uuid, p_operation_id uuid, p_action text)
returns void language plpgsql security definer set search_path = '' as $$
declare v_operation berry_private.password_operations;
begin
  perform 1 from public.berry_profiles where id = p_user_id and enabled for update;
  if not found then raise exception 'ACCOUNT_DISABLED' using errcode = '42501'; end if;
  select * into v_operation from berry_private.password_operations where user_id = p_user_id for update;
  if p_action = 'begin' then
    if v_operation.state = 'pending' and v_operation.started_at > now() - interval '5 minutes' then
      raise exception 'PASSWORD_CHANGE_BUSY' using errcode = '55P03';
    end if;
    insert into berry_private.password_operations(user_id, operation_id, state) values(p_user_id, p_operation_id, 'pending')
      on conflict(user_id) do update set operation_id = excluded.operation_id, state = 'pending', started_at = now();
  elsif p_action in ('complete', 'failed') then
    if v_operation.operation_id is distinct from p_operation_id or v_operation.state <> 'pending' then
      raise exception 'PASSWORD_CHANGE_CONFLICT' using errcode = '40001';
    end if;
    if p_action = 'complete' then
      -- The API has verified the user's JWT and changed Auth's password. It
      -- supplies the identity here; browser roles cannot execute this RPC.
      perform set_config('request.jwt.claim.sub', p_user_id::text, true);
      update public.berry_profiles set must_change_password = false,
        credentials_valid_after = floor(extract(epoch from clock_timestamp()))::bigint where id = p_user_id;
    end if;
    update berry_private.password_operations set state = case when p_action = 'complete' then 'complete' else 'failed' end where user_id = p_user_id;
  else raise exception 'INVALID_ACTION' using errcode = '22023'; end if;
end;
$$;

drop policy if exists berry_audit_read on public.berry_audit;
create policy berry_audit_read on public.berry_audit for select to authenticated
  using (berry_private.is_enabled() and (berry_private.can_read_inspection(inspection_id) or (entity_type = 'berry_profiles' and entity_id = (select auth.uid())::text)));

revoke all on function berry_private.require_admin() from public, anon, authenticated;
revoke all on function public.berry_admin_accounts(), public.berry_prepare_account(uuid, jsonb), public.berry_finish_account(uuid, uuid),
  public.berry_find_account_request(uuid), public.berry_password_operation(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.berry_admin_accounts(), public.berry_prepare_account(uuid, jsonb), public.berry_finish_account(uuid, uuid) to authenticated;
grant execute on function public.berry_find_account_request(uuid), public.berry_password_operation(uuid, uuid, text) to service_role;
grant usage on schema public to service_role;

create or replace function public.berry_schema_status()
returns jsonb language sql stable set search_path = '' as $$
  select jsonb_build_object('schema_version', '202611070001', 'stage', 'accounts', 'accounts_version', '202611070002', 'sync_ready', false);
$$;
notify pgrst, 'reload schema';
commit;
