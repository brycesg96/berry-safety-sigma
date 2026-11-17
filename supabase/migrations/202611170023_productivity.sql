-- Seguimiento, conversaciones, sincronización y recordatorios. No reescribe informes.
begin;
create table if not exists public.berry_followup_events(
 id uuid primary key default gen_random_uuid(), inspection_id uuid not null references public.berry_inspections(id),
 observation_id uuid not null, actor_id uuid not null references public.berry_profiles(id), actor_name text not null,
 action text not null check(action in ('save','submit','state','approve','changes','comment')),
 state text, decision text, body text not null default '' check(length(body)<=5000), created_at timestamptz not null default now()
);
create index if not exists berry_followup_events_report on public.berry_followup_events(inspection_id,observation_id,created_at,id);
alter table public.berry_followup_events enable row level security;
revoke all on public.berry_followup_events from public,anon,authenticated;
grant select on public.berry_followup_events to authenticated;
drop policy if exists berry_followup_events_read on public.berry_followup_events;
create policy berry_followup_events_read on public.berry_followup_events for select to authenticated using(berry_private.can_read_inspection(inspection_id) or berry_private.can_read_admin_archive(inspection_id));

create table if not exists berry_private.offline_operations(
 actor_id uuid not null, operation_id uuid not null, inspection_id uuid not null, fingerprint text not null, result jsonb not null,
 created_at timestamptz not null default now(), primary key(actor_id,operation_id)
);
alter table berry_private.offline_operations enable row level security;
revoke all on berry_private.offline_operations from public,anon,authenticated;

create or replace function berry_private.capture_followup_event() returns trigger language plpgsql security definer set search_path='' as $$
declare v_actor uuid:=auth.uid(); v_action text;
begin
 if v_actor is null then return new; end if;
 if tg_op='UPDATE' and new.data is not distinct from old.data then return new; end if;
 v_action:=case when new.decision='approved' then 'approve' when new.decision='changes' then 'changes' when new.decision='review' then 'submit' else 'save' end;
 if tg_op='UPDATE' and new.decision=old.decision and new.state is distinct from old.state then v_action:='state'; end if;
 insert into public.berry_followup_events(inspection_id,observation_id,actor_id,actor_name,action,state,decision,body)
 values(new.inspection_id,new.observation_id,v_actor,coalesce((select full_name from public.berry_profiles where id=v_actor),''),v_action,new.state,new.decision,
 case when v_action in ('approve','changes') then coalesce(new.reviewer_note,'') else '' end);
 return new;
end $$;
drop trigger if exists berry_capture_followup on public.berry_corrections;
create trigger berry_capture_followup after insert or update on public.berry_corrections for each row execute function berry_private.capture_followup_event();

