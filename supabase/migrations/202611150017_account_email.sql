-- Berry Safety · Paso 17: cambio administrativo de correo con identidad estable.
-- Requiere el paso 16 y la API de cuentas actualizada. No cambia contraseñas ni informes.
begin;
do $$ begin
 if public.berry_schema_status()->>'area_nomenclature_version' is distinct from '202611150016' then
  raise exception 'Primero instale el paso 16 de abreviaturas' using errcode='55000';
 end if;
end $$;
create table if not exists berry_private.account_email_operations(
 operation_id uuid primary key,
 actor_id uuid not null references auth.users(id),
 user_id uuid not null references auth.users(id),
 expected_revision bigint not null,
 actor_credentials bigint not null,
 previous_email text not null,
 email text not null,
 created_at timestamptz not null default clock_timestamp(),
 expires_at timestamptz not null default clock_timestamp()+interval '10 minutes',
 completed_at timestamptz,
 cancelled_at timestamptz
);
alter table berry_private.account_email_operations enable row level security;
revoke all on berry_private.account_email_operations from public,anon,authenticated;
create unique index if not exists berry_email_user_pending on berry_private.account_email_operations(user_id) where completed_at is null and cancelled_at is null;
create unique index if not exists berry_email_address_pending on berry_private.account_email_operations(email) where completed_at is null and cancelled_at is null;

