-- Paso 31. Inventario legado, fecha oficial H y asignación usuaria levantada en campo.
-- Este archivo contiene estructura y funciones; los datos reales se cargan con un SQL privado.
begin;
do $$begin if to_regclass('public.berry_emergency_equipment') is null then raise exception 'Aplica primero el paso 30 de Yo Reviso';end if;end;$$;

create table if not exists berry_private.emergency_import_batches(
 batch_sha text primary key check(batch_sha ~ '^[0-9a-f]{64}$'),source_sha text not null,
 record_count integer not null,payload_hash text not null,imported_at timestamptz not null default clock_timestamp(),imported_by text not null default session_user
);
revoke all on berry_private.emergency_import_batches from public,anon,authenticated;
alter table public.berry_emergency_equipment alter column area_id drop not null,alter column management_id drop not null,
 alter column created_by drop not null,alter column updated_by drop not null;
alter table public.berry_emergency_equipment add column if not exists owner_management_id uuid references public.berry_organization(id),
 add column if not exists owner_name text not null default '',add column if not exists classification text not null default '',
 add column if not exists placement_kind text not null default '',add column if not exists last_hydro_year integer,
 add column if not exists next_hydro_year integer,add column if not exists import_batch_sha text references berry_private.emergency_import_batches(batch_sha),
 add column if not exists assignment_inspection_id uuid references public.berry_emergency_inspections(id);
alter table public.berry_emergency_equipment drop constraint if exists berry_emergency_equipment_location_check;
do $$begin
 if not exists(select 1 from pg_constraint where conrelid='public.berry_emergency_equipment'::regclass and conname='emergency_location_length') then
  alter table public.berry_emergency_equipment add constraint emergency_location_length check(length(location)<=250),
   add constraint emergency_assignment_pair check((area_id is null)=(management_id is null)),
   add constraint emergency_import_provenance check(created_by is not null or import_batch_sha is not null),
   add constraint emergency_hydro_years check((last_hydro_year is null or last_hydro_year between 1900 and 2100) and (next_hydro_year is null or next_hydro_year between 1900 and 2100));
 end if;
end;$$;
create or replace function berry_private.emergency_code_key(p_code text) returns text language sql immutable set search_path='' as $$select regexp_replace(upper(btrim(p_code)),'[-\s]+','','g');$$;
revoke all on function berry_private.emergency_code_key(text) from public,anon,authenticated;
create unique index if not exists emergency_equipment_code_key on public.berry_emergency_equipment(kind,berry_private.emergency_code_key(code));

create table if not exists public.berry_emergency_legacy_records(
 id uuid primary key default gen_random_uuid(),equipment_id uuid not null references public.berry_emergency_equipment(id),
 batch_sha text not null references berry_private.emergency_import_batches(batch_sha),source_row integer not null,
 official_date date,previous_date date,state_original text not null default '',notes text not null default '',inspector_code text not null default '',
 months jsonb not null default '{}',original jsonb not null,imported_at timestamptz not null default clock_timestamp(),unique(batch_sha,source_row),unique(equipment_id,batch_sha)
);
alter table public.berry_emergency_legacy_records enable row level security;
revoke all on public.berry_emergency_legacy_records from public,anon,authenticated;
grant select on public.berry_emergency_legacy_records to authenticated;
drop policy if exists emergency_legacy_read on public.berry_emergency_legacy_records;
create policy emergency_legacy_read on public.berry_emergency_legacy_records for select to authenticated using(exists(
 select 1 from public.berry_emergency_equipment e where e.id=equipment_id and berry_private.emergency_scope(e.management_id)
 and berry_private.yo_seguro_read(null,coalesce(official_date::timestamptz,'-infinity'::timestamptz),e.management_id)));
create index if not exists emergency_legacy_equipment on public.berry_emergency_legacy_records(equipment_id,imported_at desc);

