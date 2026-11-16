-- Activación de los pasos 20–21 sobre el paso 19 o posterior.
-- Importa únicamente Fundo y conserva los informes y demás sedes. Ejecutar completo.
begin;

-- Berry Safety · Paso 20: orden manual de gerencias, áreas, puestos y lugares.
-- Requiere el paso 19. No modifica perfiles ni inspecciones existentes.
do $$ begin
 if public.berry_schema_status()->>'location_catalog_version' is distinct from '202611150019' then
  raise exception 'Primero instale el paso 19 del catálogo de instalaciones' using errcode='55000';
 end if;
end $$;

alter table public.berry_organization add column if not exists sort_order bigint check(sort_order>=0);
alter table public.berry_locations add column if not exists sort_order bigint check(sort_order>=0);
-- Only initialize missing positions. Reinstallation preserves the chosen order.
with ranks as(select id,row_number() over(partition by kind,parent_id order by name,id) as position from public.berry_organization)
 update public.berry_organization n set sort_order=r.position from ranks r where n.id=r.id and n.sort_order is null;
with ranks as(select id,row_number() over(partition by kind,parent_id order by name,id) as position from public.berry_locations)
 update public.berry_locations n set sort_order=r.position from ranks r where n.id=r.id and n.sort_order is null;
alter table public.berry_organization alter column sort_order set default 0,alter column sort_order set not null;
alter table public.berry_locations alter column sort_order set default 0,alter column sort_order set not null;

-- New elements and elements moved to another parent go to the end. Renaming,
-- retiring and restoring an element retain its position within the same list.
create or replace function berry_private.append_catalog_item()
returns trigger language plpgsql security definer set search_path='' as $$ begin
 if tg_op='INSERT' or new.parent_id is distinct from old.parent_id then
  perform 1 from berry_private.admin_serialization where singleton for update;
  execute format('select coalesce(max(sort_order),0)+1 from public.%I where kind=$1 and parent_id is not distinct from $2',tg_table_name)
   into new.sort_order using new.kind,new.parent_id;
 end if;
 return new;
end $$;
revoke all on function berry_private.append_catalog_item() from public,anon,authenticated;
drop trigger if exists berry_append_catalog_item on public.berry_organization;
create trigger berry_append_catalog_item before insert or update of parent_id on public.berry_organization for each row execute function berry_private.append_catalog_item();
drop trigger if exists berry_append_catalog_item on public.berry_locations;
create trigger berry_append_catalog_item before insert or update of parent_id on public.berry_locations for each row execute function berry_private.append_catalog_item();

create or replace function public.berry_reorder_catalog(p_catalog text,p_ids uuid[],p_revisions bigint[])
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_actor uuid:=berry_private.require_admin();v_table text;v_kind text;v_parent uuid;v_ids uuid[];v_revisions bigint[];v_result jsonb;
begin
 perform 1 from berry_private.admin_serialization where singleton for update;
 v_actor:=berry_private.require_admin();
 v_table:=case p_catalog when 'organization' then 'berry_organization' when 'locations' then 'berry_locations' end;
 if v_table is null or cardinality(p_ids) is null or cardinality(p_ids) not between 1 and 5000 or array_ndims(p_ids)<>1 or array_lower(p_ids,1)<>1
  or array_ndims(p_revisions) is distinct from 1 or array_lower(p_revisions,1) is distinct from 1 or cardinality(p_ids) is distinct from cardinality(p_revisions)
  or exists(select 1 from unnest(p_ids) id where id is null)
  or exists(select 1 from unnest(p_revisions) revision where revision is null or revision<1)
  or (select count(distinct id) from unnest(p_ids) id)<>cardinality(p_ids) then raise exception 'INVALID_CATALOG_ORDER' using errcode='22023';end if;
 execute format('select kind,parent_id from public.%I where id=$1',v_table) into v_kind,v_parent using p_ids[1];
 if v_kind is null then raise exception 'CATALOG_CHANGED' using errcode='40001';end if;
 if v_kind='installation' and not(select installations_ready from berry_private.location_settings where singleton) then raise exception 'INSTALLATIONS_NOT_READY' using errcode='22023';end if;
 execute format('select array_agg(id order by sort_order,name,id),array_agg(revision order by sort_order,name,id) from (select * from public.%I where kind=$1 and parent_id is not distinct from $2 for update) n',v_table)
  into v_ids,v_revisions using v_kind,v_parent;
 if cardinality(v_ids)<>cardinality(p_ids) or not(v_ids @> p_ids and p_ids @> v_ids) then raise exception 'CATALOG_CHANGED' using errcode='40001';end if;
 -- A retry after an unconfirmed response is safe if that exact order is saved.
 if v_ids is distinct from p_ids then
  if exists(select 1 from unnest(p_ids,p_revisions) requested(id,revision) join unnest(v_ids,v_revisions) actual(id,revision) using(id) where requested.revision<>actual.revision) then raise exception 'REVISION_CONFLICT' using errcode='40001';end if;
  execute format('update public.%I n set sort_order=r.position,revision=n.revision+1 from unnest($1::uuid[]) with ordinality r(id,position) where n.id=r.id and n.sort_order<>r.position',v_table) using p_ids;
 end if;
 execute format('select jsonb_agg(to_jsonb(n) order by n.sort_order,n.name,n.id) from public.%I n where kind=$1 and parent_id is not distinct from $2',v_table) into v_result using v_kind,v_parent;
 return v_result;
end $$;
revoke all on function public.berry_reorder_catalog(text,uuid[],bigint[]) from public,anon,authenticated;
grant execute on function public.berry_reorder_catalog(text,uuid[],bigint[]) to authenticated;

