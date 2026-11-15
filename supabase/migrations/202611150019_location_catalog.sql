-- Berry Safety · Paso 19: catálogo Sede → Zona → Instalación.
-- La lista de instalaciones queda bloqueada hasta recibir y cargar la lista oficial.
-- Conserva perfiles, inspecciones, evidencias, archivos y numeración.
begin;
do $$ begin
 if public.berry_schema_status()->>'location_order_version' is distinct from '202611150018' then raise exception 'Primero instale el paso 18' using errcode='55000';end if;
end $$;
create table if not exists public.berry_locations(
 id uuid primary key default gen_random_uuid(),parent_id uuid references public.berry_locations(id),
 kind text not null check(kind in('site','zone','installation')),
 name text not null check(length(name) between 1 and 250 and name=btrim(name)),
 enabled boolean not null default true,revision bigint not null default 1 check(revision>0),
 created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 check((kind='site' and parent_id is null) or (kind<>'site' and parent_id is not null)),check(parent_id is distinct from id)
);
create unique index if not exists berry_locations_name on public.berry_locations(coalesce(parent_id,'00000000-0000-0000-0000-000000000000'::uuid),lower(name));
create index if not exists berry_locations_parent on public.berry_locations(parent_id);
alter table public.berry_locations enable row level security;
revoke all on public.berry_locations from public,anon,authenticated;
create table if not exists berry_private.location_settings(singleton boolean primary key default true check(singleton),installations_ready boolean not null default false);
alter table berry_private.location_settings enable row level security;
revoke all on berry_private.location_settings from public,anon,authenticated;
insert into berry_private.location_settings(singleton) values(true) on conflict do nothing;
drop trigger if exists berry_record_change on public.berry_locations;
create trigger berry_record_change after insert or update or delete on public.berry_locations for each row execute function berry_private.record_change();
drop trigger if exists berry_touch_updated_at on public.berry_locations;
create trigger berry_touch_updated_at before update on public.berry_locations for each row execute function berry_private.touch_updated_at();
do $$ begin
 if not exists(select 1 from berry_private.organization_seed_versions where version='locations-20261115') then
  insert into public.berry_locations(id,parent_id,kind,name,enabled)
   select id::uuid,parent_id::uuid,kind,name,enabled from jsonb_to_recordset('[{"id":"838233d5-5f8f-540a-8e02-62127ed65b93","parent_id":null,"kind":"site","name":"Fundo","enabled":true,"revision":1},{"id":"49b49753-a8d6-571e-a064-c9f0c961d1d9","parent_id":"838233d5-5f8f-540a-8e02-62127ed65b93","kind":"zone","name":"Armonía I","enabled":true,"revision":1},{"id":"80885ecf-79d9-545d-861d-0b0dc2e9d88b","parent_id":"838233d5-5f8f-540a-8e02-62127ed65b93","kind":"zone","name":"Armonía II","enabled":true,"revision":1},{"id":"3ed904eb-6fcc-533e-8b50-3170aca109ff","parent_id":"838233d5-5f8f-540a-8e02-62127ed65b93","kind":"zone","name":"Armonía III","enabled":true,"revision":1},{"id":"050155bd-bee5-55da-9a79-ef3779df1c03","parent_id":"838233d5-5f8f-540a-8e02-62127ed65b93","kind":"zone","name":"Armonía IV","enabled":true,"revision":1},{"id":"76f40822-a453-5a23-a74a-3e4912e7a807","parent_id":"838233d5-5f8f-540a-8e02-62127ed65b93","kind":"zone","name":"Esperanza I","enabled":true,"revision":1},{"id":"c0994cc7-ce8c-5096-868d-15b6566a8b52","parent_id":"838233d5-5f8f-540a-8e02-62127ed65b93","kind":"zone","name":"Esperanza II","enabled":true,"revision":1},{"id":"b2e644a6-e0b4-5490-b6ff-2e83a723670e","parent_id":"838233d5-5f8f-540a-8e02-62127ed65b93","kind":"zone","name":"Esperanza III","enabled":true,"revision":1},{"id":"257fb8ad-5b90-59d1-b5e9-c156f133ec97","parent_id":"838233d5-5f8f-540a-8e02-62127ed65b93","kind":"zone","name":"Ilusión I","enabled":true,"revision":1},{"id":"4160fd73-0f59-51a7-9656-860e64e875e0","parent_id":"838233d5-5f8f-540a-8e02-62127ed65b93","kind":"zone","name":"Ilusión II","enabled":true,"revision":1},{"id":"f556fba6-7226-550e-9408-f56f78031bdb","parent_id":"838233d5-5f8f-540a-8e02-62127ed65b93","kind":"zone","name":"Remanso I","enabled":true,"revision":1},{"id":"91e0ad54-37b1-5283-955c-43f862defbcc","parent_id":"838233d5-5f8f-540a-8e02-62127ed65b93","kind":"zone","name":"Remanso II","enabled":true,"revision":1},{"id":"91fa1643-f270-5a82-be2d-0d19b111dd21","parent_id":"838233d5-5f8f-540a-8e02-62127ed65b93","kind":"zone","name":"San Luis","enabled":true,"revision":1},{"id":"8941278e-4b3e-579a-bd99-d2b5043a2869","parent_id":"838233d5-5f8f-540a-8e02-62127ed65b93","kind":"zone","name":"Tumi","enabled":true,"revision":1},{"id":"4d5f0653-b282-5d1d-8325-1866e96ffaab","parent_id":null,"kind":"site","name":"Exteriores","enabled":true,"revision":1},{"id":"7a386661-4ff8-5720-bc31-d156c85b391f","parent_id":"4d5f0653-b282-5d1d-8325-1866e96ffaab","kind":"zone","name":"Chao","enabled":true,"revision":1},{"id":"670574ce-81ad-5946-a51a-735c9e8637af","parent_id":"4d5f0653-b282-5d1d-8325-1866e96ffaab","kind":"zone","name":"Otros","enabled":true,"revision":1},{"id":"fae918e6-00e9-5d77-b205-e52be7ad2dcc","parent_id":"4d5f0653-b282-5d1d-8325-1866e96ffaab","kind":"zone","name":"Semillero","enabled":true,"revision":1},{"id":"383e4d75-4bdd-56bd-950b-24a7132b660b","parent_id":null,"kind":"site","name":"Packing Chao","enabled":true,"revision":1},{"id":"da8b476c-6bb4-5d25-916d-b2aeac2e4734","parent_id":"383e4d75-4bdd-56bd-950b-24a7132b660b","kind":"zone","name":"Packing Chao","enabled":true,"revision":1},{"id":"36ce71c9-78a6-5154-b012-2dd3cbf6ca19","parent_id":null,"kind":"site","name":"Packing Salaverry","enabled":true,"revision":1},{"id":"b91dd34b-b44a-5319-ae16-8184b9357d40","parent_id":"36ce71c9-78a6-5154-b012-2dd3cbf6ca19","kind":"zone","name":"Packing Salaverry","enabled":true,"revision":1},{"id":"67fc4cfc-50ca-5cd2-8538-e203179fa5d5","parent_id":null,"kind":"site","name":"Trujillo","enabled":true,"revision":1},{"id":"a8fa6dd5-7726-5261-928e-464bd5e3cc18","parent_id":"67fc4cfc-50ca-5cd2-8538-e203179fa5d5","kind":"zone","name":"Quintanas","enabled":true,"revision":1}]'::jsonb) as n(id text,parent_id text,kind text,name text,enabled boolean) on conflict(id) do nothing;
  insert into berry_private.organization_seed_versions(version) values('locations-20261115');
 end if;