-- Only technical fields are exposed by the public exact-code lookup.
create or replace function berry_private.emergency_public_equipment(e public.berry_emergency_equipment) returns jsonb
language sql stable security definer set search_path='' as $$
 select jsonb_build_object('id',e.id,'kind',e.kind,'code',e.code,'area_id',e.area_id,'management_id',e.management_id,
 'location',case when btrim(e.location)<>'' and (e.classification ilike 'VEH%' or e.placement_kind in('Camioneta','Tractor','Camion','Camión','Motosoldadora','Montacargas','Retroexcavadora','Torre de luminarias'))
  then coalesce(nullif(e.placement_kind,''),'Unidad móvil')||' · '||e.code else e.location end,
 'serial_number',e.serial_number,'brand',e.brand,'agent',e.agent,'capacity',e.capacity,'manufacture_year',e.manufacture_year,
 'expiry_month',e.expiry_month,'last_hydro_date',e.last_hydro_date,'next_hydro_date',e.next_hydro_date,
 'last_hydro_year',e.last_hydro_year,'next_hydro_year',e.next_hydro_year,'enabled',e.enabled,'revision',e.revision,
 'classification',e.classification,'placement_kind',e.placement_kind,'owner_management_id',e.owner_management_id,
 'owner_name',e.owner_name,'owner_management_name',(select name from public.berry_organization where id=e.owner_management_id),
 'area_name',(select name from public.berry_organization where id=e.area_id),
 'management_name',(select name from public.berry_organization where id=e.management_id),
 'legacy_available',exists(select 1 from public.berry_emergency_legacy_records l where l.equipment_id=e.id),
 'legacy_years',(select jsonb_build_object('manufacture',l.original->>'AÑO DE FABRICACIÓN','last_hydro',l.original->>'ÚLTIMA PRUEBA HIDRÓSTATICA','next_hydro',l.original->>'PRÓXIMA PRUEBA HIDRÓSTATICA')
 from public.berry_emergency_legacy_records l where l.equipment_id=e.id order by l.imported_at desc,l.id desc limit 1));
$$;
revoke all on function berry_private.emergency_public_equipment(public.berry_emergency_equipment) from public,anon,authenticated;
create or replace function public.berry_emergency_lookup(p_kind text,p_code text) returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('equipment',berry_private.emergency_public_equipment(e),'latest',(
  select q.item from (
   select i.inspection_date inspection_day,i.created_at sort_time,1 priority,jsonb_build_object('inspection_date',i.inspection_date,'state',i.state) item
   from public.berry_emergency_inspections i where i.equipment_id=e.id
   union all
   select l.official_date,l.imported_at,0,jsonb_build_object('inspection_date',l.official_date,'state',case upper(l.state_original)
    when 'OPERATIVO' then 'operational' when 'VENCIDO' then 'expired' when 'USADO' then 'used' when 'DESPRESURIZADO' then 'depressurized'
    when 'SOBREPRESURIZADO' then 'overpressurized' when 'DESHABILITADO' then 'disabled' end,
    'state_label',case when btrim(l.state_original) in('','-') then 'Sin estado consignado' else l.state_original end,'source','legacy','date_column','H')
   from public.berry_emergency_legacy_records l where l.equipment_id=e.id and l.official_date is not null
  ) q order by q.inspection_day desc,q.priority desc,q.sort_time desc limit 1))
 from public.berry_emergency_equipment e
 where e.kind=p_kind and length(p_code) between 1 and 80 and berry_private.emergency_code_key(e.code)=berry_private.emergency_code_key(p_code) and e.enabled
 and (e.area_id is null or exists(select 1 from public.berry_organization a join public.berry_organization m on m.id=a.parent_id
  where a.id=e.area_id and a.parent_id=e.management_id and a.enabled and m.enabled and a.kind='area' and m.kind='management'));
$$;
revoke all on function public.berry_emergency_lookup(text,text) from public;
grant execute on function public.berry_emergency_lookup(text,text) to anon,authenticated;

alter table public.berry_emergency_inspections drop constraint if exists berry_emergency_inspections_state_check;
alter table public.berry_emergency_inspections drop constraint if exists emergency_state_supported;
alter table public.berry_emergency_inspections add constraint emergency_state_supported check(state in('operational','attention','out_of_service','expired','used','depressurized','overpressurized','disabled'));

