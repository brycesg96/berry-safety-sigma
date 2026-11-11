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

Después de completar su perfil por primera vez, una cuenta habilitada entra directamente al espacio de trabajo en **Mis inspecciones**. Recargar esa vista mantiene la lista; abrirla no crea un borrador vacío. **Nueva inspección** inicia el formulario y **Continuar** recupera un borrador guardado. El perfil se abre voluntariamente desde **Mi perfil → Ir a mi perfil**; los administradores encuentran allí **Gestión de Cuentas** y **Gestión de Inspecciones**. Volver desde la cuenta abre otra vez **Mis inspecciones**. Los enlaces explícitos a perfil o administración conservan su destino al recargar, con los mismos controles de permisos. El cambio de contraseña obligatorio, la recuperación y las cuentas inhabilitadas mantienen sus pantallas previas al espacio de trabajo.

El administrador introduce nombre, correo, área, puesto, los accesos Administrador e Inspecciones y, si corresponde, correos de administradores en copia. Nombre y correo son obligatorios. La contraseña temporal solicitada es `0123456789`; se muestra de solo lectura con opción para verla. No se envían invitaciones por correo.

En el primer ingreso, el usuario solo puede actualizar esa contraseña o cerrar sesión. La nueva debe tener al menos diez caracteres, ser distinta de `0123456789` y confirmarse en un segundo campo. Tras el cambio se solicita iniciar sesión con la nueva contraseña. La cuenta inicial del propietario no recibe la contraseña temporal ni pierde su acceso.

La lista muestra las cuentas reales y distingue las deshabilitadas y las que aún usan contraseña temporal. El paso 5 permite editar permisos, deshabilitar y eliminar cuentas de forma lógica. La pantalla presenta dos interruptores: Administrador e Inspecciones. Inspecciones habilita realizar y recibir; Administrador incluye esas funciones automáticamente, además de la gestión de cuentas y accesos. El detalle de activación, la recuperación del propietario y el reinicio solicitado están en [Reinicio del piloto](REINICIO_PILOTO.md).

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

## Desactivar y eliminar cuentas

En Gestión de Cuentas → Gestión de Usuarios, cada usuario tiene acciones separadas para **Desactivar/Reactivar** y **Eliminar**. Desactivar impide el acceso a datos y retira a la persona de los selectores de nuevas inspecciones. La cuenta permanece y se puede reactivar. El ingreso muestra «Cuenta inhabilitada» y los nombres/correos de los administradores actuales habilitados que ya actualizaron su contraseña. Los contactos se consultan al abrir esa pantalla y al recuperar el foco; no se mantienen como una lista fija.

Eliminar retira el acceso y la cuenta de las listas, manteniendo su identidad para las inspecciones y documentos históricos. No elimina sus informes, sus levantamientos ni su autoría. La persona no vuelve a estar disponible como destinataria de nuevas inspecciones. Esta eliminación es lógica; no equivale al borrado excepcional del piloto.

Un administrador puede eliminar a otro administrador. Debe quedar al menos uno habilitado y con contraseña personal; la base protege ese requisito incluso con solicitudes simultáneas. No se permite desactivar ni eliminar la propia cuenta desde esa misma sesión.

El paso 5 incorpora una función autenticada limitada a los nombres y correos de contacto. Una cuenta inhabilitada con una sesión nueva puede consultarlos sin obtener permisos para inspecciones ni para el directorio general. No se publican contactos a visitantes anónimos ni a cuentas eliminadas.


## Cambio rápido entre secciones

Las listas de gestión se conservan en memoria durante la sesión de la misma cuenta. Volver a una sección muestra su última lista mientras consulta la versión actual al servidor. Las mutaciones actualizan también esa memoria y un error de autorización no conserva una lista antigua como válida. Cerrar sesión, cambiar de cuenta o perder la habilitación/administración limpia la caché de gestión.

Las imágenes ya descargadas se reutilizan al volver desde el perfil al espacio de trabajo. Sus referencias incluyen el hash de contenido y cada consulta de inspecciones sigue verificando la sesión y los registros autorizados. La memoria de imágenes se limpia al cerrar sesión o cambiar de identidad. No se almacena esta caché adicional en disco ni se usa como sustitución de la base compartida.

Si el servicio de datos falla al consultar el perfil, la app conserva la sesión, limita la consulta a doce segundos y permite **Reintentar** sin pedir otra contraseña. Distingue una sesión vencida, un rechazo de permisos y un dispositivo sin conexión de un fallo del servicio. Ante fallos repetidos, el siguiente correlativo reduce sus consultas a intervalos de 15, 30 y hasta 60 segundos; la lista de inspecciones espera 60, 120 y hasta 300 segundos. Una respuesta correcta restaura los intervalos habituales. La consulta del correlativo se adelanta al recuperar conexión o confirmar un cambio de inspecciones. Los controles de acceso siguen vigentes y no se sustituyen por perfiles locales ni datos de otra identidad.

Las lecturas del perfil, directorio y listado de inspecciones realizan un solo intento por consulta y tienen un límite de doce segundos, para evitar los reintentos adicionales de la biblioteca durante una saturación. El [diagnóstico de CPU](../supabase/operations/diagnose-cpu.sql) consulta actividades y bloqueos desde SQL Editor; no modifica datos ni cancela procesos. Reducir consultas del cliente no acredita que se haya resuelto un problema de capacidad, bloqueo o consultas lentas en el servidor.

## Organización y edición de copias

**Agregar Usuario** se dedica al alta; **Gestión de Usuarios** reúne las cuentas existentes. Cada fila ofrece **Editar CC**, que abre **Administradores (CC)** con los correos actuales. Permite añadir, sustituir o quitar todos los correos sin alterar permisos ni datos de perfil. El [paso 11](../supabase/migrations/202611090011_account_copies.sql) conserva los controles de administrador, el último administrador utilizable, el historial y la numeración. Mantiene los correos de copia cuando un cliente anterior actualiza únicamente permisos. Las cuentas retiradas no son editables. La API existente admite este cambio sin otro despliegue de Render.


## Perfil del primer ingreso

Las cuentas nuevas cambian primero la contraseña temporal. Antes de solicitar ese cambio, se registra en su cuenta de Auth que deben confirmar Mi perfil, incluso si el administrador ya precargó área y cargo. En el siguiente acceso se muestra Mi perfil una sola vez para completar o confirmar nombres, área y puesto. Área y puesto son obligatorios en este paso; Guardar perfil confirma los datos y abre Mis inspecciones. Si falla el guardado o su confirmación, el formulario mantiene la edición para reintentar.

La confirmación se conserva en los metadatos de la propia cuenta de Auth, también al entrar desde otro dispositivo. Estos indicadores controlan únicamente la presentación del primer ingreso: los roles, permisos y acceso siguen comprobándose mediante berry_profiles y las funciones autorizadas del servidor. No se añade ninguna columna ni se requiere SQL o actualizar Render.

Las cuentas existentes con área y cargo completos mantienen el acceso directo. Si les faltan estos datos y no tienen confirmación previa, se ofrece el mismo paso inicial para completarlos. Tras confirmarlo, editar el perfil sigue siendo voluntario desde Mi perfil → Ir a mi perfil; la recuperación de contraseña de una cuenta ya completada no vuelve a iniciar este paso.
