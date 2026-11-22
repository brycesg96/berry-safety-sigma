-- Paso 25. Yo Seguro: recepción sin cuenta y consulta privada por gerencia.
-- Requiere el paso 24. No crea cuentas ni concede lectura anónima de archivos.
begin;
alter table public.berry_safety_documents alter column owner_id drop not null;
alter table public.berry_safety_documents add column if not exists management_id uuid references public.berry_organization(id);
alter table public.berry_safety_documents add column if not exists area_id uuid references public.berry_organization(id);
alter table public.berry_safety_documents add column if not exists management_name text not null default '';
alter table public.berry_safety_documents add column if not exists area_name text not null default '';
alter table public.berry_safety_documents add column if not exists submission_source text not null default 'account' check(submission_source in('account','guest'));
-- Alcance autorizado estable: editar el perfil no cambia los permisos de lectura.
alter table public.berry_profiles add column if not exists yo_seguro_management_id uuid references public.berry_organization(id);
alter table public.berry_profiles add column if not exists yo_seguro_scope_set boolean not null default false;
revoke update(yo_seguro_management_id,yo_seguro_scope_set) on public.berry_profiles from anon,authenticated;
update public.berry_profiles p set yo_seguro_management_id=m.id,yo_seguro_scope_set=true from public.berry_organization m
where not p.yo_seguro_scope_set and m.kind='management' and m.enabled and lower(btrim(m.name))=lower(btrim(p.management));
create or replace function berry_private.yo_seguro_initial_scope() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if not new.yo_seguro_scope_set then
  select id into new.yo_seguro_management_id from public.berry_organization where kind='management' and enabled and lower(btrim(name))=lower(btrim(new.management));
  if new.yo_seguro_management_id is not null then new.yo_seguro_scope_set:=true;end if;
 end if;
 return new;
