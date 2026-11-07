# Altas de usuarios y contraseña temporal

Esta etapa permite crear y consultar cuentas reales desde Administración en el portal `?acceso=cuenta`. Requiere la segunda migración y la configuración privada de la API en Render. El espacio de inspecciones de prueba conserva sus cuentas locales; las inspecciones, archivos e importación siguen pendientes de conexión.

## Activación única por el propietario

1. En SQL Editor, abrir una consulta nueva y ejecutar el contenido completo de [202611070002_accounts.sql](../supabase/migrations/202611070002_accounts.sql). El archivo empieza con `-- Berry Safety · Paso 2`. Copiar el texto SQL, no la dirección del archivo. Ejecutarlo después de la primera migración ya instalada; no repetir la primera para esta actualización. La segunda se puede repetir y conserva la cuenta administradora y las contraseñas existentes.
2. En Supabase → Project Settings → API Keys → Secret keys, obtener una clave **Secret** para el servidor. La clave Publishable del navegador no crea usuarios de Auth. El servidor también admite la antigua clave `service_role` de Legacy API keys si esa es la disponible.
3. En Render → `berry-safety-api` → Environment, guardar `SUPABASE_URL=https://rwacygoxhkxxxkvushmb.supabase.co` y `SUPABASE_SECRET_KEY` con la clave privada del paso anterior. Introducirla directamente en Render; no compartirla por chat, no publicarla, no ponerla en GitHub Pages ni usar un nombre `VITE_`. Conservar las variables de Make y los orígenes actuales.
4. Guardar la configuración y desplegar el último commit de `main` en Render. La imagen Docker incluye las nuevas rutas de cuentas; el proceso anterior no las tiene. Si guardar las variables ya inicia ese despliegue, no hace falta lanzarlo otra vez.
5. Entrar al portal de Berry Safety con la cuenta administradora y abrir Administración. Crear una cuenta con un correo de prueba controlado por el propietario y comprobar el ingreso y el cambio de contraseña desde otra sesión o dispositivo. Estas altas de comprobación requieren que el propietario elija los correos; las pruebas automatizadas solo usan datos ficticios y APIs interceptadas.

Hasta completar los pasos 1–4, la pantalla muestra el error de configuración o de actualización del servidor y no crea cuentas locales como sustitución. Este trabajo no requiere cambiar de plan ni contratar otro servicio.

## Uso desde la app

El administrador introduce nombre, correo, área, cargo, rol y, si corresponde, correos de jefes/gerentes en copia. Nombre y correo son obligatorios. La contraseña temporal solicitada es `0123456789`; se muestra de solo lectura con opción para verla. No se envían invitaciones por correo.

En el primer ingreso, el usuario solo puede actualizar esa contraseña o cerrar sesión. La nueva debe tener al menos diez caracteres, ser distinta de `0123456789` y confirmarse en un segundo campo. Tras el cambio se solicita iniciar sesión con la nueva contraseña. La cuenta inicial del propietario no recibe la contraseña temporal ni pierde su acceso.

La lista muestra las cuentas reales y distingue las deshabilitadas y las que aún usan contraseña temporal. Esta entrega incluye creación y consulta; la edición de accesos existentes y el restablecimiento de contraseñas por administradores se incorporarán aparte.

## Permisos, reintentos y trazabilidad

- Las rutas `/api/accounts` y `/api/accounts/password` siempre verifican el JWT contra Supabase Auth. El modo de presentación del correo no habilita estas operaciones. El rol, la habilitación y el requisito de cambio provienen de la base, no del selector local o metadata editable.
- Las altas requieren una cuenta administradora habilitada y sin cambio de contraseña pendiente. Un identificador persistido por correo y solicitud permite recuperar un alta cuyo resultado se perdió. La identidad de Auth lleva el identificador en `app_metadata`, editable únicamente por el servidor. Un correo existente ajeno a esa solicitud no se adopta ni recibe otra contraseña.
- Los usuarios nuevos quedan inicialmente bloqueados. La función de finalización solo habilita una identidad vinculada a la solicitud administradora. Reintentar un alta ya completada no vuelve a marcar la contraseña como temporal ni cambia su contraseña personal.
- RLS bloquea informes, archivos, directorio y edición del perfil mientras `must_change_password` sea verdadero. El propio perfil se puede consultar para mostrar la pantalla de cambio. El navegador no puede modificar ese indicador ni ejecutar la finalización de contraseña.
- El servidor valida y cambia la contraseña en Auth y después finaliza la operación mediante una función exclusiva de `service_role`. Las operaciones simultáneas se serializan por usuario. Si el proveedor falla o no se confirma el cambio, el requisito permanece. Una operación interrumpida admite recuperación después de cinco minutos.
- La finalización registra la identidad comprobada del usuario y un corte de credenciales con la hora del servidor. RLS y la API rechazan los JWT emitidos hasta ese segundo, y se solicita el cierre global de las sesiones de Auth. El nuevo ingreso debe emitir un JWT posterior al corte. La API no devuelve contraseñas permanentes, claves o diagnósticos privados del proveedor.
- El historial registra quién habilitó cada cuenta y quién completó su cambio de contraseña. Las tablas de solicitudes y operaciones están en un esquema privado con RLS y sin permisos del navegador. No guardan contraseñas.

## Verificación

`npm run test:supabase` ejecuta diez comprobaciones PostgreSQL sobre las dos migraciones, incluidos el bloqueo con contraseña temporal, la prohibición de autoasignar permisos, los reintentos, los archivos y la invalidación de JWT anteriores. La primera migración rechaza repetirse sobre una versión posterior para conservar los controles nuevos.

`npm run test:api` incluye seis pruebas de las rutas de cuentas, con Auth/REST simulados. `tests/cloud-access.spec.ts` comprueba el flujo de altas y cambio obligatorio, además del acceso y perfil anteriores, sin crear cuentas reales ni solicitar correos. La activación real queda pendiente de la configuración del propietario y de su comprobación con un segundo usuario.
