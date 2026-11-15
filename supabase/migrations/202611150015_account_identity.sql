-- Berry Safety · Paso 15: identidad histórica y altas posteriores a una eliminación.
-- Requiere el paso 14. Los nuevos accesos tienen otro UUID de Auth; nunca heredan informes.
begin;
do $$ begin
 if public.berry_schema_status()->>'organization_catalog_version' is distinct from '202611150014' then raise exception 'Primero instale el paso 14 de Gestión de Áreas' using errcode='55000';end if;
end $$;
alter table public.berry_profiles add column if not exists person_id uuid;
update public.berry_profiles set person_id=id where person_id is null;
alter table public.berry_profiles alter column person_id set default gen_random_uuid();
alter table public.berry_profiles alter column person_id set not null;
alter table public.berry_profiles add column if not exists contact_email text;
update public.berry_profiles set contact_email=email where contact_email is null;
alter table public.berry_profiles alter column contact_email set not null;
alter table public.berry_profiles alter column contact_email set default '';
alter table public.berry_profiles add column if not exists login_retired_at timestamptz;
alter table public.berry_profiles add column if not exists deleted_access jsonb;
alter table public.berry_profiles add column if not exists history_access_from timestamptz;
create unique index if not exists berry_current_person_idx on public.berry_profiles(person_id) where deleted_at is null;
create or replace function berry_private.initialize_profile_identity()
returns trigger language plpgsql set search_path='' as $$ begin
 new.contact_email:=coalesce(nullif(new.contact_email,''),new.email);return new;
end $$;
revoke all on function berry_private.initialize_profile_identity() from public,anon,authenticated;
drop trigger if exists berry_initialize_profile_identity on public.berry_profiles;
create trigger berry_initialize_profile_identity before insert on public.berry_profiles for each row execute function berry_private.initialize_profile_identity();
-- Older accidental deletions can use the access snapshot already recorded by audit.
update public.berry_profiles p set deleted_access=(select a.before_data from public.berry_audit a where a.entity_type='berry_profiles' and a.entity_id=p.id::text and a.before_data->>'deleted_at' is null and a.after_data->>'deleted_at' is not null order by a.occurred_at desc,a.id desc limit 1)
 where p.deleted_at is not null and p.deleted_access is null;

create or replace function berry_private.remember_deleted_access()
returns trigger language plpgsql set search_path='' as $$ begin
 if new.deleted_at is not null and old.deleted_at is null then
  new.deleted_access:=jsonb_build_object('role',old.role,'enabled',old.enabled,'can_create_inspections',old.can_create_inspections,'can_receive_inspections',old.can_receive_inspections);
 end if;
 return new;
end $$;
revoke all on function berry_private.remember_deleted_access() from public,anon,authenticated;
drop trigger if exists berry_remember_deleted_access on public.berry_profiles;
create trigger berry_remember_deleted_access before update of deleted_at on public.berry_profiles for each row execute function berry_private.remember_deleted_access();
create or replace function berry_private.account_name(p_name text) returns text language sql immutable set search_path='' as $$
 select translate(lower(regexp_replace(btrim(p_name),'\s+',' ','g')),'áéíóúüñ','aeiouun');
$$;
revoke all on function berry_private.account_name(text) from public,anon,authenticated;
create or replace function berry_private.account_restore_until(p_deleted timestamptz)
returns timestamptz language sql immutable set search_path='' as $$ select ((p_deleted at time zone 'America/Lima')+interval '3 months') at time zone 'America/Lima'; $$;
revoke all on function berry_private.account_restore_until(timestamptz) from public,anon,authenticated;

