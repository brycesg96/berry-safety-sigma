-- Paso 30. ¡Yo Reviso!: catálogo privado, consulta exacta pública y recepción de inspecciones.
begin;
do $$ begin if to_regclass('berry_private.yo_seguro_batches') is null then raise exception 'Aplica primero los pasos de Yo Seguro';end if;end;$$;
create table if not exists public.berry_emergency_equipment(
 id uuid primary key,kind text not null check(kind in('extinguisher','eyewash','shower')),
 code text unique not null check(length(code) between 1 and 80),area_id uuid not null references public.berry_organization(id),management_id uuid not null references public.berry_organization(id),
 location text not null check(length(btrim(location)) between 1 and 250),serial_number text not null default '',brand text not null default '',agent text not null default '',capacity text not null default '',
 manufacture_year integer,expiry_month text not null default '',last_hydro_date date,next_hydro_date date,enabled boolean not null default true,
 revision integer not null default 1,created_at timestamptz not null default clock_timestamp(),updated_at timestamptz not null default clock_timestamp(),
 created_by uuid not null references public.berry_profiles(id),updated_by uuid not null references public.berry_profiles(id),
 check(expiry_month='' or expiry_month ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),check(next_hydro_date is null or last_hydro_date is null or next_hydro_date>=last_hydro_date)
);
create table if not exists public.berry_emergency_inspections(
 id uuid primary key,equipment_id uuid not null references public.berry_emergency_equipment(id),management_id uuid not null references public.berry_organization(id),area_id uuid not null references public.berry_organization(id),
 inspector_id uuid references public.berry_profiles(id),worker_name text not null,employee_code text not null,submission_source text not null check(submission_source in('guest','account')),
 inspection_date date not null,state text not null check(state in('operational','attention','out_of_service')),notes text not null default '',equipment_snapshot jsonb not null,
 signature_path text not null,photos jsonb not null default '[]',created_at timestamptz not null default clock_timestamp()
);
create index if not exists emergency_equipment_scope on public.berry_emergency_equipment(management_id,kind,code);
create index if not exists emergency_inspections_history on public.berry_emergency_inspections(equipment_id,inspection_date desc,created_at desc,id desc);
create table if not exists berry_private.emergency_permits(
 id uuid primary key,secret_hash text not null,request_hash text not null,actor_id uuid references public.berry_profiles(id),equipment_id uuid not null references public.berry_emergency_equipment(id),
 payload jsonb not null,reserved_bytes bigint not null,source_hash text not null,created_at timestamptz not null default clock_timestamp(),expires_at timestamptz not null default clock_timestamp()+interval '90 minutes',received_at timestamptz
);
create index if not exists emergency_permits_created on berry_private.emergency_permits(created_at);
create table if not exists berry_private.emergency_limits(singleton boolean primary key default true check(singleton),hourly integer not null default 500,daily integer not null default 2000,source_hourly integer not null default 120,daily_bytes bigint not null default 2147483648);
insert into berry_private.emergency_limits(singleton) values(true) on conflict do nothing;
alter table public.berry_emergency_equipment enable row level security;
alter table public.berry_emergency_inspections enable row level security;
alter table berry_private.emergency_permits enable row level security;
alter table berry_private.emergency_limits enable row level security;
revoke all on public.berry_emergency_equipment,public.berry_emergency_inspections,berry_private.emergency_permits,berry_private.emergency_limits from public,anon,authenticated;
grant select on public.berry_emergency_equipment,public.berry_emergency_inspections to authenticated;
create or replace function berry_private.emergency_scope(p_management uuid) returns boolean language sql stable security definer set search_path='' as $$
 select berry_private.is_enabled() and (berry_private.safety_admin() or exists(select 1 from public.berry_profiles p join public.berry_organization m on m.id=p.yo_seguro_management_id where p.id=auth.uid() and m.id=p_management and m.enabled and m.kind='management'));
$$;
revoke all on function berry_private.emergency_scope(uuid) from public,anon;
grant execute on function berry_private.emergency_scope(uuid) to authenticated;
drop policy if exists emergency_equipment_read on public.berry_emergency_equipment;
create policy emergency_equipment_read on public.berry_emergency_equipment for select to authenticated using(berry_private.emergency_scope(management_id));
drop policy if exists emergency_inspections_read on public.berry_emergency_inspections;
create policy emergency_inspections_read on public.berry_emergency_inspections for select to authenticated using(berry_private.yo_seguro_read(inspector_id,created_at,management_id));

