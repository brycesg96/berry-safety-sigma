-- Berry Safety · Paso 7: panel administrativo y consolidado sin imágenes.
-- Requiere el paso 6. Conserva las cuentas, inspecciones, archivos y correlativos.
begin;
do $$ begin
 if to_regprocedure('berry_private.storage_filename(text)') is null then
  raise exception 'Primero instale el paso 6 de nombres de archivo' using errcode='55000';
 end if;
end $$;

-- Administrators may consult registered reports from every author. Other
-- authors' drafts remain private, and workflow writes keep their own guards.
create or replace function berry_private.can_read_inspection(p_id uuid)
returns boolean language sql stable security definer set search_path='' as $$
 select berry_private.is_enabled() and exists(select 1 from public.berry_inspections i where i.id=p_id and i.deleted_at is null and
  (i.author_id=(select auth.uid()) or (i.workflow<>'draft' and exists(select 1 from public.berry_recipients r join public.berry_profiles p on p.id=r.user_id where r.inspection_id=i.id and r.user_id=(select auth.uid()) and p.can_receive_inspections))
   or (i.workflow<>'draft' and i.code is not null and exists(select 1 from public.berry_profiles p where p.id=(select auth.uid()) and p.role='admin'))));
$$;
create or replace function berry_private.dashboard_text(p_data jsonb)
returns jsonb language sql immutable set search_path='' as $$
 select p_data || jsonb_build_object(
  'observations',coalesce((select jsonb_agg((o.value-'photos')||jsonb_build_object('photos','[]'::jsonb) order by o.ordinality)
   from jsonb_array_elements(case when jsonb_typeof(p_data->'observations')='array' then p_data->'observations' else '[]'::jsonb end) with ordinality o),'[]'::jsonb),
  'registrationDetails',coalesce((select jsonb_object_agg(r.key,r.value-'signature') from jsonb_each(case when jsonb_typeof(p_data->'registrationDetails')='object' then p_data->'registrationDetails' else '{}'::jsonb end) r),'{}'::jsonb)
 ) || case when jsonb_typeof(p_data->'delivery')='object' then jsonb_build_object('delivery',(p_data->'delivery')||jsonb_build_object('corrections',coalesce(
  (select jsonb_object_agg(c.key,(c.value-'photos')||jsonb_build_object('photos','[]'::jsonb)) from jsonb_each(case when jsonb_typeof(p_data#>'{delivery,corrections}')='object' then p_data#>'{delivery,corrections}' else '{}'::jsonb end) c),'{}'::jsonb))) else '{}'::jsonb end;
$$;
revoke all on function berry_private.dashboard_text(jsonb) from public,anon,authenticated;
create or replace function public.berry_admin_dashboard()
returns jsonb language plpgsql stable security definer set search_path='' as $$ begin
 perform berry_private.require_admin();
 return(select coalesce(jsonb_agg((to_jsonb(i)-'data')||jsonb_build_object('data',berry_private.dashboard_text(i.data)) order by i.data->>'date' desc,i.code desc),'[]'::jsonb)
  from public.berry_inspections i where i.deleted_at is null and i.code is not null and i.workflow in('sent','closed') and coalesce((i.data->>'partial')::boolean,false)=false);
end $$;
create or replace function public.berry_admin_inspection(p_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_report public.berry_inspections;begin
 perform berry_private.require_admin();
 select * into v_report from public.berry_inspections where id=p_id and deleted_at is null and code is not null and workflow in('sent','closed');
 if not found then raise exception 'REPORT_NOT_AVAILABLE' using errcode='42501';end if;
 return to_jsonb(v_report);
end $$;
revoke all on function public.berry_admin_dashboard(),public.berry_admin_inspection(uuid) from public,anon,authenticated;
grant execute on function public.berry_admin_dashboard(),public.berry_admin_inspection(uuid) to authenticated;
create or replace function public.berry_schema_status()returns jsonb language sql stable set search_path='' as $$
 select jsonb_build_object('schema_version','202611070001','accounts_version','202611070002','reports_version','202611080003','final_archive_version','202611080004','permissions_version','202611080005','storage_version','202611080006','dashboard_version','202611080007','stage','reports','sync_ready',true);
$$;
notify pgrst,'reload schema';
commit;