create table if not exists berry_private.account_resolutions(
 operation_id uuid primary key,
 actor_id uuid not null references auth.users(id),
 previous_id uuid not null references public.berry_profiles(id),
 person_id uuid not null,
 mode text not null check(mode in('rehire','new_person','restore')),
 input jsonb not null,
 expected_revision bigint not null,
 needs_archive boolean not null,
 archive_email text not null,
 released_at timestamptz,
 new_user_id uuid references auth.users(id),
 created_at timestamptz not null default now(),
 completed_at timestamptz
);
alter table berry_private.account_resolutions add column if not exists cancelled_at timestamptz;
alter table berry_private.account_resolutions enable row level security;
revoke all on berry_private.account_resolutions from public,anon,authenticated;
drop index if exists berry_private.berry_resolution_person_pending_idx;
drop index if exists berry_private.berry_resolution_email_pending_idx;
create unique index berry_resolution_person_pending_idx on berry_private.account_resolutions(person_id) where completed_at is null and cancelled_at is null and mode in('rehire','restore');
create unique index berry_resolution_email_pending_idx on berry_private.account_resolutions((input->>'email')) where completed_at is null and cancelled_at is null;

create table if not exists berry_private.restored_pending_access(
 user_id uuid not null references public.berry_profiles(id),
 inspection_id uuid not null references public.berry_inspections(id) on delete cascade,
 primary key(user_id,inspection_id)
);
alter table berry_private.restored_pending_access enable row level security;
revoke all on berry_private.restored_pending_access from public,anon,authenticated;
create or replace function berry_private.history_allows(p_id uuid)
returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.berry_profiles p join public.berry_inspections i on i.id=p_id
  where p.id=(select auth.uid()) and (p.history_access_from is null or i.created_at>=p.history_access_from
   or exists(select 1 from berry_private.restored_pending_access a where a.user_id=p.id and a.inspection_id=i.id)));
$$;
revoke all on function berry_private.history_allows(uuid) from public,anon,authenticated;
create or replace function berry_private.can_read_inspection(p_id uuid)
returns boolean language sql stable security definer set search_path='' as $$
 select berry_private.is_enabled() and exists(select 1 from public.berry_inspections i where i.id=p_id and i.deleted_at is null and berry_private.history_allows(i.id) and
  (i.author_id=(select auth.uid()) or (i.workflow<>'draft' and exists(select 1 from public.berry_recipients r join public.berry_profiles p on p.id=r.user_id where r.inspection_id=i.id and r.user_id=(select auth.uid()) and p.can_receive_inspections))
   or (i.workflow<>'draft' and i.code is not null and exists(select 1 from public.berry_profiles p where p.id=(select auth.uid()) and p.role='admin'))));
$$;
-- The administrative dashboard retains its explicit global review permission;
-- restoring a personal workspace does not remove that separate administrator role.
create or replace function berry_private.can_read_admin_archive(p_id uuid)
returns boolean language sql stable security definer set search_path='' as $$
 select berry_private.is_enabled() and exists(select 1 from public.berry_profiles p where p.id=(select auth.uid()) and p.role='admin')
  and exists(select 1 from public.berry_inspections i where i.id=p_id and i.deleted_at is null and i.workflow in('sent','closed') and i.code is not null);
$$;
revoke all on function berry_private.can_read_admin_archive(uuid) from public,anon,authenticated;
grant execute on function berry_private.can_read_admin_archive(uuid) to authenticated;
drop policy if exists berry_documents_admin_identity_read on public.berry_documents;
create policy berry_documents_admin_identity_read on public.berry_documents for select to authenticated using(berry_private.can_read_admin_archive(inspection_id));
drop policy if exists berry_archives_admin_identity_read on storage.objects;
create policy berry_archives_admin_identity_read on storage.objects for select to authenticated using(
 (bucket_id='berry-evidence' and berry_private.can_read_admin_archive(berry_private.asset_inspection_id(name)))
 or (bucket_id='berry-documents' and exists(select 1 from public.berry_documents d where d.storage_path=name and berry_private.can_read_admin_archive(d.inspection_id))));
