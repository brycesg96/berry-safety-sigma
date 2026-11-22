-- Paso 24. Documentos privados de seguridad. Requiere las etapas anteriores.
begin;
create table if not exists public.berry_safety_documents (
 id uuid primary key, owner_id uuid not null references public.berry_profiles(id), owner_name text not null,
 kind text not null check(kind in ('ATS','PETAR','CHECKLIST')), title text not null check(length(btrim(title)) between 1 and 160),
 document_date date not null, workplace text not null default '' check(length(workplace)<=160),
 storage_path text unique not null, file_name text not null check(length(file_name) between 1 and 200),
 mime_type text not null check(mime_type in ('application/pdf','image/jpeg','image/png','image/webp')),
 file_size bigint not null check(file_size between 1 and 10485760),
 status text not null default 'pending' check(status in ('pending','approved','corrections')),
 review_note text not null default '' check(length(review_note)<=2000), reviewer_id uuid references public.berry_profiles(id),
 reviewed_at timestamptz, created_at timestamptz not null default now(), revision integer not null default 1,
 archived_at timestamptz
);
alter table public.berry_safety_documents enable row level security;
revoke all on public.berry_safety_documents from public,anon,authenticated;
grant select on public.berry_safety_documents to authenticated;
create index if not exists berry_safety_owner_date on public.berry_safety_documents(owner_id,created_at desc,id) where archived_at is null;
create index if not exists berry_safety_status_date on public.berry_safety_documents(status,created_at desc,id) where archived_at is null;
create or replace function berry_private.safety_admin() returns boolean language sql stable security definer set search_path='' as $$
 select berry_private.is_enabled() and exists(select 1 from public.berry_profiles where id=auth.uid() and role='admin');
$$;
create or replace function berry_private.safety_owner(p_path text) returns uuid language sql immutable set search_path='' as $$
 select case when p_path ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}/documento\.(pdf|jpg|png|webp)$' and split_part(p_path,'/',1) ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then split_part(p_path,'/',1)::uuid end;
$$;
create or replace function berry_private.safety_registered(p_path text) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.berry_safety_documents where storage_path=p_path);
$$;
create or replace function berry_private.safety_own_visible(p_owner uuid,p_created timestamptz) returns boolean language sql stable security definer set search_path='' as $$
 select p_owner=auth.uid() and exists(select 1 from public.berry_profiles where id=auth.uid() and p_created>=coalesce(history_access_from,'-infinity'::timestamptz));
