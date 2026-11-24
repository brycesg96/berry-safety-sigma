-- Step 28: close each conversation at approval, retaining all recorded messages.
-- Run after step 27. This repeatable upgrade does not rewrite report or event data.
begin;

do $$ begin
  if to_regprocedure('public.berry_correction_author_status()') is null then
    raise exception 'RUN_CORRECTION_AUTHOR_UPGRADE_FIRST' using errcode='55000';
  end if;
end $$;

create or replace function public.berry_add_followup_comment(p_id uuid,p_observation uuid,p_operation uuid,p_body text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  v_actor uuid:=berry_private.require_ready();
  v_row public.berry_inspections%rowtype;
  v_event public.berry_followup_events%rowtype;
begin
  if not berry_private.can_read_inspection(p_id) then
    raise exception 'COMMENT_DENIED' using errcode='42501';
  end if;
  -- Approval locks this same report row. A comment is committed either before
  -- approval, or rejected after it; another observation remains independent.
  select * into v_row from public.berry_inspections i
    where i.id=p_id and i.deleted_at is null and i.workflow<>'draft'
      and (i.author_id=v_actor or exists(select 1 from public.berry_recipients r where r.inspection_id=i.id and r.user_id=v_actor))
    for update;
  if not found then raise exception 'COMMENT_DENIED' using errcode='42501'; end if;
  if not exists(select 1 from jsonb_array_elements(v_row.data->'observations') o where o->>'id'=p_observation::text) then
    raise exception 'OBSERVATION_NOT_FOUND' using errcode='22023';
  end if;
  if p_operation is null or btrim(coalesce(p_body,''))='' or length(p_body)>5000 then
    raise exception 'INVALID_COMMENT' using errcode='22023';
  end if;
  -- A retry may recover a message recorded before approval, but cannot add or
  -- change one. This also lets offline queues acknowledge successful deliveries.
  select * into v_event from public.berry_followup_events where id=p_operation;
  if found then
    if v_event.actor_id<>v_actor or v_event.inspection_id<>p_id or v_event.observation_id<>p_observation or v_event.action<>'comment' or v_event.body<>btrim(p_body) then
      raise exception 'OPERATION_CONFLICT' using errcode='40001';
    end if;
    return to_jsonb(v_event);
  end if;
  if coalesce(v_row.data#>>array['delivery','corrections',p_observation::text,'decision'],'')='approved' then
    raise exception 'OBSERVATION_CONVERSATION_CLOSED' using errcode='42501';
  end if;
  insert into public.berry_followup_events(id,inspection_id,observation_id,actor_id,actor_name,action,body)
    values(p_operation,p_id,p_observation,v_actor,(select full_name from public.berry_profiles where id=v_actor),'comment',btrim(p_body))
    returning * into v_event;
  return to_jsonb(v_event);
end $$;

create or replace function public.berry_followup_conversation_status()
returns jsonb language sql stable set search_path='' as $$
  select jsonb_build_object('version','202611240028','approved_read_only',true,'per_observation',true);
$$;
revoke all on function public.berry_add_followup_comment(uuid,uuid,uuid,text) from public,anon;
grant execute on function public.berry_add_followup_comment(uuid,uuid,uuid,text) to authenticated;
revoke all on function public.berry_followup_conversation_status() from public;
grant execute on function public.berry_followup_conversation_status() to anon,authenticated;
notify pgrst,'reload schema';
commit;
select '202611240028' as followup_conversation_version;