-- Protect workflow RPCs too: a known UUID must not bypass the restored scope.
do $$ begin
 if to_regprocedure('berry_private.prepare_report_before_identity(uuid,bigint,text)') is null then
  alter function public.berry_prepare_report(uuid,bigint,text) set schema berry_private;
  alter function berry_private.berry_prepare_report(uuid,bigint,text) rename to prepare_report_before_identity;
 end if;
 if to_regprocedure('berry_private.change_correction_before_identity(uuid,uuid,bigint,text,jsonb)') is null then
  alter function public.berry_change_correction(uuid,uuid,bigint,text,jsonb) set schema berry_private;
  alter function berry_private.berry_change_correction(uuid,uuid,bigint,text,jsonb) rename to change_correction_before_identity;
 end if;
 if to_regprocedure('berry_private.ensure_draft_before_identity(uuid)') is null then
  alter function public.berry_ensure_draft(uuid) set schema berry_private;
  alter function berry_private.berry_ensure_draft(uuid) rename to ensure_draft_before_identity;
 end if;
 if to_regprocedure('berry_private.save_draft_before_identity(uuid,bigint,jsonb)') is null then
  alter function public.berry_save_draft(uuid,bigint,jsonb) set schema berry_private;
  alter function berry_private.berry_save_draft(uuid,bigint,jsonb) rename to save_draft_before_identity;
 end if;
 if to_regprocedure('berry_private.remove_draft_before_identity(uuid,bigint)') is null then
  alter function public.berry_remove_draft(uuid,bigint) set schema berry_private;
  alter function berry_private.berry_remove_draft(uuid,bigint) rename to remove_draft_before_identity;
 end if;
end $$;
revoke all on function berry_private.prepare_report_before_identity(uuid,bigint,text),berry_private.change_correction_before_identity(uuid,uuid,bigint,text,jsonb),berry_private.ensure_draft_before_identity(uuid),berry_private.save_draft_before_identity(uuid,bigint,jsonb),berry_private.remove_draft_before_identity(uuid,bigint) from public,anon,authenticated;
create or replace function public.berry_prepare_report(p_id uuid,p_expected bigint,p_hash text) returns jsonb language plpgsql security definer set search_path='' as $$ begin
 if not berry_private.history_allows(p_id) then raise exception 'HISTORY_NOT_ALLOWED' using errcode='42501';end if;
 return berry_private.prepare_report_before_identity(p_id,p_expected,p_hash);
end $$;
create or replace function public.berry_change_correction(p_id uuid,p_observation uuid,p_expected bigint,p_action text,p_value jsonb) returns jsonb language plpgsql security definer set search_path='' as $$ begin
 if not berry_private.history_allows(p_id) then raise exception 'HISTORY_NOT_ALLOWED' using errcode='42501';end if;
 return berry_private.change_correction_before_identity(p_id,p_observation,p_expected,p_action,p_value);
