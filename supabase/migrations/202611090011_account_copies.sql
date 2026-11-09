-- Berry Safety · Paso 11: editar Administradores (CC) en Gestión de Usuarios.
-- Requiere el paso 10. Conserva usuarios, permisos, inspecciones y numeración.
begin;
do $$ begin
 if public.berry_schema_status()->>'next_registration_version' is not null then raise exception 'No repita el paso 11 después de instalar el paso 12' using errcode='55000';end if;
 if public.berry_schema_status()->>'admin_edit_version' is distinct from '202611090010' then
  raise exception 'Primero instale el paso 10' using errcode='55000';end if;
end $$;
create or replace function public.berry_manage_account(p_id uuid,p_expected bigint,p_action text,p_permissions jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_actor uuid:=berry_private.require_admin(); v_target public.berry_profiles; v_enabled boolean; v_role text; v_create boolean; v_receive boolean; v_copies text[];
begin
  perform 1 from berry_private.admin_serialization where singleton for update;
  v_actor:=berry_private.require_admin();
  select * into v_target from public.berry_profiles where id=p_id and deleted_at is null for update;
  if not found then raise exception 'ACCOUNT_NOT_FOUND' using errcode='22023'; end if;
  if v_target.access_revision is distinct from p_expected then raise exception 'ACCESS_REVISION_CONFLICT' using errcode='40001'; end if;
  if p_action not in('update','delete') then raise exception 'INVALID_ACTION' using errcode='22023'; end if;
  v_copies:=v_target.supervisor_emails;
  if p_action='delete' then
    v_enabled:=false;v_role:=v_target.role;v_create:=false;v_receive:=false;
  else
    if jsonb_typeof(p_permissions) is distinct from 'object' or (p_permissions-array['enabled','role','can_create_inspections','can_receive_inspections','supervisor_emails'])<>'{}'::jsonb
      or jsonb_typeof(p_permissions->'enabled') is distinct from 'boolean' or jsonb_typeof(p_permissions->'can_create_inspections') is distinct from 'boolean'
      or jsonb_typeof(p_permissions->'can_receive_inspections') is distinct from 'boolean' or coalesce(p_permissions->>'role','') not in('admin','inspector') then raise exception 'INVALID_PERMISSIONS' using errcode='22023'; end if;
    v_enabled:=(p_permissions->>'enabled')::boolean;v_role:=p_permissions->>'role';
    v_create:=(p_permissions->>'can_create_inspections')::boolean;v_receive:=(p_permissions->>'can_receive_inspections')::boolean;
    if v_role='admin' then v_create:=true;v_receive:=true;end if;
    if p_permissions ? 'supervisor_emails' then
      if jsonb_typeof(p_permissions->'supervisor_emails') is distinct from 'array' then raise exception 'INVALID_COPIES' using errcode='22023';end if;
      if jsonb_array_length(p_permissions->'supervisor_emails')>50 or exists(
        select 1 from jsonb_array_elements(p_permissions->'supervisor_emails') e where jsonb_typeof(e) is distinct from 'string' or length(btrim(e#>>'{}'))>254 or btrim(e#>>'{}') !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
      ) then raise exception 'INVALID_COPIES' using errcode='22023';end if;
      select coalesce(array_agg(email order by position),'{}') into v_copies from (
        select lower(btrim(value#>>'{}')) email,min(ordinality) position from jsonb_array_elements(p_permissions->'supervisor_emails') with ordinality group by 1
      ) normalized;
    end if;
  end if;
  if p_id=v_actor and (not v_enabled or p_action='delete') then raise exception 'CANNOT_DISABLE_SELF' using errcode='22023'; end if;
  if v_target.role='admin' and v_target.enabled and not v_target.must_change_password and (not v_enabled or v_role<>'admin' or p_action='delete')
    and not exists(select 1 from public.berry_profiles p where p.id<>p_id and p.role='admin' and p.enabled and p.deleted_at is null and not p.must_change_password) then
    raise exception 'LAST_ADMIN_REQUIRED' using errcode='22023';
  end if;
  update public.berry_profiles set enabled=v_enabled,role=v_role,can_create_inspections=v_create,can_receive_inspections=v_receive,supervisor_emails=v_copies,
    deleted_at=case when p_action='delete' then clock_timestamp() else null end,access_revision=access_revision+1,
    credentials_valid_after=case when not v_enabled then floor(extract(epoch from clock_timestamp()))::bigint else credentials_valid_after end
    where id=p_id returning * into v_target;
  return to_jsonb(v_target)-'credentials_valid_after';
end $$;
revoke all on function public.berry_manage_account(uuid,bigint,text,jsonb) from public,anon,authenticated;
grant execute on function public.berry_manage_account(uuid,bigint,text,jsonb) to authenticated;
create or replace function public.berry_schema_status()returns jsonb language sql stable set search_path='' as $$
 select jsonb_build_object('schema_version','202611070001','accounts_version','202611070002','reports_version','202611080003','final_archive_version','202611080004','permissions_version','202611080005','storage_version','202611080006','dashboard_version','202611080007','registration_version','202611090008','correction_identity_version','202611090009','admin_edit_version','202611090010','account_copies_version','202611090011','stage','reports','sync_ready',true);
$$;
notify pgrst,'reload schema';
commit;
SELECT public.berry_schema_status();