create or replace function public.berry_add_followup_comment(p_id uuid,p_observation uuid,p_operation uuid,p_body text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_actor uuid:=berry_private.require_ready(); v_event public.berry_followup_events;
begin
 if not berry_private.can_read_inspection(p_id) then raise exception 'COMMENT_DENIED' using errcode='42501';end if;
 if not exists(select 1 from public.berry_inspections i where i.id=p_id and i.deleted_at is null and i.workflow<>'draft' and
 (i.author_id=v_actor or exists(select 1 from public.berry_recipients r where r.inspection_id=i.id and r.user_id=v_actor))) then raise exception 'COMMENT_DENIED' using errcode='42501';end if;
 if not exists(select 1 from public.berry_inspections i,jsonb_array_elements(i.data->'observations') o where i.id=p_id and o->>'id'=p_observation::text) then raise exception 'OBSERVATION_NOT_FOUND' using errcode='22023';end if;
 if p_operation is null or btrim(coalesce(p_body,''))='' or length(p_body)>5000 then raise exception 'INVALID_COMMENT' using errcode='22023';end if;
 select * into v_event from public.berry_followup_events where id=p_operation;
 if found then
  if v_event.actor_id<>v_actor or v_event.inspection_id<>p_id or v_event.observation_id<>p_observation or v_event.action<>'comment' or v_event.body<>btrim(p_body) then raise exception 'OPERATION_CONFLICT' using errcode='40001';end if;
  return to_jsonb(v_event);
 end if;
 insert into public.berry_followup_events(id,inspection_id,observation_id,actor_id,actor_name,action,body)
 values(p_operation,p_id,p_observation,v_actor,(select full_name from public.berry_profiles where id=v_actor),'comment',btrim(p_body)) returning * into v_event;
 return to_jsonb(v_event);
end $$;
create or replace function public.berry_apply_offline_correction(p_operation uuid,p_id uuid,p_observation uuid,p_expected bigint,p_action text,p_value jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_actor uuid:=berry_private.require_ready(); v_previous berry_private.offline_operations;v_result jsonb;
 v_fingerprint text:=md5(jsonb_build_object('id',p_id,'observation',p_observation,'expected',p_expected,'action',p_action,'value',p_value)::text);
begin
 if p_operation is null or p_action not in ('save','submit','state') then raise exception 'INVALID_OFFLINE_OPERATION' using errcode='22023';end if;
 perform pg_advisory_xact_lock(hashtextextended(v_actor::text||p_operation::text,0));
 if not berry_private.can_read_inspection(p_id) or not exists(select 1 from public.berry_inspections i where i.id=p_id and i.deleted_at is null and exists(select 1 from public.berry_recipients r where r.inspection_id=i.id and r.user_id=v_actor)) then raise exception 'INSPECTION_NOT_ASSIGNED' using errcode='42501';end if;
 select * into v_previous from berry_private.offline_operations where actor_id=v_actor and operation_id=p_operation;
 if found then
  if v_previous.fingerprint<>v_fingerprint then raise exception 'OPERATION_CONFLICT' using errcode='40001';end if;
  return v_previous.result;
 end if;
 v_result:=public.berry_change_correction(p_id,p_observation,p_expected,p_action,p_value);
 insert into berry_private.offline_operations(actor_id,operation_id,inspection_id,fingerprint,result) values(v_actor,p_operation,p_id,v_fingerprint,v_result);
 return v_result;
end $$;

create table if not exists public.berry_mail_recipients(
 request_id uuid not null, inspection_id uuid not null references public.berry_inspections(id), email text not null check(email=lower(email) and length(email)<=254),
 state text not null default 'requested' check(state in ('requested','submitted','delivered','bounced','deferred')),
 provider_id text, detail text not null default '', occurred_at timestamptz not null default now(), primary key(request_id,email)
);
create index if not exists berry_mail_by_inspection on public.berry_mail_recipients(inspection_id,occurred_at);
alter table public.berry_mail_recipients enable row level security;
revoke all on public.berry_mail_recipients from public,anon,authenticated;
grant select on public.berry_mail_recipients to authenticated;
drop policy if exists berry_mail_read on public.berry_mail_recipients;
create policy berry_mail_read on public.berry_mail_recipients for select to authenticated using(
 (berry_private.can_read_inspection(inspection_id) or berry_private.can_read_admin_archive(inspection_id)) and (email=(select lower(p.email) from public.berry_profiles p where p.id=auth.uid()) or
 exists(select 1 from public.berry_inspections i where i.id=inspection_id and i.author_id=auth.uid()) or exists(select 1 from public.berry_profiles a where a.id=auth.uid() and a.role='admin' and a.enabled)));
create table if not exists berry_private.mail_events(event_id text primary key, request_id uuid not null, email text not null, fingerprint text not null, received_at timestamptz not null default now());
alter table berry_private.mail_events enable row level security;
revoke all on berry_private.mail_events from public,anon,authenticated;
create or replace function public.berry_initialize_mail(p_id uuid,p_request uuid,p_emails jsonb)
returns void language plpgsql security definer set search_path='' as $$
declare v_email text;
begin
 if jsonb_typeof(p_emails)<>'array' or jsonb_array_length(p_emails)>101 or not exists(select 1 from public.berry_inspections where id=p_id and code is not null and deleted_at is null) then raise exception 'INVALID_MAIL_REQUEST' using errcode='22023';end if;
 for v_email in select distinct lower(value) from jsonb_array_elements_text(p_emails) loop
  if v_email !~ '^[^[:space:]@<>,;]+@[^[:space:]@<>,;]+\.[^[:space:]@<>,;]+$' then raise exception 'INVALID_EMAIL' using errcode='22023';end if;
  insert into public.berry_mail_recipients(request_id,inspection_id,email) values(p_request,p_id,v_email) on conflict do nothing;
 end loop;
end $$;
create or replace function public.berry_record_mail_event(p_event text,p_request uuid,p_email text,p_state text,p_provider text,p_detail text,p_occurred timestamptz)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_row public.berry_mail_recipients;v_event berry_private.mail_events;v_fingerprint text:=md5(jsonb_build_array(p_request,lower(p_email),p_state,p_provider,p_detail,p_occurred)::text);
begin
 if length(coalesce(p_event,'')) not between 1 and 250 or p_state not in ('submitted','delivered','bounced','deferred') or length(coalesce(p_detail,''))>1000 or length(coalesce(p_provider,''))>500 or p_occurred is null or p_occurred>now()+interval '5 minutes' then raise exception 'INVALID_MAIL_EVENT' using errcode='22023';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_event,0));
 select * into v_event from berry_private.mail_events where event_id=p_event;
 if found then
  if v_event.fingerprint<>v_fingerprint then raise exception 'EVENT_CONFLICT' using errcode='40001';end if;
  return jsonb_build_object('duplicate',true);
 end if;
 select * into v_row from public.berry_mail_recipients where request_id=p_request and email=lower(p_email) for update;
 if not found then raise exception 'UNKNOWN_RECIPIENT' using errcode='22023';end if;
 insert into berry_private.mail_events(event_id,request_id,email,fingerprint) values(p_event,p_request,lower(p_email),v_fingerprint);
 -- A delayed submitted/deferred event cannot erase a final delivery/bounce result.
 if (v_row.state='requested' or p_occurred>=v_row.occurred_at) and (v_row.state not in ('delivered','bounced') or p_state in ('delivered','bounced')) then
  update public.berry_mail_recipients set state=p_state,provider_id=p_provider,detail=coalesce(p_detail,''),occurred_at=p_occurred where request_id=p_request and email=lower(p_email);
 end if;
 return jsonb_build_object('duplicate',false);
