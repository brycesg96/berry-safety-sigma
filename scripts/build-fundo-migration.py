from pathlib import Path
import json
root=Path(__file__).resolve().parents[1]
data=json.loads((root/'src/fundo-installations.json').read_text())
step19=(root/'supabase/migrations/202611150019_location_catalog.sql').read_text()
step20=(root/'supabase/migrations/202611150020_catalog_order.sql').read_text()

def function(source,name):
 start=source.index('create or replace function '+name+'(')
 end=source.index('end $$;',start)+len('end $$;')
 return source[start:end]

prefix='''-- Berry Safety · Paso 21: instalaciones de Fundo del Programa Anual 2026.
-- Fuente: tres hojas, Puntos a inspeccionar → Ubicación. Excluye Actividades Fundo.
-- 178 puntos únicos / 15 ubicaciones. No reescribe perfiles ni informes históricos.
-- Requiere el paso 20. La activación se limita a la sede Fundo y sus zonas documentadas.
begin;
do $$ begin
 if public.berry_schema_status()->>'catalog_order_version' is distinct from '202611150020' then
  raise exception 'Primero instale el paso 20 de orden del catálogo' using errcode='55000';
 end if;
end $$;
create table if not exists berry_private.location_installation_scopes(
 node_id uuid primary key references public.berry_locations(id) on delete cascade,
 ready boolean not null default true
);
revoke all on berry_private.location_installation_scopes from public,anon,authenticated;
create or replace function berry_private.installations_ready_for_site(p_site uuid)
returns boolean language sql stable security definer set search_path='' as $$
 select coalesce((select installations_ready from berry_private.location_settings where singleton),false)
  or exists(select 1 from berry_private.location_installation_scopes s join public.berry_locations n on n.id=s.node_id where n.id=p_site and n.kind='site' and s.ready);
$$;
create or replace function berry_private.installations_ready_for_zone(p_zone uuid)
returns boolean language sql stable security definer set search_path='' as $$
 select coalesce((select installations_ready from berry_private.location_settings where singleton),false)
  or exists(select 1 from berry_private.location_installation_scopes s join public.berry_locations n on n.id=s.node_id where n.id=p_zone and n.kind='zone' and s.ready and berry_private.installations_ready_for_site(n.parent_id));
$$;
create or replace function berry_private.location_import_key(p_name text)
returns text language sql immutable set search_path='' as $$
 select regexp_replace(regexp_replace(translate(lower(rtrim(regexp_replace(btrim(p_name),'\\s+',' ','g'),' .')),'áéíóúü³','aeiouu3'),'\\s*,\\s*',',','g'),'\\s*/\\s*','/','g');
$$;
revoke all on function berry_private.installations_ready_for_site(uuid),berry_private.installations_ready_for_zone(uuid),berry_private.location_import_key(text) from public,anon,authenticated;
'''
importer='''
-- BEGIN REVIEWED FUNDO IMPORT
-- Run once: subsequent replays retain edits, retirements, ordering and readiness.
do $$
declare v_source jsonb:=__DATA__;v_zone jsonb;v_item jsonb;v_site uuid;v_zone_id uuid;v_item_id uuid;v_matches uuid[];
begin
 perform 1 from berry_private.admin_serialization where singleton for update;
 if not exists(select 1 from berry_private.organization_seed_versions where version=v_source->>'version') then
  select id into v_site from public.berry_locations where id=(v_source->>'siteId')::uuid and kind='site';
  if v_site is null then raise exception 'FUNDO_SITE_NOT_AVAILABLE' using errcode='55000';end if;
  insert into berry_private.location_installation_scopes(node_id,ready) values(v_site,true) on conflict(node_id) do update set ready=true;
  for v_zone in select value from jsonb_array_elements(v_source->'zones') loop
   select array_agg(id) into v_matches from public.berry_locations where kind='zone' and parent_id=v_site and berry_private.location_import_key(name)=berry_private.location_import_key(v_zone->>'name');
   if cardinality(v_matches)>1 then raise exception 'AMBIGUOUS_FUNDO_ZONE: %',v_zone->>'name' using errcode='23505';end if;
   v_zone_id:=null;
   if exists(select 1 from public.berry_locations where id=(v_zone->>'id')::uuid) then
    select id into v_zone_id from public.berry_locations where id=(v_zone->>'id')::uuid and kind='zone' and parent_id=v_site;
    if v_zone_id is null then raise exception 'FUNDO_ZONE_PARENT_CHANGED: %',v_zone->>'name' using errcode='40001';end if;
   elsif cardinality(v_matches)=1 then v_zone_id:=v_matches[1];
   else
    insert into public.berry_locations(id,parent_id,kind,name,enabled) values((v_zone->>'id')::uuid,v_site,'zone',v_zone->>'name',true) returning id into v_zone_id;
   end if;
   -- Accents and capitalization are corrected only when the meaning is unchanged.
   update public.berry_locations set name=v_zone->>'name',revision=revision+1 where id=v_zone_id and name<>v_zone->>'name' and berry_private.location_import_key(name)=berry_private.location_import_key(v_zone->>'name');
   insert into berry_private.location_installation_scopes(node_id,ready) values(v_zone_id,true) on conflict(node_id) do update set ready=true;
   for v_item in select value from jsonb_array_elements(v_zone->'installations') loop
    select array_agg(id) into v_matches from public.berry_locations where kind='installation' and parent_id=v_zone_id and berry_private.location_import_key(name)=berry_private.location_import_key(v_item->>'name');
    if cardinality(v_matches)>1 then raise exception 'AMBIGUOUS_FUNDO_INSTALLATION: %',v_item->>'name' using errcode='23505';end if;
    if cardinality(v_matches)=1 then
     v_item_id:=v_matches[1];
     update public.berry_locations set name=v_item->>'name',revision=revision+1 where id=v_item_id and name<>v_item->>'name';
    elsif exists(select 1 from public.berry_locations where id=(v_item->>'id')::uuid) then raise exception 'FUNDO_INSTALLATION_PARENT_CHANGED: %',v_item->>'name' using errcode='40001';
    else
     insert into public.berry_locations(id,parent_id,kind,name,enabled) values((v_item->>'id')::uuid,v_zone_id,'installation',v_item->>'name',true);
    end if;
   end loop;
  end loop;
  insert into berry_private.organization_seed_versions(version) values(v_source->>'version');
 end if;
end $$;
-- END REVIEWED FUNDO IMPORT
'''.replace('__DATA__',"'"+json.dumps(data,ensure_ascii=False,separators=(',',':')).replace("'","''")+"'::jsonb")
manage=function(step19,'public.berry_manage_location')
old="if p_kind='installation' and not (select installations_ready from berry_private.location_settings where singleton) then"
new="if p_kind='installation' and not berry_private.installations_ready_for_site((select parent_id from public.berry_locations where id=p_parent_id and kind='zone')) then"
assert old in manage;manage=manage.replace(old,new)
manage=manage.replace(' return to_jsonb(v_old);\nend $$;', " if p_kind='installation' then insert into berry_private.location_installation_scopes(node_id,ready) values(p_parent_id,true) on conflict(node_id) do update set ready=true;end if;\n return to_jsonb(v_old);\nend $$;")
# No-op saves still must respect the gate, and creation activates its new zone.
canonical=function(step19,'berry_private.canonical_location')
canonical=canonical.replace(' select installations_ready into v_ready from berry_private.location_settings where singleton;\n','')
canonical=canonical.replace(" if coalesce(p_location->>'installationId','')<>'' then", " v_ready:=berry_private.installations_ready_for_zone(v_zone.id);\n if coalesce(p_location->>'installationId','')<>'' then")
require=function(step19,'berry_private.require_location')
require=require.replace('not(select installations_ready from berry_private.location_settings where singleton)',"not berry_private.installations_ready_for_zone(nullif(p_data#>>'{areaLocation,zoneId}','')::uuid)")
reorder=function(step20,'public.berry_reorder_catalog')
reorder=reorder.replace("not(select installations_ready from berry_private.location_settings where singleton)","not berry_private.installations_ready_for_site((select parent_id from public.berry_locations where id=v_parent and kind='zone'))")
catalog='''create or replace function public.berry_location_catalog()
returns jsonb language plpgsql stable security definer set search_path='' as $$ begin
 perform berry_private.require_ready();
 return jsonb_build_object('installationsReady',(select installations_ready from berry_private.location_settings where singleton),
  'installationSiteIds',(select coalesce(jsonb_agg(n.id order by n.sort_order,n.name,n.id),'[]') from public.berry_locations n where n.kind='site' and n.enabled and berry_private.installations_ready_for_site(n.id)),
  'installationZoneIds',(select coalesce(jsonb_agg(n.id order by n.parent_id,n.sort_order,n.name,n.id),'[]') from public.berry_locations n join public.berry_locations p on p.id=n.parent_id where n.kind='zone' and n.enabled and p.enabled and berry_private.installations_ready_for_zone(n.id)),
  'nodes',(select coalesce(jsonb_agg(to_jsonb(n) order by n.kind,n.parent_id,n.sort_order,n.name,n.id),'[]') from public.berry_locations n
   left join public.berry_locations p on p.id=n.parent_id left join public.berry_locations g on g.id=p.parent_id
   where n.enabled and (n.kind='site' or p.enabled and (n.kind='zone' or g.enabled))));
end $$;'''
status=step20[step20.index('create or replace function public.berry_schema_status()'):]
status=status.replace("'stage','reports'", "'fundo_installations_version','202611150021','stage','reports'")
content='\n\n'.join([prefix,importer,manage,canonical,require,reorder,catalog])+'''
revoke all on function berry_private.canonical_location(uuid,jsonb),berry_private.require_location(jsonb) from public,anon,authenticated;
revoke all on function public.berry_location_catalog(),public.berry_manage_location(uuid,text,uuid,text,boolean,bigint),public.berry_reorder_catalog(text,uuid[],bigint[]) from public,anon,authenticated;
grant execute on function public.berry_location_catalog(),public.berry_manage_location(uuid,text,uuid,text,boolean,bigint),public.berry_reorder_catalog(text,uuid[],bigint[]) to authenticated;
'''+status
(root/'supabase/migrations/202611150021_fundo_installations.sql').write_text(content)
parts=[]
for s in [step20,content]:parts.append('\n'.join(line for line in s.splitlines() if line.strip().lower() not in ['begin;','commit;']))
(root/'supabase/operations/activate-fundo-installations-20261115.sql').write_text('-- Activación de los pasos 20–21 sobre el paso 19 o posterior.\n-- Importa únicamente Fundo y conserva los informes y demás sedes. Ejecutar completo.\nbegin;\n\n'+'\n\n'.join(parts)+'\ncommit;\n')