$$;
revoke all on function berry_private.safety_admin(),berry_private.safety_owner(text),berry_private.safety_registered(text),berry_private.safety_own_visible(uuid,timestamptz) from public,anon;
grant execute on function berry_private.safety_admin(),berry_private.safety_owner(text),berry_private.safety_registered(text),berry_private.safety_own_visible(uuid,timestamptz) to authenticated;
drop policy if exists berry_safety_read on public.berry_safety_documents;
create policy berry_safety_read on public.berry_safety_documents for select to authenticated using(
 berry_private.is_enabled() and archived_at is null and (berry_private.safety_own_visible(owner_id,created_at) or berry_private.safety_admin())
);
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('berry-safety-documents','berry-safety-documents',false,10485760,array['application/pdf','image/jpeg','image/png','image/webp'])
on conflict(id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;
drop policy if exists berry_safety_files_insert on storage.objects;
create policy berry_safety_files_insert on storage.objects for insert to authenticated with check(
 bucket_id='berry-safety-documents' and berry_private.is_enabled() and berry_private.safety_owner(name)=auth.uid()
 and not berry_private.safety_registered(name)
);
drop policy if exists berry_safety_files_read on storage.objects;
create policy berry_safety_files_read on storage.objects for select to authenticated using(
 bucket_id='berry-safety-documents' and berry_private.is_enabled() and exists(select 1 from public.berry_safety_documents d
 where d.storage_path=name and d.archived_at is null and (berry_private.safety_own_visible(d.owner_id,d.created_at) or berry_private.safety_admin()))
);
drop policy if exists berry_safety_orphans_delete on storage.objects;
grant select,insert on storage.objects to authenticated;
create or replace function public.berry_safety_document_status() returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if not berry_private.is_enabled() then raise exception 'ACCOUNT_NOT_READY' using errcode='42501';end if;
 return jsonb_build_object('ready',true,'version','202611220024');
end;$$;
create or replace function public.berry_submit_safety_document(p_id uuid,p_kind text,p_title text,p_date date,p_workplace text,p_file_name text,p_mime text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_actor uuid:=auth.uid();v_path text;v_ext text;v_object storage.objects;v_row public.berry_safety_documents;v_name text;
begin
 if not berry_private.is_enabled() then raise exception 'ACCOUNT_NOT_READY' using errcode='42501';end if;
 if p_id is null or p_date is null or p_kind is null or p_kind not in ('ATS','PETAR','CHECKLIST') or p_title is null or length(btrim(p_title)) not between 1 and 160
 or length(coalesce(p_workplace,''))>160 or p_file_name is null or length(p_file_name) not between 1 and 200 or p_file_name ~ '[\\/\r\n]'
 then raise exception 'INVALID_DOCUMENT' using errcode='22023';end if;
 v_ext:=case p_mime when 'application/pdf' then 'pdf' when 'image/jpeg' then 'jpg' when 'image/png' then 'png' when 'image/webp' then 'webp' end;
 if v_ext is null then raise exception 'INVALID_FILE_TYPE' using errcode='22023';end if;
 v_path:=v_actor::text||'/'||p_id::text||'/documento.'||v_ext;
 perform pg_advisory_xact_lock(hashtextextended(p_id::text,0));
 select * into v_row from public.berry_safety_documents where id=p_id;
 if found then
  if not berry_private.safety_own_visible(v_row.owner_id,v_row.created_at) then raise exception 'DOCUMENT_DENIED' using errcode='42501';end if;
  if v_row.archived_at is not null or (v_row.kind,v_row.title,v_row.document_date,v_row.workplace,v_row.file_name,v_row.mime_type)
    is distinct from (p_kind,btrim(p_title),p_date,coalesce(btrim(p_workplace),''),p_file_name,p_mime)
    then raise exception 'DOCUMENT_CONFLICT' using errcode='40001';end if;
  return to_jsonb(v_row);
 end if;
 select * into v_object from storage.objects where bucket_id='berry-safety-documents' and name=v_path;
 if not found then raise exception 'FILE_NOT_STORED' using errcode='22023';end if;
 if coalesce(v_object.metadata->>'mimetype','')<>p_mime or coalesce((v_object.metadata->>'size')::bigint,0) not between 1 and 10485760
 then raise exception 'INVALID_FILE_METADATA' using errcode='22023';end if;
 select full_name into v_name from public.berry_profiles where id=v_actor;
 insert into public.berry_safety_documents(id,owner_id,owner_name,kind,title,document_date,workplace,storage_path,file_name,mime_type,file_size)
 values(p_id,v_actor,v_name,p_kind,btrim(p_title),p_date,coalesce(btrim(p_workplace),''),v_path,p_file_name,p_mime,(v_object.metadata->>'size')::bigint) returning * into v_row;
 return to_jsonb(v_row);
end;$$;
create or replace function public.berry_review_safety_document(p_id uuid,p_revision integer,p_status text,p_note text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_actor uuid:=berry_private.require_admin();v_row public.berry_safety_documents;
begin
 if p_status is null or p_status not in ('approved','corrections') or length(coalesce(p_note,''))>2000 or (p_status='corrections' and btrim(coalesce(p_note,''))='')
 then raise exception 'REVIEW_NOTE_REQUIRED' using errcode='22023';end if;
 select * into v_row from public.berry_safety_documents where id=p_id and archived_at is null for update;
 if not found then raise exception 'DOCUMENT_NOT_FOUND' using errcode='22023';end if;
 if p_revision is null or v_row.revision<>p_revision then raise exception 'DOCUMENT_CONFLICT' using errcode='40001';end if;
 update public.berry_safety_documents set status=p_status,review_note=btrim(coalesce(p_note,'')),reviewer_id=v_actor,reviewed_at=now(),revision=revision+1 where id=p_id returning * into v_row;
 return to_jsonb(v_row);
end;$$;
create or replace function public.berry_archive_safety_document(p_id uuid,p_revision integer)
returns void language plpgsql security definer set search_path='' as $$
declare v_row public.berry_safety_documents;
begin
 if not berry_private.is_enabled() then raise exception 'ACCOUNT_NOT_READY' using errcode='42501';end if;
 select * into v_row from public.berry_safety_documents where id=p_id and archived_at is null for update;
 if not found or (not berry_private.safety_admin() and (not berry_private.safety_own_visible(v_row.owner_id,v_row.created_at) or v_row.status='approved')) then raise exception 'DOCUMENT_DENIED' using errcode='42501';end if;
 if p_revision is null or v_row.revision<>p_revision then raise exception 'DOCUMENT_CONFLICT' using errcode='40001';end if;
 update public.berry_safety_documents set archived_at=now(),revision=revision+1 where id=p_id;
end;$$;
-- Reuse the existing immutable audit trail for submission/review/archive events.
drop trigger if exists berry_safety_audit on public.berry_safety_documents;
create trigger berry_safety_audit after insert or update on public.berry_safety_documents for each row execute function berry_private.record_change();
revoke all on function public.berry_safety_document_status(),public.berry_submit_safety_document(uuid,text,text,date,text,text,text),public.berry_review_safety_document(uuid,integer,text,text),public.berry_archive_safety_document(uuid,integer) from public,anon;
grant execute on function public.berry_safety_document_status(),public.berry_submit_safety_document(uuid,text,text,date,text,text,text),public.berry_review_safety_document(uuid,integer,text,text),public.berry_archive_safety_document(uuid,integer) to authenticated;
notify pgrst,'reload schema';
commit;
select '202611220024' as safety_documents_version;
