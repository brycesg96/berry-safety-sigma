-- Berry Safety · Paso 18: Sede → Zona → Área → Instalación inspeccionada.
-- Las ubicaciones anteriores conservan su orden; no se reescriben informes ni archivos.
begin;
do $$ begin
 if public.berry_schema_status()->>'account_email_version' is distinct from '202611150017' then
  raise exception 'Primero instale el paso 17' using errcode='55000';
 end if;
end $$;
create or replace function berry_private.location_area(p_location jsonb)
returns text language plpgsql immutable set search_path='' as $$
declare v_zones jsonb; v_result text;
begin
 if jsonb_typeof(p_location) is distinct from 'object'
  or exists(select 1 from unnest(array['site','zone','detail']) k where jsonb_typeof(p_location->k) is distinct from 'string')
  or exists(select 1 from unnest(array['management','department']) k where p_location ? k and (jsonb_typeof(p_location->k) is distinct from 'string' or length(p_location->>k)>250))
  or (p_location ? 'departmentNomenclature' and (jsonb_typeof(p_location->'departmentNomenclature') is distinct from 'string' or length(p_location->>'departmentNomenclature')>50))
  or (p_location ? 'textOrder' and (jsonb_typeof(p_location->'textOrder') is distinct from 'string' or p_location->>'textOrder'<>'site-zone-area'))
  or length(p_location->>'detail')>250 then raise exception 'INVALID_LOCATION' using errcode='22023';end if;
 v_zones:=jsonb_build_object('Fundo',jsonb_build_array('Armonía I','Armonía II','Armonía III','Armonía IV','Esperanza I','Esperanza II','Esperanza III','Ilusión I','Ilusión II','Remanso I','Remanso II','San Luis','Tumi'),'Exteriores',jsonb_build_array('Chao','Otros','Semillero'),'Packing Chao',jsonb_build_array('Packing Chao'),'Packing Salaverry',jsonb_build_array('Packing Salaverry'),'Trujillo',jsonb_build_array('Quintanas'));
 if coalesce(p_location->>'site','')<>'' and not(v_zones ? (p_location->>'site')) then raise exception 'INVALID_LOCATION' using errcode='22023';end if;
 if coalesce(p_location->>'zone','')<>'' and not coalesce((v_zones->(p_location->>'site')) ? (p_location->>'zone'),false) then raise exception 'INVALID_LOCATION' using errcode='22023';end if;
 if p_location->>'textOrder'='site-zone-area' then
  v_result:=concat_ws(' – ',nullif(p_location->>'site',''),nullif(p_location->>'zone',''),coalesce(nullif(btrim(p_location->>'departmentNomenclature'),''),nullif(btrim(p_location->>'department'),'')),nullif(btrim(p_location->>'detail'),''));
 else
  v_result:=concat_ws(' – ',nullif(p_location->>'site',''),coalesce(nullif(btrim(p_location->>'departmentNomenclature'),''),nullif(btrim(p_location->>'department'),'')),nullif(p_location->>'zone',''),nullif(btrim(p_location->>'detail'),''));
 end if;
 if length(v_result)>500 then raise exception 'INVALID_LOCATION' using errcode='22023';end if;
 return v_result;
end $$;
revoke all on function berry_private.location_area(jsonb) from public,anon,authenticated;
create or replace function public.berry_schema_status() returns jsonb language sql stable set search_path='' as $$
 select jsonb_build_object('schema_version','202611070001','accounts_version','202611070002','reports_version','202611080003','final_archive_version','202611080004','permissions_version','202611080005','storage_version','202611080006','dashboard_version','202611080007','registration_version','202611090008','correction_identity_version','202611090009','admin_edit_version','202611090010','account_copies_version','202611090011','next_registration_version','202611090012','organization_catalog_version','202611150014','account_identity_version','202611150015','area_nomenclature_version','202611150016','account_email_version','202611150017','location_order_version','202611150018','stage','reports','sync_ready',true);
$$;
notify pgrst,'reload schema';
commit;