create or replace function public.berry_emergency_status() returns jsonb language sql stable set search_path='' as $$select jsonb_build_object('version','202611250030','public_submission',true,'detailed_history','authorized_accounts');$$;
revoke all on function public.berry_emergency_status() from public;
grant execute on function public.berry_emergency_status() to anon,authenticated;
-- No listado ni búsqueda parcial pública. Nunca expone personas, firmas, fotos ni observaciones anteriores.
create or replace function public.berry_emergency_lookup(p_kind text,p_code text) returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('equipment',(to_jsonb(e)-'created_by'-'updated_by'-'created_at'-'updated_at')||jsonb_build_object('area_name',a.name,'management_name',m.name),'latest',(select jsonb_build_object('inspection_date',i.inspection_date,'state',i.state) from public.berry_emergency_inspections i where i.equipment_id=e.id order by i.inspection_date desc,i.created_at desc,i.id desc limit 1))
 from public.berry_emergency_equipment e join public.berry_organization a on a.id=e.area_id and a.enabled join public.berry_organization m on m.id=e.management_id and m.enabled and a.parent_id=m.id
 where e.kind=p_kind and e.code=upper(regexp_replace(btrim(p_code),'\s+',' ','g')) and length(p_code) between 1 and 80 and e.enabled;
$$;
revoke all on function public.berry_emergency_lookup(text,text) from public;
grant execute on function public.berry_emergency_lookup(text,text) to anon,authenticated;

create or replace function public.berry_save_emergency_equipment(p_id uuid,p_expected integer,p_data jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare v_actor uuid:=berry_private.require_admin();v_row public.berry_emergency_equipment;v_area public.berry_organization;v_code text;v_year integer;
begin
 if p_id is null or p_expected is null or p_expected<0 or jsonb_typeof(p_data) is distinct from 'object' or exists(select 1 from jsonb_object_keys(p_data) k where k<>all(array['code','kind','area_id','location','serial_number','brand','agent','capacity','manufacture_year','expiry_month','last_hydro_date','next_hydro_date','enabled'])) then raise exception 'INVALID_EQUIPMENT' using errcode='22023';end if;
 if p_data->>'kind' is distinct from 'extinguisher' then raise exception 'FORMAT_NOT_AVAILABLE' using errcode='22023';end if;
 v_code:=upper(regexp_replace(btrim(p_data->>'code'),'\s+',' ','g'));
 if v_code is null or length(v_code) not between 1 and 80 or length(coalesce(btrim(p_data->>'location'),'')) not between 1 and 250
 or exists(select 1 from unnest(array['serial_number','brand','agent','capacity']) k where length(coalesce(p_data->>k,''))>160)
 or (coalesce(p_data->>'expiry_month','')<>'' and p_data->>'expiry_month' !~ '^[0-9]{4}-(0[1-9]|1[0-2])$')
 or jsonb_typeof(p_data->'enabled') is distinct from 'boolean' then raise exception 'INVALID_EQUIPMENT' using errcode='22023';end if;
 v_year:=nullif(p_data->>'manufacture_year','')::integer;
 if v_year is not null and (v_year<1900 or v_year>extract(year from clock_timestamp() at time zone 'America/Lima')) then raise exception 'INVALID_EQUIPMENT' using errcode='22023';end if;
 select * into v_area from public.berry_organization where id=(p_data->>'area_id')::uuid and kind='area' and enabled;
 if v_area.id is null or not exists(select 1 from public.berry_organization where id=v_area.parent_id and kind='management' and enabled) then raise exception 'AREA_NOT_AVAILABLE' using errcode='22023';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_id::text,30));
 select * into v_row from public.berry_emergency_equipment where id=p_id for update;
 if found then
  if v_row.revision<>p_expected then raise exception 'EQUIPMENT_CONFLICT' using errcode='40001';end if;
  if v_row.code<>v_code then raise exception 'EQUIPMENT_CODE_IMMUTABLE' using errcode='22023';end if;
 else
  if p_expected<>0 then raise exception 'EQUIPMENT_CONFLICT' using errcode='40001';end if;
  insert into public.berry_emergency_equipment(id,kind,code,area_id,management_id,location,created_by,updated_by) values(p_id,'extinguisher',v_code,v_area.id,v_area.parent_id,btrim(p_data->>'location'),v_actor,v_actor) returning * into v_row;
 end if;
 update public.berry_emergency_equipment set area_id=v_area.id,management_id=v_area.parent_id,location=btrim(p_data->>'location'),serial_number=coalesce(btrim(p_data->>'serial_number'),''),brand=coalesce(btrim(p_data->>'brand'),''),agent=coalesce(btrim(p_data->>'agent'),''),capacity=coalesce(btrim(p_data->>'capacity'),''),manufacture_year=v_year,expiry_month=coalesce(p_data->>'expiry_month',''),last_hydro_date=nullif(p_data->>'last_hydro_date','')::date,next_hydro_date=nullif(p_data->>'next_hydro_date','')::date,enabled=(p_data->>'enabled')::boolean,revision=case when p_expected=0 then 1 else revision+1 end,updated_at=clock_timestamp(),updated_by=v_actor where id=p_id returning * into v_row;
 return to_jsonb(v_row);