create or replace function public.berry_organization_catalog()
returns jsonb language plpgsql stable security definer set search_path='' as $$ begin
 perform berry_private.require_ready();
 return coalesce((select jsonb_agg(jsonb_build_object('management',m.name,'areas',a.names,'positions',a.positions,'areaNomenclatures',a.nomenclatures) order by m.sort_order,m.name,m.id)
  from public.berry_organization m
  cross join lateral(select jsonb_agg(x.name order by x.sort_order,x.name,x.id) as names,jsonb_object_agg(x.name,x.jobs) as positions,jsonb_object_agg(x.name,x.nomenclature) as nomenclatures
   from(select ar.id,ar.name,ar.sort_order,ar.nomenclature,(select jsonb_agg(p.name order by p.sort_order,p.name,p.id) from public.berry_organization p where p.parent_id=ar.id and p.kind='position' and p.enabled) as jobs
    from public.berry_organization ar where ar.parent_id=m.id and ar.kind='area' and ar.enabled
     and exists(select 1 from public.berry_organization p where p.parent_id=ar.id and p.kind='position' and p.enabled)) x) a
  where m.kind='management' and m.enabled and a.names is not null),'[]'::jsonb);
end $$;
create or replace function public.berry_admin_organization()
returns jsonb language plpgsql stable security definer set search_path='' as $$ begin
 perform berry_private.require_admin();
 return(select coalesce(jsonb_agg(to_jsonb(n) order by n.kind,n.parent_id,n.sort_order,n.name,n.id),'[]') from public.berry_organization n);
end $$;
create or replace function public.berry_location_catalog()
returns jsonb language plpgsql stable security definer set search_path='' as $$ begin
 perform berry_private.require_ready();
 return jsonb_build_object('installationsReady',(select installations_ready from berry_private.location_settings where singleton),'nodes',
  (select coalesce(jsonb_agg(to_jsonb(n) order by n.kind,n.parent_id,n.sort_order,n.name,n.id),'[]') from public.berry_locations n
   left join public.berry_locations p on p.id=n.parent_id left join public.berry_locations g on g.id=p.parent_id
   where n.enabled and (n.kind='site' or p.enabled and (n.kind='zone' or g.enabled))));
end $$;
create or replace function public.berry_admin_locations()
returns jsonb language plpgsql stable security definer set search_path='' as $$ begin
 perform berry_private.require_admin();
 return(select coalesce(jsonb_agg(to_jsonb(n) order by n.kind,n.parent_id,n.sort_order,n.name,n.id),'[]') from public.berry_locations n);
end $$;
create or replace function public.berry_schema_status() returns jsonb language sql stable set search_path='' as $$
 select jsonb_build_object('schema_version','202611070001','accounts_version','202611070002','reports_version','202611080003','final_archive_version','202611080004','permissions_version','202611080005','storage_version','202611080006','dashboard_version','202611080007','registration_version','202611090008','correction_identity_version','202611090009','admin_edit_version','202611090010','account_copies_version','202611090011','next_registration_version','202611090012','organization_catalog_version','202611150014','account_identity_version','202611150015','area_nomenclature_version','202611150016','account_email_version','202611150017','location_order_version','202611150018','location_catalog_version','202611150019','catalog_order_version','202611150020','stage','reports','sync_ready',true);
$$;
notify pgrst,'reload schema';

-- Berry Safety · Paso 21: instalaciones de Fundo del Programa Anual 2026.
-- Fuente: tres hojas, Puntos a inspeccionar → Ubicación. Excluye Actividades Fundo.
-- 178 puntos únicos / 15 ubicaciones. No reescribe perfiles ni informes históricos.
-- Requiere el paso 20. La activación se limita a la sede Fundo y sus zonas documentadas.
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
 select regexp_replace(regexp_replace(translate(lower(rtrim(regexp_replace(btrim(p_name),'\s+',' ','g'),' .')),'áéíóúü³','aeiouu3'),'\s*,\s*',',','g'),'\s*/\s*','/','g');
$$;
revoke all on function berry_private.installations_ready_for_site(uuid),berry_private.installations_ready_for_zone(uuid),berry_private.location_import_key(text) from public,anon,authenticated;