create or replace function public.berry_save_emergency_equipment(p_id uuid,p_expected integer,p_data jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare v_actor uuid:=berry_private.require_admin();v_row public.berry_emergency_equipment;v_area public.berry_organization;v_code text;v_year integer;v_owner uuid;
begin
 if p_id is null or p_expected is null or p_expected<0 or jsonb_typeof(p_data) is distinct from 'object' or exists(select 1 from jsonb_object_keys(p_data) k where k<>all(array['code','kind','area_id','location','serial_number','brand','agent','capacity','manufacture_year','expiry_month','last_hydro_date','next_hydro_date','enabled','owner_management_id','last_hydro_year','next_hydro_year'])) then raise exception 'INVALID_EQUIPMENT' using errcode='22023';end if;
 if p_data->>'kind' is distinct from 'extinguisher' then raise exception 'FORMAT_NOT_AVAILABLE' using errcode='22023';end if;
 v_code:=upper(regexp_replace(btrim(p_data->>'code'),'\s+',' ','g'));
 if v_code is null or length(v_code) not between 1 and 80 or length(coalesce(btrim(p_data->>'location'),'')) not between 1 and 250
 or exists(select 1 from unnest(array['serial_number','brand','agent','capacity']) k where length(coalesce(p_data->>k,''))>160)
 or (coalesce(p_data->>'expiry_month','')<>'' and p_data->>'expiry_month' !~ '^[0-9]{4}-(0[1-9]|1[0-2])$')
 or jsonb_typeof(p_data->'enabled') is distinct from 'boolean' then raise exception 'INVALID_EQUIPMENT' using errcode='22023';end if;
 v_year:=nullif(p_data->>'manufacture_year','')::integer;
 if v_year is not null and (v_year<1900 or v_year>extract(year from clock_timestamp() at time zone 'America/Lima')) then raise exception 'INVALID_EQUIPMENT' using errcode='22023';end if;
 if nullif(p_data->>'area_id','') is not null then
  select * into v_area from public.berry_organization where id=(p_data->>'area_id')::uuid and kind='area' and enabled;
  if v_area.id is null or not exists(select 1 from public.berry_organization where id=v_area.parent_id and kind='management' and enabled) then raise exception 'AREA_NOT_AVAILABLE' using errcode='22023';end if;
 end if;
 if nullif(p_data->>'owner_management_id','') is not null then
  select id into v_owner from public.berry_organization where id=(p_data->>'owner_management_id')::uuid and kind='management' and enabled;
  if v_owner is null then raise exception 'AREA_NOT_AVAILABLE' using errcode='22023';end if;
 end if;
 if exists(select 1 from unnest(array['last_hydro_year','next_hydro_year']) k where nullif(p_data->>k,'') is not null and (p_data->>k)::integer not between 1900 and 2100)
 or (nullif(p_data->>'last_hydro_year','') is not null and nullif(p_data->>'next_hydro_year','') is not null and (p_data->>'next_hydro_year')::integer<(p_data->>'last_hydro_year')::integer)
 then raise exception 'INVALID_EQUIPMENT' using errcode='22023';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_id::text,30));
 select * into v_row from public.berry_emergency_equipment where id=p_id for update;
 if found then
  if v_row.revision<>p_expected then raise exception 'EQUIPMENT_CONFLICT' using errcode='40001';end if;
  if v_row.code<>v_code then raise exception 'EQUIPMENT_CODE_IMMUTABLE' using errcode='22023';end if;
 else
  if p_expected<>0 then raise exception 'EQUIPMENT_CONFLICT' using errcode='40001';end if;
  insert into public.berry_emergency_equipment(id,kind,code,area_id,management_id,location,created_by,updated_by) values(p_id,'extinguisher',v_code,v_area.id,v_area.parent_id,btrim(p_data->>'location'),v_actor,v_actor) returning * into v_row;
 end if;
 update public.berry_emergency_equipment set area_id=v_area.id,management_id=v_area.parent_id,location=btrim(p_data->>'location'),
 serial_number=coalesce(btrim(p_data->>'serial_number'),''),brand=coalesce(btrim(p_data->>'brand'),''),agent=coalesce(btrim(p_data->>'agent'),''),capacity=coalesce(btrim(p_data->>'capacity'),''),manufacture_year=v_year,
 expiry_month=coalesce(p_data->>'expiry_month',''),last_hydro_date=nullif(p_data->>'last_hydro_date','')::date,next_hydro_date=nullif(p_data->>'next_hydro_date','')::date,
 last_hydro_year=case when p_data?'last_hydro_year' then nullif(p_data->>'last_hydro_year','')::integer else v_row.last_hydro_year end,
 next_hydro_year=case when p_data?'next_hydro_year' then nullif(p_data->>'next_hydro_year','')::integer else v_row.next_hydro_year end,
 owner_management_id=case when p_data?'owner_management_id' then v_owner else v_row.owner_management_id end,
 owner_name=case when v_owner is not null then (select name from public.berry_organization where id=v_owner) else v_row.owner_name end,
 enabled=(p_data->>'enabled')::boolean,revision=case when p_expected=0 then 1 else revision+1 end,updated_at=clock_timestamp(),updated_by=v_actor where id=p_id returning * into v_row;
 return berry_private.emergency_public_equipment(v_row);
