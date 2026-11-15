-- Berry Safety · Paso 20: orden manual de gerencias, áreas, puestos y lugares.
-- Requiere el paso 19. No modifica perfiles ni inspecciones existentes.
begin;
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
commit;