end;$$;
revoke all on function public.berry_save_emergency_equipment(uuid,integer,jsonb) from public,anon;
grant execute on function public.berry_save_emergency_equipment(uuid,integer,jsonb) to authenticated;

create or replace function public.berry_begin_emergency_inspection(p_id uuid,p_token text,p_kind text,p_code text,p_expected integer,p_input jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare v_actor uuid:=auth.uid();v_permit berry_private.emergency_permits;v_equipment public.berry_emergency_equipment;v_file jsonb;v_files jsonb:='[]';v_request jsonb;v_payload jsonb;v_ext text;v_worker text;v_hash text;v_bytes bigint:=0;v_source text;v_headers jsonb;v_limits berry_private.emergency_limits;
begin
 if p_kind is distinct from 'extinguisher' then raise exception 'FORMAT_NOT_AVAILABLE' using errcode='22023';end if;
 if p_id is null or p_token is null or p_token !~ '^[0-9a-f]{64}$' or p_expected is null or p_expected<1 or p_code is null or length(p_code) not between 1 and 80
 or jsonb_typeof(p_input) is distinct from 'object' or exists(select 1 from jsonb_object_keys(p_input) k where k<>all(array['worker_name','employee_code','inspection_date','state','notes','files'])) then raise exception 'INVALID_INSPECTION' using errcode='22023';end if;
 if v_actor is not null then perform berry_private.require_ready();select full_name into v_worker from public.berry_profiles where id=v_actor;
 else v_worker:=initcap(regexp_replace(btrim(p_input->>'worker_name'),'\s+',' ','g'));end if;
 if length(coalesce(v_worker,'')) not between 3 and 160 or length(coalesce(btrim(p_input->>'employee_code'),'')) not between 1 and 40
 or (p_input->>'inspection_date') is null or (p_input->>'inspection_date')::date>(clock_timestamp() at time zone 'America/Lima')::date
 or (p_input->>'state') is null or (p_input->>'state') not in('operational','attention','out_of_service') or length(coalesce(p_input->>'notes',''))>5000
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
 v_request:=jsonb_build_object('kind',p_kind,'code',upper(regexp_replace(btrim(p_code),'\s+',' ','g')),'revision',p_expected,'worker_name',v_worker,'employee_code',btrim(p_input->>'employee_code'),'inspection_date',(p_input->>'inspection_date')::date,'state',p_input->>'state','notes',btrim(coalesce(p_input->>'notes','')),'files',p_input->'files');
 v_hash:=encode(sha256(convert_to(v_request::text,'UTF8')),'hex');
 perform pg_advisory_xact_lock(hashtextextended(p_id::text,30));
 select * into v_permit from berry_private.emergency_permits where id=p_id;
 if found then
  if v_permit.secret_hash<>encode(sha256(convert_to(p_token,'UTF8')),'hex') or v_permit.actor_id is distinct from v_actor then raise exception 'UPLOAD_DENIED' using errcode='42501';end if;
  if v_permit.request_hash<>v_hash then raise exception 'INSPECTION_CONFLICT' using errcode='40001';end if;
  if v_permit.received_at is null and v_permit.expires_at<clock_timestamp() then raise exception 'UPLOAD_EXPIRED' using errcode='22023';end if;
 else
  select e.* into v_equipment from public.berry_emergency_equipment e join public.berry_organization a on a.id=e.area_id and a.enabled join public.berry_organization m on m.id=e.management_id and m.enabled and a.parent_id=m.id where e.code=v_request->>'code' and e.kind=p_kind and e.enabled for share of e;
  if v_equipment.id is null then raise exception 'EQUIPMENT_NOT_AVAILABLE' using errcode='22023';end if;
  if v_equipment.revision<>p_expected then raise exception 'EQUIPMENT_CONFLICT' using errcode='40001';end if;
  perform pg_advisory_xact_lock(20261125,30);
  v_headers:=coalesce(nullif(current_setting('request.headers',true),''),'{}')::jsonb;
  v_source:=encode(sha256(convert_to(coalesce(nullif(split_part(v_headers->>'x-forwarded-for',',',1),''),v_headers->>'x-real-ip','unknown'),'UTF8')),'hex');
  select * into v_limits from berry_private.emergency_limits where singleton;
  if (select count(*) from berry_private.emergency_permits where created_at>clock_timestamp()-interval '1 hour')>=v_limits.hourly or (select count(*) from berry_private.emergency_permits where created_at>clock_timestamp()-interval '24 hours')>=v_limits.daily or (select count(*) from berry_private.emergency_permits where source_hash=v_source and created_at>clock_timestamp()-interval '1 hour')>=v_limits.source_hourly or (select coalesce(sum(reserved_bytes),0) from berry_private.emergency_permits where created_at>clock_timestamp()-interval '24 hours')+v_bytes>v_limits.daily_bytes then raise exception 'UPLOAD_RATE_LIMIT' using errcode='54000';end if;
  v_payload:=v_request||jsonb_build_object('equipment',(to_jsonb(v_equipment)-'created_by'-'updated_by')||(select jsonb_build_object('area_name',a.name,'management_name',m.name) from public.berry_organization a join public.berry_organization m on m.id=a.parent_id where a.id=v_equipment.area_id),'files',v_files);
  insert into berry_private.emergency_permits(id,secret_hash,request_hash,actor_id,equipment_id,payload,reserved_bytes,source_hash) values(p_id,encode(sha256(convert_to(p_token,'UTF8')),'hex'),v_hash,v_actor,v_equipment.id,v_payload,v_bytes,v_source) returning * into v_permit;
 end if;
 return jsonb_build_object('id',p_id,'completed',v_permit.received_at is not null,'files',v_permit.payload->'files');
end;$$;

create or replace function berry_private.emergency_upload_allowed(p_path text) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from berry_private.emergency_permits p join public.berry_emergency_equipment e on e.id=p.equipment_id and e.enabled join public.berry_organization a on a.id=e.area_id and a.enabled join public.berry_organization m on m.id=e.management_id and m.enabled and a.parent_id=m.id
 where p.received_at is null and p.expires_at>clock_timestamp() and (p.actor_id is null or (p.actor_id=auth.uid() and berry_private.is_enabled())) and exists(select 1 from jsonb_array_elements(p.payload->'files') f where f->>'path'=p_path));
