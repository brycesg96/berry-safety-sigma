-- Berry Safety · Paso 9: nombre del responsable del levantamiento inmodificable.
-- Requiere el paso 8. No modifica informes existentes, archivos ni correlativos.
begin;
do $$ begin
 if public.berry_schema_status()->>'admin_edit_version' is not null then raise exception 'No repita el paso 9 después de instalar el paso 10' using errcode='55000';end if;
 if public.berry_schema_status()->>'registration_version' is distinct from '202611090008' then
  raise exception 'Primero instale la actualización del espacio de trabajo hasta el paso 8' using errcode='55000';end if;
end $$;
create or replace function berry_private.berry_change_correction_v4(p_id uuid,p_observation uuid,p_expected bigint,p_action text,p_value jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_actor uuid := berry_private.require_ready(); v_row public.berry_inspections; v_previous jsonb; v_saved jsonb; v_state text; v_decision text; v_closed boolean; v_is_recipient boolean; v_responsible_name text;
begin
  if jsonb_typeof(p_value) is distinct from 'object' or exists(select 1 from unnest(array['state','responsibleName','action','date','note']) k where p_value ? k and jsonb_typeof(p_value -> k) is distinct from 'string') then raise exception 'INVALID_CORRECTION' using errcode='22023'; end if;
  select * into v_row from public.berry_inspections where id=p_id and deleted_at is null for update;
  v_is_recipient := exists(select 1 from public.berry_recipients where inspection_id=p_id and user_id=v_actor);
  if not found or (v_row.author_id<>v_actor and not v_is_recipient) or v_row.workflow='draft' then raise exception 'INSPECTION_NOT_ASSIGNED' using errcode='42501'; end if;
  if v_row.workflow='closed' then raise exception 'INSPECTION_CLOSED' using errcode='42501'; end if;
  if v_row.revision is distinct from p_expected then raise exception 'REVISION_CONFLICT' using errcode='40001'; end if;
  if not exists(select 1 from jsonb_array_elements(v_row.data -> 'observations') o where o ->> 'id'=p_observation::text) then raise exception 'OBSERVATION_NOT_FOUND' using errcode='22023'; end if;
  v_responsible_name := v_row.data #>> '{responsibles,0,name}';
  if btrim(coalesce(v_responsible_name,''))='' then raise exception 'ASSIGNED_RESPONSIBLE_REQUIRED' using errcode='22023'; end if;
  v_previous := v_row.data #> array['delivery','corrections',p_observation::text];
  if v_previous is null then v_previous := jsonb_build_object('actorId',v_row.data #>> '{delivery,recipientIds,0}','responsibleName',v_responsible_name,'action','','date',(select o ->> 'dueDate' from jsonb_array_elements(v_row.data -> 'observations') o where o ->> 'id'=p_observation::text),'photos','[]'::jsonb,'state','Pendiente','proposedState','Pendiente','decision','draft','note',''); end if;
  v_state := p_value ->> 'state'; v_decision := v_previous ->> 'decision';
  if p_action in ('save','submit') then
    if not v_is_recipient or v_decision in ('review','approved') then raise exception 'CORRECTION_NOT_EDITABLE' using errcode='42501'; end if;
    if coalesce(v_state,'') not in ('Pendiente','Ejecutado') or not (p_value ?& array['action','date']) or length(coalesce(p_value ->> 'responsibleName',''))>250 or length(coalesce(p_value ->> 'action',''))>10000 then raise exception 'INVALID_CORRECTION' using errcode='22023'; end if;
    perform berry_private.check_photos(p_id,p_value -> 'photos');
    if coalesce(p_value ->> 'date','')<>'' then perform (p_value ->> 'date')::date; end if;
    if p_action='submit' and (btrim(coalesce(p_value ->> 'action',''))='' or coalesce(p_value ->> 'date','')='' or (v_state='Ejecutado' and jsonb_array_length(p_value -> 'photos')=0)) then raise exception 'INCOMPLETE_CORRECTION' using errcode='22023'; end if;
    v_saved := jsonb_build_object('actorId',v_actor,'responsibleName',v_responsible_name,'action',p_value ->> 'action','date',p_value ->> 'date','photos',p_value -> 'photos','state',v_state,'proposedState',v_state,'decision',case when p_action='submit' then 'review' else 'draft' end,'note',v_previous ->> 'note');
  elsif p_action='state' then
    if coalesce(v_state,'') not in ('Pendiente','Ejecutado') then raise exception 'INVALID_STATE' using errcode='22023'; end if;
    v_saved := v_previous || jsonb_build_object('state',v_state,'proposedState',v_state,'decision',case when v_decision='approved' and v_state<>v_previous ->> 'state' then 'review' else v_decision end);
  elsif p_action in ('approve','changes') then
    if v_row.author_id<>v_actor or v_decision<>'review' then raise exception 'REVIEW_NOT_ALLOWED' using errcode='42501'; end if;
    if length(coalesce(p_value ->> 'note',''))>5000 or (p_action='changes' and btrim(coalesce(p_value ->> 'note',''))='') then raise exception 'REVIEW_NOTE_REQUIRED' using errcode='22023'; end if;
    v_state := case when p_action='approve' then 'Ejecutado' else 'Pendiente' end;
    v_saved := v_previous || jsonb_build_object('state',v_state,'proposedState',v_state,'decision',case when p_action='approve' then 'approved' else 'changes' end,'note',btrim(coalesce(p_value ->> 'note','')));
  else raise exception 'INVALID_ACTION' using errcode='22023'; end if;
  -- The assigned identity is an inspection snapshot, never caller-supplied text.
  v_saved := v_saved || jsonb_build_object('responsibleName',v_responsible_name);
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

revoke all on function berry_private.berry_change_correction_v4(uuid,uuid,bigint,text,jsonb) from public,anon,authenticated;
create or replace function public.berry_schema_status()returns jsonb language sql stable set search_path='' as $$
 select jsonb_build_object('schema_version','202611070001','accounts_version','202611070002','reports_version','202611080003','final_archive_version','202611080004','permissions_version','202611080005','storage_version','202611080006','dashboard_version','202611080007','registration_version','202611090008','correction_identity_version','202611090009','stage','reports','sync_ready',true);
$$;
notify pgrst,'reload schema';
commit;