-- BEGIN REVIEWED FUNDO IMPORT
-- Run once: subsequent replays retain edits, retirements, ordering and readiness.
do $$
declare v_source jsonb:='{"version":"fundo-programa-2026-v1","siteId":"838233d5-5f8f-540a-8e02-62127ed65b93","siteName":"Fundo","zones":[{"id":"49b49753-a8d6-571e-a064-c9f0c961d1d9","name":"Armonía I","installations":[{"id":"b7c6ba49-984b-564e-9bd8-a3886794a904","name":"Oficina y Sala de Inducciones SIGMA"},{"id":"26fef0d4-03fe-59dd-a2e5-cbdd990c00be","name":"Tópico"},{"id":"bfe15d8f-2081-5ab3-9145-8a193b5f283d","name":"Oficina de Balanza"},{"id":"6da6f56f-837f-5907-8755-43ac5147988e","name":"Agrytracer y Almacén"},{"id":"c39cb5e9-5b44-50c0-9994-5131dc40f45e","name":"Oficina de Atención al Trabajador Fundo y Almacén de Indumentaria"},{"id":"fc6d4196-7e47-5ed1-a8b5-c6d63299ef5a","name":"Oficina de Archivo"},{"id":"2a9fbeb3-17c3-5ad4-9469-00258526f564","name":"Oficina de Seguridad Patrimonial"},{"id":"4e86f16c-9943-5559-b16c-aac3bb22c766","name":"Sala de Capacitaciones"},{"id":"c90b33e0-5dea-5525-bfe2-de578d2fda11","name":"Comedor de Empleados"},{"id":"fab8d6c4-a912-5ab8-9dcc-46379a024faa","name":"Oficina y Club de Campeones"},{"id":"76679ce9-2f6c-538f-a697-af9e057f1c7c","name":"Filtrado Módulo HIJK"},{"id":"b403a0f9-5c84-5630-a8fa-197267f96894","name":"Almacén de Producción Costado HIJK"},{"id":"692dc1c8-5940-52bd-9554-8b5e7c9e0e80","name":"Garita Principal de Seguridad Patrimonial"},{"id":"6a979e06-d1bd-54a0-8e7e-5f3c7c48b459","name":"Almacén Central de Residuos Sólidos"}]},{"id":"80885ecf-79d9-545d-861d-0b0dc2e9d88b","name":"Armonía II","installations":[{"id":"8982584a-accf-5f86-9e83-a78cdd1e8836","name":"Lavadero de Camiones"},{"id":"1858c946-1f0c-5081-8a47-dec2d3aaa07d","name":"Lavadero y Almacén de Jabas"},{"id":"586d33f9-36f0-523f-9056-dcc84dbad2c0","name":"Filtrado Módulo G y Oficina de Producción"},{"id":"90a3c49e-62a9-5a3e-a219-6dc0849bd86b","name":"Almacén de Producción (Módulo G)"},{"id":"bde77c32-3553-5d02-99ca-1e22e3029a52","name":"Centro de Acopio y Enfriamiento"},{"id":"2703cab2-de58-54f8-b15b-56331c41029c","name":"Laboratorio de Sanidad"},{"id":"0d7149ee-cab8-598a-93fe-612d7a783efe","name":"Lavadero de Jabas de Reparto de Almuerzos"},{"id":"4d32c6ff-4af7-5710-b638-00fba91d3507","name":"Oficina de Relaciones Laborales"},{"id":"d50c732f-f522-5e9f-8b4d-5849ae4efefd","name":"Almacén Equipos de Riego"},{"id":"fceb2216-0784-5ead-b3b8-691de01c660d","name":"Reservorio 8 K"},{"id":"81c4995b-9d0b-5fa7-ae12-348aa9ad2c84","name":"Taller de Automatización y Riego"},{"id":"eb762f3d-7bca-5ccd-ac37-623f47174559","name":"Almacén Productivo Armonía II"},{"id":"5283d768-9eec-58ba-af0c-8fe752f51698","name":"Oficina de Servicios Generales"},{"id":"2b098e6e-67c1-505b-9a09-a2b522e72306","name":"Taller de Carpintería"},{"id":"c27d5f69-5d16-5ffd-bf8a-51ca1693e343","name":"Oficina de Reparto de Almuerzos"},{"id":"1ff9baf6-35c3-5658-a2fc-be5edf85a4c1","name":"Oficina de Sanidad"},{"id":"4ee7bbf2-2661-5bca-87d5-b523f2116ab1","name":"Laboratorio de Fertirriego"},{"id":"63f8da06-7d7c-56ea-ba43-232e53866eac","name":"Oficina de Cosecha"},{"id":"4d28cc41-3dde-5f29-a187-94796b833e9d","name":"Oficina de Riego"},{"id":"594e0e96-65c7-5c0a-9e69-1dad29c37fe2","name":"Tópico y Lactario"},{"id":"3e6bfe64-67d4-5fbf-bddd-2ce80caa0b90","name":"Oficina de Atención al Trabajador Fundo, Planillas y Compensaciones, Cultura Organizacional y Capacitaciones"},{"id":"4806ddfc-fee3-5c45-b96f-efddfb6ae404","name":"Almacén Productivo, Central y Mantenimiento"},{"id":"5c48900f-a8fb-5a78-87b0-663a97bf2260","name":"Filtrado Módulo EF"},{"id":"1f7fcdf5-f239-5f49-a3f1-7305535acc91","name":"Planta de Tratamiento de Agua Potable"},{"id":"8212579b-e592-566c-81a0-a32aa5dee965","name":"Vestuarios, Duchas, Lavandería, Premezcla y Phytobac"},{"id":"aaf66914-6388-5213-a807-8f0ca2a8024d","name":"Almacén Agrícola, Grifo y Químicos"},{"id":"f198b785-dd40-5636-b8de-c8122cbda9b7","name":"Almacén Productivo Construcción"},{"id":"235505f2-b567-5847-ab0c-3030e8553cae","name":"Oficina de Construcción y Almacén de 2.º Uso"},{"id":"0c4fa076-bc0d-5e06-a0a8-83fd837028e0","name":"Oficina de Inocuidad Alimentaria"},{"id":"7d6d75ad-9165-56e1-94c5-9ee31c0df427","name":"Oficina de TI"},{"id":"751e0727-d7f5-5d93-9478-22bdac0a95fe","name":"Oficina de Operaciones (Transportes-Mtto, Maquinaria y SS.GG)"},{"id":"4b4f4772-912a-537c-8c89-ae0f6760d8d2","name":"Taller de Mantenimiento Eléctrico"},{"id":"85422c7b-93cb-5f3a-9653-42fa2b1276e6","name":"Taller de Mantenimiento Mecánico"},{"id":"5fdbb1ee-eabd-5d22-83b0-abcf04a47fc8","name":"Oficinas de Operaciones Agrícolas y Sala de Reunión (2.º Piso)"},{"id":"8638292d-fe48-5fc9-9df5-6e45d64c21c6","name":"Comedor de Empleados"},{"id":"659d3bfe-9921-5fbb-b523-c223fc03706a","name":"Almacén de Atriles"},{"id":"db85b0ab-c95b-5b3f-ba43-651777591bb0","name":"Almacén de Bioseguridad"},{"id":"999c0f22-8d5a-542f-8245-a0284dbf698f","name":"Garita de Seguridad Patrimonial CAE Armonía II"},{"id":"6df9246a-078b-53d9-b2d1-70e5ec47cfa0","name":"Garita de Seguridad Taller Mantenimiento"},{"id":"cbb286ae-8910-58ff-a271-29909010ae54","name":"Compostera"},{"id":"f9334900-9c7a-5de7-9932-27c997ac3a58","name":"Proyecciones Agrícolas"},{"id":"9c7c2ff1-7b44-5375-9ecc-6f13288c8d6d","name":"Almacén de Equipos de Riego Costado CAE"}]},{"id":"3ed904eb-6fcc-533e-8b50-3170aca109ff","name":"Armonía III","installations":[{"id":"115d2523-8810-5b5d-8cd2-6c0ba661f38f","name":"Filtrado Módulo A y B"},{"id":"cf0cd705-391f-5b9f-9295-90d9cdc9d271","name":"Almacén de Producción Filtrado A y B"},{"id":"536982de-b8d2-5af1-a22f-9d912dc7f203","name":"Filtrado Módulo C"},{"id":"e30cc607-8f39-59c4-b6c6-1c8eb60509da","name":"Filtrado Módulo D"},{"id":"8a42683c-3bb6-55fb-942c-421c3eb8ba6a","name":"Reservorio 40 K"},{"id":"c41c00a5-dee4-5aec-ad23-4e5b1a11cb59","name":"Reservorio 50 K"},{"id":"dce519a1-14b4-52ff-ab0b-fd170fcb8161","name":"Tratamiento de Agua"},{"id":"a3f11dd9-ddb4-5ca3-9303-344c1c684035","name":"Garita de Seguridad Chavimochic I"},{"id":"731cb58c-c918-57c9-8490-e2e336cddc42","name":"Almacén de Jabas"},{"id":"44e9f22b-5fb2-5e32-8b86-2f9702f48f21","name":"Filtrado Vivero Armonía 3"},{"id":"9e782376-7aa1-5fec-ad39-fd47a9967eaf","name":"Almacén Vivero Armonía"}]},{"id":"050155bd-bee5-55da-9a79-ef3779df1c03","name":"Armonía IV","installations":[{"id":"dc3db6d6-8470-5ae0-853a-cfe9357868f8","name":"Filtrado Módulo LM"},{"id":"f441c8b0-1846-5384-9d53-fa007359dde0","name":"Almacén Producción"},{"id":"51d7bc32-d042-5ee4-94fa-9ad26154ee95","name":"Tratamiento de Agua"},{"id":"1c5a9b77-8270-5c61-96f0-86941e4ea9ab","name":"Reservorio 95 K"},{"id":"6c70b629-5d35-53ca-a703-dfd5709c2809","name":"Almacén de Jabas"}]},{"id":"628cc172-82b1-578b-8ae0-0d0b1b9d2319","name":"Fundo","installations":[{"id":"f830ab92-aeb0-54c2-89e6-16e72685abb9","name":"Extintores Fundo"},{"id":"8b994882-3ca4-576e-a6d0-e58404430b9a","name":"Luces de Emergencia"},{"id":"a0c02aeb-fb7a-5d0d-a22d-f4ccca23e14e","name":"Lavaojos y Ducha de Emergencia"}]},{"id":"103c8975-c9c5-5beb-88bc-ee485589b116","name":"Exterior e Interior Fundo","installations":[{"id":"227c3b65-b759-5fef-8405-c963a5d97a85","name":"Extintor (Maquinaria, Camiones, Camionetas, Exteriores y Semillero)"}]},{"id":"2c22177d-5f73-5249-92a6-906020f194c1","name":"Chao","installations":[{"id":"a6e6d563-7648-5572-85ef-bcc72722fed2","name":"Centro de Acopio de Almuerzo (Chao, Nuevo Chao y Valle de Dios)"},{"id":"1ce89969-86e9-555c-8fee-ac26e1d30c99","name":"Campamento Laredo 1"},{"id":"7f14a224-4c1f-5be5-9c20-73f29b0a0438","name":"Semillero"}]},{"id":"257fb8ad-5b90-59d1-b5e9-c156f133ec97","name":"Ilusión I","installations":[{"id":"7aee733c-cc2a-5c36-a18a-407934143093","name":"Almacén de Producción (Costado de Cerrito)"},{"id":"d8eac9fa-2b9c-563b-8f37-13338d199f2c","name":"Almacén de Jabas"},{"id":"9f02cda1-2715-5622-8d62-b8eb14aa43e6","name":"Garita de Seguridad Patrimonial (Vivero)"},{"id":"18b84e8b-4aaf-5ff4-bad7-aae6383960c2","name":"Vestuario y Oficina de Vivero"},{"id":"b92fda46-2257-5aee-8350-eacda3035098","name":"Almacén de Vivero"},{"id":"baf9b06a-65ef-5c66-9552-9e1fade983e5","name":"Filtrado Vivero"},{"id":"97cf7a51-e9ac-51ff-ad4c-a7117bd3e387","name":"Reservorio 100 000 m³"},{"id":"aec31560-4513-58f2-b3b3-78f28e9920bd","name":"Caseta de Impulsión de Bombeo (Esperanza III)"},{"id":"781233aa-8fac-5674-bcb8-4500a3edc0b3","name":"Tratamiento de Agua (Esperanza III)"},{"id":"dca06be4-40c2-524f-a867-adf2e4f2ea35","name":"Tratamiento de Agua (Ilusión II)"},{"id":"dab739b5-7246-56a1-8845-184b7934dbf3","name":"Reservorio 80 000 m³ (Ilusión II)"},{"id":"bb71ca2e-7486-57b6-a096-c287cff8c20b","name":"Caseta de Impulsión Bombeo (Parte Baja) / Esperanza II"},{"id":"a6bda2a2-457d-5875-a692-81c35bd000f3","name":"Reservorio 111 000 m³"},{"id":"f710a81d-8b10-5e0f-b7d4-94c6365a9aed","name":"Reservorio 193 000 m³"},{"id":"5a6ebf1e-eb4d-5c7f-aab8-d2a525b21ea9","name":"Sedimentador de 20 000 m³"},{"id":"c2557027-e9ee-5887-be3d-e62672db21f9","name":"Presedimentador de 10 000 m³"},{"id":"26bafea6-ffd8-5b10-a197-b460d6a8842a","name":"Reservorio 240 000 m³"},{"id":"05e156a9-99fc-58aa-9979-884973c39d16","name":"Tratamiento de Agua (Esperanza I)"},{"id":"da291fdc-976b-557a-bf1d-1ef2b8fd6e2f","name":"Caseta de Impulsión de Bombeo (Esperanza I)"},{"id":"27a89e46-f871-56b8-b52e-92d7d188135b","name":"Filtrado de Ilusión I y II"}]},{"id":"f556fba6-7226-550e-9408-f56f78031bdb","name":"Remanso I","installations":[{"id":"54b5333f-2691-5b61-a79f-71c813160f76","name":"Filtrado Módulo PQ"},{"id":"1299db27-b72a-50a2-9ea1-da3d12fbf3a3","name":"Planta de Tratamiento de Agua Potable"},{"id":"fc53de8f-af43-5c4b-8d95-ea6d263c25cb","name":"Lavadero de Camiones"},{"id":"5f2f8edd-dbcc-5d24-b836-952f83f66ec3","name":"Centro de Acopio y Enfriamiento"},{"id":"cd4977e7-096e-5f01-bb07-b7c29a29b805","name":"Lavadero y Almacén de Jabas"},{"id":"e2aef629-dc56-5f86-b954-3c62954fcfff","name":"Garita de Seguridad CAE Remanso"},{"id":"e77325f1-edf2-50e6-80de-46d9c00d65ee","name":"Filtrado Módulo R S"},{"id":"e2a28dd0-ab99-51ef-af6b-6ea8045a9c68","name":"Filtrado Módulo R1 R2"},{"id":"adc7a5f6-5274-50a0-8e22-11b1dad92c31","name":"Filtrado Módulo S2 S3"},{"id":"ecedb6fe-5527-59ac-ae98-0f9f7d3c776a","name":"Oficina de Producción Remanso"},{"id":"b1bf1cef-724b-5c86-a3d9-e604aee5ff68","name":"Almacén Productivo Remanso I"},{"id":"9e69aee7-bcc6-52ad-9407-fcb4e5e9c0d3","name":"Oficina de Servicios Generales"},{"id":"325cc09a-7baf-57b3-b2bc-18fd4400f770","name":"Almacén Remanso"},{"id":"32dddbe3-d107-5674-b2f7-f62c421e5e97","name":"Almacén Producción (Filtrado RS)"},{"id":"a1938d85-dd9f-5969-97d1-0b3e5a8a3d29","name":"Vestuarios, Duchas, Lavandería, Premezcla y Phytobac, Oficina"},{"id":"f46a73a9-8f9d-544d-abcc-9d552634c86c","name":"Almacén de Bioseguridad"},{"id":"52b61455-f964-5e8a-8a37-f6e17afbf4e0","name":"Almacén de Producción Módulo P - Comedor 28"}]},{"id":"91e0ad54-37b1-5283-955c-43f862defbcc","name":"Remanso II","installations":[{"id":"f5ad3dbc-7dcb-5cf4-afed-766acd7d3d81","name":"Filtrado Módulo TUVW"},{"id":"a7eeb488-483f-5b6f-9164-db1edc8251ea","name":"Filtrado Módulo X"},{"id":"27a46219-1138-5e68-a9b6-ae98a0566a87","name":"Almacén de Atriles"},{"id":"35e9decb-5eeb-5e4f-9191-588a4d64cd60","name":"Reservorio 180 K"},{"id":"c34640cc-e7a8-537e-be2c-bb09010886af","name":"Reservorio 100 K"},{"id":"651774aa-97e7-5e02-aa42-d70681fd1cac","name":"Garita de Seguridad Chavimochic II"},{"id":"cdab74b5-8c2c-54ca-9737-8f70b95a7ce4","name":"Garita de Seguridad Canal Santa Isabel"},{"id":"78eb514a-dd99-57a1-a9cb-625a985afbfd","name":"Compostera"},{"id":"87c53565-3827-5ed6-854d-e7f3c4d350b5","name":"Oficina de CAT Container"}]},{"id":"76f40822-a453-5a23-a74a-3e4912e7a807","name":"Esperanza I","installations":[{"id":"b9b77964-e3a2-5f69-9b14-f79d682fb43a","name":"Filtrado Módulo A-1"},{"id":"1406fb7e-5cdc-51b6-9a57-6f51b7f5f77e","name":"Reservorio 900 m³"},{"id":"9bde7ced-a67d-513f-8f96-5e4374b2d98e","name":"Oficina de Calidad y SIGMA"},{"id":"2a1afb57-9e19-5d04-a6a9-98554d911696","name":"Tópico y Lactario"},{"id":"bebd6d77-d0bc-5314-a5b8-5b71605fbde0","name":"Oficina de Atención al Trabajador Fundo, Relaciones Laborales, Planillas y Compensaciones"},{"id":"093be3e4-03de-5330-891a-ee405cb81fe4","name":"Vestuarios, Duchas, Lavandería, Premezcla y Phytobac"},{"id":"681e6706-b45d-5597-9ac4-0309048da20f","name":"Oficina de Producción"},{"id":"bddcb525-11ea-5102-9db6-6ac304863754","name":"Oficina y Almacén Temporal de Taller y Maquinaria"},{"id":"b6c97ed8-ad5b-5ad6-b2de-80bbcdb211a1","name":"Garita de Seguridad Patrimonial"},{"id":"da9f169d-aa7f-50c6-816b-900311415662","name":"Almacén de Bioseguridad (Cerrito)"},{"id":"1afe5c03-1fe4-5a86-8a82-6a1cce0d5ac0","name":"Almacén de Producción (Cerrito)"},{"id":"574d60bc-8840-546f-8cfa-c32a63ed24d5","name":"Almacén de Riego (Cerrito)"},{"id":"70df6d11-59b5-5e00-96ef-ce769bcfcacf","name":"Almacén Agrícola y Grifo"},{"id":"ad65b5f2-f745-58b0-90c1-cd9d96f0e15e","name":"Planta de Tratamiento de Agua Potable"},{"id":"b482df7f-56d2-5fdf-ab5d-03a125f9279c","name":"Almacén de Jabas"},{"id":"b0f6f208-752f-53b1-b9da-4cc6809a0ce3","name":"Centro de Acopio y Enfriamiento"}]},{"id":"c0994cc7-ce8c-5096-868d-15b6566a8b52","name":"Esperanza II","installations":[{"id":"bfb208a4-2738-5119-9a6a-345e9efe007f","name":"Filtrado Módulo B"},{"id":"1377954e-2f9c-564a-b0f5-aa62f88a6b8a","name":"Caseta de Impulsión de Rebombeo (Parte Alta)"},{"id":"53d22f0c-b6fc-54aa-b32f-4cf72be40cc4","name":"Reservorio 40 000 m³"},{"id":"5701ee42-9c59-50e7-ac4b-299ebc63c657","name":"Reservorio 80 000 m³"},{"id":"8164e9ff-c0f0-540e-9f3b-8d74900c38f5","name":"Almacén de Genética"},{"id":"33b80213-6cf1-542c-96d4-a9e06b481974","name":"Filtrado de Genética"},{"id":"adc30624-a59d-5544-8ff7-afea312d65cc","name":"Oficina de Genética (Container)"},{"id":"e68df2f9-f677-57c9-a47e-db4f97a12090","name":"Almacén Productivo Esperanza II (Módulo C)"},{"id":"5db1a971-7c79-5167-a2f6-78edc4ea4a98","name":"Oficina de Servicios Generales (Módulo C)"},{"id":"7a332741-29a4-544c-ab29-e9a49b1f948d","name":"Filtrado Módulo C, D, E, F, Q"},{"id":"0439c8e3-9562-57b4-99a9-5a758a779f84","name":"Oficina Central de Riego"},{"id":"b566da1d-dbdb-5125-8546-b5cbe6b67424","name":"Laboratorio HUB"},{"id":"72e9b98c-ce56-55d4-999d-8466a62afee0","name":"Almacén de Jabas"},{"id":"d8518a08-c426-5412-a686-07cbdf3a52d0","name":"Almacén de Producción (Comedor 10)"},{"id":"f74cefeb-2e03-532c-9f5f-fe8ec4807ac7","name":"Almacén de Producción (Comedor 14)"},{"id":"e5bde931-cc9b-5a87-b499-0627fd8db4d1","name":"Almacén de Producción (Módulo G-Esperanza 2)"},{"id":"220bb3a1-188c-58a6-87b0-9d317ee6603f","name":"Almacén Productivo Esperanza II (Módulo G)"},{"id":"b49a59fe-22e0-5642-a337-fd8a5ee1ea7b","name":"Oficina de Servicios Generales (Módulo G)"}]},{"id":"b2e644a6-e0b4-5490-b6ff-2e83a723670e","name":"Esperanza III","installations":[{"id":"02320f36-c653-5d8f-b9fa-af396ec5a57b","name":"Reservorio 15 000 m³"},{"id":"7b7d3bed-65fa-5d0e-9b7f-d787b22bcf8e","name":"Filtrado Módulo J, K, L, A-2"},{"id":"750e7a7a-8f64-5454-8324-c3937b607906","name":"Almacén de Producción"},{"id":"22822c44-98a0-54c0-9b0d-f26cb303491f","name":"Garita de Seguridad Patrimonial"},{"id":"597904e8-157b-55f0-91d3-d2085375c7bc","name":"Almacén de Atril"}]},{"id":"91fa1643-f270-5a82-be2d-0d19b111dd21","name":"San Luis","installations":[{"id":"44513a4e-bbac-5c0d-a9f2-47b77a8d8c97","name":"Almacén de Producción (Costado de Filtrado San Luis)"},{"id":"07faccc8-8cea-5208-a6f0-255eb2fe627e","name":"Filtrado Módulo H, I y M y Oficina Central de Riego"},{"id":"82db5f68-150d-5690-a733-35a2b2fde328","name":"Reservorio 28 000 m³"}]},{"id":"8941278e-4b3e-579a-bd99-d2b5043a2869","name":"Tumi","installations":[{"id":"86d57910-a70f-5ac5-89d2-9889672eafe3","name":"Almacén de Jabas"},{"id":"9f00add9-cc56-597e-8504-4a5b2d101cf4","name":"Vestuarios, Duchas, Lavandería, Premezcla y Phytobac"},{"id":"93edbc17-6f33-57f5-9447-d60ef619450a","name":"Compostera"},{"id":"ceac5b51-9b3b-5aeb-9419-18cd80b35bce","name":"Caseta de Impulsión"},{"id":"4aebe6f2-2a52-5f6d-af7c-179de3abe077","name":"Filtrado Módulo N, O, P, G"},{"id":"2011f33d-c798-5963-be0c-c2c357feede8","name":"Oficina de Atención al Trabajador Fundo"},{"id":"1e15507c-9b18-5d77-bfc0-6027547b961b","name":"Reservorio 90 000 m³"},{"id":"44e9c728-011b-5bfe-b03b-a74fbc2595a9","name":"Reservorio 770 000 m³"},{"id":"f4d50b84-be6b-5c5e-9667-b9d70ea640fc","name":"Almacén de Atril"},{"id":"b52745d1-d3b8-5753-b175-bb0e2565c98b","name":"Almacén de Producción (Interior de Almacén de Atril)"},{"id":"f8394845-9216-5b46-a496-0f19bf5d4b08","name":"Almacén de Producción (Comedor 20) y Almacén Temporal de Materiales"}]}]}'::jsonb;v_zone jsonb;v_item jsonb;v_site uuid;v_zone_id uuid;v_item_id uuid;v_matches uuid[];
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


