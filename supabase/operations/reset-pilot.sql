-- REINICIO EXCEPCIONAL autorizado: solo se conserva bryx96@gmail.com.
-- Borra las inspecciones y otras cuentas; el siguiente código vuelve a 001.
-- Primero: Storage -> vaciar berry-evidence y berry-documents (conservar buckets).
-- No vuelve a ejecutarse con el mismo identificador. No cambia la contraseña.
begin;
create table if not exists berry_private.pilot_resets (
  id text primary key, owner_id uuid not null, completed_at timestamptz not null default clock_timestamp()
);
alter table berry_private.pilot_resets enable row level security;
revoke all on berry_private.pilot_resets from public,anon,authenticated;
create table if not exists berry_private.retired_inspection_ids(id uuid primary key);
alter table berry_private.retired_inspection_ids enable row level security;
revoke all on berry_private.retired_inspection_ids from public,anon,authenticated;
do $$
declare v_owner uuid; v_tables text; v_name text;
begin
  if exists(select 1 from berry_private.pilot_resets where id='2026-11-08-clean-pilot-001') then
    raise exception 'Este reinicio ya se realizó. No repetir: podría haber registros nuevos.' using errcode='55000';
  end if;
  select u.id into v_owner from auth.users u join public.berry_profiles p on p.id=u.id
    where lower(u.email)='bryx96@gmail.com' and p.email=lower(u.email) and u.email_confirmed_at is not null and p.role='admin' and p.enabled;
  if not found then raise exception 'No se encontró al propietario confirmado. No se ha borrado ningún registro.' using errcode='55000'; end if;
  if exists(select 1 from storage.objects where bucket_id in('berry-evidence','berry-documents')) then
    raise exception 'Primero vacíe ambos buckets desde Storage; no borre storage.objects con SQL.' using errcode='55000'; end if;
  perform 1 from public.berry_profiles where id=v_owner for update;
  insert into berry_private.retired_inspection_ids select id from public.berry_inspections on conflict do nothing;
  foreach v_name in array array['berry_private.document_cleanup','berry_private.report_outbox','berry_private.report_leases','berry_private.report_counters','berry_private.account_requests','berry_private.password_operations','public.berry_shared_texts','public.berry_documents','public.berry_corrections','public.berry_recipients','public.berry_inspections','public.berry_audit'] loop
    if to_regclass(v_name) is not null then v_tables:=concat_ws(',',v_tables,v_name); end if;
  end loop;
  execute 'truncate table '||v_tables||' restart identity';
  delete from auth.sessions;
  delete from auth.refresh_tokens;
  delete from auth.users where id<>v_owner;
  update public.berry_profiles set credentials_valid_after=floor(extract(epoch from clock_timestamp()))::bigint where id=v_owner;
  delete from public.berry_audit;
  insert into berry_private.pilot_resets(id,owner_id)values('2026-11-08-clean-pilot-001',v_owner);
end;
$$;
-- Prevent an old tab or pending offline draft from recreating a retired UUID.
create or replace function berry_private.reject_retired_inspection()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if exists(select 1 from berry_private.retired_inspection_ids where id=new.id) then
    raise exception 'El piloto se reinició. Actualice la aplicación; este identificador ya fue retirado.' using errcode='42501';
  end if;
  return new;
end;
$$;
revoke all on function berry_private.reject_retired_inspection() from public,anon,authenticated;
drop trigger if exists berry_reject_retired_inspection on public.berry_inspections;
create trigger berry_reject_retired_inspection before insert or update on public.berry_inspections for each row execute function berry_private.reject_retired_inspection();
do $install$ begin
 if to_regprocedure('public.berry_cloud_tombstones(uuid[])') is null then
  execute $definition$create or replace function public.berry_cloud_tombstones(p_ids uuid[])returns jsonb language plpgsql stable security definer set search_path='' as $$ begin
  perform berry_private.require_ready();
  return(select coalesce(jsonb_agg(id),'[]') from berry_private.retired_inspection_ids where id=any(p_ids));
end $$;
$definition$;
 end if;
end $install$;
revoke all on function public.berry_cloud_tombstones(uuid[]) from public,anon,authenticated;
grant execute on function public.berry_cloud_tombstones(uuid[]) to authenticated;
notify pgrst,'reload schema';
commit;
select (select count(*) from auth.users) as cuentas_conservadas,
       (select email from public.berry_profiles where email='bryx96@gmail.com') as propietario,
       (select count(*) from public.berry_inspections) as inspecciones,
       'El próximo registro empezará en 001' as numeracion;
