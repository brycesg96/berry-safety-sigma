-- Paso 26. Yo Seguro: envíos múltiples, recepción con fecha del servidor y consulta sin aprobaciones.
begin;
create table if not exists berry_private.yo_seguro_batches(
 id uuid primary key,secret_hash text not null,payload jsonb not null,
 created_at timestamptz not null default clock_timestamp(),expires_at timestamptz not null default clock_timestamp()+interval '90 minutes',
 received_at timestamptz
);
alter table berry_private.yo_seguro_batches enable row level security;
revoke all on berry_private.yo_seguro_batches from public,anon,authenticated;
alter table berry_private.yo_seguro_uploads add column if not exists batch_id uuid references berry_private.yo_seguro_batches(id);
alter table public.berry_safety_documents add column if not exists batch_id uuid;
alter table public.berry_safety_documents add column if not exists site_id uuid references public.berry_locations(id);
alter table public.berry_safety_documents add column if not exists zone_id uuid references public.berry_locations(id);
alter table public.berry_safety_documents add column if not exists site_name text not null default '';
alter table public.berry_safety_documents add column if not exists zone_name text not null default '';
create index if not exists berry_safety_batch on public.berry_safety_documents(batch_id);
create index if not exists berry_safety_person_date on public.berry_safety_documents(management_id,lower(owner_name),created_at desc) where archived_at is null;

create or replace function public.berry_yo_seguro_locations() returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('version','202611220026','sites',coalesce((select jsonb_agg(jsonb_build_object('id',s.id,'name',s.name,'zones',z.items) order by s.sort_order,s.name,s.id)
 from public.berry_locations s cross join lateral(select jsonb_agg(jsonb_build_object('id',a.id,'name',a.name) order by a.sort_order,a.name,a.id) items
 from public.berry_locations a where a.parent_id=s.id and a.kind='zone' and a.enabled)z where s.kind='site' and s.enabled and z.items is not null),'[]'::jsonb));
$$;
revoke all on function public.berry_yo_seguro_locations() from public;
grant execute on function public.berry_yo_seguro_locations() to anon,authenticated;