end $$;

create table if not exists berry_private.reminder_settings(singleton boolean primary key default true check(singleton), enabled boolean not null default false,
 lead_days integer not null default 3 check(lead_days between 0 and 30), cadence_days integer not null default 3 check(cadence_days between 1 and 30), updated_at timestamptz not null default now());
alter table berry_private.reminder_settings enable row level security;
revoke all on berry_private.reminder_settings from public,anon,authenticated;
insert into berry_private.reminder_settings(singleton) values(true) on conflict do nothing;
create table if not exists berry_private.reminder_jobs(
 id uuid primary key default gen_random_uuid(), inspection_id uuid not null references public.berry_inspections(id), actor_id uuid not null references public.berry_profiles(id),
 period date not null, state text not null default 'claimed' check(state in ('claimed','accepted','rejected','unconfirmed')), claimed_at timestamptz not null default now(), result jsonb,
 unique(inspection_id,actor_id,period)
);
alter table berry_private.reminder_jobs enable row level security;
revoke all on berry_private.reminder_jobs from public,anon,authenticated;
create or replace function public.berry_reminder_settings(p_value jsonb default null) returns jsonb language plpgsql security definer set search_path='' as $$
declare v_actor uuid:=berry_private.require_admin();v_settings berry_private.reminder_settings;
begin
 if p_value is not null then
  if jsonb_typeof(p_value->'enabled')<>'boolean' or (p_value->>'lead_days')::integer not between 0 and 30 or (p_value->>'cadence_days')::integer not between 1 and 30 or not(p_value ?& array['enabled','lead_days','cadence_days']) then raise exception 'INVALID_SETTINGS' using errcode='22023';end if;
  update berry_private.reminder_settings set enabled=(p_value->>'enabled')::boolean,lead_days=(p_value->>'lead_days')::integer,cadence_days=(p_value->>'cadence_days')::integer,updated_at=now() where singleton;
 end if;
 select * into v_settings from berry_private.reminder_settings where singleton;return to_jsonb(v_settings);
