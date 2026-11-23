-- Paso 27. Autor real de cada levantamiento, confirmado por la sesión autenticada.
-- Conserva informes, documentos, correlativos, permisos e historial existentes.
begin;
create or replace function berry_private.correction_author_name(p_actor uuid,p_snapshot text) returns text
language sql stable security definer set search_path='' as $$
 select coalesce((select coalesce(nullif(btrim(full_name),''),nullif(email,'')) from public.berry_profiles where id=p_actor),nullif(btrim(p_snapshot),''),'');
$$;
revoke all on function berry_private.correction_author_name(uuid,text) from public,anon,authenticated;
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
  v_previous := v_row.data #> array['delivery','corrections',p_observation::text];
  if v_previous is null then v_previous := jsonb_build_object('actorId',v_actor,'responsibleName',berry_private.correction_author_name(v_actor,null),'action','','date',(select o ->> 'dueDate' from jsonb_array_elements(v_row.data -> 'observations') o where o ->> 'id'=p_observation::text),'photos','[]'::jsonb,'state','Pendiente','proposedState','Pendiente','decision','draft','note',''); end if;
  v_responsible_name:=berry_private.correction_author_name(case when p_action in ('save','submit') then v_actor else coalesce(nullif(v_previous->>'actorId','')::uuid,v_actor) end,v_previous->>'responsibleName');
  if btrim(v_responsible_name)='' then raise exception 'CORRECTION_AUTHOR_REQUIRED' using errcode='22023';end if;
  v_state := p_value ->> 'state'; v_decision := v_previous ->> 'decision';
  if p_action in ('save','submit') then
    if coalesce(v_state,'')<>'Pendiente' then raise exception 'CORRECTION_STATE_IS_AUTOMATIC' using errcode='42501';end if;
    if not v_is_recipient or v_decision in ('review','approved') then raise exception 'CORRECTION_NOT_EDITABLE' using errcode='42501'; end if;
    if coalesce(v_state,'') not in ('Pendiente','Ejecutado') or not (p_value ?& array['action','date']) or length(coalesce(p_value ->> 'responsibleName',''))>250 or length(coalesce(p_value ->> 'action',''))>10000 then raise exception 'INVALID_CORRECTION' using errcode='22023'; end if;
    perform berry_private.check_photos(p_id,p_value -> 'photos');
    if coalesce(p_value ->> 'date','')<>'' then perform (p_value ->> 'date')::date; end if;
    if p_action='submit' and (btrim(coalesce(p_value ->> 'action',''))='' or coalesce(p_value ->> 'date','')='' or (v_state='Ejecutado' and jsonb_array_length(p_value -> 'photos')=0)) then raise exception 'INCOMPLETE_CORRECTION' using errcode='22023'; end if;
    v_saved := jsonb_build_object('actorId',v_actor,'responsibleName',v_responsible_name,'action',p_value ->> 'action','date',p_value ->> 'date','photos',p_value -> 'photos','state',v_state,'proposedState',v_state,'decision',case when p_action='submit' then 'review' else 'draft' end,'note',v_previous ->> 'note');
  elsif p_action='state' then
    raise exception 'CORRECTION_STATE_IS_AUTOMATIC' using errcode='42501';
  elsif p_action in ('approve','changes') then
    if v_row.author_id<>v_actor or v_decision<>'review' then raise exception 'REVIEW_NOT_ALLOWED' using errcode='42501'; end if;
    if length(coalesce(p_value ->> 'note',''))>5000 or (p_action='changes' and btrim(coalesce(p_value ->> 'note',''))='') then raise exception 'REVIEW_NOTE_REQUIRED' using errcode='22023'; end if;
    v_state := case when p_action='approve' then 'Ejecutado' else 'Pendiente' end;
    v_saved := v_previous || jsonb_build_object('state',v_state,'proposedState',v_state,'decision',case when p_action='approve' then 'approved' else 'changes' end,'note',btrim(coalesce(p_value ->> 'note','')));
  else raise exception 'INVALID_ACTION' using errcode='22023'; end if;
  -- Authenticated editor owns the correction; reviewer preserves that actor identity.
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

-- Preserve the administrator edit workflow and its guards. Patch only the line
-- that used to replace every correction author with the first assigned recipient.
do $$
declare definition text;before_text text;after_text text;
begin
 before_text:=$old$v_correction:=v_correction||jsonb_build_object('responsibleName',v_data#>>'{responsibles,0,name}');$old$;
 after_text:=$new$v_correction:=v_correction||jsonb_build_object('responsibleName',berry_private.correction_author_name((v_correction->>'actorId')::uuid,v_correction->>'responsibleName'));$new$;
 definition:=pg_get_functiondef('public.berry_prepare_admin_edit(uuid,bigint,jsonb,uuid)'::regprocedure);
 if position(before_text in definition)>0 then execute replace(definition,before_text,after_text);
 elsif position(after_text in definition)=0 then raise exception 'ADMIN_AUTHOR_PATCH_NOT_APPLICABLE' using errcode='55000';end if;
end $$;

create or replace function public.berry_correction_author_status() returns jsonb language sql stable set search_path='' as $$
 select jsonb_build_object('version','202611230027','binds_to','authenticated_actor','automatic_state',true);
$$;
revoke all on function public.berry_correction_author_status() from public;
grant execute on function public.berry_correction_author_status() to anon,authenticated;
notify pgrst,'reload schema';
commit;
select '202611230027' as correction_author_version;
