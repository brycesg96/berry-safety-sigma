-- Berry Safety · Paso 16: nomenclatura opcional de áreas y traslado de Viveros.
-- Requiere el paso 15. Conserva los nombres completos, puestos, perfiles e informes históricos.
begin;
do $$ begin
 if public.berry_schema_status()->>'account_identity_version' is distinct from '202611150015' then
  raise exception 'Primero instale el paso 15 de identidad de usuarios' using errcode='55000';
 end if;
end $$;
alter table public.berry_organization add column if not exists nomenclature text not null default ''
 check(length(nomenclature)<=50 and nomenclature=btrim(nomenclature) and (kind='area' or nomenclature=''));
-- These user-requested corrections run once. Replaying the migration cannot undo later admin edits.
do $$ begin
 if not exists(select 1 from berry_private.organization_seed_versions where version='area-adjustments-20261115') then
  update public.berry_organization set parent_id='45d5faeb-c5bf-561b-a6b4-7ddddee55c6b',revision=revision+1
   where id='84270532-994a-5747-8145-f78ae1516b72' and parent_id='e56d435e-9f9e-5c38-a121-48553390d0d2';
  update public.berry_organization set nomenclature='SIGMA',revision=revision+1
   where id='704e6e57-4856-5c77-8de9-63c7cbb15cae' and nomenclature='';
  insert into berry_private.organization_seed_versions(version) values('area-adjustments-20261115');
 end if;
end $$;
create or replace function public.berry_organization_catalog()
returns jsonb language plpgsql stable security definer set search_path='' as $$ begin
 perform berry_private.require_ready();
 return coalesce((select jsonb_agg(jsonb_build_object('management',m.name,'areas',a.names,'positions',a.positions,'areaNomenclatures',a.nomenclatures) order by m.name)
  from public.berry_organization m
  cross join lateral(select jsonb_agg(x.name order by x.name) as names,jsonb_object_agg(x.name,x.jobs) as positions,jsonb_object_agg(x.name,x.nomenclature) as nomenclatures
   from(select ar.name,ar.nomenclature,(select jsonb_agg(p.name order by p.name) from public.berry_organization p where p.parent_id=ar.id and p.kind='position' and p.enabled) as jobs
    from public.berry_organization ar where ar.parent_id=m.id and ar.kind='area' and ar.enabled
     and exists(select 1 from public.berry_organization p where p.parent_id=ar.id and p.kind='position' and p.enabled)) x) a
  where m.kind='management' and m.enabled and a.names is not null),'[]'::jsonb);
end $$;

