-- Berry Safety · Paso 5: accesos independientes y administración de cuentas/informes.
-- Requiere los pasos 3 y 4. No borra cuentas, inspecciones ni reinicia números.
begin;
do $$ begin
  if not exists(select 1 from information_schema.columns where table_schema='public' and table_name='berry_inspections' and column_name='final_excel_stored') then
    raise exception 'Primero instale el paso 4 del archivo final' using errcode='55000';
  end if;
end $$;
alter table public.berry_profiles add column if not exists can_create_inspections boolean not null default true;
alter table public.berry_profiles add column if not exists can_receive_inspections boolean not null default true;
alter table public.berry_profiles alter column can_create_inspections set default false;
alter table public.berry_profiles alter column can_receive_inspections set default false;
alter table public.berry_profiles add column if not exists deleted_at timestamptz;
alter table public.berry_profiles add column if not exists access_revision bigint not null default 1;
alter table public.berry_inspections add column if not exists deleted_by_admin boolean not null default false;
create table if not exists berry_private.retired_inspection_ids(id uuid primary key);
alter table berry_private.retired_inspection_ids enable row level security;
revoke all on berry_private.retired_inspection_ids from public,anon,authenticated;
create table if not exists berry_private.admin_serialization(singleton boolean primary key default true check(singleton));
insert into berry_private.admin_serialization values(true) on conflict do nothing;
alter table berry_private.admin_serialization enable row level security;
revoke all on berry_private.admin_serialization from public,anon,authenticated;
update berry_private.account_requests set input=jsonb_build_object('can_create_inspections',true,'can_receive_inspections',true)||input;

create or replace function berry_private.is_enabled()
returns boolean language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.berry_profiles p where p.id=(select auth.uid()) and p.enabled and p.deleted_at is null and not p.must_change_password
    and (p.credentials_valid_after=0 or coalesce(((select auth.jwt())->>'iat')::bigint,0)>p.credentials_valid_after));
$$;
create or replace function berry_private.require_create()
returns uuid language plpgsql stable security definer set search_path='' as $$
declare v_actor uuid:=berry_private.require_ready(); begin
  if not exists(select 1 from public.berry_profiles where id=v_actor and can_create_inspections) then raise exception 'CREATE_NOT_ALLOWED' using errcode='42501'; end if;
  return v_actor;
end $$;
create or replace function berry_private.can_read_inspection(p_id uuid)
returns boolean language sql stable security definer set search_path='' as $$
  select berry_private.is_enabled() and exists(select 1 from public.berry_inspections i where i.id=p_id and i.deleted_at is null and
    (i.author_id=(select auth.uid()) or (i.workflow<>'draft' and exists(select 1 from public.berry_recipients r join public.berry_profiles p on p.id=r.user_id where r.inspection_id=i.id and r.user_id=(select auth.uid()) and p.can_receive_inspections))));
$$;
create or replace function public.berry_admin_accounts()
returns jsonb language plpgsql stable security definer set search_path='' as $$ begin
  perform berry_private.require_admin();
  return(select coalesce(jsonb_agg(to_jsonb(p)-'credentials_valid_after' order by p.created_at,p.id),'[]') from public.berry_profiles p where p.deleted_at is null);
