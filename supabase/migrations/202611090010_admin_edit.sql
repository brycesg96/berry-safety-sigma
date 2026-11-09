-- Berry Safety · Paso 10: edición administrativa de informes abiertos y reemplazo del Excel.
-- Requiere el paso 9. Conserva autoría, correlativo, avances y auditoría.
begin;
do $$ begin
 if public.berry_schema_status()->>'correction_identity_version' is distinct from '202611090009' then
  raise exception 'Primero instale el paso 9' using errcode='55000';end if;
end $$;
create table if not exists berry_private.admin_edits(
 operation_id uuid primary key,inspection_id uuid not null references public.berry_inspections(id),actor_id uuid not null references public.berry_profiles(id),
 base_revision bigint not null,input_data jsonb not null,content jsonb not null,state text not null default 'prepared' check(state in('prepared','committed','complete')),
 created_at timestamptz not null default now(),expires_at timestamptz not null default(now()+interval '30 minutes')
);
alter table berry_private.admin_edits enable row level security;
revoke all on berry_private.admin_edits from public,anon,authenticated;
alter table public.berry_inspections add column if not exists active_edit_operation uuid;
-- A structured location is optional for historical reports. When supplied, the
-- archive/export area is always composed on the server from validated choices.
create or replace function berry_private.location_area(p_location jsonb)
returns text language plpgsql immutable set search_path='' as $$
declare v_zones jsonb;begin
 if jsonb_typeof(p_location) is distinct from 'object' or exists(select 1 from unnest(array['site','zone','detail']) k where jsonb_typeof(p_location->k) is distinct from 'string') or length(p_location->>'detail')>250 then raise exception 'INVALID_LOCATION' using errcode='22023';end if;
 v_zones:=jsonb_build_object('Fundo',jsonb_build_array('Armonía I','Armonía II','Armonía III','Armonía IV','Esperanza I','Esperanza II','Esperanza III','Ilusión I','Ilusión II','Remanso I','Remanso II','San Luis','Tumi'),'Exteriores',jsonb_build_array('Chao','Otros','Semillero'),'Packing Chao',jsonb_build_array('Packing Chao'),'Packing Salaverry',jsonb_build_array('Packing Salaverry'),'Trujillo',jsonb_build_array('Quintanas'));
 if coalesce(p_location->>'site','')<>'' and not(v_zones ? (p_location->>'site')) then raise exception 'INVALID_LOCATION' using errcode='22023';end if;
 if coalesce(p_location->>'zone','')<>'' and not coalesce((v_zones->(p_location->>'site')) ? (p_location->>'zone'),false) then raise exception 'INVALID_LOCATION' using errcode='22023';end if;
 return concat_ws(' – ',nullif(p_location->>'site',''),nullif(p_location->>'zone',''),nullif(btrim(p_location->>'detail'),''));
end $$;
revoke all on function berry_private.location_area(jsonb) from public,anon,authenticated;

