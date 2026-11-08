-- Berry Safety · Paso 3: inspecciones compartidas, correlativo y archivo mensual.
-- Requiere los pasos 1 y 2. No importa ni borra los datos del navegador.
begin;
do $$ begin
  if exists(select 1 from information_schema.columns where table_schema='public' and table_name='berry_inspections' and column_name='final_excel_stored') then
    raise exception 'A later migration is installed; do not reapply step 3' using errcode='55000';
  end if;
end $$;

alter table public.berry_inspections add column if not exists code text unique;
alter table public.berry_inspections add column if not exists registered_at timestamptz;
alter table public.berry_inspections add column if not exists source_sha256 text;

create table if not exists berry_private.report_counters (
  year integer primary key check(year between 1000 and 9999), last_sequence bigint not null default 0 check(last_sequence >= 0)
);
create table if not exists berry_private.report_leases (
  year integer primary key references berry_private.report_counters(year), operation_id uuid not null,
  inspection_id uuid not null references public.berry_inspections(id), actor_id uuid not null references auth.users(id),
  source_sha256 text not null, revision bigint not null, expires_at timestamptz not null,
  code text not null, accepted_at timestamptz not null
);
create table if not exists berry_private.report_outbox (
  inspection_id uuid primary key references public.berry_inspections(id),
  state text not null default 'queued' check(state in ('queued','dispatching','accepted','rejected','unconfirmed')),
  result jsonb, claimed_at timestamptz
);
alter table berry_private.report_counters enable row level security;
alter table berry_private.report_leases enable row level security;
alter table berry_private.report_outbox enable row level security;
revoke all on berry_private.report_counters, berry_private.report_leases, berry_private.report_outbox from public, anon, authenticated;

create or replace function berry_private.report_clock()
returns timestamptz language sql volatile set search_path = '' as $$ select clock_timestamp(); $$;
create or replace function berry_private.require_ready()
returns uuid language plpgsql stable security definer set search_path = '' as $$
begin
  if not berry_private.is_enabled() then raise exception 'ACCOUNT_NOT_READY' using errcode = '42501'; end if;
  return auth.uid();
end;
$$;

create or replace function berry_private.report_person(p_value jsonb)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_person public.berry_profiles;
begin
  if jsonb_typeof(p_value) is distinct from 'object' or exists(select 1 from unnest(array['id','name','email']) k where p_value ? k and jsonb_typeof(p_value -> k) is distinct from 'string') then raise exception 'INVALID_PERSON' using errcode='22023'; end if;
  if coalesce(p_value ->> 'personId', '') = '' then return p_value - 'email' || jsonb_build_object('email',''); end if;
  select * into v_person from public.berry_profiles where id = (p_value ->> 'personId')::uuid and enabled;
  if not found then raise exception 'PERSON_DISABLED' using errcode = '22023'; end if;
  return jsonb_build_object('id', p_value ->> 'id', 'personId', v_person.id, 'name', v_person.full_name, 'email', v_person.email, 'area', v_person.area, 'jobTitle', v_person.job_title);
end;
$$;
create or replace function berry_private.check_photos(p_id uuid, p_photos jsonb)
returns void language plpgsql stable security definer set search_path = '' as $$
declare v_photo jsonb; v_path text;
begin
  if jsonb_typeof(p_photos) is distinct from 'array' or jsonb_array_length(p_photos) > 8 then raise exception 'INVALID_PHOTOS' using errcode = '22023'; end if;
  for v_photo in select value from jsonb_array_elements(p_photos) loop
    if jsonb_typeof(v_photo) is distinct from 'object' or jsonb_typeof(v_photo -> 'id') is distinct from 'string' or coalesce(v_photo ->> 'id','') = '' or jsonb_typeof(v_photo -> 'name') is distinct from 'string' or length(v_photo ->> 'name')>500
      or v_photo ? 'data' or v_photo ? 'originalData' or jsonb_typeof(v_photo -> 'dataRef') is distinct from 'string' then raise exception 'INVALID_PHOTO' using errcode = '22023'; end if;
    perform (v_photo ->> 'id')::uuid;
    for v_path in select value from jsonb_array_elements_text(jsonb_build_array(v_photo ->> 'dataRef', v_photo ->> 'originalRef')) where value is not null loop
      if split_part(v_path,'/',1) <> p_id::text or v_path !~ '^[0-9a-f-]+/[0-9a-f-]+/[0-9a-f]{64}\.(jpg|png|webp|gif)$'
        or not exists(select 1 from storage.objects where bucket_id = 'berry-evidence' and name = v_path) then raise exception 'PHOTO_NOT_STORED' using errcode = '22023'; end if;
    end loop;
  end loop;