create or replace function public.berry_begin_account_email(p_operation uuid,p_id uuid,p_expected bigint,p_email text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_actor uuid:=berry_private.require_admin();v_old public.berry_profiles;v_op berry_private.account_email_operations;v_email text:=lower(btrim(p_email));
begin
 perform 1 from berry_private.admin_serialization where singleton for update;
 v_actor:=berry_private.require_admin();
 if p_operation is null or p_id is null or p_expected is null or p_expected<1 or v_email is null or length(v_email) not between 3 and 254 or v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then raise exception 'INVALID_EMAIL' using errcode='22023';end if;
 update berry_private.account_email_operations o set cancelled_at=clock_timestamp() where o.completed_at is null and o.cancelled_at is null and (o.expires_at<=clock_timestamp()
  or exists(select 1 from public.berry_profiles p where p.id=o.user_id and (p.deleted_at is not null or p.access_revision<>o.expected_revision))
  or exists(select 1 from public.berry_profiles p where p.id=o.actor_id and (not p.enabled or p.deleted_at is not null or p.must_change_password or p.role<>'admin' or p.credentials_valid_after<>o.actor_credentials)));
 select * into v_op from berry_private.account_email_operations where operation_id=p_operation for update;
 if found then
  if v_op.actor_id<>v_actor or v_op.user_id<>p_id or v_op.email<>v_email or v_op.expected_revision<>p_expected then raise exception 'EMAIL_OPERATION_CONFLICT' using errcode='40001';end if;
  if v_op.cancelled_at is not null then raise exception 'EMAIL_OPERATION_EXPIRED' using errcode='22023';end if;
  select * into v_old from public.berry_profiles where id=p_id;
  return to_jsonb(v_op)||jsonb_build_object('account',to_jsonb(v_old));
 end if;
 select * into v_old from public.berry_profiles where id=p_id for update;
 if not found or v_old.deleted_at is not null then raise exception 'ACCOUNT_NOT_AVAILABLE' using errcode='22023';end if;
 if v_old.access_revision<>p_expected then raise exception 'ACCESS_REVISION_CONFLICT' using errcode='40001';end if;
 if exists(select 1 from berry_private.account_resolutions where previous_id=p_id and completed_at is null and cancelled_at is null) then raise exception 'RESOLUTION_PENDING' using errcode='40001';end if;
 if exists(select 1 from public.berry_profiles where lower(email)=v_email and id<>p_id)
  or exists(select 1 from auth.users where lower(email)=v_email and id<>p_id)
  or exists(select 1 from berry_private.account_requests where email=v_email and completed_at is null and user_id is distinct from p_id)
  or exists(select 1 from berry_private.account_resolutions where input->>'email'=v_email and completed_at is null and cancelled_at is null)
  then raise exception 'EMAIL_IN_USE' using errcode='23505';end if;
 select * into v_op from berry_private.account_email_operations where user_id=p_id and completed_at is null and cancelled_at is null for update;
 if found then
  if v_op.actor_id=v_actor and v_op.email=v_email and v_op.expected_revision=p_expected then return to_jsonb(v_op)||jsonb_build_object('account',to_jsonb(v_old));end if;
  raise exception 'EMAIL_OPERATION_PENDING' using errcode='40001';
 end if;
 insert into berry_private.account_email_operations(operation_id,actor_id,user_id,expected_revision,actor_credentials,previous_email,email,completed_at)
  values(p_operation,v_actor,p_id,p_expected,(select credentials_valid_after from public.berry_profiles where id=v_actor),v_old.email,v_email,case when v_old.email=v_email then clock_timestamp() end) returning * into v_op;
 return to_jsonb(v_op)||jsonb_build_object('account',to_jsonb(v_old));
end $$;

-- Auth's supported Admin API updates auth.users. Its trigger synchronizes the
-- profile and commits the operation in that SAME transaction, or rejects both.
create or replace function berry_private.apply_account_email()
returns trigger language plpgsql security definer set search_path='' as $$
declare v_op berry_private.account_email_operations;v_old public.berry_profiles;v_actor public.berry_profiles;v_email text:=lower(btrim(new.email));
begin
 if exists(select 1 from berry_private.account_email_operations where email=v_email and user_id<>new.id and completed_at is null and cancelled_at is null and expires_at>clock_timestamp()) then raise exception 'EMAIL_RESERVED' using errcode='23505';end if;
 if tg_op='INSERT' then return new;end if;
 if new.email is not distinct from old.email then return new;end if;
 perform 1 from berry_private.admin_serialization where singleton for update;
 -- The authorized reservation binds the change even if Auth writes email and
 -- app metadata in separate statements. Browser metadata grants no authority.
 select * into v_op from berry_private.account_email_operations where user_id=new.id and email=v_email and completed_at is null order by created_at desc limit 1 for update;
 if not found then return new;end if;
 if v_op.user_id<>new.id or v_op.email<>v_email or v_op.completed_at is not null or v_op.cancelled_at is not null or v_op.expires_at<=clock_timestamp() then raise exception 'INVALID_EMAIL_OPERATION' using errcode='22023';end if;
 select * into v_actor from public.berry_profiles where id=v_op.actor_id;
 if not found or not v_actor.enabled or v_actor.deleted_at is not null or v_actor.must_change_password or v_actor.role<>'admin' or v_actor.credentials_valid_after<>v_op.actor_credentials then raise exception 'ADMIN_REQUIRED' using errcode='42501';end if;
 select * into v_old from public.berry_profiles where id=new.id for update;
 if not found or v_old.deleted_at is not null or v_old.access_revision<>v_op.expected_revision or v_old.email<>v_op.previous_email or lower(old.email)<>v_op.previous_email then raise exception 'ACCESS_REVISION_CONFLICT' using errcode='40001';end if;
 if exists(select 1 from berry_private.account_resolutions where previous_id=new.id and completed_at is null and cancelled_at is null) then raise exception 'RESOLUTION_PENDING' using errcode='40001';end if;
 if exists(select 1 from berry_private.account_requests where email=v_email and completed_at is null and user_id is distinct from new.id)
  or exists(select 1 from berry_private.account_resolutions where input->>'email'=v_email and completed_at is null and cancelled_at is null) then raise exception 'EMAIL_IN_USE' using errcode='23505';end if;
 update public.berry_profiles set email=v_email,contact_email=v_email,access_revision=access_revision+1 where id=new.id;
 -- A completed original invitation must not permanently reserve the old address.
 -- Keep its request ID and original input for traceability and fail closed on old retries.
 update berry_private.account_requests set email=request_id::text||'@fulfilled.berry-safety.invalid' where user_id=new.id and completed_at is not null and email=v_old.email;
 update berry_private.account_email_operations set completed_at=clock_timestamp() where operation_id=v_op.operation_id;
 insert into public.berry_audit(actor_id,entity_type,entity_id,action,before_data,after_data)
  values(v_op.actor_id,'account_email',new.id::text,'update',jsonb_build_object('email',v_old.email,'operation_id',v_op.operation_id),jsonb_build_object('email',v_email,'operation_id',v_op.operation_id));
 return new;
end $$;
revoke all on function berry_private.apply_account_email() from public,anon,authenticated;
drop trigger if exists berry_apply_account_email on auth.users;
create trigger berry_apply_account_email before insert or update of email,raw_app_meta_data on auth.users for each row execute function berry_private.apply_account_email();
revoke all on function public.berry_begin_account_email(uuid,uuid,bigint,text) from public,anon,authenticated;
grant execute on function public.berry_begin_account_email(uuid,uuid,bigint,text) to authenticated;
create or replace function public.berry_schema_status() returns jsonb language sql stable set search_path='' as $$
 select jsonb_build_object('schema_version','202611070001','accounts_version','202611070002','reports_version','202611080003','final_archive_version','202611080004','permissions_version','202611080005','storage_version','202611080006','dashboard_version','202611080007','registration_version','202611090008','correction_identity_version','202611090009','admin_edit_version','202611090010','account_copies_version','202611090011','next_registration_version','202611090012','organization_catalog_version','202611150014','account_identity_version','202611150015','area_nomenclature_version','202611150016','account_email_version','202611150017','stage','reports','sync_ready',true);
$$;
notify pgrst,'reload schema';
commit;