end;$$;
revoke all on function public.berry_save_emergency_equipment(uuid,integer,jsonb) from public,anon;
grant execute on function public.berry_save_emergency_equipment(uuid,integer,jsonb) to authenticated;

-- Invoker-only private loader: SQL Editor/DB owner. No public import endpoint or service key in the client.
create or replace function berry_private.import_emergency_inventory(p_batch text,p_source text,p_rows jsonb) returns jsonb language plpgsql set search_path='' as $$
declare r jsonb;e public.berry_emergency_equipment;v_owner uuid;v_id uuid;v_new integer:=0;v_existing integer:=0;v_count integer;v_payload_hash text;
begin
 if p_batch is null or p_batch !~ '^[0-9a-f]{64}$' or p_source is null or p_source !~ '^[0-9a-f]{64}$' or jsonb_typeof(p_rows) is distinct from 'array' then raise exception 'INVALID_INVENTORY';end if;
 v_count:=jsonb_array_length(p_rows);
 if v_count not between 1 and 5000 or (select count(distinct berry_private.emergency_code_key(x->>'code')) from jsonb_array_elements(p_rows) x)<>v_count
 or (select count(distinct x->>'source_row') from jsonb_array_elements(p_rows) x)<>v_count then raise exception 'DUPLICATE_INVENTORY';end if;
 v_payload_hash:=encode(sha256(convert_to(p_rows::text,'UTF8')),'hex');
 perform pg_advisory_xact_lock(20261127,31);
 if exists(select 1 from berry_private.emergency_import_batches where batch_sha=p_batch) then
  if (select source_sha=p_source and record_count=v_count and payload_hash=v_payload_hash from berry_private.emergency_import_batches where batch_sha=p_batch) is not true then raise exception 'IMPORT_CONFLICT';end if;
  return jsonb_build_object('already_imported',true,'records',v_count,'version','202611270031');
 end if;
 insert into berry_private.emergency_import_batches(batch_sha,source_sha,record_count,payload_hash) values(p_batch,p_source,v_count,v_payload_hash);
 for r in select value from jsonb_array_elements(p_rows) loop
  if r->>'kind' is distinct from 'extinguisher' or length(coalesce(btrim(r->>'code'),'')) not between 1 and 80 or length(coalesce(r->>'location',''))>250
  or jsonb_typeof(r->'legacy'->'original') is distinct from 'object' or jsonb_typeof(r->'legacy'->'months') is distinct from 'object'
  or (r->'legacy'->'months'->>'Noviembre') is distinct from (r->'legacy'->>'official_date')
  or (r->'legacy'->'original'->>'FECHA DE INSPECCIÓN')::date is distinct from nullif(r->'legacy'->>'official_date','')::date
  or jsonb_typeof(r->'enabled') is distinct from 'boolean' then raise exception 'INVALID_INVENTORY_ROW';end if;
  select * into e from public.berry_emergency_equipment where kind='extinguisher' and berry_private.emergency_code_key(code)=berry_private.emergency_code_key(r->>'code') for update;
  if found then v_id:=e.id;v_existing:=v_existing+1;
  else
   v_id:=gen_random_uuid();v_owner:=null;
   if nullif(r->>'owner_management_id','') is not null then select id into v_owner from public.berry_organization where id=(r->>'owner_management_id')::uuid and kind='management' and enabled;end if;
   insert into public.berry_emergency_equipment(id,kind,code,area_id,management_id,location,serial_number,brand,agent,capacity,manufacture_year,expiry_month,
    owner_management_id,owner_name,classification,placement_kind,last_hydro_year,next_hydro_year,import_batch_sha,enabled,created_by,updated_by)
   values(v_id,'extinguisher',upper(btrim(r->>'code')),null,null,coalesce(r->>'location',''),coalesce(r->>'serial_number',''),coalesce(r->>'brand',''),coalesce(r->>'agent',''),coalesce(r->>'capacity',''),
    nullif(r->>'manufacture_year','')::integer,coalesce(r->>'expiry_month',''),v_owner,coalesce(r->>'owner_name',''),coalesce(r->>'classification',''),coalesce(r->>'placement_kind',''),
    nullif(r->>'last_hydro_year','')::integer,nullif(r->>'next_hydro_year','')::integer,p_batch,(r->>'enabled')::boolean,null,null);
   v_new:=v_new+1;
  end if;
  insert into public.berry_emergency_legacy_records(equipment_id,batch_sha,source_row,official_date,previous_date,state_original,notes,inspector_code,months,original)
  values(v_id,p_batch,(r->>'source_row')::integer,nullif(r->'legacy'->>'official_date','')::date,nullif(r->'legacy'->>'previous_date','')::date,
   coalesce(r->'legacy'->>'state',''),coalesce(r->'legacy'->>'notes',''),coalesce(r->'legacy'->>'inspector_code',''),r->'legacy'->'months',r->'legacy'->'original');
 end loop;
 return jsonb_build_object('already_imported',false,'records',v_count,'new_equipment',v_new,'existing_equipment_preserved',v_existing,'version','202611270031');
