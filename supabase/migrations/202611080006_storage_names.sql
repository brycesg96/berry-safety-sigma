-- Berry Safety · Paso 6: rutas compatibles con tildes en los nombres de área.
-- Requiere el paso 5. Conserva nombres visibles, archivos y correlativos.
begin;
do $$ begin
 if to_regprocedure('berry_private.berry_commit_report_v4(uuid,uuid,bigint,jsonb)') is null then
  raise exception 'Primero instale el paso 5 de permisos' using errcode='55000';end if;
 if to_regprocedure('public.berry_admin_dashboard()') is not null then
  raise exception 'No repita el paso 6 después de instalar el paso 7' using errcode='55000';end if;
end $$;
create or replace function berry_private.storage_filename(p_filename text)
returns text language sql immutable strict set search_path='' as $$
 select regexp_replace(regexp_replace(normalize(p_filename,NFD), U&'[\0300-\036F]', '', 'g'), '[^A-Za-z0-9._ -]', '_','g');
$$;
revoke all on function berry_private.storage_filename(text) from public,anon,authenticated;

create or replace function berry_private.berry_commit_report_v4(p_operation uuid, p_actor uuid, p_actor_iat bigint, p_document jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_lease berry_private.report_leases; v_row public.berry_inspections; v_profile public.berry_profiles;
  v_now timestamptz := berry_private.report_clock(); v_sequence bigint; v_data jsonb; v_doc public.berry_documents;
  v_recipients uuid[]; v_cc text[]; v_folder text; v_expected_path text; v_date date;
begin
  select * into v_profile from public.berry_profiles where id=p_actor and enabled and not must_change_password;
  if not found or p_actor_iat is null or (v_profile.credentials_valid_after>0 and p_actor_iat<=v_profile.credentials_valid_after) then raise exception 'ACCOUNT_NOT_READY' using errcode='42501'; end if;
  select * into v_lease from berry_private.report_leases where operation_id=p_operation and actor_id=p_actor;
  if not found then raise exception 'LEASE_EXPIRED' using errcode='40001'; end if;
  select * into v_row from public.berry_inspections where id=v_lease.inspection_id and author_id=p_actor and deleted_at is null for update;
  if not found or v_row.workflow<>'draft' or v_row.revision<>v_lease.revision then raise exception 'REVISION_CONFLICT' using errcode='40001'; end if;
  select last_sequence+1 into v_sequence from berry_private.report_counters where year=v_lease.year for update;
  select * into v_lease from berry_private.report_leases where operation_id=p_operation and actor_id=p_actor for update;
  if not found or v_lease.expires_at<=v_now then raise exception 'LEASE_EXPIRED' using errcode='40001'; end if;
  if extract(year from v_now at time zone 'America/Lima')<>v_lease.year then raise exception 'YEAR_CHANGED' using errcode='40001'; end if;
  if v_lease.code <> ('IH-'||v_lease.year||'-'||(case when v_sequence<1000 then lpad(v_sequence::text,3,'0') else v_sequence::text end)) then raise exception 'COUNTER_CONFLICT' using errcode='40001'; end if;
  v_date := (v_row.data ->> 'date')::date;
  v_folder := to_char(v_date,'YYYY')||'/'||to_char(v_date,'MM')||'-'||(array['ENERO','FEBRERO','MARZO','ABRIL','MAYO','JUNIO','JULIO','AGOSTO','SEPTIEMBRE','OCTUBRE','NOVIEMBRE','DICIEMBRE'])[extract(month from v_date)::integer];
  v_expected_path := v_folder||'/'||v_row.id||'/'||(p_document ->> 'sha256')||'/'||berry_private.storage_filename(p_document ->> 'filename');
  -- Existing objects made by an earlier API retain their exact references.
  if p_document ->> 'storage_path' = v_folder||'/'||v_row.id||'/'||(p_document ->> 'sha256')||'/'||(p_document ->> 'filename') then
    v_expected_path := p_document ->> 'storage_path';
  end if;
  if jsonb_typeof(p_document) is distinct from 'object' or coalesce(p_document ->> 'sha256','') !~ '^[a-f0-9]{64}$'
    or coalesce(p_document ->> 'filename','') !~ '^[^/\\]+\.xlsx$' or length(p_document ->> 'filename')>250
    or p_document ->> 'storage_path' is distinct from v_expected_path
    or not exists(select 1 from storage.objects where bucket_id='berry-documents' and name=v_expected_path) then raise exception 'DOCUMENT_NOT_STORED' using errcode='22023'; end if;
  select array_agg((value ->> 'personId')::uuid order by position) into v_recipients from jsonb_array_elements(v_row.data -> 'responsibles') with ordinality as people(value,position);
  if coalesce(cardinality(v_recipients),0)=0 or (select count(distinct id) from unnest(v_recipients) id)<>cardinality(v_recipients)
    or exists(select 1 from unnest(v_recipients) as recipients(user_id) where not exists(select 1 from public.berry_profiles p where p.id=recipients.user_id and p.enabled)) then raise exception 'RECIPIENT_DISABLED' using errcode='22023'; end if;
  select coalesce(array_agg(distinct e), '{}') into v_cc from public.berry_profiles p cross join lateral unnest(p.supervisor_emails) e
    where p.id=any(v_recipients) and e not in(select email from public.berry_profiles where id=any(v_recipients));
  if cardinality(v_cc)>50 then raise exception 'TOO_MANY_COPIES' using errcode='22023'; end if;
  v_data := v_row.data || jsonb_build_object('serverRegistration',jsonb_build_object('inspectionId',v_row.id,'code',v_lease.code,'acceptedAt',v_now),
    'delivery',jsonb_build_object('sentAt',v_now,'recipientIds',v_recipients,'revision',v_row.revision+1,'corrections','{}'::jsonb),
    'emailCc',v_cc,'emailDelivery',jsonb_build_object('state','pending','requestId',v_row.id,'updatedAt',v_now),'status','ready');
  perform set_config('request.jwt.claim.sub',p_actor::text,true);
  update berry_private.report_counters set last_sequence=v_sequence where year=v_lease.year;
  update public.berry_inspections set workflow='sent',revision=revision+1,data=v_data,code=v_lease.code,registered_at=v_now,sent_at=v_now,source_sha256=v_lease.source_sha256 where id=v_row.id returning * into v_row;
  insert into public.berry_recipients(inspection_id,user_id,assigned_by) select v_row.id,id,p_actor from unnest(v_recipients) id;
  insert into public.berry_documents(inspection_id,kind,revision,filename,storage_path,mime_type,byte_size,sha256,created_by)
    values(v_row.id,'excel',v_row.revision,p_document ->> 'filename',v_expected_path,'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',(p_document ->> 'byte_size')::bigint,p_document ->> 'sha256',p_actor) returning * into v_doc;
  insert into berry_private.report_outbox(inspection_id) values(v_row.id);
  delete from berry_private.report_leases where operation_id=p_operation;
  return jsonb_build_object('inspection',to_jsonb(v_row),'document',to_jsonb(v_doc));
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
    ||'/'||p_id||'/'||(p_document ->> 'sha256')||'/'||berry_private.storage_filename(p_document ->> 'filename');
  if p_document ->> 'storage_path' = split_part(v_path,'/',1)||'/'||split_part(v_path,'/',2)||'/'||p_id||'/'||(p_document ->> 'sha256')||'/'||(p_document ->> 'filename') then
    v_path := p_document ->> 'storage_path';
  end if;
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

create or replace function public.berry_schema_status()returns jsonb language sql stable set search_path='' as $$
 select jsonb_build_object('schema_version','202611070001','accounts_version','202611070002','reports_version','202611080003','final_archive_version','202611080004','permissions_version','202611080005','storage_version','202611080006','stage','reports','sync_ready',true);
$$;
notify pgrst,'reload schema';
commit;