end $$;
create or replace function public.berry_prepare_account(p_request_id uuid, p_input jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid := berry_private.require_admin();
  v_request berry_private.account_requests;
  v_email text := lower(btrim(p_input ->> 'email'));
begin
  perform 1 from berry_private.admin_serialization where singleton for update;
  v_actor := berry_private.require_admin();
  p_input := jsonb_build_object('can_create_inspections',true,'can_receive_inspections',true)||p_input;
  if jsonb_typeof(p_input -> 'can_create_inspections') is distinct from 'boolean' or jsonb_typeof(p_input -> 'can_receive_inspections') is distinct from 'boolean' then raise exception 'INVALID_PERMISSIONS' using errcode='22023'; end if;
  if p_request_id is null or p_input is null or jsonb_typeof(p_input) <> 'object'
    or not (p_input ?& array['email', 'full_name', 'area', 'job_title', 'role', 'supervisor_emails', 'can_create_inspections', 'can_receive_inspections'])
    or (p_input - array['email', 'full_name', 'area', 'job_title', 'role', 'supervisor_emails', 'can_create_inspections', 'can_receive_inspections']) <> '{}'::jsonb
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
  perform 1 from berry_private.admin_serialization where singleton for update;
  v_actor := berry_private.require_admin();
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
    enabled = true, must_change_password = true,
    can_create_inspections=(v_request.input ->> 'can_create_inspections')::boolean,
    can_receive_inspections=(v_request.input ->> 'can_receive_inspections')::boolean
    where id = p_user_id and email = v_request.email returning * into v_profile;
  if not found then raise exception 'ACCOUNT_PROFILE_NOT_FOUND' using errcode = '42501'; end if;
  update berry_private.account_requests set user_id = p_user_id, completed_at = now() where request_id = p_request_id;
  return to_jsonb(v_profile) - 'credentials_valid_after';
end;
$$;


create or replace function public.berry_manage_account(p_id uuid,p_expected bigint,p_action text,p_permissions jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_actor uuid:=berry_private.require_admin(); v_target public.berry_profiles; v_enabled boolean; v_role text; v_create boolean; v_receive boolean;
begin
  perform 1 from berry_private.admin_serialization where singleton for update;
  v_actor:=berry_private.require_admin();
  select * into v_target from public.berry_profiles where id=p_id and deleted_at is null for update;
  if not found then raise exception 'ACCOUNT_NOT_FOUND' using errcode='22023'; end if;
  if v_target.access_revision is distinct from p_expected then raise exception 'ACCESS_REVISION_CONFLICT' using errcode='40001'; end if;
  if p_action not in('update','delete') then raise exception 'INVALID_ACTION' using errcode='22023'; end if;
  if p_action='delete' then
    v_enabled:=false;v_role:=v_target.role;v_create:=false;v_receive:=false;
  else
    if jsonb_typeof(p_permissions) is distinct from 'object' or (p_permissions-array['enabled','role','can_create_inspections','can_receive_inspections'])<>'{}'::jsonb
      or jsonb_typeof(p_permissions->'enabled') is distinct from 'boolean' or jsonb_typeof(p_permissions->'can_create_inspections') is distinct from 'boolean'
      or jsonb_typeof(p_permissions->'can_receive_inspections') is distinct from 'boolean' or coalesce(p_permissions->>'role','') not in('admin','inspector') then raise exception 'INVALID_PERMISSIONS' using errcode='22023'; end if;
    v_enabled:=(p_permissions->>'enabled')::boolean;v_role:=p_permissions->>'role';
    v_create:=(p_permissions->>'can_create_inspections')::boolean;v_receive:=(p_permissions->>'can_receive_inspections')::boolean;
  end if;
  if p_id=v_actor and (not v_enabled or p_action='delete') then raise exception 'CANNOT_DISABLE_SELF' using errcode='22023'; end if;
  if v_target.role='admin' and v_target.enabled and not v_target.must_change_password and (not v_enabled or v_role<>'admin' or p_action='delete')
    and not exists(select 1 from public.berry_profiles p where p.id<>p_id and p.role='admin' and p.enabled and p.deleted_at is null and not p.must_change_password) then
    raise exception 'LAST_ADMIN_REQUIRED' using errcode='22023';
  end if;
  update public.berry_profiles set enabled=v_enabled,role=v_role,can_create_inspections=v_create,can_receive_inspections=v_receive,
    deleted_at=case when p_action='delete' then clock_timestamp() else null end,access_revision=access_revision+1,
    credentials_valid_after=case when not v_enabled then floor(extract(epoch from clock_timestamp()))::bigint else credentials_valid_after end
    where id=p_id returning * into v_target;
  return to_jsonb(v_target)-'credentials_valid_after';
end $$;
create or replace function public.berry_admin_inspections()
returns jsonb language plpgsql stable security definer set search_path='' as $$ begin
  perform berry_private.require_admin();
  return(select coalesce(jsonb_agg(jsonb_build_object('id',i.id,'author_id',i.author_id,'author',p.full_name,'email',p.email,'area',i.data->>'area','facility',i.data->>'facility','date',i.data->>'date','workflow',i.workflow,'code',i.code,'revision',i.revision,'observation_count',case when jsonb_typeof(i.data->'observations')='array' then jsonb_array_length(i.data->'observations') else 0 end) order by i.updated_at desc),'[]')
    from public.berry_inspections i join public.berry_profiles p on p.id=i.author_id where i.deleted_at is null and coalesce((i.data->>'partial')::boolean,false)=false);
end $$;
create or replace function public.berry_admin_delete_inspection(p_id uuid,p_expected bigint)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_actor uuid:=berry_private.require_admin();v_row public.berry_inspections; begin
  select * into v_row from public.berry_inspections where id=p_id for update;
  if not found then raise exception 'INSPECTION_NOT_FOUND' using errcode='22023';end if;
  if v_row.deleted_at is not null then return jsonb_build_object('id',p_id,'code',v_row.code,'deleted',true);end if;
  if v_row.revision is distinct from p_expected then raise exception 'REVISION_CONFLICT' using errcode='40001';end if;
  update public.berry_inspections set deleted_at=clock_timestamp(),deleted_by_admin=true,revision=revision+1 where id=p_id;
  -- Keep the code and counter unchanged: normal deletion never reuses a number.
  return jsonb_build_object('id',p_id,'code',v_row.code,'deleted',true);
end $$;
create or replace function public.berry_cloud_tombstones(p_ids uuid[])
returns jsonb language plpgsql stable security definer set search_path='' as $$ begin
  perform berry_private.require_ready();
  return(select coalesce(jsonb_agg(i.id),'[]') from (select i.id from public.berry_inspections i where i.id=any(p_ids) and i.author_id=(select auth.uid()) and i.deleted_by_admin union select r.id from berry_private.retired_inspection_ids r where r.id=any(p_ids)) i);
end $$;

-- Retain the previous workflow bodies privately, then enforce capabilities at
-- each public operation. The original functions continue to enforce ownership.
do $$ declare v_item text;v_name text;v_args text; begin
  foreach v_item in array array['berry_ensure_draft(uuid)','berry_save_draft(uuid,bigint,jsonb)','berry_remove_draft(uuid,bigint)','berry_prepare_report(uuid,bigint,text)','berry_commit_report(uuid,uuid,bigint,jsonb)','berry_change_correction(uuid,uuid,bigint,text,jsonb)','berry_claim_report_mail(uuid,uuid)'] loop
    v_name:=split_part(v_item,'(',1);v_args:=substring(v_item from position('(' in v_item));
    if to_regprocedure('berry_private.'||v_name||'_v4'||v_args) is null then
      execute 'alter function public.'||v_item||' set schema berry_private';
      execute 'alter function berry_private.'||v_item||' rename to '||v_name||'_v4';
    end if;
    execute 'revoke all on function berry_private.'||v_name||'_v4'||v_args||' from public,anon,authenticated';
  end loop;
end $$;
create or replace function public.berry_ensure_draft(p_id uuid)returns jsonb language plpgsql security definer set search_path='' as $$ begin
  perform berry_private.require_create();
  if exists(select 1 from public.berry_inspections where id=p_id and deleted_by_admin) then raise exception 'INSPECTION_REMOVED_BY_ADMIN' using errcode='42501';end if;
  return berry_private.berry_ensure_draft_v4(p_id);
end $$;
create or replace function public.berry_save_draft(p_id uuid,p_expected bigint,p_data jsonb)returns jsonb language plpgsql security definer set search_path='' as $$ begin
  perform berry_private.require_create();
  if exists(select 1 from public.berry_inspections where id=p_id and deleted_by_admin) then raise exception 'INSPECTION_REMOVED_BY_ADMIN' using errcode='42501';end if;
  return berry_private.berry_save_draft_v4(p_id,p_expected,p_data);
end $$;
create or replace function public.berry_remove_draft(p_id uuid,p_expected bigint)returns bigint language plpgsql security definer set search_path='' as $$ begin
  perform berry_private.require_create();
  return berry_private.berry_remove_draft_v4(p_id,p_expected);
end $$;
create or replace function public.berry_prepare_report(p_id uuid,p_expected bigint,p_hash text)returns jsonb language plpgsql security definer set search_path='' as $$
declare v_result jsonb;v_person jsonb;begin
  perform berry_private.require_create();v_result:=berry_private.berry_prepare_report_v4(p_id,p_expected,p_hash);
  if coalesce((v_result->>'registered')::boolean,false) then return v_result;end if;
  for v_person in select value from jsonb_array_elements(v_result#>'{inspection,data,responsibles}') loop
    if not exists(select 1 from public.berry_profiles where id=(v_person->>'personId')::uuid and enabled and deleted_at is null and can_receive_inspections) then raise exception 'RECIPIENT_NOT_ALLOWED' using errcode='22023';end if;
  end loop;
  for v_person in select value from jsonb_array_elements(v_result#>'{inspection,data,additionalInspectors}') loop
    if not exists(select 1 from public.berry_profiles where id=(v_person->>'personId')::uuid and enabled and deleted_at is null and can_create_inspections) then raise exception 'INSPECTOR_NOT_ALLOWED' using errcode='22023';end if;
  end loop;
  return v_result;
end $$;
create or replace function public.berry_commit_report(p_operation uuid,p_actor uuid,p_actor_iat bigint,p_document jsonb)returns jsonb language plpgsql security definer set search_path='' as $$
declare v_data jsonb;v_person jsonb;begin
  perform 1 from public.berry_profiles where id=p_actor for share;
  if not exists(select 1 from public.berry_profiles where id=p_actor and enabled and deleted_at is null and can_create_inspections) then raise exception 'CREATE_NOT_ALLOWED' using errcode='42501';end if;
  select i.data into v_data from public.berry_inspections i join berry_private.report_leases l on l.inspection_id=i.id where l.operation_id=p_operation and l.actor_id=p_actor;
  for v_person in select value from jsonb_array_elements(v_data->'responsibles') loop
    perform 1 from public.berry_profiles where id=(v_person->>'personId')::uuid for share;
    if not exists(select 1 from public.berry_profiles where id=(v_person->>'personId')::uuid and enabled and deleted_at is null and can_receive_inspections) then raise exception 'RECIPIENT_NOT_ALLOWED' using errcode='22023';end if;
  end loop;
  return berry_private.berry_commit_report_v4(p_operation,p_actor,p_actor_iat,p_document);
end $$;
create or replace function public.berry_change_correction(p_id uuid,p_observation uuid,p_expected bigint,p_action text,p_value jsonb)returns jsonb language plpgsql security definer set search_path='' as $$
declare v_actor uuid:=berry_private.require_ready();v_owner boolean;v_create boolean;v_receive boolean;begin
  select author_id=v_actor into v_owner from public.berry_inspections where id=p_id;
  select can_create_inspections,can_receive_inspections into v_create,v_receive from public.berry_profiles where id=v_actor;
  if (p_action in('save','submit') and not v_receive) or(p_action in('approve','changes') and not(v_owner and v_create))
    or(p_action='state' and not((v_owner and v_create) or(v_receive and exists(select 1 from public.berry_recipients where inspection_id=p_id and user_id=v_actor)))) then raise exception 'ACTION_NOT_ALLOWED' using errcode='42501';end if;
  return berry_private.berry_change_correction_v4(p_id,p_observation,p_expected,p_action,p_value);
end $$;
create or replace function public.berry_claim_report_mail(p_id uuid,p_actor uuid)returns jsonb language plpgsql security definer set search_path='' as $$ begin
  perform 1 from public.berry_inspections where id=p_id and deleted_at is null for update;
  if not found then raise exception 'INSPECTION_REMOVED' using errcode='42501';end if;
  return berry_private.berry_claim_report_mail_v4(p_id,p_actor);
end $$;
create or replace function berry_private.can_upload_evidence(p_id uuid)
returns boolean language sql stable security definer set search_path='' as $$
 select berry_private.is_enabled() and exists(select 1 from public.berry_inspections i join public.berry_profiles p on p.id=(select auth.uid()) where i.id=p_id and i.deleted_at is null and i.workflow<>'closed'
  and((i.author_id=p.id and i.workflow='draft' and p.can_create_inspections) or(i.workflow='sent' and p.can_receive_inspections and exists(select 1 from public.berry_recipients r where r.inspection_id=i.id and r.user_id=p.id))));
$$;
create or replace function berry_private.require_final_actor(p_id uuid,p_actor uuid,p_iat bigint)
returns void language plpgsql stable security definer set search_path='' as $$ begin
 if not exists(select 1 from public.berry_profiles p where p.id=p_actor and p.enabled and p.deleted_at is null and not p.must_change_password and p_iat>0 and(p.credentials_valid_after=0 or p_iat>p.credentials_valid_after)
  and exists(select 1 from public.berry_inspections i where i.id=p_id and i.workflow='closed' and i.deleted_at is null and(i.author_id=p.id or(p.can_receive_inspections and exists(select 1 from public.berry_recipients r where r.inspection_id=p_id and r.user_id=p.id))))) then raise exception 'FINAL_NOT_ALLOWED' using errcode='42501';end if;
end $$;

revoke all on function berry_private.require_create(),berry_private.require_final_actor(uuid,uuid,bigint) from public,anon,authenticated;
revoke all on function public.berry_manage_account(uuid,bigint,text,jsonb),public.berry_admin_inspections(),public.berry_admin_delete_inspection(uuid,bigint),public.berry_cloud_tombstones(uuid[]),
 public.berry_ensure_draft(uuid),public.berry_save_draft(uuid,bigint,jsonb),public.berry_remove_draft(uuid,bigint),public.berry_prepare_report(uuid,bigint,text),public.berry_change_correction(uuid,uuid,bigint,text,jsonb),public.berry_commit_report(uuid,uuid,bigint,jsonb),public.berry_claim_report_mail(uuid,uuid) from public,anon,authenticated;
grant execute on function public.berry_manage_account(uuid,bigint,text,jsonb),public.berry_admin_inspections(),public.berry_admin_delete_inspection(uuid,bigint),public.berry_cloud_tombstones(uuid[]),public.berry_ensure_draft(uuid),public.berry_save_draft(uuid,bigint,jsonb),public.berry_remove_draft(uuid,bigint),public.berry_prepare_report(uuid,bigint,text),public.berry_change_correction(uuid,uuid,bigint,text,jsonb) to authenticated;
grant execute on function public.berry_commit_report(uuid,uuid,bigint,jsonb),public.berry_claim_report_mail(uuid,uuid) to service_role;
create or replace function public.berry_schema_status()returns jsonb language sql stable set search_path='' as $$
 select jsonb_build_object('schema_version','202611070001','accounts_version','202611070002','reports_version','202611080003','final_archive_version','202611080004','permissions_version','202611080005','stage','reports','sync_ready',true);
$$;
notify pgrst,'reload schema';
commit;