end;$$;
revoke all on function berry_private.import_emergency_inventory(text,text,jsonb) from public,anon,authenticated;

-- BEGIN FIELD INSPECTION FUNCTIONS
create or replace function public.berry_begin_emergency_inspection(p_id uuid,p_token text,p_kind text,p_code text,p_expected integer,p_input jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare v_actor uuid:=auth.uid();v_permit berry_private.emergency_permits;v_equipment public.berry_emergency_equipment;v_area public.berry_organization;
 v_file jsonb;v_files jsonb:='[]';v_request jsonb;v_payload jsonb;v_ext text;v_worker text;v_hash text;v_bytes bigint:=0;v_source text;v_headers jsonb;v_limits berry_private.emergency_limits;v_code text;v_area_id uuid;v_location text;
begin
 if p_kind is distinct from 'extinguisher' then raise exception 'FORMAT_NOT_AVAILABLE' using errcode='22023';end if;
 if p_id is null or p_token is null or p_token !~ '^[0-9a-f]{64}$' or p_expected is null or p_expected<1 or p_code is null or length(p_code) not between 1 and 80
 or jsonb_typeof(p_input) is distinct from 'object' or exists(select 1 from jsonb_object_keys(p_input) k where k<>all(array['worker_name','employee_code','inspection_date','state','notes','files','area_id','location'])) then raise exception 'INVALID_INSPECTION' using errcode='22023';end if;
 if v_actor is not null then perform berry_private.require_ready();select full_name into v_worker from public.berry_profiles where id=v_actor;
 else v_worker:=initcap(regexp_replace(btrim(p_input->>'worker_name'),'\s+',' ','g'));end if;
 if length(coalesce(v_worker,'')) not between 3 and 160 or length(coalesce(btrim(p_input->>'employee_code'),'')) not between 1 and 40
 or (p_input->>'inspection_date') is null or (p_input->>'inspection_date')::date>(clock_timestamp() at time zone 'America/Lima')::date
 or (p_input->>'state') is null or (p_input->>'state') not in('operational','attention','out_of_service','expired','used','depressurized','overpressurized','disabled') or length(coalesce(p_input->>'notes',''))>5000
 or ((p_input->>'state')<>'operational' and btrim(coalesce(p_input->>'notes',''))='') or jsonb_typeof(p_input->'files') is distinct from 'array' then raise exception 'INVALID_INSPECTION' using errcode='22023';end if;
 if jsonb_array_length(p_input->'files') not between 1 and 9 or (select count(*) from jsonb_array_elements(p_input->'files') f where f->>'role'='signature')<>1 then raise exception 'INVALID_FILES' using errcode='22023';end if;
 for v_file in select value from jsonb_array_elements(p_input->'files') loop
  if jsonb_typeof(v_file) is distinct from 'object' or (select count(*) from jsonb_object_keys(v_file))<>5 or v_file->>'id' is null or v_file->>'id' !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  or v_file->>'role' is null or v_file->>'role' not in('signature','photo') or length(coalesce(v_file->>'name','')) not between 1 and 200 or v_file->>'name' ~ '[\\/\r\n]'
  or jsonb_typeof(v_file->'size') is distinct from 'number' or v_file->>'size' !~ '^[0-9]+$' then raise exception 'INVALID_FILES' using errcode='22023';end if;
  v_ext:=case v_file->>'mime' when 'image/jpeg' then 'jpg' when 'image/png' then 'png' when 'image/webp' then 'webp' end;
  if v_ext is null or (v_file->>'size')::bigint not between 1 and 2097152 or (v_file->>'role'='signature' and (v_ext<>'png' or (v_file->>'size')::bigint>1048576)) then raise exception 'INVALID_FILES' using errcode='22023';end if;
  v_bytes:=v_bytes+(v_file->>'size')::bigint;
  v_files:=v_files||jsonb_build_array(v_file||jsonb_build_object('path','public/'||p_id::text||'/'||p_token||'/'||(v_file->>'id')||'.'||v_ext));
 end loop;
 if (select count(distinct f->>'id') from jsonb_array_elements(v_files) f)<>jsonb_array_length(v_files) then raise exception 'INVALID_FILES' using errcode='22023';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_id::text,30));
 select * into v_permit from berry_private.emergency_permits where id=p_id;
 if found then
  if v_permit.secret_hash<>encode(sha256(convert_to(p_token,'UTF8')),'hex') or v_permit.actor_id is distinct from v_actor then raise exception 'UPLOAD_DENIED' using errcode='42501';end if;
  if berry_private.emergency_code_key(v_permit.payload->>'code') is distinct from berry_private.emergency_code_key(p_code) then raise exception 'INSPECTION_CONFLICT' using errcode='40001';end if;
  v_code:=v_permit.payload->>'code';
 else
  select * into v_equipment from public.berry_emergency_equipment e where e.kind=p_kind and e.enabled and berry_private.emergency_code_key(e.code)=berry_private.emergency_code_key(p_code) for share;
  if v_equipment.id is null then raise exception 'EQUIPMENT_NOT_AVAILABLE' using errcode='22023';end if;
  if v_equipment.revision<>p_expected then raise exception 'EQUIPMENT_CONFLICT' using errcode='40001';end if;
  v_code:=v_equipment.code;v_area_id:=coalesce(v_equipment.area_id,nullif(p_input->>'area_id','')::uuid);
  if v_equipment.area_id is not null and nullif(p_input->>'area_id','') is not null and (p_input->>'area_id')::uuid<>v_equipment.area_id then raise exception 'EQUIPMENT_AREA_FIXED' using errcode='22023';end if;
  select * into v_area from public.berry_organization where id=v_area_id and kind='area' and enabled;
  if v_area.id is null or not exists(select 1 from public.berry_organization where id=v_area.parent_id and kind='management' and enabled)
   or (v_equipment.management_id is not null and v_equipment.management_id<>v_area.parent_id) then raise exception 'AREA_NOT_AVAILABLE' using errcode='22023';end if;
  v_location:=coalesce(nullif(btrim(v_equipment.location),''),nullif(btrim(p_input->>'location'),''));
  if length(coalesce(v_location,'')) not between 1 and 250 then raise exception 'LOCATION_REQUIRED' using errcode='22023';end if;
  if nullif(btrim(v_equipment.location),'') is not null and p_input?'location' and btrim(p_input->>'location') is distinct from btrim(v_equipment.location) then raise exception 'EQUIPMENT_LOCATION_FIXED' using errcode='22023';end if;
 end if;
 v_request:=jsonb_build_object('kind',p_kind,'code',v_code,'revision',p_expected,'worker_name',v_worker,'employee_code',btrim(p_input->>'employee_code'),'inspection_date',(p_input->>'inspection_date')::date,'state',p_input->>'state','notes',btrim(coalesce(p_input->>'notes','')),'files',p_input->'files');
 -- Optional additions preserve hashes of existing step-30 permits and retries.
 if p_input?'area_id' then v_request:=v_request||jsonb_build_object('area_id',nullif(p_input->>'area_id','')::uuid);end if;
 if p_input?'location' then v_request:=v_request||jsonb_build_object('location',btrim(p_input->>'location'));end if;
 v_hash:=encode(sha256(convert_to(v_request::text,'UTF8')),'hex');
 if v_permit.id is not null then
  if v_permit.request_hash<>v_hash then raise exception 'INSPECTION_CONFLICT' using errcode='40001';end if;
  if v_permit.received_at is null and v_permit.expires_at<clock_timestamp() then raise exception 'UPLOAD_EXPIRED' using errcode='22023';end if;
 else
  perform pg_advisory_xact_lock(20261125,30);
  v_headers:=coalesce(nullif(current_setting('request.headers',true),''),'{}')::jsonb;
  v_source:=encode(sha256(convert_to(coalesce(nullif(split_part(v_headers->>'x-forwarded-for',',',1),''),v_headers->>'x-real-ip','unknown'),'UTF8')),'hex');
  select * into v_limits from berry_private.emergency_limits where singleton;
  if (select count(*) from berry_private.emergency_permits where created_at>clock_timestamp()-interval '1 hour')>=v_limits.hourly
   or (select count(*) from berry_private.emergency_permits where created_at>clock_timestamp()-interval '24 hours')>=v_limits.daily
   or (select count(*) from berry_private.emergency_permits where source_hash=v_source and created_at>clock_timestamp()-interval '1 hour')>=v_limits.source_hourly
   or (select coalesce(sum(reserved_bytes),0) from berry_private.emergency_permits where created_at>clock_timestamp()-interval '24 hours')+v_bytes>v_limits.daily_bytes then raise exception 'UPLOAD_RATE_LIMIT' using errcode='54000';end if;
  v_payload:=v_request||jsonb_build_object('equipment',berry_private.emergency_public_equipment(v_equipment)||jsonb_build_object('area_id',v_area.id,'management_id',v_area.parent_id,'area_name',v_area.name,'management_name',(select name from public.berry_organization where id=v_area.parent_id),'location',v_location),
   'assignment_area_id',v_area.id,'assignment_location',v_location,'files',v_files);
  insert into berry_private.emergency_permits(id,secret_hash,request_hash,actor_id,equipment_id,payload,reserved_bytes,source_hash)
   values(p_id,encode(sha256(convert_to(p_token,'UTF8')),'hex'),v_hash,v_actor,v_equipment.id,v_payload,v_bytes,v_source) returning * into v_permit;
 end if;
 return jsonb_build_object('id',p_id,'completed',v_permit.received_at is not null,'files',v_permit.payload->'files');