create or replace function berry_private.require_location(p_data jsonb)
returns void language plpgsql immutable set search_path='' as $$ begin
 if p_data ? 'areaLocation' then
  perform berry_private.location_area(p_data->'areaLocation');
  if coalesce(p_data#>>'{areaLocation,site}','')='' or coalesce(p_data#>>'{areaLocation,zone}','')='' or btrim(coalesce(p_data#>>'{areaLocation,detail}',''))='' then raise exception 'INCOMPLETE_LOCATION' using errcode='22023';end if;
 end if;
end $$;
revoke all on function berry_private.require_location(jsonb) from public,anon,authenticated;

create or replace function berry_private.clean_report_for_owner(p_id uuid, p_data jsonb, p_owner uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_owner public.berry_profiles; v_value jsonb; v_obs jsonb; v_people jsonb := '[]'; v_team jsonb := '[]'; v_registrants jsonb := '[]'; v_records jsonb := '{}'; v_source_records jsonb; v_person_id text; v_job text;
begin
  select * into v_owner from public.berry_profiles where id = p_owner;
  if p_data ? 'areaLocation' then p_data:=p_data||jsonb_build_object('area',berry_private.location_area(p_data->'areaLocation'));end if;
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
create or replace function berry_private.clean_draft(p_id uuid,p_data jsonb)
returns jsonb language sql stable security definer set search_path='' as $$
 select berry_private.clean_report_for_owner(p_id,p_data,(select auth.uid()));
$$;
revoke all on function berry_private.clean_report_for_owner(uuid,jsonb,uuid) from public,anon,authenticated;

-- Shared validation is repeated at commit so a later account deactivation cannot
-- slip through a prepared edit. It never reserves or consumes a report number.
create or replace function berry_private.validate_admin_content(p_data jsonb)
returns void language plpgsql stable security definer set search_path='' as $$
declare v_person jsonb;v_obs jsonb;begin
 perform berry_private.require_location(p_data);
 if btrim(coalesce(p_data->>'area',''))='' or btrim(coalesce(p_data->>'objective',''))='' or btrim(coalesce(p_data->>'closingRemarks',''))=''
  or coalesce(p_data->>'type','') not in('Planeada','No planeada','Otro') or (p_data->>'type'='Otro' and btrim(coalesce(p_data->>'otherType',''))='')
  or coalesce(p_data->>'inspectionPeriod','') not in('AM','PM') or coalesce(p_data->>'inspectionTime','') !~ '^(0[1-9]|1[0-2]):[0-5][0-9]$'
  or coalesce(p_data->>'date','') !~ '^[1-9][0-9]{3}-[0-9]{2}-[0-9]{2}$' or jsonb_array_length(p_data->'observations')=0 or jsonb_array_length(p_data->'responsibles')=0 then
  raise exception 'INCOMPLETE_INSPECTION' using errcode='22023';end if;
 perform(p_data->>'date')::date;
 if (select count(*)<>count(distinct value->>'personId') from jsonb_array_elements(p_data->'responsibles')) then raise exception 'DUPLICATE_RECIPIENT' using errcode='22023';end if;
 for v_person in select value from jsonb_array_elements(p_data->'responsibles') loop
  if not exists(select 1 from public.berry_profiles where id=(v_person->>'personId')::uuid and enabled and deleted_at is null and can_receive_inspections and full_name<>'') then raise exception 'RECIPIENT_NOT_ALLOWED' using errcode='22023';end if;
 end loop;
 for v_person in select value from jsonb_array_elements(p_data->'additionalInspectors') union all select value from jsonb_array_elements(p_data->'registrationParticipants') loop
  if not exists(select 1 from public.berry_profiles where id=(v_person->>'personId')::uuid and enabled and deleted_at is null and can_create_inspections and full_name<>'') then raise exception 'INSPECTOR_NOT_ALLOWED' using errcode='22023';end if;
 end loop;
 for v_obs in select value from jsonb_array_elements(p_data->'observations') loop
  if btrim(coalesce(v_obs->>'description',''))='' or btrim(coalesce(v_obs->>'correctiveAction',''))='' or coalesce(v_obs->>'dueDate','')='' then raise exception 'INCOMPLETE_OBSERVATION' using errcode='22023';end if;
  perform(v_obs->>'dueDate')::date;
 end loop;
end $$;
revoke all on function berry_private.validate_admin_content(jsonb) from public,anon,authenticated;

create or replace function public.berry_prepare_admin_edit(p_id uuid,p_expected bigint,p_data jsonb,p_operation uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_actor uuid:=berry_private.require_admin();v_row public.berry_inspections;v_edit berry_private.admin_edits;v_data jsonb;v_input jsonb;v_obs jsonb;v_old jsonb;v_correction jsonb;v_corrections jsonb:='{}';v_recipients uuid[];begin
 select * into v_edit from berry_private.admin_edits where operation_id=p_operation;
 if found then
  if v_edit.actor_id<>v_actor or v_edit.inspection_id<>p_id then raise exception 'EDIT_NOT_ALLOWED' using errcode='42501';end if;
  if v_edit.base_revision is distinct from p_expected or v_edit.input_data is distinct from p_data then raise exception 'EDIT_CONTENT_CHANGED' using errcode='40001';end if;
  if v_edit.state='prepared' and v_edit.expires_at<=now() then raise exception 'EDIT_EXPIRED' using errcode='40001';end if;
  select * into v_row from public.berry_inspections where id=p_id and deleted_at is null;
  if not found then raise exception 'REPORT_NOT_AVAILABLE' using errcode='42501';end if;
  if v_edit.state='prepared' then v_row.data:=v_edit.content;end if;
  return jsonb_build_object('inspection',to_jsonb(v_row),'operation_id',p_operation,'state',v_edit.state);
 end if;
 select * into v_row from public.berry_inspections where id=p_id and deleted_at is null for update;
 if not found or v_row.workflow<>'sent' or v_row.code is null then raise exception 'REPORT_NOT_EDITABLE' using errcode='42501';end if;
 if v_row.revision is distinct from p_expected then raise exception 'REVISION_CONFLICT' using errcode='40001';end if;
 if v_row.active_edit_operation is not null then raise exception 'EDIT_CLEANUP_PENDING' using errcode='40001';end if;
 if exists(select 1 from berry_private.report_outbox where inspection_id=p_id and state='dispatching') then raise exception 'MAIL_IN_PROGRESS' using errcode='40001';end if;
 select coalesce(jsonb_object_agg(key,value),'{}') into v_input from jsonb_each(p_data) where key=any(array['company','ruc','facility','area','areaLocation','date','initialInspectionDate','type','otherType','inspectionTime','inspectionPeriod','objective','defaultClosingDate','unfavorableCause','closingRemarks','conclusions','recommendations','observations','responsibles','additionalInspectors','registrationParticipants','registrationDetails']);
 v_data:=berry_private.clean_report_for_owner(p_id,v_input,v_row.author_id);
 perform berry_private.validate_admin_content(v_data);
 -- The primary inspector and their profile snapshot cannot be replaced by the administrator.
 v_data:=v_row.data||v_data||jsonb_build_object('ownerId',v_row.author_id,'inspector',v_row.data->'inspector','inspectorEmail',v_row.data->'inspectorEmail','serverRegistration',v_row.data->'serverRegistration','status','ready','step',4);
 if v_data#>array['registrationDetails',v_row.author_id::text] is not null and v_row.data#>array['registrationDetails',v_row.author_id::text] is not null then
  v_data:=jsonb_set(v_data,array['registrationDetails',v_row.author_id::text,'jobTitle'],coalesce(v_row.data#>array['registrationDetails',v_row.author_id::text,'jobTitle'],'""'));
 end if;
 for v_obs in select value from jsonb_array_elements(v_data->'observations') loop
  v_correction:=v_row.data#>array['delivery','corrections',v_obs->>'id'];
  if v_correction is not null then
   select value into v_old from jsonb_array_elements(v_row.data->'observations') where value->>'id'=v_obs->>'id';
   if v_old is distinct from v_obs then v_correction:=v_correction||jsonb_build_object('state','Pendiente','proposedState','Pendiente','decision','changes');end if;
   v_correction:=v_correction||jsonb_build_object('responsibleName',v_data#>>'{responsibles,0,name}');
   v_corrections:=v_corrections||jsonb_build_object(v_obs->>'id',v_correction);
  end if;
 end loop;
 select array_agg((value->>'personId')::uuid order by ordinality) into v_recipients from jsonb_array_elements(v_data->'responsibles') with ordinality;
 v_data:=v_data||jsonb_build_object('delivery',(v_row.data->'delivery')||jsonb_build_object('recipientIds',v_recipients,'corrections',v_corrections));
 insert into berry_private.admin_edits(operation_id,inspection_id,actor_id,base_revision,input_data,content)values(p_operation,p_id,v_actor,p_expected,p_data,v_data);
 v_row.data:=v_data;
 return jsonb_build_object('inspection',to_jsonb(v_row),'operation_id',p_operation,'state','prepared');
end $$;

create or replace function berry_private.require_admin_edit_actor(p_actor uuid,p_iat bigint)
returns void language plpgsql stable security definer set search_path='' as $$begin
 if p_iat is null or p_iat<=0 or not exists(select 1 from public.berry_profiles where id=p_actor and role='admin' and enabled and deleted_at is null and not must_change_password and (credentials_valid_after=0 or p_iat>credentials_valid_after)) then raise exception 'ADMIN_REQUIRED' using errcode='42501';end if;
end $$;
create or replace function public.berry_admin_edit_upload(p_operation uuid,p_actor uuid,p_iat bigint)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_edit berry_private.admin_edits;v_row public.berry_inspections;begin
 perform berry_private.require_admin_edit_actor(p_actor,p_iat);
 select * into v_edit from berry_private.admin_edits where operation_id=p_operation;
 if not found or(v_edit.state='prepared' and v_edit.actor_id<>p_actor) then raise exception 'EDIT_NOT_ALLOWED' using errcode='42501';end if;
 select * into v_row from public.berry_inspections where id=v_edit.inspection_id and deleted_at is null;
 if not found then raise exception 'REPORT_NOT_AVAILABLE' using errcode='42501';end if;
 if v_edit.state='prepared' then
  if v_edit.expires_at<=now() then raise exception 'EDIT_EXPIRED' using errcode='40001';end if;
  if v_row.workflow<>'sent' or v_row.revision<>v_edit.base_revision then raise exception 'REVISION_CONFLICT' using errcode='40001';end if;
  v_row.data:=v_edit.content;
 end if;
 return jsonb_build_object('state',v_edit.state,'inspection',to_jsonb(v_row),'document',(select to_jsonb(d) from public.berry_documents d where inspection_id=v_row.id and kind='excel'));
end $$;

create or replace function public.berry_commit_admin_edit(p_operation uuid,p_actor uuid,p_iat bigint,p_document jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_edit berry_private.admin_edits;v_row public.berry_inspections;v_old public.berry_documents;v_doc public.berry_documents;v_data jsonb;v_date date;v_path text;v_person jsonb;v_correction jsonb;v_pair record;v_closed boolean;v_cc text[];begin
 perform 1 from public.berry_profiles where id=p_actor for share;
 perform berry_private.require_admin_edit_actor(p_actor,p_iat);
 select * into v_edit from berry_private.admin_edits where operation_id=p_operation;
 if not found or(v_edit.state='prepared' and v_edit.actor_id<>p_actor) then raise exception 'EDIT_NOT_ALLOWED' using errcode='42501';end if;
 select * into v_row from public.berry_inspections where id=v_edit.inspection_id and deleted_at is null for update;
 if not found then raise exception 'REPORT_NOT_AVAILABLE' using errcode='42501';end if;
 select * into v_edit from berry_private.admin_edits where operation_id=p_operation for update;
 if v_edit.state<>'prepared' then return jsonb_build_object('inspection',to_jsonb(v_row),'document',(select to_jsonb(d) from public.berry_documents d where inspection_id=v_row.id and kind='excel'));end if;
 if v_edit.expires_at<=now() then raise exception 'EDIT_EXPIRED' using errcode='40001';end if;
 if v_row.workflow<>'sent' or v_row.revision<>v_edit.base_revision or v_row.active_edit_operation is not null then raise exception 'REVISION_CONFLICT' using errcode='40001';end if;
 perform 1 from berry_private.report_outbox where inspection_id=v_row.id for update;
 if exists(select 1 from berry_private.report_outbox where inspection_id=v_row.id and state='dispatching') then raise exception 'MAIL_IN_PROGRESS' using errcode='40001';end if;
 v_data:=v_edit.content;
 for v_person in select value from jsonb_array_elements(v_data->'responsibles') union all select value from jsonb_array_elements(v_data->'additionalInspectors') union all select value from jsonb_array_elements(v_data->'registrationParticipants') loop
  perform 1 from public.berry_profiles where id=(v_person->>'personId')::uuid for share;
 end loop;
 perform berry_private.validate_admin_content(v_data);
 v_date:=(v_data->>'date')::date;
 v_path:=to_char(v_date,'YYYY')||'/'||to_char(v_date,'MM')||'-'||(array['ENERO','FEBRERO','MARZO','ABRIL','MAYO','JUNIO','JULIO','AGOSTO','SEPTIEMBRE','OCTUBRE','NOVIEMBRE','DICIEMBRE'])[extract(month from v_date)::integer]||'/'||v_row.id||'/'||(p_document->>'sha256')||'/'||berry_private.storage_filename(p_document->>'filename');
 if jsonb_typeof(p_document) is distinct from 'object' or coalesce(p_document->>'sha256','') !~ '^[a-f0-9]{64}$' or coalesce(p_document->>'filename','') !~ '^[^/\\]+\.xlsx$'
  or length(p_document->>'filename')>250 or p_document->>'storage_path' is distinct from v_path or not exists(select 1 from storage.objects where bucket_id='berry-documents' and name=v_path) then raise exception 'DOCUMENT_NOT_STORED' using errcode='22023';end if;
 select * into v_old from public.berry_documents where inspection_id=v_row.id and kind='excel' for update;
 if not found then raise exception 'DOCUMENT_NOT_FOUND' using errcode='22023';end if;
 perform set_config('request.jwt.claim.sub',p_actor::text,true);
 delete from public.berry_recipients where inspection_id=v_row.id and user_id not in(select(value->>'personId')::uuid from jsonb_array_elements(v_data->'responsibles'));
 insert into public.berry_recipients(inspection_id,user_id,assigned_by) select v_row.id,(value->>'personId')::uuid,p_actor from jsonb_array_elements(v_data->'responsibles') on conflict(inspection_id,user_id) do nothing;
 select coalesce(array_agg(distinct e),'{}') into v_cc from public.berry_profiles p cross join lateral unnest(p.supervisor_emails) e where p.id in(select(value->>'personId')::uuid from jsonb_array_elements(v_data->'responsibles')) and e not in(select value->>'email' from jsonb_array_elements(v_data->'responsibles'));
 if cardinality(v_cc)>50 then raise exception 'TOO_MANY_COPIES' using errcode='22023';end if;
 v_data:=v_data||jsonb_build_object('emailCc',v_cc,'emailDelivery',jsonb_build_object('state','unconfirmed','requestId',v_row.id,'updatedAt',now(),'message','Esta versión está disponible en la plataforma. La edición no ha enviado otro correo.'),'adminEditedBy',p_actor,'adminEditedAt',now());
 delete from public.berry_corrections c where inspection_id=v_row.id and not exists(select 1 from jsonb_array_elements(v_data->'observations') o where o->>'id'=c.observation_id::text);
 for v_pair in select key,value from jsonb_each(v_data#>'{delivery,corrections}') loop
  v_correction:=v_pair.value;
  update public.berry_corrections set responsible_name=v_correction->>'responsibleName',state=v_correction->>'state',decision=v_correction->>'decision',data=v_correction,revision=revision+1,
   reviewer_id=case when v_correction->>'decision'='changes' then null else reviewer_id end,reviewed_at=case when v_correction->>'decision'='changes' then null else reviewed_at end where inspection_id=v_row.id and observation_id=v_pair.key::uuid;
 end loop;
 select not exists(select 1 from jsonb_array_elements(v_data->'observations') o where coalesce(v_data#>>array['delivery','corrections',o->>'id','decision'],'')<>'approved' or coalesce(v_data#>>array['delivery','corrections',o->>'id','state'],'')<>'Ejecutado') into v_closed;
 v_data:=jsonb_set(v_data,'{delivery,revision}',to_jsonb(v_row.revision+1));
 update public.berry_inspections set data=v_data,revision=revision+1,workflow=case when v_closed then 'closed' else 'sent' end,closed_at=case when v_closed then now() else null end,active_edit_operation=p_operation,final_excel_stored=false where id=v_row.id returning * into v_row;
 update public.berry_documents set revision=v_row.revision,filename=p_document->>'filename',storage_path=v_path,sha256=p_document->>'sha256',byte_size=(p_document->>'byte_size')::bigint,is_final=v_closed,created_by=p_actor,created_at=now() where id=v_old.id returning * into v_doc;
 if v_old.storage_path<>v_path then insert into berry_private.document_cleanup values(v_old.storage_path,v_row.id) on conflict do nothing;end if;
 update berry_private.report_outbox set state='unconfirmed',result=jsonb_build_object('state','unconfirmed','message','La inspección fue editada; el envío anterior no se reintentará automáticamente.') where inspection_id=v_row.id and state='queued';
 update berry_private.admin_edits set state='committed' where operation_id=p_operation;
 return jsonb_build_object('inspection',to_jsonb(v_row),'document',to_jsonb(v_doc));
end $$;

create or replace function public.berry_admin_edit_cleanup(p_operation uuid,p_actor uuid,p_iat bigint)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_edit berry_private.admin_edits;begin
 perform berry_private.require_admin_edit_actor(p_actor,p_iat);
 select * into v_edit from berry_private.admin_edits where operation_id=p_operation and state in('committed','complete');
 if not found then raise exception 'EDIT_NOT_COMMITTED' using errcode='42501';end if;
 if not exists(select 1 from public.berry_inspections where id=v_edit.inspection_id and deleted_at is null) then raise exception 'REPORT_NOT_AVAILABLE' using errcode='42501';end if;
 -- Remove unused versions from every date folder, including abandoned uploads.
 insert into berry_private.document_cleanup(storage_path,inspection_id) select name,v_edit.inspection_id from storage.objects o where bucket_id='berry-documents' and split_part(name,'/',3)=v_edit.inspection_id::text and right(name,5)='.xlsx' and not exists(select 1 from public.berry_documents d where d.storage_path=o.name) on conflict do nothing;
 return(select coalesce(jsonb_agg(storage_path),'[]') from berry_private.document_cleanup c where inspection_id=v_edit.inspection_id and not exists(select 1 from public.berry_documents d where d.storage_path=c.storage_path));
end $$;
create or replace function public.berry_finish_admin_edit(p_operation uuid,p_actor uuid,p_iat bigint,p_removed text[])
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_edit berry_private.admin_edits;v_row public.berry_inspections;begin
 perform berry_private.require_admin_edit_actor(p_actor,p_iat);
 select * into v_edit from berry_private.admin_edits where operation_id=p_operation and state in('committed','complete');
 if not found then raise exception 'EDIT_NOT_COMMITTED' using errcode='42501';end if;
 select * into v_row from public.berry_inspections where id=v_edit.inspection_id and deleted_at is null for update;
 if not found then raise exception 'REPORT_NOT_AVAILABLE' using errcode='42501';end if;
 delete from berry_private.document_cleanup c where inspection_id=v_row.id and(c.storage_path=any(p_removed) or exists(select 1 from public.berry_documents d where d.storage_path=c.storage_path)) and not exists(select 1 from storage.objects o where bucket_id='berry-documents' and name=c.storage_path and not exists(select 1 from public.berry_documents d where d.storage_path=c.storage_path));
 if exists(select 1 from berry_private.document_cleanup c where inspection_id=v_row.id and not exists(select 1 from public.berry_documents d where d.storage_path=c.storage_path)) then raise exception 'EDIT_CLEANUP_PENDING' using errcode='40001';end if;
 if v_row.active_edit_operation=p_operation then
  perform set_config('request.jwt.claim.sub',p_actor::text,true);
  update public.berry_inspections set active_edit_operation=null,revision=revision+1,data=jsonb_set(data,'{delivery,revision}',to_jsonb(revision+1)),final_excel_stored=(workflow='closed' and exists(select 1 from public.berry_documents where inspection_id=v_row.id and kind='excel' and is_final)) where id=v_row.id returning * into v_row;
 end if;
 update berry_private.admin_edits set state='complete' where operation_id=p_operation;
 return to_jsonb(v_row);
end $$;

create or replace function public.berry_prepare_report(p_id uuid,p_expected bigint,p_hash text)returns jsonb language plpgsql security definer set search_path='' as $$
declare v_result jsonb;v_person jsonb;begin
  perform berry_private.require_create();v_result:=berry_private.berry_prepare_report_v4(p_id,p_expected,p_hash);
  if coalesce((v_result->>'registered')::boolean,false) then return v_result;end if;
  perform berry_private.require_location(v_result#>'{inspection,data}');
  for v_person in select value from jsonb_array_elements(v_result#>'{inspection,data,responsibles}') loop
    if not exists(select 1 from public.berry_profiles where id=(v_person->>'personId')::uuid and enabled and deleted_at is null and can_receive_inspections) then raise exception 'RECIPIENT_NOT_ALLOWED' using errcode='22023';end if;
  end loop;
  for v_person in select value from jsonb_array_elements(v_result#>'{inspection,data,additionalInspectors}') union all select value from jsonb_array_elements(berry_private.registration_participants(v_result#>'{inspection,data}')) loop
    if not exists(select 1 from public.berry_profiles where id=(v_person->>'personId')::uuid and enabled and deleted_at is null and can_create_inspections and full_name<>'') then raise exception 'INSPECTOR_NOT_ALLOWED' using errcode='22023';end if;
  end loop;
  return v_result;
end $$;


-- Inspectors review corrections; only assigned recipients can set their status.
create or replace function public.berry_change_correction(p_id uuid,p_observation uuid,p_expected bigint,p_action text,p_value jsonb)returns jsonb language plpgsql security definer set search_path='' as $$
declare v_actor uuid:=berry_private.require_ready();v_owner boolean;v_create boolean;v_receive boolean;begin
  select author_id=v_actor into v_owner from public.berry_inspections where id=p_id;
  select can_create_inspections,can_receive_inspections into v_create,v_receive from public.berry_profiles where id=v_actor;
  if (p_action in('save','submit') and not v_receive) or(p_action in('approve','changes') and not(v_owner and v_create))
    or(p_action='state' and not(v_receive and exists(select 1 from public.berry_recipients where inspection_id=p_id and user_id=v_actor))) then raise exception 'ACTION_NOT_ALLOWED' using errcode='42501';end if;
  return berry_private.berry_change_correction_v4(p_id,p_observation,p_expected,p_action,p_value);
end $$;

-- Administrators can stage original evidence for any open, registered report.
create or replace function berry_private.can_upload_evidence(p_id uuid)
returns boolean language sql stable security definer set search_path='' as $$
 select berry_private.is_enabled() and exists(select 1 from public.berry_inspections i where i.id=p_id and i.deleted_at is null and
  ((i.workflow='draft' and i.author_id=(select auth.uid()) and exists(select 1 from public.berry_profiles where id=(select auth.uid()) and can_create_inspections))
  or(i.workflow='sent' and (exists(select 1 from public.berry_recipients r join public.berry_profiles p on p.id=r.user_id where r.inspection_id=i.id and r.user_id=(select auth.uid()) and p.can_receive_inspections)
   or (i.code is not null and exists(select 1 from public.berry_profiles where id=(select auth.uid()) and role='admin'))))));
$$;
revoke all on function public.berry_prepare_admin_edit(uuid,bigint,jsonb,uuid) from public,anon,authenticated;
grant execute on function public.berry_prepare_admin_edit(uuid,bigint,jsonb,uuid) to authenticated;
revoke all on function berry_private.require_admin_edit_actor(uuid,bigint),public.berry_admin_edit_upload(uuid,uuid,bigint),public.berry_commit_admin_edit(uuid,uuid,bigint,jsonb),public.berry_admin_edit_cleanup(uuid,uuid,bigint),public.berry_finish_admin_edit(uuid,uuid,bigint,text[]) from public,anon,authenticated;
grant execute on function public.berry_admin_edit_upload(uuid,uuid,bigint),public.berry_commit_admin_edit(uuid,uuid,bigint,jsonb),public.berry_admin_edit_cleanup(uuid,uuid,bigint),public.berry_finish_admin_edit(uuid,uuid,bigint,text[]) to service_role;
create or replace function public.berry_schema_status()returns jsonb language sql stable set search_path='' as $$
 select jsonb_build_object('schema_version','202611070001','accounts_version','202611070002','reports_version','202611080003','final_archive_version','202611080004','permissions_version','202611080005','storage_version','202611080006','dashboard_version','202611080007','registration_version','202611090008','correction_identity_version','202611090009','admin_edit_version','202611090010','stage','reports','sync_ready',true);
$$;
notify pgrst,'reload schema';
commit;
