-- Berry Safety · Paso 22: creación manual de instalaciones en cualquier sede.
-- Requiere el paso 21. No importa listas ni reescribe inspecciones o perfiles.
-- La primera instalación activa habilita únicamente su zona para nuevas inspecciones.
begin;
do $$ begin
 if public.berry_schema_status()->>'fundo_installations_version' is distinct from '202611150021' then
  raise exception 'Primero instale el paso 21 del catálogo de Fundo' using errcode='55000';
 end if;
end $$;
alter table berry_private.location_installation_scopes enable row level security;
revoke all on berry_private.location_installation_scopes from public,anon,authenticated;

create or replace function public.berry_manage_location(p_id uuid,p_kind text,p_parent_id uuid,p_name text,p_enabled boolean,p_expected bigint default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_actor uuid:=berry_private.require_admin();v_old public.berry_locations;v_parent public.berry_locations;v_name text:=regexp_replace(btrim(p_name),'\s+',' ','g');
begin
 perform 1 from berry_private.admin_serialization where singleton for update;
 v_actor:=berry_private.require_admin();
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
  if v_old.name=v_name and v_old.parent_id is not distinct from p_parent_id and v_old.enabled=p_enabled then if p_kind='installation' and p_enabled then
   insert into berry_private.location_installation_scopes(node_id,ready) values(v_parent.parent_id,true),(p_parent_id,true) on conflict(node_id) do update set ready=true;
  end if; return to_jsonb(v_old);end if;
  if p_expected is null or v_old.revision<>p_expected then raise exception 'REVISION_CONFLICT' using errcode='40001';end if;
  update public.berry_locations set name=v_name,parent_id=p_parent_id,enabled=p_enabled,revision=revision+1 where id=p_id returning * into v_old;
 else
  if p_expected is not null then raise exception 'ORGANIZATION_NOT_AVAILABLE' using errcode='40001';end if;
  insert into public.berry_locations(id,parent_id,kind,name,enabled) values(p_id,p_parent_id,p_kind,v_name,p_enabled) returning * into v_old;
 end if;
 if p_kind='installation' and p_enabled then
   insert into berry_private.location_installation_scopes(node_id,ready) values(v_parent.parent_id,true),(p_parent_id,true) on conflict(node_id) do update set ready=true;
  end if;
 return to_jsonb(v_old);
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

revoke all on function public.berry_manage_location(uuid,text,uuid,text,boolean,bigint),public.berry_reorder_catalog(text,uuid[],bigint[]) from public,anon,authenticated;
grant execute on function public.berry_manage_location(uuid,text,uuid,text,boolean,bigint),public.berry_reorder_catalog(text,uuid[],bigint[]) to authenticated;
create or replace function public.berry_schema_status() returns jsonb language sql stable set search_path='' as $$
 select jsonb_build_object('schema_version','202611070001','accounts_version','202611070002','reports_version','202611080003','final_archive_version','202611080004','permissions_version','202611080005','storage_version','202611080006','dashboard_version','202611080007','registration_version','202611090008','correction_identity_version','202611090009','admin_edit_version','202611090010','account_copies_version','202611090011','next_registration_version','202611090012','organization_catalog_version','202611150014','account_identity_version','202611150015','area_nomenclature_version','202611150016','account_email_version','202611150017','location_order_version','202611150018','location_catalog_version','202611150019','catalog_order_version','202611150020','fundo_installations_version','202611150021','manual_installations_version','202611160022','stage','reports','sync_ready',true);
$$;
notify pgrst,'reload schema';
commit;