end;$$;
revoke all on function public.berry_begin_emergency_inspection(uuid,text,text,text,integer,jsonb) from public;
grant execute on function public.berry_begin_emergency_inspection(uuid,text,text,text,integer,jsonb) to anon,authenticated;

create or replace function berry_private.emergency_upload_allowed(p_path text) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from berry_private.emergency_permits p join public.berry_emergency_equipment e on e.id=p.equipment_id and e.enabled
 join public.berry_organization a on a.id=coalesce((p.payload->'equipment'->>'area_id')::uuid,e.area_id) and a.enabled
 join public.berry_organization m on m.id=a.parent_id and m.kind='management' and m.enabled
 where p.received_at is null and p.expires_at>clock_timestamp() and (p.actor_id is null or (p.actor_id=auth.uid() and berry_private.is_enabled()))
 and exists(select 1 from jsonb_array_elements(p.payload->'files') f where f->>'path'=p_path));
$$;
revoke all on function berry_private.emergency_upload_allowed(text) from public;
grant execute on function berry_private.emergency_upload_allowed(text) to anon,authenticated;

create or replace function public.berry_finish_emergency_inspection(p_id uuid,p_token text) returns jsonb language plpgsql security definer set search_path='' as $$
declare p berry_private.emergency_permits;e public.berry_emergency_equipment;v_area public.berry_organization;f jsonb;o storage.objects;
 v_time timestamptz;v_signature text;v_photos jsonb:='[]';v_area_id uuid;v_location text;v_changed boolean;v_snapshot jsonb;
