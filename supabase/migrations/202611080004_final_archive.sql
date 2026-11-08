-- Berry Safety · Paso 4: conservar únicamente el Excel final tras el cierre.
-- Requiere el paso 3. El archivo inicial se retira solo después de guardar el final.
begin;
alter table public.berry_inspections add column if not exists final_excel_stored boolean not null default false;
alter table public.berry_documents add column if not exists is_final boolean not null default false;
create unique index if not exists berry_one_excel on public.berry_documents(inspection_id) where kind='excel';
create table if not exists berry_private.document_cleanup (
  storage_path text primary key, inspection_id uuid not null references public.berry_inspections(id)
);
alter table berry_private.document_cleanup enable row level security;
revoke all on berry_private.document_cleanup from public,anon,authenticated;

create or replace function public.berry_prepare_final(p_id uuid,p_expected bigint)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_actor uuid:=berry_private.require_ready(); v_row public.berry_inspections; v_doc public.berry_documents;
begin
  if not berry_private.can_read_inspection(p_id) then raise exception 'INSPECTION_NOT_ASSIGNED' using errcode='42501'; end if;
  select * into v_row from public.berry_inspections where id=p_id;
  if v_row.workflow<>'closed' or v_row.code is null then raise exception 'INSPECTION_NOT_CLOSED' using errcode='42501'; end if;
  select * into v_doc from public.berry_documents where inspection_id=p_id and kind='excel';
  if not found then raise exception 'DOCUMENT_NOT_FOUND' using errcode='22023'; end if;
  if not v_doc.is_final and v_row.revision is distinct from p_expected then raise exception 'REVISION_CONFLICT' using errcode='40001'; end if;
  return jsonb_build_object('complete',v_doc.is_final,'inspection',to_jsonb(v_row),'document',to_jsonb(v_doc));
end;
$$;
create or replace function berry_private.require_final_actor(p_id uuid,p_actor uuid,p_iat bigint)
returns void language plpgsql stable security definer set search_path='' as $$
begin
  if not exists(select 1 from public.berry_profiles p where p.id=p_actor and p.enabled and not p.must_change_password and p_iat>0 and (p.credentials_valid_after=0 or p_iat>p.credentials_valid_after))
    or not exists(select 1 from public.berry_inspections i where i.id=p_id and i.workflow='closed' and i.deleted_at is null and
      (i.author_id=p_actor or exists(select 1 from public.berry_recipients r where r.inspection_id=p_id and r.user_id=p_actor))) then raise exception 'FINAL_NOT_ALLOWED' using errcode='42501'; end if;