end;$$;
revoke all on function berry_private.yo_seguro_initial_scope() from public,anon,authenticated;
drop trigger if exists yo_seguro_initial_scope on public.berry_profiles;
create trigger yo_seguro_initial_scope before insert or update of management on public.berry_profiles for each row execute function berry_private.yo_seguro_initial_scope();
create or replace function public.berry_yo_seguro_account_access(p_user uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_actor uuid:=berry_private.require_admin();v_management uuid;
begin
 select yo_seguro_management_id into v_management from public.berry_profiles where id=p_user and deleted_at is null;
 if not found then raise exception 'ACCOUNT_NOT_FOUND' using errcode='22023';end if;
 return jsonb_build_object('user_id',p_user,'management_id',v_management);
end;$$;
revoke all on function public.berry_yo_seguro_account_access(uuid) from public,anon;
grant execute on function public.berry_yo_seguro_account_access(uuid) to authenticated;
create or replace function public.berry_set_yo_seguro_access(p_user uuid,p_expected uuid,p_management uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare v_actor uuid:=berry_private.require_admin();v_profile public.berry_profiles;
begin
 select * into v_profile from public.berry_profiles where id=p_user and deleted_at is null for update;
 if not found then raise exception 'ACCOUNT_NOT_FOUND' using errcode='22023';end if;
 if v_profile.yo_seguro_management_id is distinct from p_expected then raise exception 'DOCUMENT_CONFLICT' using errcode='40001';end if;
 if p_management is not null and not exists(select 1 from public.berry_organization where id=p_management and kind='management' and enabled) then raise exception 'AREA_NOT_AVAILABLE' using errcode='22023';end if;
 update public.berry_profiles set yo_seguro_management_id=p_management,yo_seguro_scope_set=true where id=p_user returning * into v_profile;
 return to_jsonb(v_profile);
end;$$;
revoke all on function public.berry_set_yo_seguro_access(uuid,uuid,uuid) from public,anon;
grant execute on function public.berry_set_yo_seguro_access(uuid,uuid,uuid) to authenticated;
-- Una recepción sin cuenta no tiene propietario autenticado: NULL nunca concede permisos.
create or replace function berry_private.safety_own_visible(p_owner uuid,p_created timestamptz) returns boolean language sql stable security definer set search_path='' as $$
 select p_owner is not null and p_owner=auth.uid() and exists(select 1 from public.berry_profiles where id=auth.uid() and p_created>=coalesce(history_access_from,'-infinity'::timestamptz));
$$;
create or replace function berry_private.yo_seguro_account_area() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.submission_source='account' then
  select m.id,m.name,a.id,a.name into new.management_id,new.management_name,new.area_id,new.area_name
  from public.berry_profiles p join public.berry_organization m on m.kind='management' and lower(btrim(m.name))=lower(btrim(p.management))
  join public.berry_organization a on a.kind='area' and a.parent_id=m.id and lower(btrim(a.name))=lower(btrim(p.area)) where p.id=new.owner_id;
  new.management_name:=coalesce(new.management_name,'');new.area_name:=coalesce(new.area_name,'');
 end if;
 return new;
end;$$;
revoke all on function berry_private.yo_seguro_account_area() from public,anon,authenticated;
drop trigger if exists yo_seguro_account_area on public.berry_safety_documents;
create trigger yo_seguro_account_area before insert on public.berry_safety_documents for each row execute function berry_private.yo_seguro_account_area();
-- El respaldo inicial no se repite al reinstalar: preserva la clasificación histórica.
create table if not exists berry_private.yo_seguro_installations(version text primary key);
alter table berry_private.yo_seguro_installations enable row level security;
revoke all on berry_private.yo_seguro_installations from public,anon,authenticated;
do $$ begin
 if not exists(select 1 from berry_private.yo_seguro_installations where version='202611220025') then
 update public.berry_safety_documents d set management_id=m.id,management_name=m.name,area_id=a.id,area_name=a.name
from public.berry_profiles p join public.berry_organization m on m.kind='management' and lower(btrim(m.name))=lower(btrim(p.management))
join public.berry_organization a on a.kind='area' and a.parent_id=m.id and lower(btrim(a.name))=lower(btrim(p.area))
where d.owner_id=p.id and d.management_id is null;
 insert into berry_private.yo_seguro_installations(version) values('202611220025');
 end if;
end;$$;
create index if not exists berry_safety_management_area on public.berry_safety_documents(management_id,area_id,created_at desc,id) where archived_at is null;

create table if not exists berry_private.yo_seguro_uploads(
 id uuid primary key, secret_hash text not null, storage_path text unique not null, payload jsonb not null,
 source_hash text not null, reserved_bytes bigint not null, created_at timestamptz not null default clock_timestamp(),
 expires_at timestamptz not null default clock_timestamp()+interval '30 minutes', completed_at timestamptz
);
alter table berry_private.yo_seguro_uploads enable row level security;
revoke all on berry_private.yo_seguro_uploads from public,anon,authenticated;
create index if not exists yo_seguro_uploads_date on berry_private.yo_seguro_uploads(created_at);
create index if not exists yo_seguro_uploads_source on berry_private.yo_seguro_uploads(source_hash,created_at);
-- Límites operativos ajustables por el propietario del proyecto (bytes reservados, también intentos incompletos).
create table if not exists berry_private.yo_seguro_limits(
 singleton boolean primary key default true check(singleton), hourly integer not null default 500,
 daily integer not null default 2000, source_hourly integer not null default 120,
 daily_bytes bigint not null default 2147483648
);
alter table berry_private.yo_seguro_limits enable row level security;
revoke all on berry_private.yo_seguro_limits from public,anon,authenticated;
insert into berry_private.yo_seguro_limits(singleton) values(true) on conflict do nothing;

create or replace function berry_private.yo_seguro_read(p_owner uuid,p_created timestamptz,p_management uuid)
returns boolean language sql stable security definer set search_path='' as $$
 select berry_private.is_enabled() and (berry_private.safety_admin() or exists(
  select 1 from public.berry_profiles p where p.id=auth.uid() and p_created>=coalesce(p.history_access_from,'-infinity'::timestamptz)
  and ((p_management is null and p_owner=p.id) or exists(select 1 from public.berry_organization m
    where m.id=p_management and m.kind='management' and m.enabled and m.id=p.yo_seguro_management_id))));
$$;
revoke all on function berry_private.yo_seguro_read(uuid,timestamptz,uuid) from public,anon;
grant execute on function berry_private.yo_seguro_read(uuid,timestamptz,uuid) to authenticated;
drop policy if exists berry_safety_read on public.berry_safety_documents;
create policy berry_safety_read on public.berry_safety_documents for select to authenticated using(
 archived_at is null and berry_private.yo_seguro_read(owner_id,created_at,management_id));
drop policy if exists berry_safety_files_read on storage.objects;
create policy berry_safety_files_read on storage.objects for select to authenticated using(
 bucket_id='berry-safety-documents' and exists(select 1 from public.berry_safety_documents d where d.storage_path=name
 and d.archived_at is null and berry_private.yo_seguro_read(d.owner_id,d.created_at,d.management_id)));

create or replace function public.berry_yo_seguro_catalog() returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('version','202611220025','catalog',coalesce((select jsonb_agg(jsonb_build_object('id',m.id,'name',m.name,'areas',a.items) order by m.sort_order,m.name,m.id)
 from public.berry_organization m cross join lateral(select jsonb_agg(jsonb_build_object('id',ar.id,'name',ar.name) order by ar.sort_order,ar.name,ar.id) items
 from public.berry_organization ar where ar.kind='area' and ar.parent_id=m.id and ar.enabled) a
 where m.kind='management' and m.enabled and a.items is not null),'[]'::jsonb));
$$;
create or replace function public.berry_yo_seguro_scope() returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_management uuid;v_name text;v_admin boolean;
begin
 if not berry_private.is_enabled() then raise exception 'ACCOUNT_NOT_READY' using errcode='42501';end if;
 v_admin:=berry_private.safety_admin();
 select m.id,m.name into v_management,v_name from public.berry_profiles p join public.berry_organization m
 on m.kind='management' and m.enabled and m.id=p.yo_seguro_management_id where p.id=auth.uid();
 return jsonb_build_object('version','202611220025','admin',v_admin,'management_id',v_management,'management_name',coalesce(v_name,''));
end;$$;

create or replace function public.berry_begin_yo_seguro_upload(p_id uuid,p_token text,p_area uuid,p_worker text,p_kind text,p_title text,p_date date,p_workplace text,p_file_name text,p_mime text,p_size bigint)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_ticket berry_private.yo_seguro_uploads;v_area public.berry_organization;v_management public.berry_organization;
 v_payload jsonb;v_ext text;v_path text;v_source text;v_headers jsonb;v_limits berry_private.yo_seguro_limits;
begin
 if p_id is null or p_token is null or p_token !~ '^[0-9a-f]{64}$' or p_area is null or p_worker is null or length(btrim(p_worker)) not between 3 and 160
 or p_kind is null or p_kind not in('ATS','PETAR','CHECKLIST') or p_title is null or length(btrim(p_title)) not between 1 and 160 or p_date is null
 or length(coalesce(p_workplace,''))>160 or p_file_name is null or length(p_file_name) not between 1 and 200 or p_file_name ~ '[\\/\r\n]'
 or p_size is null or p_size not between 1 and 10485760 then raise exception 'INVALID_DOCUMENT' using errcode='22023';end if;
 v_ext:=case p_mime when 'application/pdf' then 'pdf' when 'image/jpeg' then 'jpg' when 'image/png' then 'png' when 'image/webp' then 'webp' end;
 if v_ext is null or lower(p_file_name) !~ ('\.'||case when v_ext='jpg' then 'jpe?g' else v_ext end||'$') then raise exception 'INVALID_FILE_TYPE' using errcode='22023';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_id::text,25));
 select * into v_ticket from berry_private.yo_seguro_uploads where id=p_id;
 if found then
  if v_ticket.secret_hash<>encode(sha256(convert_to(p_token,'UTF8')),'hex') then raise exception 'UPLOAD_DENIED' using errcode='42501';end if;
  if (v_ticket.payload->>'area_id',v_ticket.payload->>'worker',v_ticket.payload->>'kind',v_ticket.payload->>'title',v_ticket.payload->>'date',v_ticket.payload->>'workplace',v_ticket.payload->>'file_name',v_ticket.payload->>'mime',v_ticket.reserved_bytes)
   is distinct from(p_area::text,btrim(p_worker),p_kind,btrim(p_title),p_date::text,coalesce(btrim(p_workplace),''),p_file_name,p_mime,p_size) then raise exception 'DOCUMENT_CONFLICT' using errcode='40001';end if;
  if v_ticket.completed_at is null and v_ticket.expires_at<clock_timestamp() then raise exception 'UPLOAD_EXPIRED' using errcode='22023';end if;
  return jsonb_build_object('id',p_id,'path',v_ticket.storage_path,'completed',v_ticket.completed_at is not null);
 end if;
 select * into v_area from public.berry_organization where id=p_area and kind='area' and enabled;
 select * into v_management from public.berry_organization where id=v_area.parent_id and kind='management' and enabled;
 if v_area.id is null or v_management.id is null then raise exception 'AREA_NOT_AVAILABLE' using errcode='22023';end if;
 -- Cuenta intentos antes de Storage; el bloqueo evita eludir cuotas con solicitudes paralelas.
 perform pg_advisory_xact_lock(20261122,25);
 v_headers:=coalesce(nullif(current_setting('request.headers',true),''),'{}')::jsonb;
 v_source:=encode(sha256(convert_to(coalesce(nullif(split_part(v_headers->>'x-forwarded-for',',',1),''),v_headers->>'x-real-ip','unknown'),'UTF8')),'hex');
 select * into v_limits from berry_private.yo_seguro_limits where singleton;
 if (select count(*) from berry_private.yo_seguro_uploads where created_at>clock_timestamp()-interval '1 hour')>=v_limits.hourly
 or (select count(*) from berry_private.yo_seguro_uploads where created_at>clock_timestamp()-interval '24 hours')>=v_limits.daily
 or (select count(*) from berry_private.yo_seguro_uploads where source_hash=v_source and created_at>clock_timestamp()-interval '1 hour')>=v_limits.source_hourly
 or (select coalesce(sum(reserved_bytes),0) from berry_private.yo_seguro_uploads where created_at>clock_timestamp()-interval '24 hours')+p_size>v_limits.daily_bytes
 then raise exception 'UPLOAD_RATE_LIMIT' using errcode='54000';end if;
 v_path:='public/'||p_id::text||'/'||p_token||'/documento.'||v_ext;
 v_payload:=jsonb_build_object('worker',btrim(p_worker),'kind',p_kind,'title',btrim(p_title),'date',p_date,'workplace',coalesce(btrim(p_workplace),''),'file_name',p_file_name,'mime',p_mime,'area_id',v_area.id,'area_name',v_area.name,'management_id',v_management.id,'management_name',v_management.name);
 insert into berry_private.yo_seguro_uploads(id,secret_hash,storage_path,payload,source_hash,reserved_bytes)
 values(p_id,encode(sha256(convert_to(p_token,'UTF8')),'hex'),v_path,v_payload,v_source,p_size);
 return jsonb_build_object('id',p_id,'path',v_path,'completed',false);