end $$;
create or replace function public.berry_location_catalog()
returns jsonb language plpgsql stable security definer set search_path='' as $$ begin
 perform berry_private.require_ready();
 return jsonb_build_object('installationsReady',(select installations_ready from berry_private.location_settings where singleton),'nodes',
  (select coalesce(jsonb_agg(to_jsonb(n) order by n.kind,n.name,n.id),'[]') from public.berry_locations n
   left join public.berry_locations p on p.id=n.parent_id left join public.berry_locations g on g.id=p.parent_id
   where n.enabled and (n.kind='site' or p.enabled and (n.kind='zone' or g.enabled))));
end $$;
create or replace function public.berry_admin_locations()
returns jsonb language plpgsql stable security definer set search_path='' as $$ begin
 perform berry_private.require_admin();
 return(select coalesce(jsonb_agg(to_jsonb(n) order by n.kind,n.name,n.id),'[]') from public.berry_locations n);
end $$;
create or replace function public.berry_manage_location(p_id uuid,p_kind text,p_parent_id uuid,p_name text,p_enabled boolean,p_expected bigint default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_actor uuid:=berry_private.require_admin();v_old public.berry_locations;v_parent public.berry_locations;v_name text:=regexp_replace(btrim(p_name),'\s+',' ','g');
begin
 perform 1 from berry_private.admin_serialization where singleton for update;
 v_actor:=berry_private.require_admin();
 if p_kind='installation' and not (select installations_ready from berry_private.location_settings where singleton) then raise exception 'INSTALLATIONS_NOT_READY' using errcode='22023';end if;
 if p_id is null or p_kind not in('site','zone','installation') or p_kind is null or p_enabled is null or v_name is null or length(v_name) not between 1 and 250
  or (p_kind='site' and p_parent_id is not null) or (p_kind<>'site' and p_parent_id is null) then raise exception 'INVALID_ORGANIZATION' using errcode='22023';end if;
 if p_kind<>'site' then
  select * into v_parent from public.berry_locations where id=p_parent_id;
  if not found or v_parent.kind<>(case p_kind when 'zone' then 'site' else 'zone' end) then raise exception 'INVALID_ORGANIZATION_PARENT' using errcode='22023';end if;
  if p_enabled and (not v_parent.enabled or (p_kind='installation' and not exists(select 1 from public.berry_locations m where m.id=v_parent.parent_id and m.kind='site' and m.enabled))) then raise exception 'ORGANIZATION_PARENT_DISABLED' using errcode='22023';end if;
 end if;
 select * into v_old from public.berry_locations where id=p_id for update;
 if found then
  if v_old.kind<>p_kind then raise exception 'INVALID_ORGANIZATION' using errcode='22023';end if;
  if v_old.name=v_name and v_old.parent_id is not distinct from p_parent_id and v_old.enabled=p_enabled then return to_jsonb(v_old);end if;
  if p_expected is null or v_old.revision<>p_expected then raise exception 'REVISION_CONFLICT' using errcode='40001';end if;
  update public.berry_locations set name=v_name,parent_id=p_parent_id,enabled=p_enabled,revision=revision+1 where id=p_id returning * into v_old;
 else
  if p_expected is not null then raise exception 'ORGANIZATION_NOT_AVAILABLE' using errcode='40001';end if;
  insert into public.berry_locations(id,parent_id,kind,name,enabled) values(p_id,p_parent_id,p_kind,v_name,p_enabled) returning * into v_old;
 end if;
 return to_jsonb(v_old);
end $$;


create or replace function berry_private.canonical_location(p_id uuid,p_location jsonb)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_old public.berry_inspections;v_site public.berry_locations;v_zone public.berry_locations;v_installation public.berry_locations;v_ready boolean;v_detail text:='';
begin
 select * into v_old from public.berry_inspections where id=p_id;
 if v_old.workflow in('sent','closed') and p_location is not distinct from v_old.data->'areaLocation' then return p_location;end if;
 select installations_ready into v_ready from berry_private.location_settings where singleton;
 if coalesce(p_location->>'siteId','')<>'' then
  select * into v_site from public.berry_locations where id=(p_location->>'siteId')::uuid and kind='site' and enabled;
  if not found then raise exception 'INVALID_SITE' using errcode='22023';end if;
 elsif coalesce(p_location->>'site','')<>'' then raise exception 'INVALID_SITE' using errcode='22023';end if;
 if coalesce(p_location->>'zoneId','')<>'' then
  select * into v_zone from public.berry_locations where id=(p_location->>'zoneId')::uuid and kind='zone' and enabled and parent_id=v_site.id;
  if not found then raise exception 'INVALID_ZONE' using errcode='22023';end if;
 elsif coalesce(p_location->>'zone','')<>'' then raise exception 'INVALID_ZONE' using errcode='22023';end if;
 if coalesce(p_location->>'installationId','')<>'' then
  if not v_ready then raise exception 'INSTALLATIONS_NOT_READY' using errcode='22023';end if;
  select * into v_installation from public.berry_locations where id=(p_location->>'installationId')::uuid and kind='installation' and enabled and parent_id=v_zone.id;
  if not found then raise exception 'INVALID_INSTALLATION' using errcode='22023';end if;
  v_detail:=v_installation.name;
 elsif v_ready and coalesce(p_location->>'detail','')<>'' then raise exception 'INVALID_INSTALLATION' using errcode='22023';
 elsif not v_ready and (v_old.data->'areaLocation'->>'source') is distinct from 'catalog'
  and p_location->>'site'=v_old.data->'areaLocation'->>'site' and p_location->>'zone'=v_old.data->'areaLocation'->>'zone' and p_location->>'detail'=v_old.data->'areaLocation'->>'detail'
  then v_detail:=p_location->>'detail';
 end if;
 return (p_location-array['site','zone','detail','installationPending'])||jsonb_build_object('site',coalesce(v_site.name,''),'zone',coalesce(v_zone.name,''),'detail',v_detail,'installationPending',not v_ready,'textOrder','site-zone-area');
exception when invalid_text_representation then raise exception 'INVALID_LOCATION' using errcode='22023';
end $$;
revoke all on function berry_private.canonical_location(uuid,jsonb) from public,anon,authenticated;
create or replace function berry_private.location_area(p_location jsonb)
returns text language plpgsql immutable set search_path='' as $$
declare v_zones jsonb; v_result text;
begin
 if jsonb_typeof(p_location) is distinct from 'object'
  or exists(select 1 from unnest(array['site','zone','detail']) k where jsonb_typeof(p_location->k) is distinct from 'string')
  or exists(select 1 from unnest(array['management','department']) k where p_location ? k and (jsonb_typeof(p_location->k) is distinct from 'string' or length(p_location->>k)>250))
  or (p_location ? 'departmentNomenclature' and (jsonb_typeof(p_location->'departmentNomenclature') is distinct from 'string' or length(p_location->>'departmentNomenclature')>50))
  or (p_location ? 'textOrder' and (jsonb_typeof(p_location->'textOrder') is distinct from 'string' or p_location->>'textOrder'<>'site-zone-area'))
  or (p_location ? 'source' and (jsonb_typeof(p_location->'source') is distinct from 'string' or p_location->>'source'<>'catalog'))
  or (p_location ? 'departmentDisplay' and (jsonb_typeof(p_location->'departmentDisplay') is distinct from 'string' or length(p_location->>'departmentDisplay')>250))
  or (p_location ? 'installationPending' and jsonb_typeof(p_location->'installationPending') is distinct from 'boolean')
  or length(p_location->>'detail')>250 then raise exception 'INVALID_LOCATION' using errcode='22023';end if;
 v_zones:=jsonb_build_object('Fundo',jsonb_build_array('Armonía I','Armonía II','Armonía III','Armonía IV','Esperanza I','Esperanza II','Esperanza III','Ilusión I','Ilusión II','Remanso I','Remanso II','San Luis','Tumi'),'Exteriores',jsonb_build_array('Chao','Otros','Semillero'),'Packing Chao',jsonb_build_array('Packing Chao'),'Packing Salaverry',jsonb_build_array('Packing Salaverry'),'Trujillo',jsonb_build_array('Quintanas'));
 if p_location->>'source' is distinct from 'catalog' then
 if coalesce(p_location->>'site','')<>'' and not(v_zones ? (p_location->>'site')) then raise exception 'INVALID_LOCATION' using errcode='22023';end if;
 if coalesce(p_location->>'zone','')<>'' and not coalesce((v_zones->(p_location->>'site')) ? (p_location->>'zone'),false) then raise exception 'INVALID_LOCATION' using errcode='22023';end if;
 end if;
 if p_location->>'source'='catalog' or p_location->>'textOrder'='site-zone-area' then
  v_result:=concat_ws(' – ',nullif(p_location->>'site',''),nullif(p_location->>'zone',''),coalesce(nullif(btrim(p_location->>'departmentDisplay'),''),nullif(btrim(p_location->>'departmentNomenclature'),''),nullif(btrim(p_location->>'department'),'')),nullif(btrim(p_location->>'detail'),''));
 else
  v_result:=concat_ws(' – ',nullif(p_location->>'site',''),coalesce(nullif(btrim(p_location->>'departmentDisplay'),''),nullif(btrim(p_location->>'departmentNomenclature'),''),nullif(btrim(p_location->>'department'),'')),nullif(p_location->>'zone',''),nullif(btrim(p_location->>'detail'),''));
 end if;
 if length(v_result)>500 then raise exception 'INVALID_LOCATION' using errcode='22023';end if;
 return v_result;
end $$;
revoke all on function berry_private.location_area(jsonb) from public,anon,authenticated;
create or replace function berry_private.clean_report_for_owner(p_id uuid, p_data jsonb, p_owner uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_owner public.berry_profiles; v_value jsonb; v_obs jsonb; v_people jsonb := '[]'; v_team jsonb := '[]'; v_registrants jsonb := '[]'; v_records jsonb := '{}'; v_source_records jsonb; v_person_id text; v_job text;
begin
  if p_data#>>'{areaLocation,source}'='catalog' then p_data:=jsonb_set(p_data,'{areaLocation}',berry_private.canonical_location(p_id,p_data->'areaLocation'));end if;
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

create or replace function berry_private.require_location(p_data jsonb)
returns void language plpgsql stable security definer set search_path='' as $$
declare v_pending boolean:=false;
begin
 if p_data ? 'areaLocation' then
  perform berry_private.location_area(p_data->'areaLocation');
  if p_data#>>'{areaLocation,source}'='catalog' and p_data#>>'{areaLocation,installationPending}'='true' then
   v_pending:=not(select installations_ready from berry_private.location_settings where singleton)
    or exists(select 1 from public.berry_inspections i where i.id=(p_data->>'id')::uuid and i.workflow in('sent','closed') and i.data->'areaLocation'=p_data->'areaLocation');
  end if;
  if coalesce(p_data#>>'{areaLocation,site}','')='' or coalesce(p_data#>>'{areaLocation,zone}','')='' or not v_pending and btrim(coalesce(p_data#>>'{areaLocation,detail}',''))='' then raise exception 'INCOMPLETE_LOCATION' using errcode='22023';end if;
 end if;
end $$;
revoke all on function berry_private.require_location(jsonb) from public,anon,authenticated;
revoke all on function public.berry_location_catalog(),public.berry_admin_locations(),public.berry_manage_location(uuid,text,uuid,text,boolean,bigint) from public,anon,authenticated;
grant execute on function public.berry_location_catalog(),public.berry_admin_locations(),public.berry_manage_location(uuid,text,uuid,text,boolean,bigint) to authenticated;
create or replace function public.berry_schema_status() returns jsonb language sql stable set search_path='' as $$
 select jsonb_build_object('schema_version','202611070001','accounts_version','202611070002','reports_version','202611080003','final_archive_version','202611080004','permissions_version','202611080005','storage_version','202611080006','dashboard_version','202611080007','registration_version','202611090008','correction_identity_version','202611090009','admin_edit_version','202611090010','account_copies_version','202611090011','next_registration_version','202611090012','organization_catalog_version','202611150014','account_identity_version','202611150015','area_nomenclature_version','202611150016','account_email_version','202611150017','location_order_version','202611150018','location_catalog_version','202611150019','stage','reports','sync_ready',true);
$$;
notify pgrst,'reload schema';
commit;