create or replace function public.berry_begin_yo_seguro_batch(p_id uuid,p_token text,p_area uuid,p_worker text,p_title text,p_site uuid,p_zone uuid,p_files jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_batch berry_private.yo_seguro_batches;v_area public.berry_organization;v_management public.berry_organization;
 v_site public.berry_locations;v_zone public.berry_locations;v_payload jsonb;v_file jsonb;v_id uuid;v_ext text;v_path text;
 v_count integer;v_bytes bigint;v_source text;v_headers jsonb;v_limits berry_private.yo_seguro_limits;v_name text;
begin
 if p_id is null or p_token is null or p_token !~ '^[0-9a-f]{64}$' or p_area is null or p_site is null or p_zone is null
 or p_worker is null or length(btrim(p_worker)) not between 3 and 160 or p_title is null or length(btrim(p_title)) not between 1 and 160
 or p_files is null or jsonb_typeof(p_files)<>'array' then raise exception 'INVALID_DOCUMENT' using errcode='22023';end if;
 v_count:=jsonb_array_length(p_files);
 if v_count not between 1 and 50 then raise exception 'INVALID_FILE_COUNT' using errcode='22023';end if;
 v_bytes:=0;
 for v_file in select value from jsonb_array_elements(p_files) loop
  if jsonb_typeof(v_file)<>'object' then raise exception 'INVALID_DOCUMENT' using errcode='22023';end if;
  if (select count(*) from jsonb_object_keys(v_file))<>5 or jsonb_typeof(v_file->'id') is distinct from 'string' or (v_file->>'id') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  or jsonb_typeof(v_file->'kind') is distinct from 'string' or (v_file->>'kind') not in('ATS','PETAR','CHECKLIST')
  or jsonb_typeof(v_file->'file_name') is distinct from 'string' or length(v_file->>'file_name') not between 1 and 200 or (v_file->>'file_name') ~ '[\\/\r\n]'
  or jsonb_typeof(v_file->'size') is distinct from 'number' or (v_file->>'size') !~ '^[0-9]+$'
  then raise exception 'INVALID_DOCUMENT' using errcode='22023';end if;
  if (v_file->>'size')::numeric not between 1 and 10485760 then raise exception 'INVALID_FILE_METADATA' using errcode='22023';end if;
  v_ext:=case v_file->>'mime' when 'application/pdf' then 'pdf' when 'image/jpeg' then 'jpg' when 'image/png' then 'png' when 'image/webp' then 'webp' end;
  if v_ext is null or lower(v_file->>'file_name') !~ ('\.'||case when v_ext='jpg' then 'jpe?g' else v_ext end||'$') then raise exception 'INVALID_FILE_TYPE' using errcode='22023';end if;
  v_bytes:=v_bytes+(v_file->>'size')::bigint;
 end loop;
 if(select count(distinct value->>'id') from jsonb_array_elements(p_files))<>v_count then raise exception 'INVALID_FILE_COUNT' using errcode='22023';end if;
 v_name:=initcap(regexp_replace(btrim(p_worker),'\s+',' ','g'));
 v_payload:=jsonb_build_object('area_id',p_area,'worker',v_name,'title',btrim(p_title),'site_id',p_site,'zone_id',p_zone,'files',p_files);
 perform pg_advisory_xact_lock(hashtextextended(p_id::text,26));
 select * into v_batch from berry_private.yo_seguro_batches where id=p_id;
 if found then
  if v_batch.secret_hash<>encode(sha256(convert_to(p_token,'UTF8')),'hex') then raise exception 'UPLOAD_DENIED' using errcode='42501';end if;
  if (v_batch.payload-'area_name'-'management_id'-'management_name'-'site_name'-'zone_name') is distinct from v_payload then raise exception 'DOCUMENT_CONFLICT' using errcode='40001';end if;
  if v_batch.received_at is null and v_batch.expires_at<clock_timestamp() then raise exception 'UPLOAD_EXPIRED' using errcode='22023';end if;
 else
  select * into v_area from public.berry_organization where id=p_area and kind='area' and enabled;
  select * into v_management from public.berry_organization where id=v_area.parent_id and kind='management' and enabled;
  select * into v_site from public.berry_locations where id=p_site and kind='site' and enabled;
  select * into v_zone from public.berry_locations where id=p_zone and kind='zone' and enabled and parent_id=p_site;
  if v_area.id is null or v_management.id is null then raise exception 'AREA_NOT_AVAILABLE' using errcode='22023';end if;
  if v_site.id is null or v_zone.id is null then raise exception 'LOCATION_NOT_AVAILABLE' using errcode='22023';end if;
  perform pg_advisory_xact_lock(20261122,25);
  if exists(select 1 from berry_private.yo_seguro_uploads where id in(select(value->>'id')::uuid from jsonb_array_elements(p_files)))
   or exists(select 1 from public.berry_safety_documents where id in(select(value->>'id')::uuid from jsonb_array_elements(p_files))) then raise exception 'DOCUMENT_CONFLICT' using errcode='40001';end if;
  v_headers:=coalesce(nullif(current_setting('request.headers',true),''),'{}')::jsonb;
  v_source:=encode(sha256(convert_to(coalesce(nullif(split_part(v_headers->>'x-forwarded-for',',',1),''),v_headers->>'x-real-ip','unknown'),'UTF8')),'hex');
  select * into v_limits from berry_private.yo_seguro_limits where singleton;
  if (select count(*) from berry_private.yo_seguro_uploads where created_at>clock_timestamp()-interval '1 hour')+v_count>v_limits.hourly
  or (select count(*) from berry_private.yo_seguro_uploads where created_at>clock_timestamp()-interval '24 hours')+v_count>v_limits.daily
  or (select count(*) from berry_private.yo_seguro_uploads where source_hash=v_source and created_at>clock_timestamp()-interval '1 hour')+v_count>v_limits.source_hourly
  or (select coalesce(sum(reserved_bytes),0) from berry_private.yo_seguro_uploads where created_at>clock_timestamp()-interval '24 hours')+v_bytes>v_limits.daily_bytes
  then raise exception 'UPLOAD_RATE_LIMIT' using errcode='54000';end if;
  v_payload:=v_payload||jsonb_build_object('area_name',v_area.name,'management_id',v_management.id,'management_name',v_management.name,'site_name',v_site.name,'zone_name',v_zone.name);
  insert into berry_private.yo_seguro_batches(id,secret_hash,payload) values(p_id,encode(sha256(convert_to(p_token,'UTF8')),'hex'),v_payload) returning * into v_batch;
  for v_file in select value from jsonb_array_elements(p_files) loop
   v_id:=(v_file->>'id')::uuid;
   v_ext:=case v_file->>'mime' when 'application/pdf' then 'pdf' when 'image/jpeg' then 'jpg' when 'image/png' then 'png' when 'image/webp' then 'webp' end;
   v_path:='public/'||v_id::text||'/'||p_token||'/documento.'||v_ext;
   insert into berry_private.yo_seguro_uploads(id,secret_hash,storage_path,payload,source_hash,reserved_bytes,expires_at,batch_id)
   values(v_id,v_batch.secret_hash,v_path,jsonb_build_object('area_id',v_area.id,'management_id',v_management.id,'kind',v_file->>'kind','mime',v_file->>'mime'),v_source,(v_file->>'size')::bigint,v_batch.expires_at,p_id);
  end loop;
 end if;
 return jsonb_build_object('id',p_id,'completed',v_batch.received_at is not null,'files',(select jsonb_agg(jsonb_build_object('id',t.id,'path',t.storage_path) order by t.id) from berry_private.yo_seguro_uploads t where t.batch_id=p_id));
end;$$;

create or replace function public.berry_finish_yo_seguro_batch(p_id uuid,p_token text) returns jsonb language plpgsql security definer set search_path='' as $$
declare v_batch berry_private.yo_seguro_batches;v_ticket berry_private.yo_seguro_uploads;v_file jsonb;v_object storage.objects;v_data jsonb;v_received timestamptz;
begin
 perform pg_advisory_xact_lock(hashtextextended(p_id::text,26));
 select * into v_batch from berry_private.yo_seguro_batches where id=p_id for update;
 if not found or p_token is null or v_batch.secret_hash<>encode(sha256(convert_to(p_token,'UTF8')),'hex') then raise exception 'UPLOAD_DENIED' using errcode='42501';end if;
 if v_batch.received_at is null then
  if v_batch.expires_at<clock_timestamp() then raise exception 'UPLOAD_EXPIRED' using errcode='22023';end if;
  v_data:=v_batch.payload;
  if not exists(select 1 from public.berry_organization a join public.berry_organization m on m.id=a.parent_id where a.id=(v_data->>'area_id')::uuid and a.enabled and a.kind='area' and m.id=(v_data->>'management_id')::uuid and m.enabled and m.kind='management') then raise exception 'AREA_NOT_AVAILABLE' using errcode='22023';end if;
  if not exists(select 1 from public.berry_locations z join public.berry_locations s on s.id=z.parent_id where z.id=(v_data->>'zone_id')::uuid and z.kind='zone' and z.enabled and s.id=(v_data->>'site_id')::uuid and s.kind='site' and s.enabled) then raise exception 'LOCATION_NOT_AVAILABLE' using errcode='22023';end if;
  -- Verifica todo antes de registrar: nunca se publica un envío parcial.
  for v_file in select value from jsonb_array_elements(v_data->'files') loop
   select * into v_ticket from berry_private.yo_seguro_uploads where id=(v_file->>'id')::uuid and batch_id=p_id;
   select * into v_object from storage.objects where bucket_id='berry-safety-documents' and name=v_ticket.storage_path;
   if v_ticket.id is null or not found then raise exception 'FILE_NOT_STORED' using errcode='22023';end if;
   if coalesce(v_object.metadata->>'mimetype','')<>v_file->>'mime' or coalesce((v_object.metadata->>'size')::bigint,0)<>(v_file->>'size')::bigint then raise exception 'INVALID_FILE_METADATA' using errcode='22023';end if;
  end loop;
  v_received:=clock_timestamp();
  for v_file in select value from jsonb_array_elements(v_data->'files') loop
   select * into v_ticket from berry_private.yo_seguro_uploads where id=(v_file->>'id')::uuid;
   insert into public.berry_safety_documents(id,owner_id,owner_name,kind,title,document_date,workplace,storage_path,file_name,mime_type,file_size,management_id,area_id,management_name,area_name,submission_source,batch_id,site_id,zone_id,site_name,zone_name,created_at)
   values(v_ticket.id,null,v_data->>'worker',v_file->>'kind',v_data->>'title',(v_received at time zone 'America/Lima')::date,(v_data->>'site_name')||' – '||(v_data->>'zone_name'),v_ticket.storage_path,v_file->>'file_name',v_file->>'mime',(v_file->>'size')::bigint,(v_data->>'management_id')::uuid,(v_data->>'area_id')::uuid,v_data->>'management_name',v_data->>'area_name','guest',p_id,(v_data->>'site_id')::uuid,(v_data->>'zone_id')::uuid,v_data->>'site_name',v_data->>'zone_name',v_received);
   update berry_private.yo_seguro_uploads set completed_at=v_received where id=v_ticket.id;
  end loop;
  update berry_private.yo_seguro_batches set received_at=v_received where id=p_id returning * into v_batch;
 end if;
 return jsonb_build_object('id',p_id,'received',true,'received_at',v_batch.received_at,'count',jsonb_array_length(v_batch.payload->'files'));
end;$$;
revoke all on function public.berry_begin_yo_seguro_batch(uuid,text,uuid,text,text,uuid,uuid,jsonb),public.berry_finish_yo_seguro_batch(uuid,text) from public;
grant execute on function public.berry_begin_yo_seguro_batch(uuid,text,uuid,text,text,uuid,uuid,jsonb),public.berry_finish_yo_seguro_batch(uuid,text) to anon,authenticated;

create or replace function berry_private.yo_seguro_account_timestamp() returns trigger language plpgsql set search_path='' as $$
begin
 if new.submission_source='account' then new.created_at:=clock_timestamp();new.document_date:=(new.created_at at time zone 'America/Lima')::date;end if;
 return new;
end;$$;
revoke all on function berry_private.yo_seguro_account_timestamp() from public,anon,authenticated;
drop trigger if exists yo_seguro_account_timestamp on public.berry_safety_documents;
create trigger yo_seguro_account_timestamp before insert on public.berry_safety_documents for each row execute function berry_private.yo_seguro_account_timestamp();

-- Los comprobantes de recepción no son aprobaciones. Se cierra la revisión también por API.
revoke all on function public.berry_review_safety_document(uuid,integer,text,text) from public,anon,authenticated;
-- Evita confirmar un archivo de un lote usando el endpoint anterior.
create or replace function public.berry_finish_yo_seguro_upload(p_id uuid,p_token text) returns jsonb language plpgsql security definer set search_path='' as $$
declare v_ticket berry_private.yo_seguro_uploads;v_object storage.objects;v_data jsonb;v_received timestamptz;
begin
 perform pg_advisory_xact_lock(hashtextextended(p_id::text,25));
 select * into v_ticket from berry_private.yo_seguro_uploads where id=p_id for update;
 if not found or p_token is null or v_ticket.secret_hash<>encode(sha256(convert_to(p_token,'UTF8')),'hex') or v_ticket.batch_id is not null then raise exception 'UPLOAD_DENIED' using errcode='42501';end if;
 if v_ticket.completed_at is null then
  if v_ticket.expires_at<clock_timestamp() then raise exception 'UPLOAD_EXPIRED' using errcode='22023';end if;
  v_data:=v_ticket.payload;
  if not exists(select 1 from public.berry_organization a join public.berry_organization m on m.id=a.parent_id where a.id=(v_data->>'area_id')::uuid and a.enabled and m.id=(v_data->>'management_id')::uuid and m.enabled) then raise exception 'AREA_NOT_AVAILABLE' using errcode='22023';end if;
  select * into v_object from storage.objects where bucket_id='berry-safety-documents' and name=v_ticket.storage_path;
  if not found then raise exception 'FILE_NOT_STORED' using errcode='22023';end if;
  if coalesce(v_object.metadata->>'mimetype','')<>v_data->>'mime' or coalesce((v_object.metadata->>'size')::bigint,0)<>v_ticket.reserved_bytes then raise exception 'INVALID_FILE_METADATA' using errcode='22023';end if;
  v_received:=clock_timestamp();
  insert into public.berry_safety_documents(id,owner_id,owner_name,kind,title,document_date,workplace,storage_path,file_name,mime_type,file_size,management_id,area_id,management_name,area_name,submission_source,created_at)
  values(p_id,null,v_data->>'worker',v_data->>'kind',v_data->>'title',(v_received at time zone 'America/Lima')::date,v_data->>'workplace',v_ticket.storage_path,v_data->>'file_name',v_data->>'mime',v_ticket.reserved_bytes,(v_data->>'management_id')::uuid,(v_data->>'area_id')::uuid,v_data->>'management_name',v_data->>'area_name','guest',v_received);
  update berry_private.yo_seguro_uploads set completed_at=v_received where id=p_id;
 end if;
 return jsonb_build_object('id',p_id,'received',true);
end;$$;
-- PostgreSQL Realtime respeta los permisos RLS de cada suscriptor autenticado.
do $$ begin
 if exists(select 1 from pg_publication where pubname='supabase_realtime') and not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='berry_safety_documents') then
  alter publication supabase_realtime add table public.berry_safety_documents;
 end if;
end;$$;
notify pgrst,'reload schema';
commit;
select '202611220026' as yo_seguro_version;