end $$;
create or replace function public.berry_ensure_draft(p_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$ begin
 if exists(select 1 from public.berry_inspections where id=p_id) and not berry_private.history_allows(p_id) then raise exception 'HISTORY_NOT_ALLOWED' using errcode='42501';end if;
 return berry_private.ensure_draft_before_identity(p_id);
end $$;
create or replace function public.berry_save_draft(p_id uuid,p_expected bigint,p_data jsonb) returns jsonb language plpgsql security definer set search_path='' as $$ begin
 if not berry_private.history_allows(p_id) then raise exception 'HISTORY_NOT_ALLOWED' using errcode='42501';end if;
 return berry_private.save_draft_before_identity(p_id,p_expected,p_data);
end $$;
create or replace function public.berry_remove_draft(p_id uuid,p_expected bigint) returns bigint language plpgsql security definer set search_path='' as $$ begin
 if not berry_private.history_allows(p_id) then raise exception 'HISTORY_NOT_ALLOWED' using errcode='42501';end if;
 return berry_private.remove_draft_before_identity(p_id,p_expected);
end $$;
revoke all on function public.berry_prepare_report(uuid,bigint,text),public.berry_change_correction(uuid,uuid,bigint,text,jsonb),public.berry_ensure_draft(uuid),public.berry_save_draft(uuid,bigint,jsonb),public.berry_remove_draft(uuid,bigint) from public,anon,authenticated;
grant execute on function public.berry_prepare_report(uuid,bigint,text),public.berry_change_correction(uuid,uuid,bigint,text,jsonb),public.berry_ensure_draft(uuid),public.berry_save_draft(uuid,bigint,jsonb),public.berry_remove_draft(uuid,bigint) to authenticated;

create or replace function public.berry_account_matches(p_email text,p_name text)
returns jsonb language plpgsql stable security definer set search_path='' as $$ begin
 perform berry_private.require_admin();
 return(select coalesce(jsonb_agg(jsonb_build_object('id',p.id,'person_id',p.person_id,'email',p.contact_email,'full_name',p.full_name,'management',p.management,'area',p.area,'job_title',p.job_title,'deleted_at',p.deleted_at,'enabled',p.enabled,'access_revision',p.access_revision,
  'same_email',lower(p.contact_email)=lower(btrim(p_email)),'owns_email',lower(p.email)=lower(btrim(p_email)),'restore_until',berry_private.account_restore_until(p.deleted_at),
  'pending',(select jsonb_build_object('mode',o.mode,'input',o.input) from berry_private.account_resolutions o where o.previous_id=p.id and o.completed_at is null and o.cancelled_at is null and (o.mode<>'restore' or now()<=berry_private.account_restore_until(p.deleted_at)) order by o.created_at limit 1),
  'can_restore',p.deleted_at is not null and now()<=berry_private.account_restore_until(p.deleted_at) and p.login_retired_at is null and not exists(select 1 from public.berry_profiles x where x.person_id=p.person_id and x.deleted_at is null),
  'can_rehire',p.deleted_at is not null and not exists(select 1 from public.berry_profiles x where x.person_id=p.person_id and x.deleted_at is null)) order by p.deleted_at nulls first,p.created_at desc),'[]')
  from public.berry_profiles p where (lower(p.contact_email)=lower(btrim(p_email)) or berry_private.account_name(p.full_name)=berry_private.account_name(p_name))
   and not exists(select 1 from auth.users u join berry_private.account_requests r on u.raw_app_meta_data->>'berry_request_id'=r.request_id::text where u.id=p.id and r.actor_id=(select auth.uid()) and r.user_id is null));
end $$;

create or replace function public.berry_begin_account_resolution(p_operation uuid,p_previous uuid,p_expected bigint,p_mode text,p_input jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_actor uuid:=berry_private.require_admin();v_old public.berry_profiles;v_op berry_private.account_resolutions;v_email text:=lower(btrim(p_input->>'email'));v_person uuid;v_archive boolean;
begin
 perform 1 from berry_private.admin_serialization where singleton for update;v_actor:=berry_private.require_admin();
 update berry_private.account_resolutions o set cancelled_at=clock_timestamp() from public.berry_profiles p where o.previous_id=p.id and o.mode='restore' and o.completed_at is null and o.cancelled_at is null and p.deleted_at is not null and now()>berry_private.account_restore_until(p.deleted_at);
 select * into v_op from berry_private.account_resolutions where operation_id=p_operation for update;
 if found then
  if v_op.cancelled_at is not null then raise exception 'RESTORE_EXPIRED' using errcode='22023';end if;
  if v_op.actor_id<>v_actor or v_op.previous_id<>p_previous or v_op.mode<>p_mode or v_op.input<>p_input then raise exception 'RESOLUTION_CONFLICT' using errcode='40001';end if;
  return to_jsonb(v_op);
 end if;
 select * into v_op from berry_private.account_resolutions where completed_at is null and cancelled_at is null and input->>'email'=v_email for update;
 if found then
  if v_op.previous_id=p_previous and v_op.mode=p_mode and v_op.input=p_input then
   if v_op.actor_id<>v_actor then
    insert into public.berry_audit(actor_id,entity_type,entity_id,action,before_data,after_data) values(v_actor,'account_resolutions',v_op.operation_id::text,'resume',jsonb_build_object('actor_id',v_op.actor_id),jsonb_build_object('actor_id',v_actor));
    update berry_private.account_requests set actor_id=v_actor where request_id=v_op.operation_id;
    update berry_private.account_resolutions set actor_id=v_actor where operation_id=v_op.operation_id returning * into v_op;
   end if;
   return to_jsonb(v_op);
  end if;
  raise exception 'RESOLUTION_PENDING' using errcode='40001';
 end if;
 if p_operation is null or p_mode not in('rehire','new_person') or p_mode is null or jsonb_typeof(p_input) is distinct from 'object' or coalesce(length(v_email),0) not between 3 and 254 or coalesce(length(btrim(p_input->>'full_name')),0) not between 1 and 250
  or v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then raise exception 'INVALID_RESOLUTION' using errcode='22023';end if;
 select * into v_old from public.berry_profiles where id=p_previous for update;
 if not found or v_old.access_revision<>p_expected then raise exception 'ACCESS_REVISION_CONFLICT' using errcode='40001';end if;
 if lower(v_old.contact_email)<>v_email and berry_private.account_name(v_old.full_name)<>berry_private.account_name(p_input->>'full_name') then raise exception 'RESOLUTION_NOT_MATCHED' using errcode='22023';end if;
 if exists(select 1 from public.berry_profiles p where lower(p.email)=v_email and p.deleted_at is null) then raise exception 'EMAIL_IN_USE' using errcode='23505';end if;
 if exists(select 1 from public.berry_profiles p where lower(p.email)=v_email and p.id<>p_previous) then raise exception 'RESOLUTION_EMAIL_MISMATCH' using errcode='23505';end if;
 if p_mode='rehire' then
  if v_old.deleted_at is null or exists(select 1 from public.berry_profiles p where p.person_id=v_old.person_id and p.deleted_at is null) then raise exception 'PERSON_ALREADY_ACTIVE' using errcode='22023';end if;
  v_person:=v_old.person_id;
 else v_person:=gen_random_uuid();end if;
 v_archive:=p_mode='rehire' or lower(v_old.email)=v_email;
 if v_archive and v_old.deleted_at is null then raise exception 'ACCOUNT_NOT_DELETED' using errcode='22023';end if;
 insert into berry_private.account_resolutions(operation_id,actor_id,previous_id,person_id,mode,input,expected_revision,needs_archive,archive_email)
  values(p_operation,v_actor,p_previous,v_person,p_mode,p_input,v_old.access_revision,v_archive,v_old.id::text||'@retired.berry-safety.invalid') returning * into v_op;
 return to_jsonb(v_op);
end $$;

create or replace function public.berry_release_resolution_email(p_operation uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_actor uuid:=berry_private.require_admin();v_op berry_private.account_resolutions;v_old public.berry_profiles;
begin
 perform 1 from berry_private.admin_serialization where singleton for update;v_actor:=berry_private.require_admin();
 select * into v_op from berry_private.account_resolutions where operation_id=p_operation and actor_id=v_actor for update;
 if not found then raise exception 'RESOLUTION_NOT_FOUND' using errcode='42501';end if;
 if v_op.released_at is not null or not v_op.needs_archive then return to_jsonb(v_op);end if;
 select * into v_old from public.berry_profiles where id=v_op.previous_id for update;
 if v_old.deleted_at is null or v_old.access_revision<>v_op.expected_revision then raise exception 'ACCESS_REVISION_CONFLICT' using errcode='40001';end if;
 if not exists(select 1 from auth.users u where u.id=v_old.id and lower(u.email)=v_op.archive_email and u.raw_app_meta_data->>'berry_retired_operation'=p_operation::text) then raise exception 'AUTH_RETIREMENT_NOT_CONFIRMED' using errcode='42501';end if;
 update berry_private.account_requests set email=v_op.archive_email where email=v_old.email and user_id=v_old.id;
 update public.berry_profiles set email=v_op.archive_email,login_retired_at=clock_timestamp(),credentials_valid_after=floor(extract(epoch from clock_timestamp()))::bigint,access_revision=access_revision+1 where id=v_old.id;
 update berry_private.account_resolutions set released_at=clock_timestamp(),expected_revision=expected_revision+1 where operation_id=p_operation returning * into v_op;
 return to_jsonb(v_op);
end $$;

create or replace function public.berry_finish_account_resolution(p_operation uuid,p_user_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_actor uuid:=berry_private.require_admin();v_op berry_private.account_resolutions;v_profile public.berry_profiles;
begin
 perform 1 from berry_private.admin_serialization where singleton for update;v_actor:=berry_private.require_admin();
 select * into v_op from berry_private.account_resolutions where operation_id=p_operation and actor_id=v_actor for update;
 if not found then raise exception 'RESOLUTION_NOT_FOUND' using errcode='42501';end if;
 if v_op.completed_at is not null then
  if v_op.new_user_id<>p_user_id then raise exception 'RESOLUTION_CONFLICT' using errcode='40001';end if;
  return(select to_jsonb(p)-'credentials_valid_after' from public.berry_profiles p where id=p_user_id);
 end if;
 if v_op.mode='restore' or p_user_id=v_op.previous_id or (v_op.needs_archive and v_op.released_at is null)
  or not exists(select 1 from berry_private.account_requests r join auth.users u on u.id=r.user_id where r.request_id=p_operation and r.actor_id=v_actor and r.user_id=p_user_id and r.completed_at is not null and u.raw_app_meta_data->>'berry_request_id'=p_operation::text)
 then raise exception 'RESOLUTION_NOT_CONFIRMED' using errcode='42501';end if;
 update public.berry_profiles set person_id=v_op.person_id,contact_email=v_op.input->>'email' where id=p_user_id and deleted_at is null returning * into v_profile;
 if not found then raise exception 'ACCOUNT_NOT_FOUND' using errcode='42501';end if;
 update berry_private.account_resolutions set new_user_id=p_user_id,completed_at=clock_timestamp() where operation_id=p_operation;
 return to_jsonb(v_profile)-'credentials_valid_after';
end $$;

create or replace function public.berry_begin_account_restore(p_operation uuid,p_previous uuid,p_expected bigint,p_input jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_actor uuid:=berry_private.require_admin();v_old public.berry_profiles;v_op berry_private.account_resolutions;
begin
 perform 1 from berry_private.admin_serialization where singleton for update;v_actor:=berry_private.require_admin();
 select * into v_op from berry_private.account_resolutions where operation_id=p_operation for update;
 if found then
  if v_op.cancelled_at is not null then raise exception 'RESTORE_EXPIRED' using errcode='22023';end if;
  if v_op.actor_id<>v_actor or v_op.previous_id<>p_previous or v_op.mode<>'restore' or v_op.input<>p_input then raise exception 'RESOLUTION_CONFLICT' using errcode='40001';end if;
  return to_jsonb(v_op);
 end if;
 select * into v_op from berry_private.account_resolutions where completed_at is null and cancelled_at is null and input->>'email'=lower(btrim(p_input->>'email')) for update;
 if found then
  if v_op.previous_id=p_previous and v_op.mode='restore' and v_op.input=p_input then
   if v_op.actor_id<>v_actor then
    insert into public.berry_audit(actor_id,entity_type,entity_id,action,before_data,after_data) values(v_actor,'account_resolutions',v_op.operation_id::text,'resume',jsonb_build_object('actor_id',v_op.actor_id),jsonb_build_object('actor_id',v_actor));
    update berry_private.account_resolutions set actor_id=v_actor where operation_id=v_op.operation_id returning * into v_op;
   end if;
   return to_jsonb(v_op);
  end if;
  raise exception 'RESOLUTION_PENDING' using errcode='40001';
 end if;
 select * into v_old from public.berry_profiles where id=p_previous for update;
 if not found or v_old.access_revision<>p_expected then raise exception 'ACCESS_REVISION_CONFLICT' using errcode='40001';end if;
 if v_old.deleted_at is null or now()>berry_private.account_restore_until(v_old.deleted_at) then raise exception 'RESTORE_EXPIRED' using errcode='22023';end if;
 if v_old.login_retired_at is not null or exists(select 1 from public.berry_profiles p where p.person_id=v_old.person_id and p.deleted_at is null) then raise exception 'ACCOUNT_ALREADY_REPLACED' using errcode='22023';end if;
 if lower(btrim(p_input->>'email'))<>lower(v_old.contact_email) or v_old.email<>v_old.contact_email then raise exception 'RESTORE_EMAIL_MISMATCH' using errcode='22023';end if;
 insert into berry_private.account_resolutions(operation_id,actor_id,previous_id,person_id,mode,input,expected_revision,needs_archive,archive_email)
  values(p_operation,v_actor,p_previous,v_old.person_id,'restore',p_input,v_old.access_revision,false,v_old.id::text||'@retired.berry-safety.invalid') returning * into v_op;
 return to_jsonb(v_op);
end $$;
create or replace function public.berry_finish_account_restore(p_operation uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_actor uuid:=berry_private.require_admin();v_old public.berry_profiles;v_op berry_private.account_resolutions;v_allowed uuid[];v_role text;v_create boolean;v_receive boolean;
begin
 perform 1 from berry_private.admin_serialization where singleton for update;v_actor:=berry_private.require_admin();
 select * into v_op from berry_private.account_resolutions where operation_id=p_operation and actor_id=v_actor and mode='restore' for update;
 if not found then raise exception 'RESOLUTION_NOT_FOUND' using errcode='42501';end if;
 if v_op.cancelled_at is not null then raise exception 'RESTORE_EXPIRED' using errcode='22023';end if;
 select * into v_old from public.berry_profiles where id=v_op.previous_id for update;
 if v_op.completed_at is not null then return to_jsonb(v_old)-'credentials_valid_after';end if;
 if v_old.deleted_at is null or now()>berry_private.account_restore_until(v_old.deleted_at) then raise exception 'RESTORE_EXPIRED' using errcode='22023';end if;
 if v_old.access_revision<>v_op.expected_revision or v_old.login_retired_at is not null then raise exception 'ACCESS_REVISION_CONFLICT' using errcode='40001';end if;
 if not exists(select 1 from auth.users u where u.id=v_old.id and lower(u.email)=v_old.contact_email and u.raw_app_meta_data->>'berry_restore_operation'=p_operation::text) then raise exception 'AUTH_RESTORE_NOT_CONFIRMED' using errcode='42501';end if;
 select coalesce(array_agg(i.id),'{}'::uuid[]) into v_allowed from public.berry_inspections i
  where i.deleted_at is null and i.created_at<=v_old.deleted_at and (i.closed_at is null or i.closed_at>v_old.deleted_at)
   and (v_old.history_access_from is null or i.created_at>=v_old.history_access_from or exists(select 1 from berry_private.restored_pending_access a where a.user_id=v_old.id and a.inspection_id=i.id))
   and (i.author_id=v_old.id or (i.sent_at<=v_old.deleted_at and exists(select 1 from public.berry_recipients r where r.inspection_id=i.id and r.user_id=v_old.id and r.assigned_at<=v_old.deleted_at)));
 delete from berry_private.restored_pending_access where user_id=v_old.id;
 insert into berry_private.restored_pending_access(user_id,inspection_id) select v_old.id,unnest(v_allowed);
 v_role:=case when v_old.deleted_access->>'role'='admin' then 'admin' else 'inspector' end;
 v_create:=v_role='admin' or coalesce((v_old.deleted_access->>'can_create_inspections')::boolean,false);
 v_receive:=v_role='admin' or coalesce((v_old.deleted_access->>'can_receive_inspections')::boolean,false);
 update public.berry_profiles set enabled=true,deleted_at=null,role=v_role,can_create_inspections=v_create,can_receive_inspections=v_receive,must_change_password=true,
  history_access_from=clock_timestamp(),credentials_valid_after=floor(extract(epoch from clock_timestamp()))::bigint,access_revision=access_revision+1 where id=v_old.id returning * into v_old;
 update berry_private.account_resolutions set new_user_id=v_old.id,completed_at=clock_timestamp() where operation_id=p_operation;
 return to_jsonb(v_old)-'credentials_valid_after';
end $$;

create or replace function berry_private.dashboard_identity_links(p_data jsonb,p_author uuid)
returns jsonb language sql stable security definer set search_path='' as $$
 with ids as(select p_author::text as id union select coalesce(v->>'personId',v->>'id') from jsonb_array_elements(coalesce(p_data->'responsibles','[]')) v
  union select coalesce(v->>'personId',v->>'id') from jsonb_array_elements(coalesce(p_data->'additionalInspectors','[]')) v)
 select coalesce(jsonb_object_agg(p.id::text,jsonb_build_object('personId',p.person_id,'name',c.full_name,'email',c.contact_email,'management',c.management,'area',c.area,'current',c.deleted_at is null,'createdAt',c.created_at)),'{}')
 from public.berry_profiles p join ids on ids.id=p.id::text cross join lateral(select x.* from public.berry_profiles x where x.person_id=p.person_id order by (x.deleted_at is null) desc,x.created_at desc,x.id limit 1) c;
$$;
revoke all on function berry_private.dashboard_identity_links(jsonb,uuid) from public,anon,authenticated;
create or replace function public.berry_admin_dashboard()
returns jsonb language plpgsql stable security definer set search_path='' as $$ begin
 perform berry_private.require_admin();
 return(select coalesce(jsonb_agg((to_jsonb(i)-'data')||jsonb_build_object('data',berry_private.dashboard_text(i.data),'identityLinks',berry_private.dashboard_identity_links(i.data,i.author_id)) order by i.data->>'date' desc,i.code desc),'[]')
  from public.berry_inspections i where i.deleted_at is null and i.code is not null and i.workflow in('sent','closed') and coalesce((i.data->>'partial')::boolean,false)=false);
end $$;
revoke all on function public.berry_account_matches(text,text),public.berry_begin_account_resolution(uuid,uuid,bigint,text,jsonb),public.berry_release_resolution_email(uuid),public.berry_finish_account_resolution(uuid,uuid) from public,anon,authenticated;
grant execute on function public.berry_account_matches(text,text),public.berry_begin_account_resolution(uuid,uuid,bigint,text,jsonb),public.berry_release_resolution_email(uuid),public.berry_finish_account_resolution(uuid,uuid) to authenticated;
revoke all on function public.berry_begin_account_restore(uuid,uuid,bigint,jsonb),public.berry_finish_account_restore(uuid) from public,anon,authenticated;
grant execute on function public.berry_begin_account_restore(uuid,uuid,bigint,jsonb),public.berry_finish_account_restore(uuid) to authenticated;
create or replace function public.berry_schema_status() returns jsonb language sql stable set search_path='' as $$
 select jsonb_build_object('schema_version','202611070001','accounts_version','202611070002','reports_version','202611080003','final_archive_version','202611080004','permissions_version','202611080005','storage_version','202611080006','dashboard_version','202611080007','registration_version','202611090008','correction_identity_version','202611090009','admin_edit_version','202611090010','account_copies_version','202611090011','next_registration_version','202611090012','organization_catalog_version','202611150014','account_identity_version','202611150015','stage','reports','sync_ready',true);
$$;
notify pgrst,'reload schema';
commit;