end;
$$;
create or replace function berry_private.clean_draft(p_id uuid, p_data jsonb)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_owner public.berry_profiles; v_value jsonb; v_obs jsonb; v_people jsonb := '[]'; v_team jsonb := '[]'; v_records jsonb := '{}'; v_source_records jsonb; v_person_id text; v_job text;
begin
  select * into v_owner from public.berry_profiles where id = (select auth.uid());
  if exists(select 1 from unnest(array['company','ruc','facility','area','date','initialInspectionDate','type','otherType','inspectionTime','inspectionPeriod','objective','defaultClosingDate','unfavorableCause','closingRemarks','conclusions','recommendations','status']) k
    where p_data ? k and jsonb_typeof(p_data -> k) is distinct from 'string')
    or (p_data ? 'step' and (jsonb_typeof(p_data -> 'step')<>'number' or p_data ->> 'step' !~ '^[0-4]$')) then raise exception 'INVALID_INSPECTION_FIELDS' using errcode='22023'; end if;
  if jsonb_typeof(p_data) is distinct from 'object' or octet_length(p_data::text) > 1048576
    or jsonb_typeof(p_data -> 'observations') is distinct from 'array' or jsonb_typeof(p_data -> 'responsibles') is distinct from 'array'
    or jsonb_typeof(p_data -> 'additionalInspectors') is distinct from 'array'
    or jsonb_array_length(p_data -> 'observations') > 100 or jsonb_array_length(p_data -> 'responsibles') > 50 or jsonb_array_length(p_data -> 'additionalInspectors') > 2
    or length(coalesce(p_data ->> 'objective','')) > 560 or length(coalesce(p_data ->> 'unfavorableCause','')) > 1200 or length(coalesce(p_data ->> 'closingRemarks','')) > 1200
    or length(coalesce(p_data ->> 'area','')) > 500 or length(coalesce(p_data ->> 'facility','')) > 500 then raise exception 'INVALID_INSPECTION' using errcode = '22023'; end if;
  for v_value in select value from jsonb_array_elements(p_data -> 'responsibles') loop v_people := v_people || jsonb_build_array(berry_private.report_person(v_value)); end loop;
  for v_value in select value from jsonb_array_elements(p_data -> 'additionalInspectors') loop v_team := v_team || jsonb_build_array(berry_private.report_person(v_value)); end loop;
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
  for v_person_id in select v_owner.id::text union all select value ->> 'personId' from jsonb_array_elements(v_team) where value ->> 'personId' is not null loop
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
    || jsonb_build_object('id',p_id,'ownerId',v_owner.id,'inspector',v_owner.full_name,'inspectorEmail',v_owner.email,'responsibles',v_people,'additionalInspectors',v_team,'registrationDetails',v_records,'registrationNumber','');
end;
$$;