end;$$;

create or replace function public.berry_yo_seguro_upload_allowed(p_path text) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from berry_private.yo_seguro_uploads t where t.storage_path=p_path and t.completed_at is null and t.expires_at>clock_timestamp() and exists(select 1 from public.berry_organization a join public.berry_organization m on m.id=a.parent_id where a.id=(t.payload->>'area_id')::uuid and a.enabled and m.id=(t.payload->>'management_id')::uuid and m.enabled))
 and not exists(select 1 from public.berry_safety_documents where storage_path=p_path)
 and not exists(select 1 from storage.objects where bucket_id='berry-safety-documents' and name=p_path);
$$;
revoke all on function public.berry_yo_seguro_upload_allowed(text) from public;
grant execute on function public.berry_yo_seguro_upload_allowed(text) to anon,authenticated;
grant insert on storage.objects to anon;
drop policy if exists berry_yo_seguro_guest_upload on storage.objects;
create policy berry_yo_seguro_guest_upload on storage.objects for insert to anon,authenticated with check(
 bucket_id='berry-safety-documents' and public.berry_yo_seguro_upload_allowed(name));

create or replace function public.berry_finish_yo_seguro_upload(p_id uuid,p_token text) returns jsonb language plpgsql security definer set search_path='' as $$
declare v_ticket berry_private.yo_seguro_uploads;v_object storage.objects;v_data jsonb;
begin
 perform pg_advisory_xact_lock(hashtextextended(p_id::text,25));
 select * into v_ticket from berry_private.yo_seguro_uploads where id=p_id for update;
 if not found or p_token is null or v_ticket.secret_hash<>encode(sha256(convert_to(p_token,'UTF8')),'hex') then raise exception 'UPLOAD_DENIED' using errcode='42501';end if;
 if v_ticket.completed_at is null then
  if v_ticket.expires_at<clock_timestamp() then raise exception 'UPLOAD_EXPIRED' using errcode='22023';end if;
  v_data:=v_ticket.payload;
  if not exists(select 1 from public.berry_organization a join public.berry_organization m on m.id=a.parent_id
   where a.id=(v_data->>'area_id')::uuid and a.kind='area' and a.enabled and m.id=(v_data->>'management_id')::uuid and m.kind='management' and m.enabled)
  then raise exception 'AREA_NOT_AVAILABLE' using errcode='22023';end if;
  select * into v_object from storage.objects where bucket_id='berry-safety-documents' and name=v_ticket.storage_path;
  if not found then raise exception 'FILE_NOT_STORED' using errcode='22023';end if;
  if coalesce(v_object.metadata->>'mimetype','')<>v_data->>'mime' or coalesce((v_object.metadata->>'size')::bigint,0)<>v_ticket.reserved_bytes
  then raise exception 'INVALID_FILE_METADATA' using errcode='22023';end if;
  insert into public.berry_safety_documents(id,owner_id,owner_name,kind,title,document_date,workplace,storage_path,file_name,mime_type,file_size,management_id,area_id,management_name,area_name,submission_source)
  values(p_id,null,v_data->>'worker',v_data->>'kind',v_data->>'title',(v_data->>'date')::date,v_data->>'workplace',v_ticket.storage_path,v_data->>'file_name',v_data->>'mime',v_ticket.reserved_bytes,(v_data->>'management_id')::uuid,(v_data->>'area_id')::uuid,v_data->>'management_name',v_data->>'area_name','guest');
  update berry_private.yo_seguro_uploads set completed_at=clock_timestamp() where id=p_id;
 end if;
 -- Recibo mínimo: nunca expone la fila, revisiones, listado ni datos de otro envío.
 return jsonb_build_object('id',p_id,'received',true);
end;$$;
revoke all on function public.berry_yo_seguro_catalog(),public.berry_begin_yo_seguro_upload(uuid,text,uuid,text,text,text,date,text,text,text,bigint),public.berry_finish_yo_seguro_upload(uuid,text) from public;
grant execute on function public.berry_yo_seguro_catalog(),public.berry_begin_yo_seguro_upload(uuid,text,uuid,text,text,text,date,text,text,text,bigint),public.berry_finish_yo_seguro_upload(uuid,text) to anon,authenticated;
revoke all on function public.berry_yo_seguro_scope() from public,anon;
grant execute on function public.berry_yo_seguro_scope() to authenticated;
notify pgrst,'reload schema';
commit;
select '202611220025' as yo_seguro_version;