end;
$$;
create or replace function public.berry_commit_final(p_id uuid,p_actor uuid,p_actor_iat bigint,p_expected bigint,p_document jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_row public.berry_inspections; v_old public.berry_documents; v_doc public.berry_documents; v_date date; v_path text;
begin
  perform berry_private.require_final_actor(p_id,p_actor,p_actor_iat);
  select * into v_row from public.berry_inspections where id=p_id for update;
  select * into v_old from public.berry_documents where inspection_id=p_id and kind='excel' for update;
  if not found then raise exception 'DOCUMENT_NOT_FOUND' using errcode='22023'; end if;
  v_date:=(v_row.data ->> 'date')::date;
  v_path:=to_char(v_date,'YYYY')||'/'||to_char(v_date,'MM')||'-'||(array['ENERO','FEBRERO','MARZO','ABRIL','MAYO','JUNIO','JULIO','AGOSTO','SEPTIEMBRE','OCTUBRE','NOVIEMBRE','DICIEMBRE'])[extract(month from v_date)::integer]
    ||'/'||p_id||'/'||(p_document ->> 'sha256')||'/'||(p_document ->> 'filename');
  if jsonb_typeof(p_document) is distinct from 'object' or coalesce(p_document ->> 'sha256','') !~ '^[a-f0-9]{64}$'
    or coalesce(p_document ->> 'filename','') !~ '^[^/\\]+\.xlsx$' or length(p_document ->> 'filename')>250
    or p_document ->> 'storage_path' is distinct from v_path
    or not exists(select 1 from storage.objects where bucket_id='berry-documents' and name=v_path) then raise exception 'DOCUMENT_NOT_STORED' using errcode='22023'; end if;
  if v_old.is_final then
    -- Another device won the race. Keep its final and clean only our unused upload.
    if v_path<>v_old.storage_path then insert into berry_private.document_cleanup values(v_path,p_id) on conflict do nothing; end if;
    return jsonb_build_object('inspection',to_jsonb(v_row),'document',to_jsonb(v_old));
  end if;
  if v_row.revision is distinct from p_expected then raise exception 'REVISION_CONFLICT' using errcode='40001'; end if;
  perform set_config('request.jwt.claim.sub',p_actor::text,true);
  update public.berry_documents set revision=v_row.revision+1,filename=p_document ->> 'filename',storage_path=v_path,
    sha256=p_document ->> 'sha256',byte_size=(p_document ->> 'byte_size')::bigint,is_final=true,created_by=p_actor,created_at=now()
    where id=v_old.id returning * into v_doc;
  if v_old.storage_path<>v_path then insert into berry_private.document_cleanup values(v_old.storage_path,p_id) on conflict do nothing; end if;
  update public.berry_inspections set revision=revision+1,data=jsonb_set(data,'{delivery,revision}',to_jsonb(revision+1)) where id=p_id returning * into v_row;
  return jsonb_build_object('inspection',to_jsonb(v_row),'document',to_jsonb(v_doc));
end;
$$;
create or replace function public.berry_final_cleanup(p_id uuid,p_actor uuid,p_actor_iat bigint)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_path text; v_prefix text;
begin
  perform berry_private.require_final_actor(p_id,p_actor,p_actor_iat);
  select storage_path into v_path from public.berry_documents where inspection_id=p_id and kind='excel' and is_final;
  if not found then raise exception 'FINAL_NOT_STORED' using errcode='42501'; end if;
  v_prefix:=split_part(v_path,'/',1)||'/'||split_part(v_path,'/',2)||'/'||p_id||'/';
  -- Also retire abandoned uploads from earlier interrupted registrations.
  insert into berry_private.document_cleanup(storage_path,inspection_id)
    select o.name,p_id from storage.objects o where o.bucket_id='berry-documents' and starts_with(o.name,v_prefix) and right(o.name,5)='.xlsx'
      and not exists(select 1 from public.berry_documents d where d.storage_path=o.name) on conflict do nothing;
  return (select coalesce(jsonb_agg(c.storage_path),'[]'::jsonb) from berry_private.document_cleanup c where c.inspection_id=p_id
    and not exists(select 1 from public.berry_documents d where d.storage_path=c.storage_path));
end;
$$;
create or replace function public.berry_finish_final(p_id uuid,p_actor uuid,p_actor_iat bigint,p_removed text[])
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_row public.berry_inspections;
begin
  perform berry_private.require_final_actor(p_id,p_actor,p_actor_iat);
  select * into v_row from public.berry_inspections where id=p_id for update;
  delete from berry_private.document_cleanup c where c.inspection_id=p_id and c.storage_path=any(p_removed)
    and not exists(select 1 from public.berry_documents d where d.storage_path=c.storage_path);
  if exists(select 1 from berry_private.document_cleanup where inspection_id=p_id)
    or not exists(select 1 from public.berry_documents where inspection_id=p_id and kind='excel' and is_final) then raise exception 'FINAL_CLEANUP_PENDING' using errcode='40001'; end if;
  if not v_row.final_excel_stored then
    perform set_config('request.jwt.claim.sub',p_actor::text,true);
    update public.berry_inspections set final_excel_stored=true,revision=revision+1,data=jsonb_set(data,'{delivery,revision}',to_jsonb(revision+1)) where id=p_id returning * into v_row;
  end if;
  return to_jsonb(v_row);
end;
$$;
revoke all on function berry_private.require_final_actor(uuid,uuid,bigint) from public,anon,authenticated;
revoke all on function public.berry_prepare_final(uuid,bigint),public.berry_commit_final(uuid,uuid,bigint,bigint,jsonb),public.berry_final_cleanup(uuid,uuid,bigint),public.berry_finish_final(uuid,uuid,bigint,text[]) from public,anon,authenticated;
grant execute on function public.berry_prepare_final(uuid,bigint) to authenticated;
grant execute on function public.berry_commit_final(uuid,uuid,bigint,bigint,jsonb),public.berry_final_cleanup(uuid,uuid,bigint),public.berry_finish_final(uuid,uuid,bigint,text[]) to service_role;
create or replace function public.berry_schema_status()
returns jsonb language sql stable set search_path='' as $$
  select jsonb_build_object('schema_version','202611070001','accounts_version','202611070002','reports_version','202611080003','final_archive_version','202611080004','stage','reports','sync_ready',true);
$$;
notify pgrst,'reload schema';
commit;
