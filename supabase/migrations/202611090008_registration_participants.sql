-- Berry Safety · Paso 8: responsables de inspección y registro independientes.
-- Hasta cuatro personas por lista. No modifica informes enviados ni archivos guardados.
begin;
do $$ begin
 if to_regprocedure('public.berry_admin_dashboard()') is null then raise exception 'Primero instale el paso 7 del panel' using errcode='55000';end if;
end $$;
create or replace function berry_private.registration_participants(p_data jsonb)
returns jsonb language sql immutable strict set search_path='' as $$
 select case when p_data ? 'registrationParticipants' then p_data->'registrationParticipants'
  when p_data ? 'delivery' then coalesce(p_data->'additionalInspectors','[]'::jsonb)
  else coalesce((select jsonb_agg(p) from jsonb_array_elements(coalesce(p_data->'additionalInspectors','[]'::jsonb)) p
    where p_data#>array['registrationDetails',coalesce(p->>'personId',p->>'id'),'signature'] is not null),'[]'::jsonb) end;
$$;
revoke all on function berry_private.registration_participants(jsonb) from public,anon,authenticated;

create or replace function berry_private.clean_draft(p_id uuid, p_data jsonb)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_owner public.berry_profiles; v_value jsonb; v_obs jsonb; v_people jsonb := '[]'; v_team jsonb := '[]'; v_registrants jsonb := '[]'; v_records jsonb := '{}'; v_source_records jsonb; v_person_id text; v_job text;
begin
  select * into v_owner from public.berry_profiles where id = (select auth.uid());
  if exists(select 1 from unnest(array['company','ruc','facility','area','date','initialInspectionDate','type','otherType','inspectionTime','inspectionPeriod','objective','defaultClosingDate','unfavorableCause','closingRemarks','conclusions','recommendations','status']) k
    where p_data ? k and jsonb_typeof(p_data -> k) is distinct from 'string')
    or (p_data ? 'step' and (jsonb_typeof(p_data -> 'step')<>'number' or p_data ->> 'step' !~ '^[0-4]$')) then raise exception 'INVALID_INSPECTION_FIELDS' using errcode='22023'; end if;
  if jsonb_typeof(p_data) is distinct from 'object' or octet_length(p_data::text) > 1048576
    or jsonb_typeof(p_data -> 'observations') is distinct from 'array' or jsonb_typeof(p_data -> 'responsibles') is distinct from 'array'
    or jsonb_typeof(p_data -> 'additionalInspectors') is distinct from 'array'
    or (p_data ? 'registrationParticipants' and jsonb_typeof(p_data -> 'registrationParticipants') is distinct from 'array')
    or jsonb_array_length(p_data -> 'observations') > 100 or jsonb_array_length(p_data -> 'responsibles') > 50 or jsonb_array_length(p_data -> 'additionalInspectors') > 3 or jsonb_array_length(berry_private.registration_participants(p_data)) > 3
    or length(coalesce(p_data ->> 'objective','')) > 560 or length(coalesce(p_data ->> 'unfavorableCause','')) > 1200 or length(coalesce(p_data ->> 'closingRemarks','')) > 1200
    or length(coalesce(p_data ->> 'area','')) > 500 or length(coalesce(p_data ->> 'facility','')) > 500 then raise exception 'INVALID_INSPECTION' using errcode = '22023'; end if;
  for v_value in select value from jsonb_array_elements(p_data -> 'responsibles') loop v_people := v_people || jsonb_build_array(berry_private.report_person(v_value)); end loop;
  for v_value in select value from jsonb_array_elements(p_data -> 'additionalInspectors') loop v_team := v_team || jsonb_build_array(berry_private.report_person(v_value)); end loop;
  for v_value in select value from jsonb_array_elements(berry_private.registration_participants(p_data)) loop v_registrants := v_registrants || jsonb_build_array(berry_private.report_person(v_value)); end loop;
  -- Each list is independent, but no person may occur twice within one list.
  for v_value in select v_team union all select v_registrants loop
    if exists(select 1 from jsonb_array_elements(v_value) p where p->>'personId'=v_owner.id::text)
      or (select count(*)<>count(distinct p->>'personId') from jsonb_array_elements(v_value) p where coalesce(p->>'personId','')<>'') then
      raise exception 'DUPLICATE_PARTICIPANT' using errcode='22023';end if;
  end loop;
  for v_obs in select value from jsonb_array_elements(p_data -> 'observations') loop
    if jsonb_typeof(v_obs) is distinct from 'object' or exists(select 1 from unnest(array['id','description','correctiveAction','severity','dueDate']) k where jsonb_typeof(v_obs -> k) is distinct from 'string') then raise exception 'INVALID_OBSERVATION' using errcode='22023'; end if;
    perform (v_obs ->> 'id')::uuid;
    if coalesce(v_obs ->> 'id','') = '' or coalesce(v_obs ->> 'severity','') not in ('baja','media','alta') or length(coalesce(v_obs ->> 'description','')) > 10000 or length(coalesce(v_obs ->> 'correctiveAction','')) > 10000 then raise exception 'INVALID_OBSERVATION' using errcode = '22023'; end if;
    perform berry_private.check_photos(p_id, v_obs -> 'photos');
  end loop;
  if (select count(*) <> count(distinct value ->> 'id') from jsonb_array_elements(p_data -> 'observations')) then raise exception 'DUPLICATE_OBSERVATION' using errcode = '22023'; end if;
  v_source_records := coalesce(p_data -> 'registrationDetails', '{}'::jsonb);
  if jsonb_typeof(v_source_records) <> 'object' then raise exception 'INVALID_SIGNATURES' using errcode = '22023'; end if;
  -- Job titles are profile snapshots; clients cannot override the responsible's profile.
  for v_person_id in select v_owner.id::text union all select value ->> 'personId' from jsonb_array_elements(v_registrants) where value ->> 'personId' is not null loop
    if v_source_records ? v_person_id then
      select job_title into v_job from public.berry_profiles where id = v_person_id::uuid;
      v_value := v_source_records -> v_person_id;
      if jsonb_typeof(v_value) is distinct from 'object' or (v_value ? 'date' and jsonb_typeof(v_value -> 'date') is distinct from 'string') then raise exception 'INVALID_SIGNATURE' using errcode='22023'; end if;
      if v_value ? 'signature' then perform berry_private.check_photos(p_id, jsonb_build_array(v_value -> 'signature')); end if;
      if coalesce(v_value ->> 'date','') <> '' then perform (v_value ->> 'date')::date; end if;
      v_records := v_records || jsonb_build_object(v_person_id, v_value || jsonb_build_object('jobTitle',v_job,'initialJobTitle',v_job));
    end if;
  end loop;
  return jsonb_build_object('company','','ruc','','facility','','area','','type','','otherType','','date','','objective','','defaultClosingDate','','unfavorableCause','','closingRemarks','','conclusions','','recommendations','','inspectionTime','','inspectionPeriod','','step',0,'status','draft')
    || (p_data - array['storage','cloudRevision','serverRegistration','delivery','emailDelivery','emailCc','updatedAt','registrationNumber','legacyRegistrationNumber','partial'])
    || jsonb_build_object('id',p_id,'ownerId',v_owner.id,'inspector',v_owner.full_name,'inspectorEmail',v_owner.email,'responsibles',v_people,'additionalInspectors',v_team,'registrationParticipants',v_registrants,'registrationDetails',v_records,'registrationNumber','');
end;
$$;

create or replace function public.berry_prepare_report(p_id uuid,p_expected bigint,p_hash text)returns jsonb language plpgsql security definer set search_path='' as $$
declare v_result jsonb;v_person jsonb;begin
  perform berry_private.require_create();v_result:=berry_private.berry_prepare_report_v4(p_id,p_expected,p_hash);
  if coalesce((v_result->>'registered')::boolean,false) then return v_result;end if;
  for v_person in select value from jsonb_array_elements(v_result#>'{inspection,data,responsibles}') loop
    if not exists(select 1 from public.berry_profiles where id=(v_person->>'personId')::uuid and enabled and deleted_at is null and can_receive_inspections) then raise exception 'RECIPIENT_NOT_ALLOWED' using errcode='22023';end if;
  end loop;
  for v_person in select value from jsonb_array_elements(v_result#>'{inspection,data,additionalInspectors}') union all select value from jsonb_array_elements(berry_private.registration_participants(v_result#>'{inspection,data}')) loop
    if not exists(select 1 from public.berry_profiles where id=(v_person->>'personId')::uuid and enabled and deleted_at is null and can_create_inspections and full_name<>'') then raise exception 'INSPECTOR_NOT_ALLOWED' using errcode='22023';end if;
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
  for v_person in select value from jsonb_array_elements(v_data->'additionalInspectors') union all select value from jsonb_array_elements(berry_private.registration_participants(v_data)) loop
    perform 1 from public.berry_profiles where id=(v_person->>'personId')::uuid for share;
    if coalesce(v_person->>'personId','')='' or not exists(select 1 from public.berry_profiles where id=(v_person->>'personId')::uuid and enabled and deleted_at is null and can_create_inspections and full_name<>'') then raise exception 'INSPECTOR_NOT_ALLOWED' using errcode='22023';end if;
  end loop;
  return berry_private.berry_commit_report_v4(p_operation,p_actor,p_actor_iat,p_document);
end $$;

create or replace function public.berry_schema_status()returns jsonb language sql stable set search_path='' as $$
 select jsonb_build_object('schema_version','202611070001','accounts_version','202611070002','reports_version','202611080003','final_archive_version','202611080004','permissions_version','202611080005','storage_version','202611080006','dashboard_version','202611080007','registration_version','202611090008','stage','reports','sync_ready',true);
$$;
notify pgrst,'reload schema';
commit;
