-- Berry Safety · Paso 13: gerencia del perfil y área organizativa de la inspección.
-- Requiere el paso 12. No reasigna usuarios ni modifica informes o archivos existentes.
begin;
do $$ begin
 if public.berry_schema_status()->>'next_registration_version' is distinct from '202611090012' then
  raise exception 'Primero instale el paso 12 de numeración' using errcode='55000';
 end if;
end $$;

alter table public.berry_profiles add column if not exists management text not null default '' check(length(management)<=250);
grant update(management) on public.berry_profiles to authenticated;
-- The existing own-profile RLS policy and audit trigger also apply to this column.

create or replace function berry_private.report_person(p_value jsonb)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_person public.berry_profiles;
begin
 if jsonb_typeof(p_value) is distinct from 'object' or exists(select 1 from unnest(array['id','name','email','management']) k where p_value ? k and jsonb_typeof(p_value->k) is distinct from 'string') then raise exception 'INVALID_PERSON' using errcode='22023';end if;
 if coalesce(p_value->>'personId','')='' then return p_value-'email'||jsonb_build_object('email','');end if;
 select * into v_person from public.berry_profiles where id=(p_value->>'personId')::uuid and enabled;
 if not found then raise exception 'PERSON_DISABLED' using errcode='22023';end if;
 return jsonb_build_object('id',p_value->>'id','personId',v_person.id,'name',v_person.full_name,'email',v_person.email,'management',v_person.management,'area',v_person.area,'jobTitle',v_person.job_title);
end $$;
revoke all on function berry_private.report_person(jsonb) from public,anon,authenticated;

create or replace function berry_private.location_area(p_location jsonb)
returns text language plpgsql immutable set search_path='' as $$
declare v_zones jsonb; v_result text;
begin
 if jsonb_typeof(p_location) is distinct from 'object'
  or exists(select 1 from unnest(array['site','zone','detail']) k where jsonb_typeof(p_location->k) is distinct from 'string')
  or exists(select 1 from unnest(array['management','department']) k where p_location ? k and (jsonb_typeof(p_location->k) is distinct from 'string' or length(p_location->>k)>250))
  or length(p_location->>'detail')>250 then raise exception 'INVALID_LOCATION' using errcode='22023';end if;
 v_zones:=jsonb_build_object('Fundo',jsonb_build_array('Armonía I','Armonía II','Armonía III','Armonía IV','Esperanza I','Esperanza II','Esperanza III','Ilusión I','Ilusión II','Remanso I','Remanso II','San Luis','Tumi'),'Exteriores',jsonb_build_array('Chao','Otros','Semillero'),'Packing Chao',jsonb_build_array('Packing Chao'),'Packing Salaverry',jsonb_build_array('Packing Salaverry'),'Trujillo',jsonb_build_array('Quintanas'));
 if coalesce(p_location->>'site','')<>'' and not(v_zones ? (p_location->>'site')) then raise exception 'INVALID_LOCATION' using errcode='22023';end if;
 if coalesce(p_location->>'zone','')<>'' and not coalesce((v_zones->(p_location->>'site')) ? (p_location->>'zone'),false) then raise exception 'INVALID_LOCATION' using errcode='22023';end if;
 v_result:=concat_ws(' – ',nullif(p_location->>'site',''),nullif(btrim(p_location->>'department'),''),nullif(p_location->>'zone',''),nullif(btrim(p_location->>'detail'),''));
 if length(v_result)>500 then raise exception 'INVALID_LOCATION' using errcode='22023';end if;
 return v_result;
end $$;
revoke all on function berry_private.location_area(jsonb) from public,anon,authenticated;
notify pgrst,'reload schema';
commit;