create or replace function public.berry_ensure_draft(p_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_actor uuid := berry_private.require_ready(); v_row public.berry_inspections;
begin
  insert into public.berry_inspections(id,author_id,data) values(p_id,v_actor,jsonb_build_object('id',p_id,'ownerId',v_actor,'partial',true)) on conflict(id) do nothing;
  select * into v_row from public.berry_inspections where id = p_id;
  if v_row.author_id <> v_actor or v_row.workflow <> 'draft' then raise exception 'DRAFT_NOT_EDITABLE' using errcode = '42501'; end if;
  return to_jsonb(v_row);
end;
$$;
create or replace function public.berry_cloud_session()
returns uuid language sql stable security definer set search_path = '' as $$ select berry_private.require_ready(); $$;
create or replace function public.berry_save_draft(p_id uuid, p_expected bigint, p_data jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_actor uuid := berry_private.require_ready(); v_row public.berry_inspections; v_data jsonb;
begin
  select * into v_row from public.berry_inspections where id = p_id and author_id = v_actor for update;
  if not found or v_row.workflow <> 'draft' then raise exception 'DRAFT_NOT_EDITABLE' using errcode = '42501'; end if;
  v_data := berry_private.clean_draft(p_id,p_data);
  if v_row.data = v_data and v_row.deleted_at is null then return to_jsonb(v_row); end if;
  if v_row.revision <> p_expected then
    raise exception 'REVISION_CONFLICT' using errcode = '40001';
  end if;
  update public.berry_inspections set data = v_data, deleted_at = null, revision = revision + 1 where id = p_id returning * into v_row;
  return to_jsonb(v_row);
end;
$$;
create or replace function public.berry_remove_draft(p_id uuid, p_expected bigint)
returns bigint language plpgsql security definer set search_path = '' as $$
declare v_actor uuid := berry_private.require_ready(); v_row public.berry_inspections;
begin
  select * into v_row from public.berry_inspections where id = p_id and author_id = v_actor for update;
  if not found or v_row.workflow <> 'draft' then raise exception 'DRAFT_NOT_EDITABLE' using errcode = '42501'; end if;
  if v_row.revision <> p_expected then raise exception 'REVISION_CONFLICT' using errcode = '40001'; end if;
  update public.berry_inspections set deleted_at = now(), revision = revision + 1 where id = p_id returning * into v_row;
  return v_row.revision;
end;
$$;

create or replace function public.berry_prepare_report(p_id uuid, p_expected bigint, p_hash text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_actor uuid := berry_private.require_ready(); v_row public.berry_inspections; v_lease berry_private.report_leases; v_now timestamptz := berry_private.report_clock(); v_year integer; v_sequence bigint; v_code text; v_obs jsonb; v_person jsonb;
begin
  select * into v_row from public.berry_inspections where id = p_id and author_id = v_actor and deleted_at is null for update;
  if not found then raise exception 'INSPECTION_NOT_FOUND' using errcode = '42501'; end if;
  if v_row.code is not null then
    if p_hash is not null and p_hash <> v_row.source_sha256 then raise exception 'REGISTERED_CONTENT_CHANGED' using errcode = '23505'; end if;
    return jsonb_build_object('registered',true,'inspection',to_jsonb(v_row),'document',(select to_jsonb(d) from public.berry_documents d where inspection_id=p_id and kind='excel' order by revision limit 1));
  end if;
  if v_row.workflow <> 'draft' or p_expected is distinct from v_row.revision then raise exception 'REVISION_CONFLICT' using errcode = '40001'; end if;
  if p_hash is null or p_hash !~ '^[a-f0-9]{64}$' then raise exception 'FILE_REQUIRED' using errcode = '22023'; end if;
  if coalesce(v_row.data ->> 'area','') = '' or coalesce(v_row.data ->> 'objective','') = '' or coalesce(v_row.data ->> 'closingRemarks','') = ''
    or coalesce(v_row.data ->> 'type','') not in ('Planeada','No planeada','Otro') or coalesce(v_row.data ->> 'inspectionPeriod','') not in ('AM','PM')
    or coalesce(v_row.data ->> 'inspectionTime','') !~ '^(0[1-9]|1[0-2]):[0-5][0-9]$' or coalesce(v_row.data ->> 'date','') !~ '^[1-9][0-9]{3}-[0-9]{2}-[0-9]{2}$'
    or jsonb_array_length(v_row.data -> 'observations') = 0 or jsonb_array_length(v_row.data -> 'responsibles') = 0 then raise exception 'INCOMPLETE_INSPECTION' using errcode = '22023'; end if;
  perform (v_row.data ->> 'date')::date;
  for v_obs in select value from jsonb_array_elements(v_row.data -> 'observations') loop
    if btrim(coalesce(v_obs ->> 'description','')) = '' or btrim(coalesce(v_obs ->> 'correctiveAction','')) = '' or coalesce(v_obs ->> 'dueDate','') = '' then raise exception 'INCOMPLETE_OBSERVATION' using errcode = '22023'; end if;
    perform (v_obs ->> 'dueDate')::date;
  end loop;
  for v_person in select value from jsonb_array_elements(v_row.data -> 'responsibles') union all select value from jsonb_array_elements(v_row.data -> 'additionalInspectors') loop
    if coalesce(v_person ->> 'personId','') = '' or not exists(select 1 from public.berry_profiles where id=(v_person ->> 'personId')::uuid and enabled and full_name <> '') then raise exception 'PERSON_DISABLED' using errcode = '22023'; end if;
  end loop;
  v_year := extract(year from v_now at time zone 'America/Lima');
  insert into berry_private.report_counters(year) values(v_year) on conflict do nothing;
  select last_sequence + 1 into v_sequence from berry_private.report_counters where year=v_year for update;
  select * into v_lease from berry_private.report_leases where year=v_year;
  if found and v_lease.expires_at > v_now then
    if v_lease.inspection_id=p_id and v_lease.actor_id=v_actor and v_lease.source_sha256=p_hash and v_lease.revision=v_row.revision then
      return jsonb_build_object('registered',false,'lease',to_jsonb(v_lease),'inspection',to_jsonb(v_row));
    end if;
    raise exception 'REGISTRATION_BUSY' using errcode = '55P03';
  end if;
  v_code := 'IH-' || v_year || '-' || case when v_sequence < 1000 then lpad(v_sequence::text,3,'0') else v_sequence::text end;
  insert into berry_private.report_leases(year,operation_id,inspection_id,actor_id,source_sha256,revision,expires_at,code,accepted_at)
    values(v_year,gen_random_uuid(),p_id,v_actor,p_hash,v_row.revision,v_now + interval '90 seconds',v_code,v_now)
    on conflict(year) do update set operation_id=excluded.operation_id,inspection_id=excluded.inspection_id,actor_id=excluded.actor_id,source_sha256=excluded.source_sha256,revision=excluded.revision,expires_at=excluded.expires_at,code=excluded.code,accepted_at=excluded.accepted_at
    returning * into v_lease;
  return jsonb_build_object('registered',false,'lease',to_jsonb(v_lease),'inspection',to_jsonb(v_row));
end;
$$;

create or replace function public.berry_commit_report(p_operation uuid, p_actor uuid, p_actor_iat bigint, p_document jsonb)
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
  v_expected_path := v_folder||'/'||v_row.id||'/'||(p_document ->> 'sha256')||'/'||(p_document ->> 'filename');
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

create or replace function public.berry_cancel_report(p_operation uuid, p_actor uuid)
returns void language sql security definer set search_path = '' as $$
  delete from berry_private.report_leases where operation_id=p_operation and actor_id=p_actor;
$$;
create or replace function public.berry_claim_report_mail(p_id uuid, p_actor uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_job berry_private.report_outbox;
begin
  if not exists(select 1 from public.berry_inspections where id=p_id and author_id=p_actor and code is not null) then raise exception 'INSPECTION_NOT_FOUND' using errcode='42501'; end if;
  select * into v_job from berry_private.report_outbox where inspection_id=p_id for update;
  if not found then raise exception 'MAIL_NOT_FOUND' using errcode='22023'; end if;
  if v_job.state='queued' then
    update berry_private.report_outbox set state='dispatching',claimed_at=now() where inspection_id=p_id returning * into v_job;
    return jsonb_build_object('dispatch',true,'state',v_job.state);
  end if;
  return jsonb_build_object('dispatch',false,'state',v_job.state,'result',v_job.result);
end;
$$;
create or replace function public.berry_finish_report_mail(p_id uuid,p_actor uuid,p_result jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_job berry_private.report_outbox; v_row public.berry_inspections; v_state text := p_result ->> 'state';
begin
  if coalesce(v_state,'') not in ('accepted','rejected','unconfirmed') then raise exception 'INVALID_RECEIPT' using errcode='22023'; end if;
  select * into v_row from public.berry_inspections where id=p_id and author_id=p_actor for update;
  if not found then raise exception 'INSPECTION_NOT_FOUND' using errcode='42501'; end if;
  select * into v_job from berry_private.report_outbox where inspection_id=p_id for update;
  if not found then raise exception 'MAIL_NOT_FOUND' using errcode='22023'; end if;
  if v_job.result is not null then return to_jsonb(v_row); end if;
  if v_job.state<>'dispatching' then raise exception 'MAIL_NOT_CLAIMED' using errcode='40001'; end if;
  perform set_config('request.jwt.claim.sub',p_actor::text,true);
  update berry_private.report_outbox set state=v_state,result=p_result where inspection_id=p_id;
  update public.berry_inspections set data=jsonb_set(data,'{emailDelivery}',p_result||jsonb_build_object('requestId',p_id,'updatedAt',now())) where id=p_id returning * into v_row;
  if v_state='accepted' then
    insert into public.berry_shared_texts(singleton,inspection_id,objective,unfavorable_cause,closing_remarks,submitted_at)
      values(true,p_id,v_row.data ->> 'objective',coalesce(v_row.data ->> 'unfavorableCause',''),coalesce(v_row.data ->> 'closingRemarks',''),now())
      on conflict(singleton) do update set inspection_id=excluded.inspection_id,objective=excluded.objective,unfavorable_cause=excluded.unfavorable_cause,closing_remarks=excluded.closing_remarks,submitted_at=excluded.submitted_at;
  end if;
  return to_jsonb(v_row);
end;
$$;

create or replace function public.berry_change_correction(p_id uuid,p_observation uuid,p_expected bigint,p_action text,p_value jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_actor uuid := berry_private.require_ready(); v_row public.berry_inspections; v_previous jsonb; v_saved jsonb; v_state text; v_decision text; v_closed boolean; v_is_recipient boolean;
begin
  if jsonb_typeof(p_value) is distinct from 'object' or exists(select 1 from unnest(array['state','responsibleName','action','date','note']) k where p_value ? k and jsonb_typeof(p_value -> k) is distinct from 'string') then raise exception 'INVALID_CORRECTION' using errcode='22023'; end if;
  select * into v_row from public.berry_inspections where id=p_id and deleted_at is null for update;
  v_is_recipient := exists(select 1 from public.berry_recipients where inspection_id=p_id and user_id=v_actor);
  if not found or (v_row.author_id<>v_actor and not v_is_recipient) or v_row.workflow='draft' then raise exception 'INSPECTION_NOT_ASSIGNED' using errcode='42501'; end if;
  if v_row.workflow='closed' then raise exception 'INSPECTION_CLOSED' using errcode='42501'; end if;
  if v_row.revision is distinct from p_expected then raise exception 'REVISION_CONFLICT' using errcode='40001'; end if;
  if not exists(select 1 from jsonb_array_elements(v_row.data -> 'observations') o where o ->> 'id'=p_observation::text) then raise exception 'OBSERVATION_NOT_FOUND' using errcode='22023'; end if;
  v_previous := v_row.data #> array['delivery','corrections',p_observation::text];
  if v_previous is null then v_previous := jsonb_build_object('actorId',v_row.data #>> '{delivery,recipientIds,0}','responsibleName',v_row.data #>> '{responsibles,0,name}','action','','date',(select o ->> 'dueDate' from jsonb_array_elements(v_row.data -> 'observations') o where o ->> 'id'=p_observation::text),'photos','[]'::jsonb,'state','Pendiente','proposedState','Pendiente','decision','draft','note',''); end if;
  v_state := p_value ->> 'state'; v_decision := v_previous ->> 'decision';
  if p_action in ('save','submit') then
    if not v_is_recipient or v_decision in ('review','approved') then raise exception 'CORRECTION_NOT_EDITABLE' using errcode='42501'; end if;
    if coalesce(v_state,'') not in ('Pendiente','Ejecutado') or not (p_value ?& array['responsibleName','action','date']) or length(coalesce(p_value ->> 'responsibleName',''))>250 or length(coalesce(p_value ->> 'action',''))>10000 then raise exception 'INVALID_CORRECTION' using errcode='22023'; end if;
    perform berry_private.check_photos(p_id,p_value -> 'photos');
    if coalesce(p_value ->> 'date','')<>'' then perform (p_value ->> 'date')::date; end if;
    if p_action='submit' and (btrim(coalesce(p_value ->> 'responsibleName',''))='' or btrim(coalesce(p_value ->> 'action',''))='' or coalesce(p_value ->> 'date','')='' or (v_state='Ejecutado' and jsonb_array_length(p_value -> 'photos')=0)) then raise exception 'INCOMPLETE_CORRECTION' using errcode='22023'; end if;
    v_saved := jsonb_build_object('actorId',v_actor,'responsibleName',btrim(p_value ->> 'responsibleName'),'action',p_value ->> 'action','date',p_value ->> 'date','photos',p_value -> 'photos','state',v_state,'proposedState',v_state,'decision',case when p_action='submit' then 'review' else 'draft' end,'note',v_previous ->> 'note');
  elsif p_action='state' then
    if coalesce(v_state,'') not in ('Pendiente','Ejecutado') then raise exception 'INVALID_STATE' using errcode='22023'; end if;
    v_saved := v_previous || jsonb_build_object('state',v_state,'proposedState',v_state,'decision',case when v_decision='approved' and v_state<>v_previous ->> 'state' then 'review' else v_decision end);
  elsif p_action in ('approve','changes') then
    if v_row.author_id<>v_actor or v_decision<>'review' then raise exception 'REVIEW_NOT_ALLOWED' using errcode='42501'; end if;
    if length(coalesce(p_value ->> 'note',''))>5000 or (p_action='changes' and btrim(coalesce(p_value ->> 'note',''))='') then raise exception 'REVIEW_NOTE_REQUIRED' using errcode='22023'; end if;
    v_state := case when p_action='approve' then 'Ejecutado' else 'Pendiente' end;
    v_saved := v_previous || jsonb_build_object('state',v_state,'proposedState',v_state,'decision',case when p_action='approve' then 'approved' else 'changes' end,'note',btrim(coalesce(p_value ->> 'note','')));
  else raise exception 'INVALID_ACTION' using errcode='22023'; end if;
  v_row.data := jsonb_set(v_row.data,array['delivery','corrections',p_observation::text],v_saved);
  select not exists(select 1 from jsonb_array_elements(v_row.data -> 'observations') o where coalesce(v_row.data #>> array['delivery','corrections',o ->> 'id','decision'],'')<>'approved' or coalesce(v_row.data #>> array['delivery','corrections',o ->> 'id','state'],'')<>'Ejecutado') into v_closed;
  insert into public.berry_corrections(inspection_id,observation_id,actor_id,responsible_name,state,decision,data,reviewer_id,reviewer_note,reviewed_at)
    values(p_id,p_observation,(v_saved ->> 'actorId')::uuid,v_saved ->> 'responsibleName',v_saved ->> 'state',v_saved ->> 'decision',v_saved,case when p_action in ('approve','changes') then v_actor else null end,coalesce(v_saved ->> 'note',''),case when p_action in ('approve','changes') then now() else null end)
    on conflict(inspection_id,observation_id) do update set actor_id=excluded.actor_id,responsible_name=excluded.responsible_name,state=excluded.state,decision=excluded.decision,data=excluded.data,revision=berry_corrections.revision+1,
      reviewer_id=case when p_action in ('approve','changes') then excluded.reviewer_id else berry_corrections.reviewer_id end,reviewer_note=excluded.reviewer_note,reviewed_at=case when p_action in ('approve','changes') then excluded.reviewed_at else berry_corrections.reviewed_at end;
  update public.berry_inspections set data=jsonb_set(v_row.data,'{delivery,revision}',to_jsonb(revision+1)),revision=revision+1,workflow=case when v_closed then 'closed' else 'sent' end,closed_at=case when v_closed then now() else null end where id=p_id returning * into v_row;
  return to_jsonb(v_row);
end;
$$;

create or replace function berry_private.can_upload_evidence(p_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select berry_private.is_enabled() and exists(select 1 from public.berry_inspections i where id=p_id and workflow<>'closed' and
    ((i.author_id=(select auth.uid()) and i.workflow='draft') or (i.workflow='sent' and exists(select 1 from public.berry_recipients r where r.inspection_id=i.id and r.user_id=(select auth.uid())))));
$$;
drop policy if exists berry_private_files_read on storage.objects;
create policy berry_private_files_read on storage.objects for select to authenticated using (
  (bucket_id='berry-evidence' and berry_private.can_read_inspection(berry_private.asset_inspection_id(name)))
  or (bucket_id='berry-documents' and exists(select 1 from public.berry_documents d where d.storage_path=name and berry_private.can_read_inspection(d.inspection_id)))
);
drop policy if exists berry_evidence_insert on storage.objects;
create policy berry_evidence_insert on storage.objects for insert to authenticated with check (bucket_id='berry-evidence' and berry_private.can_upload_evidence(berry_private.asset_inspection_id(name)));
grant insert on storage.objects to authenticated;

revoke all on function berry_private.report_clock(),berry_private.require_ready(),berry_private.report_person(jsonb),berry_private.check_photos(uuid,jsonb),berry_private.clean_draft(uuid,jsonb),berry_private.can_upload_evidence(uuid) from public,anon,authenticated;
grant execute on function berry_private.can_upload_evidence(uuid) to authenticated;
revoke all on function public.berry_ensure_draft(uuid),public.berry_save_draft(uuid,bigint,jsonb),public.berry_remove_draft(uuid,bigint),public.berry_prepare_report(uuid,bigint,text),public.berry_change_correction(uuid,uuid,bigint,text,jsonb),
  public.berry_commit_report(uuid,uuid,bigint,jsonb),public.berry_cancel_report(uuid,uuid),public.berry_claim_report_mail(uuid,uuid),public.berry_finish_report_mail(uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.berry_ensure_draft(uuid),public.berry_save_draft(uuid,bigint,jsonb),public.berry_remove_draft(uuid,bigint),public.berry_prepare_report(uuid,bigint,text),public.berry_change_correction(uuid,uuid,bigint,text,jsonb) to authenticated;
grant execute on function public.berry_commit_report(uuid,uuid,bigint,jsonb),public.berry_cancel_report(uuid,uuid),public.berry_claim_report_mail(uuid,uuid),public.berry_finish_report_mail(uuid,uuid,jsonb) to service_role;

create or replace function public.berry_schema_status()
returns jsonb language sql stable set search_path = '' as $$
  select jsonb_build_object('schema_version','202611070001','accounts_version','202611070002','reports_version','202611080003','stage','reports','sync_ready',true);
$$;
revoke all on function public.berry_cloud_session() from public,anon,authenticated;
grant execute on function public.berry_cloud_session() to authenticated;
notify pgrst,'reload schema';
commit;
