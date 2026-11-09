-- Berry Safety · Paso 12: siguiente correlativo compartido, solo consulta.
-- Requiere el paso 11. No reserva números ni modifica usuarios o inspecciones.
begin;
do $$ begin
 if public.berry_schema_status()->>'account_copies_version' is distinct from '202611090011' then
  raise exception 'Primero instale el paso 11' using errcode='55000';end if;
end $$;
create or replace function public.berry_next_registration()
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare v_now timestamptz;v_year integer;v_sequence bigint;v_code text;begin
 perform berry_private.require_create();
 v_now:=berry_private.report_clock();v_year:=extract(year from v_now at time zone 'America/Lima');
 select coalesce((select last_sequence from berry_private.report_counters where year=v_year),0)+1 into v_sequence;
 v_code:='IH-'||v_year||'-'||case when v_sequence<1000 then lpad(v_sequence::text,3,'0') else v_sequence::text end;
 return jsonb_build_object('code',v_code,'year',v_year,'sequence',v_sequence,'checked_at',v_now);
end $$;
revoke all on function public.berry_next_registration() from public,anon,authenticated;
grant execute on function public.berry_next_registration() to authenticated;
create or replace function public.berry_schema_status()returns jsonb language sql stable set search_path='' as $$
 select jsonb_build_object('schema_version','202611070001','accounts_version','202611070002','reports_version','202611080003','final_archive_version','202611080004','permissions_version','202611080005','storage_version','202611080006','dashboard_version','202611080007','registration_version','202611090008','correction_identity_version','202611090009','admin_edit_version','202611090010','account_copies_version','202611090011','next_registration_version','202611090012','stage','reports','sync_ready',true);
$$;
notify pgrst,'reload schema';
commit;
SELECT public.berry_schema_status();