begin
 perform pg_advisory_xact_lock(hashtextextended(p_id::text,30));
 select * into p from berry_private.emergency_permits where id=p_id for update;
 if not found or p_token is null or p.secret_hash<>encode(sha256(convert_to(p_token,'UTF8')),'hex') or (p.actor_id is not null and (p.actor_id is distinct from auth.uid() or not berry_private.is_enabled())) then raise exception 'UPLOAD_DENIED' using errcode='42501';end if;
 if p.received_at is null then
  if p.expires_at<clock_timestamp() then raise exception 'UPLOAD_EXPIRED' using errcode='22023';end if;
  select * into e from public.berry_emergency_equipment q where q.id=p.equipment_id and q.enabled for update;
  if e.id is null then raise exception 'EQUIPMENT_NOT_AVAILABLE' using errcode='22023';end if;
  if e.revision<>(p.payload->>'revision')::integer then raise exception 'EQUIPMENT_CONFLICT' using errcode='40001';end if;
  v_area_id:=coalesce((p.payload->>'assignment_area_id')::uuid,e.area_id);
  select * into v_area from public.berry_organization where id=v_area_id and kind='area' and enabled;
  if v_area.id is null or not exists(select 1 from public.berry_organization where id=v_area.parent_id and kind='management' and enabled)
   or (e.area_id is not null and (e.area_id<>v_area.id or e.management_id<>v_area.parent_id)) then raise exception 'AREA_NOT_AVAILABLE' using errcode='22023';end if;
  v_location:=coalesce(nullif(btrim(e.location),''),nullif(p.payload->>'assignment_location',''));
  if length(coalesce(v_location,'')) not between 1 and 250 then raise exception 'LOCATION_REQUIRED' using errcode='22023';end if;
  for f in select value from jsonb_array_elements(p.payload->'files') loop
   select * into o from storage.objects where bucket_id='berry-emergency-evidence' and name=f->>'path';
   if not found then raise exception 'FILE_NOT_STORED' using errcode='22023';end if;
   if coalesce(o.metadata->>'mimetype','')<>f->>'mime' or coalesce((o.metadata->>'size')::bigint,0)<>(f->>'size')::bigint then raise exception 'INVALID_FILE_METADATA' using errcode='22023';end if;
   if f->>'role'='signature' then v_signature:=f->>'path';else v_photos:=v_photos||jsonb_build_array(jsonb_build_object('path',f->>'path','name',f->>'name','mime',f->>'mime'));end if;
  end loop;
  v_time:=clock_timestamp();v_changed:=e.area_id is null or btrim(e.location)='';
  v_snapshot:=(p.payload->'equipment')||jsonb_build_object('area_id',v_area.id,'management_id',v_area.parent_id,'location',v_location,'revision',e.revision+case when v_changed then 1 else 0 end);
  insert into public.berry_emergency_inspections(id,equipment_id,management_id,area_id,inspector_id,worker_name,employee_code,submission_source,inspection_date,state,notes,equipment_snapshot,signature_path,photos,created_at)
  values(p_id,e.id,v_area.parent_id,v_area.id,p.actor_id,p.payload->>'worker_name',p.payload->>'employee_code',case when p.actor_id is null then 'guest' else 'account' end,(p.payload->>'inspection_date')::date,p.payload->>'state',p.payload->>'notes',v_snapshot,v_signature,v_photos,v_time);
  if v_changed then
   update public.berry_emergency_equipment set area_id=v_area.id,management_id=v_area.parent_id,location=v_location,
    assignment_inspection_id=case when e.area_id is null then p_id else e.assignment_inspection_id end,
    revision=revision+1,updated_at=v_time,updated_by=p.actor_id where id=e.id;
  end if;
  update berry_private.emergency_permits set received_at=v_time where id=p_id returning * into p;
 end if;
 return jsonb_build_object('id',p.id,'received',true,'received_at',p.received_at,'equipment_code',p.payload->>'code','worker_name',p.payload->>'worker_name','inspection_date',p.payload->>'inspection_date','state',p.payload->>'state');
end;$$;
revoke all on function public.berry_finish_emergency_inspection(uuid,text) from public;
grant execute on function public.berry_finish_emergency_inspection(uuid,text) to anon,authenticated;
-- END FIELD INSPECTION FUNCTIONS

create or replace function public.berry_emergency_status() returns jsonb language sql stable set search_path='' as $$
 select jsonb_build_object('version','202611270031','public_submission',true,'detailed_history','authorized_accounts','field_assignment',true,'legacy_date_column','H','hydro_years',true);
$$;
revoke all on function public.berry_emergency_status() from public;
grant execute on function public.berry_emergency_status() to anon,authenticated;
notify pgrst,'reload schema';
commit;