create or replace function public.berry_manage_location(p_id uuid,p_kind text,p_parent_id uuid,p_name text,p_enabled boolean,p_expected bigint default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_actor uuid:=berry_private.require_admin();v_old public.berry_locations;v_parent public.berry_locations;v_name text:=regexp_replace(btrim(p_name),'\s+',' ','g');
begin
 perform 1 from berry_private.admin_serialization where singleton for update;
 v_actor:=berry_private.require_admin();
 if p_kind='installation' and not berry_private.installations_ready_for_site((select parent_id from public.berry_locations where id=p_parent_id and kind='zone')) then raise exception 'INSTALLATIONS_NOT_READY' using errcode='22023';end if;
 if p_id is null or p_kind not in('site','zone','installation') or p_kind is null or p_enabled is null or v_name is null or length(v_name) not between 1 and 250
  or (p_kind='site' and p_parent_id is not null) or (p_kind<>'site' and p_parent_id is null) then raise exception 'INVALID_ORGANIZATION' using errcode='22023';end if;
 if p_kind<>'site' then
  select * into v_parent from public.berry_locations where id=p_parent_id;
  if not found or v_parent.kind<>(case p_kind when 'zone' then 'site' else 'zone' end) then raise exception 'INVALID_ORGANIZATION_PARENT' using errcode='22023';end if;
  if p_enabled and (not v_parent.enabled or (p_kind='installation' and not exists(select 1 from public.berry_locations m where m.id=v_parent.parent_id and m.kind='site' and m.enabled))) then raise exception 'ORGANIZATION_PARENT_DISABLED' using errcode='22023';end if;
 end if;
 select * into v_old from public.berry_locations where id=p_id for update;
 if found then
  if v_old.kind<>p_kind then raise exception 'INVALID_ORGANIZATION' using errcode='22023';end if;
  if v_old.name=v_name and v_old.parent_id is not distinct from p_parent_id and v_old.enabled=p_enabled then return to_jsonb(v_old);end if;
  if p_expected is null or v_old.revision<>p_expected then raise exception 'REVISION_CONFLICT' using errcode='40001';end if;
  update public.berry_locations set name=v_name,parent_id=p_parent_id,enabled=p_enabled,revision=revision+1 where id=p_id returning * into v_old;
 else
  if p_expected is not null then raise exception 'ORGANIZATION_NOT_AVAILABLE' using errcode='40001';end if;
  insert into public.berry_locations(id,parent_id,kind,name,enabled) values(p_id,p_parent_id,p_kind,v_name,p_enabled) returning * into v_old;
 end if;
 if p_kind='installation' then insert into berry_private.location_installation_scopes(node_id,ready) values(p_parent_id,true) on conflict(node_id) do update set ready=true;end if;
 return to_jsonb(v_old);
end $$;

create or replace function berry_private.canonical_location(p_id uuid,p_location jsonb)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_old public.berry_inspections;v_site public.berry_locations;v_zone public.berry_locations;v_installation public.berry_locations;v_ready boolean;v_detail text:='';
begin
 select * into v_old from public.berry_inspections where id=p_id;
 if v_old.workflow in('sent','closed') and p_location is not distinct from v_old.data->'areaLocation' then return p_location;end if;
 if coalesce(p_location->>'siteId','')<>'' then
  select * into v_site from public.berry_locations where id=(p_location->>'siteId')::uuid and kind='site' and enabled;
  if not found then raise exception 'INVALID_SITE' using errcode='22023';end if;
 elsif coalesce(p_location->>'site','')<>'' then raise exception 'INVALID_SITE' using errcode='22023';end if;
 if coalesce(p_location->>'zoneId','')<>'' then
  select * into v_zone from public.berry_locations where id=(p_location->>'zoneId')::uuid and kind='zone' and enabled and parent_id=v_site.id;
  if not found then raise exception 'INVALID_ZONE' using errcode='22023';end if;
 elsif coalesce(p_location->>'zone','')<>'' then raise exception 'INVALID_ZONE' using errcode='22023';end if;
 v_ready:=berry_private.installations_ready_for_zone(v_zone.id);
 if coalesce(p_location->>'installationId','')<>'' then
  if not v_ready then raise exception 'INSTALLATIONS_NOT_READY' using errcode='22023';end if;
  select * into v_installation from public.berry_locations where id=(p_location->>'installationId')::uuid and kind='installation' and enabled and parent_id=v_zone.id;
  if not found then raise exception 'INVALID_INSTALLATION' using errcode='22023';end if;
  v_detail:=v_installation.name;
 elsif v_ready and coalesce(p_location->>'detail','')<>'' then raise exception 'INVALID_INSTALLATION' using errcode='22023';
 elsif not v_ready and (v_old.data->'areaLocation'->>'source') is distinct from 'catalog'
  and p_location->>'site'=v_old.data->'areaLocation'->>'site' and p_location->>'zone'=v_old.data->'areaLocation'->>'zone' and p_location->>'detail'=v_old.data->'areaLocation'->>'detail'
  then v_detail:=p_location->>'detail';
 end if;
 return (p_location-array['site','zone','detail','installationPending'])||jsonb_build_object('site',coalesce(v_site.name,''),'zone',coalesce(v_zone.name,''),'detail',v_detail,'installationPending',not v_ready,'textOrder','site-zone-area');
exception when invalid_text_representation then raise exception 'INVALID_LOCATION' using errcode='22023';
end $$;

create or replace function berry_private.require_location(p_data jsonb)
returns void language plpgsql stable security definer set search_path='' as $$
declare v_pending boolean:=false;
begin
 if p_data ? 'areaLocation' then
  perform berry_private.location_area(p_data->'areaLocation');
  if p_data#>>'{areaLocation,source}'='catalog' and p_data#>>'{areaLocation,installationPending}'='true' then
   v_pending:=not berry_private.installations_ready_for_zone(nullif(p_data#>>'{areaLocation,zoneId}','')::uuid)
    or exists(select 1 from public.berry_inspections i where i.id=(p_data->>'id')::uuid and i.workflow in('sent','closed') and i.data->'areaLocation'=p_data->'areaLocation');
  end if;
  if coalesce(p_data#>>'{areaLocation,site}','')='' or coalesce(p_data#>>'{areaLocation,zone}','')='' or not v_pending and btrim(coalesce(p_data#>>'{areaLocation,detail}',''))='' then raise exception 'INCOMPLETE_LOCATION' using errcode='22023';end if;
 end if;
end $$;

create or replace function public.berry_reorder_catalog(p_catalog text,p_ids uuid[],p_revisions bigint[])
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_actor uuid:=berry_private.require_admin();v_table text;v_kind text;v_parent uuid;v_ids uuid[];v_revisions bigint[];v_result jsonb;
begin
 perform 1 from berry_private.admin_serialization where singleton for update;
 v_actor:=berry_private.require_admin();
 v_table:=case p_catalog when 'organization' then 'berry_organization' when 'locations' then 'berry_locations' end;
 if v_table is null or cardinality(p_ids) is null or cardinality(p_ids) not between 1 and 5000 or array_ndims(p_ids)<>1 or array_lower(p_ids,1)<>1
  or array_ndims(p_revisions) is distinct from 1 or array_lower(p_revisions,1) is distinct from 1 or cardinality(p_ids) is distinct from cardinality(p_revisions)
  or exists(select 1 from unnest(p_ids) id where id is null)
  or exists(select 1 from unnest(p_revisions) revision where revision is null or revision<1)
  or (select count(distinct id) from unnest(p_ids) id)<>cardinality(p_ids) then raise exception 'INVALID_CATALOG_ORDER' using errcode='22023';end if;
 execute format('select kind,parent_id from public.%I where id=$1',v_table) into v_kind,v_parent using p_ids[1];
 if v_kind is null then raise exception 'CATALOG_CHANGED' using errcode='40001';end if;
 if v_kind='installation' and not berry_private.installations_ready_for_site((select parent_id from public.berry_locations where id=v_parent and kind='zone')) then raise exception 'INSTALLATIONS_NOT_READY' using errcode='22023';end if;
 execute format('select array_agg(id order by sort_order,name,id),array_agg(revision order by sort_order,name,id) from (select * from public.%I where kind=$1 and parent_id is not distinct from $2 for update) n',v_table)
  into v_ids,v_revisions using v_kind,v_parent;
 if cardinality(v_ids)<>cardinality(p_ids) or not(v_ids @> p_ids and p_ids @> v_ids) then raise exception 'CATALOG_CHANGED' using errcode='40001';end if;
 -- A retry after an unconfirmed response is safe if that exact order is saved.
 if v_ids is distinct from p_ids then
  if exists(select 1 from unnest(p_ids,p_revisions) requested(id,revision) join unnest(v_ids,v_revisions) actual(id,revision) using(id) where requested.revision<>actual.revision) then raise exception 'REVISION_CONFLICT' using errcode='40001';end if;
  execute format('update public.%I n set sort_order=r.position,revision=n.revision+1 from unnest($1::uuid[]) with ordinality r(id,position) where n.id=r.id and n.sort_order<>r.position',v_table) using p_ids;
 end if;
 execute format('select jsonb_agg(to_jsonb(n) order by n.sort_order,n.name,n.id) from public.%I n where kind=$1 and parent_id is not distinct from $2',v_table) into v_result using v_kind,v_parent;
 return v_result;
end $$;

create or replace function public.berry_location_catalog()
returns jsonb language plpgsql stable security definer set search_path='' as $$ begin
 perform berry_private.require_ready();
 return jsonb_build_object('installationsReady',(select installations_ready from berry_private.location_settings where singleton),
  'installationSiteIds',(select coalesce(jsonb_agg(n.id order by n.sort_order,n.name,n.id),'[]') from public.berry_locations n where n.kind='site' and n.enabled and berry_private.installations_ready_for_site(n.id)),
  'installationZoneIds',(select coalesce(jsonb_agg(n.id order by n.parent_id,n.sort_order,n.name,n.id),'[]') from public.berry_locations n join public.berry_locations p on p.id=n.parent_id where n.kind='zone' and n.enabled and p.enabled and berry_private.installations_ready_for_zone(n.id)),
  'nodes',(select coalesce(jsonb_agg(to_jsonb(n) order by n.kind,n.parent_id,n.sort_order,n.name,n.id),'[]') from public.berry_locations n
   left join public.berry_locations p on p.id=n.parent_id left join public.berry_locations g on g.id=p.parent_id
   where n.enabled and (n.kind='site' or p.enabled and (n.kind='zone' or g.enabled))));
end $$;
revoke all on function berry_private.canonical_location(uuid,jsonb),berry_private.require_location(jsonb) from public,anon,authenticated;
revoke all on function public.berry_location_catalog(),public.berry_manage_location(uuid,text,uuid,text,boolean,bigint),public.berry_reorder_catalog(text,uuid[],bigint[]) from public,anon,authenticated;
grant execute on function public.berry_location_catalog(),public.berry_manage_location(uuid,text,uuid,text,boolean,bigint),public.berry_reorder_catalog(text,uuid[],bigint[]) to authenticated;
create or replace function public.berry_schema_status() returns jsonb language sql stable set search_path='' as $$
 select jsonb_build_object('schema_version','202611070001','accounts_version','202611070002','reports_version','202611080003','final_archive_version','202611080004','permissions_version','202611080005','storage_version','202611080006','dashboard_version','202611080007','registration_version','202611090008','correction_identity_version','202611090009','admin_edit_version','202611090010','account_copies_version','202611090011','next_registration_version','202611090012','organization_catalog_version','202611150014','account_identity_version','202611150015','area_nomenclature_version','202611150016','account_email_version','202611150017','location_order_version','202611150018','location_catalog_version','202611150019','catalog_order_version','202611150020','fundo_installations_version','202611150021','stage','reports','sync_ready',true);
$$;
notify pgrst,'reload schema';
commit;