create or replace function public.berry_manage_organization_v2(p_id uuid,p_kind text,p_parent_id uuid,p_name text,p_enabled boolean,p_expected bigint,p_nomenclature text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_actor uuid:=berry_private.require_admin();v_old public.berry_organization;v_parent public.berry_organization;v_name text:=regexp_replace(btrim(p_name),'\s+',' ','g');v_alias text:=regexp_replace(btrim(coalesce(p_nomenclature,'')),'\s+',' ','g');
begin
 perform 1 from berry_private.admin_serialization where singleton for update;
 v_actor:=berry_private.require_admin();
 if p_id is null or p_kind not in('management','area','position') or p_kind is null or p_enabled is null or v_name is null or length(v_name) not between 1 and 250
  or length(v_alias)>50 or (p_kind<>'area' and v_alias<>'')
  or (p_kind='management' and p_parent_id is not null) or (p_kind<>'management' and p_parent_id is null) then raise exception 'INVALID_ORGANIZATION' using errcode='22023';end if;
 if p_kind<>'management' then
  select * into v_parent from public.berry_organization where id=p_parent_id;
  if not found or v_parent.kind<>(case p_kind when 'area' then 'management' else 'area' end) then raise exception 'INVALID_ORGANIZATION_PARENT' using errcode='22023';end if;
  if p_enabled and (not v_parent.enabled or (p_kind='position' and not exists(select 1 from public.berry_organization m where m.id=v_parent.parent_id and m.kind='management' and m.enabled))) then raise exception 'ORGANIZATION_PARENT_DISABLED' using errcode='22023';end if;
 end if;
 select * into v_old from public.berry_organization where id=p_id for update;
 if found then
  if v_old.kind<>p_kind then raise exception 'INVALID_ORGANIZATION' using errcode='22023';end if;
  if v_old.name=v_name and v_old.parent_id is not distinct from p_parent_id and v_old.enabled=p_enabled and v_old.nomenclature=v_alias then return to_jsonb(v_old);end if;
  if p_expected is null or v_old.revision<>p_expected then raise exception 'REVISION_CONFLICT' using errcode='40001';end if;
  update public.berry_organization set name=v_name,nomenclature=v_alias,parent_id=p_parent_id,enabled=p_enabled,revision=revision+1 where id=p_id returning * into v_old;
 else
  if p_expected is not null then raise exception 'ORGANIZATION_NOT_AVAILABLE' using errcode='40001';end if;
  insert into public.berry_organization(id,parent_id,kind,name,enabled,nomenclature) values(p_id,p_parent_id,p_kind,v_name,p_enabled,v_alias) returning * into v_old;
 end if;
 return to_jsonb(v_old);
end $$;

revoke all on function public.berry_manage_organization_v2(uuid,text,uuid,text,boolean,bigint,text) from public,anon,authenticated;
grant execute on function public.berry_manage_organization_v2(uuid,text,uuid,text,boolean,bigint,text) to authenticated;
-- Location nomenclature is a bounded snapshot, just like the full department name:
-- later catalog edits must not change the text of an already recorded inspection.
create or replace function berry_private.report_person(p_value jsonb)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_person public.berry_profiles;
begin
 if jsonb_typeof(p_value) is distinct from 'object' or exists(select 1 from unnest(array['id','name','email','management']) k where p_value ? k and jsonb_typeof(p_value->k) is distinct from 'string') then raise exception 'INVALID_PERSON' using errcode='22023';end if;
 if coalesce(p_value->>'personId','')='' then return p_value-'email'||jsonb_build_object('email','');end if;
 select * into v_person from public.berry_profiles where id=(p_value->>'personId')::uuid and enabled;
 if not found then raise exception 'PERSON_DISABLED' using errcode='22023';end if;
 return jsonb_build_object('id',p_value->>'id','personId',v_person.id,'name',v_person.full_name,'email',v_person.email,'management',v_person.management,'area',v_person.area,'jobTitle',v_person.job_title,'areaNomenclature',coalesce((select a.nomenclature from public.berry_organization a join public.berry_organization m on m.id=a.parent_id where a.kind='area' and m.kind='management' and a.name=v_person.area and m.name=v_person.management),''));
end $$;
revoke all on function berry_private.report_person(jsonb) from public,anon,authenticated;

create or replace function berry_private.location_area(p_location jsonb)
returns text language plpgsql immutable set search_path='' as $$
declare v_zones jsonb; v_result text;
begin
 if jsonb_typeof(p_location) is distinct from 'object'
  or exists(select 1 from unnest(array['site','zone','detail']) k where jsonb_typeof(p_location->k) is distinct from 'string')
  or exists(select 1 from unnest(array['management','department']) k where p_location ? k and (jsonb_typeof(p_location->k) is distinct from 'string' or length(p_location->>k)>250))
  or (p_location ? 'departmentNomenclature' and (jsonb_typeof(p_location->'departmentNomenclature') is distinct from 'string' or length(p_location->>'departmentNomenclature')>50))
  or length(p_location->>'detail')>250 then raise exception 'INVALID_LOCATION' using errcode='22023';end if;
 v_zones:=jsonb_build_object('Fundo',jsonb_build_array('Armonía I','Armonía II','Armonía III','Armonía IV','Esperanza I','Esperanza II','Esperanza III','Ilusión I','Ilusión II','Remanso I','Remanso II','San Luis','Tumi'),'Exteriores',jsonb_build_array('Chao','Otros','Semillero'),'Packing Chao',jsonb_build_array('Packing Chao'),'Packing Salaverry',jsonb_build_array('Packing Salaverry'),'Trujillo',jsonb_build_array('Quintanas'));
 if coalesce(p_location->>'site','')<>'' and not(v_zones ? (p_location->>'site')) then raise exception 'INVALID_LOCATION' using errcode='22023';end if;
 if coalesce(p_location->>'zone','')<>'' and not coalesce((v_zones->(p_location->>'site')) ? (p_location->>'zone'),false) then raise exception 'INVALID_LOCATION' using errcode='22023';end if;
 v_result:=concat_ws(' – ',nullif(p_location->>'site',''),coalesce(nullif(btrim(p_location->>'departmentNomenclature'),''),nullif(btrim(p_location->>'department'),'')),nullif(p_location->>'zone',''),nullif(btrim(p_location->>'detail'),''));
 if length(v_result)>500 then raise exception 'INVALID_LOCATION' using errcode='22023';end if;
 return v_result;
end $$;
revoke all on function berry_private.location_area(jsonb) from public,anon,authenticated;
create or replace function public.berry_schema_status() returns jsonb language sql stable set search_path='' as $$
 select jsonb_build_object('schema_version','202611070001','accounts_version','202611070002','reports_version','202611080003','final_archive_version','202611080004','permissions_version','202611080005','storage_version','202611080006','dashboard_version','202611080007','registration_version','202611090008','correction_identity_version','202611090009','admin_edit_version','202611090010','account_copies_version','202611090011','next_registration_version','202611090012','organization_catalog_version','202611150014','account_identity_version','202611150015','area_nomenclature_version','202611150016','stage','reports','sync_ready',true);
$$;
notify pgrst,'reload schema';
commit;
