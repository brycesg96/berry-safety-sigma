# Altas de usuarios y contraseña temporal

Esta etapa permite crear y consultar cuentas reales desde Administración en el portal `?acceso=cuenta`. Requiere la segunda migración y la configuración privada de la API en Render. Los pasos de cuentas ya fueron instalados por el propietario el 8 de noviembre. El espacio de pruebas conserva sus cuentas locales; la conexión de las nuevas inspecciones se activa con el [paso 3](SUPABASE.md#tercera-etapa-espacio-de-trabajo-compartido-y-archivo-mensual) y la importación histórica se conserva como trabajo separado.

## Activación única por el propietario

1. En SQL Editor, abrir una consulta nueva y ejecutar el contenido completo de [202611070002_accounts.sql](../supabase/migrations/202611070002_accounts.sql). El archivo empieza con `-- Berry Safety · Paso 2`. Copiar el texto SQL, no la dirección del archivo. Ejecutarlo después de la primera migración ya instalada; no repetir la primera para esta actualización. La segunda se puede repetir dentro de su etapa y conserva las cuentas. No ejecutarla después de instalar el paso 3: su guarda impide restablecer reglas anteriores.
2. En Supabase → Project Settings → API Keys → Secret keys, obtener una clave **Secret** para el servidor. La clave Publishable del navegador no crea usuarios de Auth. El servidor también admite la antigua clave `service_role` de Legacy API keys si esa es la disponible.
3. En Render → `berry-safety-api` → Environment, guardar `SUPABASE_URL=https://rwacygoxhkxxxkvushmb.supabase.co` y `SUPABASE_SECRET_KEY` con la clave privada del paso anterior. Introducirla directamente en Render; no compartirla por chat, no publicarla, no ponerla en GitHub Pages ni usar un nombre `VITE_`. Conservar las variables de Make y los orígenes actuales.
4. Guardar la configuración y desplegar el último commit de `main` en Render. La imagen Docker incluye las nuevas rutas de cuentas; el proceso anterior no las tiene. Si guardar las variables ya inicia ese despliegue, no hace falta lanzarlo otra vez.
5. Entrar al portal de Berry Safety con la cuenta administradora y abrir Administración. Crear una cuenta con un correo de prueba controlado por el propietario y comprobar el ingreso y el cambio de contraseña desde otra sesión o dispositivo. Estas altas de comprobación requieren que el propietario elija los correos; las pruebas automatizadas solo usan datos ficticios y APIs interceptadas.

Hasta completar los pasos 1–4, la pantalla muestra el error de configuración o de actualización del servidor y no crea cuentas locales como sustitución. Este trabajo no requiere cambiar de plan ni contratar otro servicio.

## Uso desde la app

El administrador introduce nombre, correo, área, cargo, los tres accesos independientes y, si corresponde, correos de jefes/gerentes en copia. Nombre y correo son obligatorios. La contraseña temporal solicitada es `0123456789`; se muestra de solo lectura con opción para verla. No se envían invitaciones por correo.

En el primer ingreso, el usuario solo puede actualizar esa contraseña o cerrar sesión. La nueva debe tener al menos diez caracteres, ser distinta de `0123456789` y confirmarse en un segundo campo. Tras el cambio se solicita iniciar sesión con la nueva contraseña. La cuenta inicial del propietario no recibe la contraseña temporal ni pierde su acceso.

La lista muestra las cuentas reales y distingue las deshabilitadas y las que aún usan contraseña temporal. El paso 5 incorpora tres accesos independientes, edición de permisos, deshabilitación y eliminación lógica. El detalle de activación, la recuperación del propietario y el reinicio solicitado están en [Reinicio del piloto](REINICIO_PILOTO.md).

## Permisos, reintentos y trazabilidad

- Las rutas `/api/accounts` y `/api/accounts/password` siempre verifican el JWT contra Supabase Auth. El modo de presentación del correo no habilita estas operaciones. El rol, la habilitación y el requisito de cambio provienen de la base, no del selector local o metadata editable.
- Las altas requieren una cuenta administradora habilitada y sin cambio de contraseña pendiente. Un identificador persistido por correo y solicitud permite recuperar un alta cuyo resultado se perdió. La identidad de Auth lleva el identificador en `app_metadata`, editable únicamente por el servidor. Un correo existente ajeno a esa solicitud no se adopta ni recibe otra contraseña.
- Los usuarios nuevos quedan inicialmente bloqueados. La función de finalización solo habilita una identidad vinculada a la solicitud administradora. Reintentar un alta ya completada no vuelve a marcar la contraseña como temporal ni cambia su contraseña personal.
- RLS bloquea informes, archivos, directorio y edición del perfil mientras `must_change_password` sea verdadero. El propio perfil se puede consultar para mostrar la pantalla de cambio. El navegador no puede modificar ese indicador ni ejecutar la finalización de contraseña.
- El servidor valida y cambia la contraseña en Auth y después finaliza la operación mediante una función exclusiva de `service_role`. Las operaciones simultáneas se serializan por usuario. Si el proveedor falla o no se confirma el cambio, el requisito permanece. Una operación interrumpida admite recuperación después de cinco minutos.
- La finalización registra la identidad comprobada del usuario y un corte de credenciales con la hora del servidor. RLS y la API rechazan los JWT emitidos hasta ese segundo, y se solicita el cierre global de las sesiones de Auth. El nuevo ingreso debe emitir un JWT posterior al corte. La API no devuelve contraseñas permanentes, claves o diagnósticos privados del proveedor.
- El historial registra quién habilitó cada cuenta y quién completó su cambio de contraseña. Las tablas de solicitudes y operaciones están en un esquema privado con RLS y sin permisos del navegador. No guardan contraseñas.

## Verificación

`npm run test:supabase` ejecuta diecisiete comprobaciones PostgreSQL sobre las tres migraciones, incluidos el bloqueo con contraseña temporal, la prohibición de autoasignar permisos, los reintentos, los archivos y la invalidación de JWT anteriores. La primera migración rechaza repetirse sobre una versión posterior para conservar los controles nuevos.

`npm run test:api` incluye seis pruebas de las rutas de cuentas, con Auth/REST simulados. `tests/cloud-access.spec.ts` comprueba el flujo de altas y cambio obligatorio, además del acceso y perfil anteriores, sin crear cuentas reales ni solicitar correos. La configuración de cuentas y el despliegue `6fde0aa` fueron mostrados por el propietario. Sigue pendiente su comprobación operativa con un segundo usuario; las pruebas automatizadas no crean cuentas reales.


## Recuperación de contraseña

La pantalla de acceso incluye **Olvidé mi contraseña**. Solicita un enlace de Supabase Auth, con PKCE, para que la persona verifique su correo y elija una contraseña nueva. Abrir el enlace en el mismo navegador que lo solicitó. No se envían correos desde las herramientas de desarrollo; la persona pulsa el botón desde la app.

Configuración única en Supabase → Authentication → URL Configuration:

- Site URL: `https://brycesg96.github.io/berry-safety-sigma/?acceso=cuenta`.
- Redirect URLs: añadir `https://brycesg96.github.io/berry-safety-sigma/**` para admitir el retorno de recuperación y su identificador PKCE.

El enlace habilita el formulario de contraseña solo después de verificar la sesión con Auth y el perfil propio. También se admiten los enlaces de recuperación enviados desde el panel de Supabase. La ruta protegida de cambio existente conserva el rol y los registros, modifica solo la contraseña del usuario verificado, invalida las sesiones anteriores y solicita entrar otra vez. Un enlace vencido permite solicitar otro; el identificador en la URL no concede permisos por sí solo. Las pruebas interceptan Auth y no envían correos reales.


## Entrada única de administración

Administración → Usuarios → Administrar usuarios es la única gestión de altas. El formulario local paralelo se retiró; las cuentas históricas y sus informes se conservan. El enlace `?acceso=cuenta&seccion=usuarios` lleva a esta sección después del acceso, sujeto al rol real. [Interfaz y conservación de datos anteriores](ADMINISTRACION.md).