$$;
revoke all on function berry_private.emergency_upload_allowed(text) from public;
grant execute on function berry_private.emergency_upload_allowed(text) to anon,authenticated;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('berry-emergency-evidence','berry-emergency-evidence',false,2097152,array['image/jpeg','image/png','image/webp']) on conflict(id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;
drop policy if exists emergency_evidence_insert on storage.objects;
create policy emergency_evidence_insert on storage.objects for insert to anon,authenticated with check(bucket_id='berry-emergency-evidence' and berry_private.emergency_upload_allowed(name));
drop policy if exists emergency_evidence_read on storage.objects;
create policy emergency_evidence_read on storage.objects for select to authenticated using(bucket_id='berry-emergency-evidence' and exists(select 1 from public.berry_emergency_inspections i where (i.signature_path=name or i.photos @> jsonb_build_array(jsonb_build_object('path',name))) and berry_private.yo_seguro_read(i.inspector_id,i.created_at,i.management_id)));

create or replace function public.berry_finish_emergency_inspection(p_id uuid,p_token text) returns jsonb language plpgsql security definer set search_path='' as $$
declare p berry_private.emergency_permits;e public.berry_emergency_equipment;f jsonb;o storage.objects;v_time timestamptz;v_signature text;v_photos jsonb:='[]';
begin
 perform pg_advisory_xact_lock(hashtextextended(p_id::text,30));
 select * into p from berry_private.emergency_permits where id=p_id for update;
 if not found or p_token is null or p.secret_hash<>encode(sha256(convert_to(p_token,'UTF8')),'hex') or (p.actor_id is not null and (p.actor_id is distinct from auth.uid() or not berry_private.is_enabled())) then raise exception 'UPLOAD_DENIED' using errcode='42501';end if;
 if p.received_at is null then
  if p.expires_at<clock_timestamp() then raise exception 'UPLOAD_EXPIRED' using errcode='22023';end if;
  select q.* into e from public.berry_emergency_equipment q join public.berry_organization a on a.id=q.area_id and a.enabled join public.berry_organization m on m.id=q.management_id and m.enabled and a.parent_id=m.id where q.id=p.equipment_id and q.enabled for share of q;
  if e.id is null then raise exception 'EQUIPMENT_NOT_AVAILABLE' using errcode='22023';end if;
  if e.revision<>(p.payload->>'revision')::integer then raise exception 'EQUIPMENT_CONFLICT' using errcode='40001';end if;
  for f in select value from jsonb_array_elements(p.payload->'files') loop
   select * into o from storage.objects where bucket_id='berry-emergency-evidence' and name=f->>'path';
   if not found then raise exception 'FILE_NOT_STORED' using errcode='22023';end if;
   if coalesce(o.metadata->>'mimetype','')<>f->>'mime' or coalesce((o.metadata->>'size')::bigint,0)<>(f->>'size')::bigint then raise exception 'INVALID_FILE_METADATA' using errcode='22023';end if;
   if f->>'role'='signature' then v_signature:=f->>'path';else v_photos:=v_photos||jsonb_build_array(jsonb_build_object('path',f->>'path','name',f->>'name','mime',f->>'mime'));end if;
  end loop;
  v_time:=clock_timestamp();
  insert into public.berry_emergency_inspections(id,equipment_id,management_id,area_id,inspector_id,worker_name,employee_code,submission_source,inspection_date,state,notes,equipment_snapshot,signature_path,photos,created_at)
  values(p_id,e.id,e.management_id,e.area_id,p.actor_id,p.payload->>'worker_name',p.payload->>'employee_code',case when p.actor_id is null then 'guest' else 'account' end,(p.payload->>'inspection_date')::date,p.payload->>'state',p.payload->>'notes',p.payload->'equipment',v_signature,v_photos,v_time);
  update berry_private.emergency_permits set received_at=v_time where id=p_id returning * into p;
 end if;
 return jsonb_build_object('id',p.id,'received',true,'received_at',p.received_at,'equipment_code',p.payload->>'code','worker_name',p.payload->>'worker_name','inspection_date',p.payload->>'inspection_date','state',p.payload->>'state');
end;$$;
revoke all on function public.berry_begin_emergency_inspection(uuid,text,text,text,integer,jsonb),public.berry_finish_emergency_inspection(uuid,text) from public;
grant execute on function public.berry_begin_emergency_inspection(uuid,text,text,text,integer,jsonb),public.berry_finish_emergency_inspection(uuid,text) to anon,authenticated;
drop trigger if exists emergency_equipment_audit on public.berry_emergency_equipment;
create trigger emergency_equipment_audit after insert or update on public.berry_emergency_equipment for each row execute function berry_private.record_change();
drop trigger if exists emergency_inspection_audit on public.berry_emergency_inspections;
create trigger emergency_inspection_audit after insert on public.berry_emergency_inspections for each row execute function berry_private.record_change();
notify pgrst,'reload schema';
commit;
select '202611250030' as yo_reviso_version;