end $$;
create or replace function public.berry_claim_reminders(p_limit integer default 20) returns jsonb language plpgsql security definer set search_path='' as $$
declare v_settings berry_private.reminder_settings;v_today date:=(now() at time zone 'America/Lima')::date; v_job berry_private.reminder_jobs;v_candidate record; v_result jsonb:='[]';
begin
 select * into v_settings from berry_private.reminder_settings where singleton;
 if not v_settings.enabled then return v_result;end if;
 for v_candidate in
  select i.id,p.id actor_id,p.email,p.full_name,i.data,i.code,d.storage_path,d.filename,
   case when p.id=i.author_id and exists(select 1 from jsonb_each(coalesce(i.data#>'{delivery,corrections}','{}')) c where c.value->>'decision'='review') then 'review' else 'correction' end reason
  from public.berry_inspections i join public.berry_profiles p on p.enabled and p.deleted_at is null and (p.id=i.author_id or exists(select 1 from public.berry_recipients r where r.inspection_id=i.id and r.user_id=p.id))
  join lateral (select storage_path,filename from public.berry_documents where inspection_id=i.id and kind='excel' order by revision desc limit 1) d on true
  where i.workflow='sent' and i.deleted_at is null and i.active_edit_operation is null
  and (p.history_access_from is null or i.created_at>=p.history_access_from or exists(select 1 from berry_private.restored_pending_access a where a.user_id=p.id and a.inspection_id=i.id))
  and ((p.id=i.author_id and p.can_create_inspections) or (p.can_receive_inspections and exists(select 1 from public.berry_recipients r where r.inspection_id=i.id and r.user_id=p.id))) and exists(
   select 1 from jsonb_array_elements(i.data->'observations') o
   where coalesce(i.data #>> array['delivery','corrections',o->>'id','decision'],'draft')<>'approved'
    and case when o->>'dueDate' ~ '^\d{4}-\d{2}-\d{2}$' then (o->>'dueDate')::date<=v_today+v_settings.lead_days else false end
    and ((p.id=i.author_id and i.data #>> array['delivery','corrections',o->>'id','decision']='review') or (p.can_receive_inspections and exists(select 1 from public.berry_recipients r where r.inspection_id=i.id and r.user_id=p.id) and coalesce(i.data #>> array['delivery','corrections',o->>'id','decision'],'draft')<>'review')))
  and not exists(select 1 from berry_private.reminder_jobs j where j.inspection_id=i.id and j.actor_id=p.id and j.period>v_today-v_settings.cadence_days)
  order by (select max(j.period) from berry_private.reminder_jobs j where j.inspection_id=i.id and j.actor_id=p.id) nulls first,i.id,p.id limit greatest(1,least(p_limit,50))
 loop
  insert into berry_private.reminder_jobs(inspection_id,actor_id,period) values(v_candidate.id,v_candidate.actor_id,v_today) on conflict do nothing returning * into v_job;
  if found then v_result:=v_result||jsonb_build_array(to_jsonb(v_candidate)||jsonb_build_object('request_id',v_job.id));end if;
 end loop;return v_result;
end $$;
create or replace function public.berry_finish_reminder(p_id uuid,p_state text,p_result jsonb) returns void language plpgsql security definer set search_path='' as $$ begin
 if p_state not in ('accepted','rejected','unconfirmed') then raise exception 'INVALID_STATE' using errcode='22023';end if;
 update berry_private.reminder_jobs set state=p_state,result=p_result where id=p_id and state='claimed';
end $$;

revoke all on function berry_private.capture_followup_event() from public,anon,authenticated;
revoke all on function public.berry_add_followup_comment(uuid,uuid,uuid,text),public.berry_apply_offline_correction(uuid,uuid,uuid,bigint,text,jsonb),public.berry_reminder_settings(jsonb) from public,anon,authenticated;
grant execute on function public.berry_add_followup_comment(uuid,uuid,uuid,text),public.berry_apply_offline_correction(uuid,uuid,uuid,bigint,text,jsonb),public.berry_reminder_settings(jsonb) to authenticated;
revoke all on function public.berry_initialize_mail(uuid,uuid,jsonb),public.berry_record_mail_event(text,uuid,text,text,text,text,timestamptz),public.berry_claim_reminders(integer),public.berry_finish_reminder(uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.berry_initialize_mail(uuid,uuid,jsonb),public.berry_record_mail_event(text,uuid,text,text,text,text,timestamptz),public.berry_claim_reminders(integer),public.berry_finish_reminder(uuid,text,jsonb) to service_role;

create index if not exists berry_assigned_recipients on public.berry_inspections using gin ((data->'delivery'->'recipientIds')) where deleted_at is null;
create index if not exists berry_registered_dates on public.berry_inspections((coalesce(data->>'date','')) desc,id desc) where code is not null and deleted_at is null;
create index if not exists berry_assigned_recipients_page on public.berry_inspections using gin ((data->'delivery'->'recipientIds')) where deleted_at is null;
create index if not exists berry_workspace_page on public.berry_inspections(author_id,updated_at desc,id) where deleted_at is null;
create index if not exists berry_recipient_page on public.berry_inspections using gin((data->'delivery'->'recipientIds')) where deleted_at is null;
create or replace function public.berry_admin_dashboard_page(p_before text default null,p_before_id uuid default null,p_limit integer default 100)
returns jsonb language plpgsql stable security definer set search_path='' as $$ begin
 perform berry_private.require_admin();
 return (select coalesce(jsonb_agg((to_jsonb(i)-'data')||jsonb_build_object('data',berry_private.dashboard_text(i.data),'identityLinks',berry_private.dashboard_identity_links(i.data,i.author_id)) order by coalesce(i.data->>'date','') desc,i.id desc),'[]')
 from (select * from public.berry_inspections n where n.deleted_at is null and n.code is not null and n.workflow in ('sent','closed') and coalesce((n.data->>'partial')::boolean,false)=false
 and (p_before is null or (coalesce(n.data->>'date',''),n.id)<(p_before,p_before_id)) order by coalesce(n.data->>'date','') desc,n.id desc limit greatest(1,least(p_limit,200))) i);
end $$;
revoke all on function public.berry_admin_dashboard_page(text,uuid,integer) from public,anon,authenticated;
grant execute on function public.berry_admin_dashboard_page(text,uuid,integer) to authenticated;
create or replace function public.berry_schema_status() returns jsonb language sql stable set search_path='' as $$
 select jsonb_build_object('schema_version','202611070001','accounts_version','202611070002','reports_version','202611080003','final_archive_version','202611080004','permissions_version','202611080005','storage_version','202611080006','dashboard_version','202611080007','registration_version','202611090008','correction_identity_version','202611090009','admin_edit_version','202611090010','account_copies_version','202611090011','next_registration_version','202611090012','organization_catalog_version','202611150014','account_identity_version','202611150015','area_nomenclature_version','202611150016','account_email_version','202611150017','location_order_version','202611150018','location_catalog_version','202611150019','catalog_order_version','202611150020','fundo_installations_version','202611150021','manual_installations_version','202611160022','productivity_version','202611170023','stage','reports','sync_ready',true);
$$;
notify pgrst,'reload schema';
commit;
