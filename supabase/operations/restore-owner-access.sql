-- Recuperación privada del propietario desde SQL Editor de Supabase.
-- No envía correo. La contraseña temporal aleatoria aparece SOLO en el resultado.
-- Copiarla en privado, entrar a Berry y elegir una contraseña personal.
-- No compartir una captura del resultado. No cambia correos ni crea usuarios.
with owner as materialized (
  select u.id,p.email from auth.users u join public.berry_profiles p on p.id=u.id
  where lower(u.email)='bryx96@gmail.com' and p.email=lower(u.email)
    and u.email_confirmed_at is not null and p.role='admin' and p.enabled
), secret as materialized (
  select id,encode(extensions.gen_random_bytes(18),'hex') as temporary_password from owner
), changed_auth as (
  update auth.users u set encrypted_password=extensions.crypt(s.temporary_password,extensions.gen_salt('bf',10)),updated_at=clock_timestamp()
  from secret s where u.id=s.id returning u.id
), changed_profile as (
  update public.berry_profiles p set must_change_password=true,
    credentials_valid_after=floor(extract(epoch from clock_timestamp()))::bigint
  from changed_auth a where p.id=a.id returning p.id,p.email
), removed_sessions as (
  delete from auth.sessions s using changed_profile p where s.user_id=p.id returning s.id
), removed_refresh_tokens as (
  delete from auth.refresh_tokens r using changed_profile p where r.user_id::text=p.id::text returning r.id
), cleared_password_operation as (
  delete from berry_private.password_operations o using changed_profile p where o.user_id=p.id returning o.user_id
)
select p.email,s.temporary_password,'Entrar a Berry y cambiar la contraseña temporal' as siguiente_paso
from changed_profile p join secret s on s.id=p.id;
