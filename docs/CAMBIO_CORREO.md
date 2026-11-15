# Modificar el correo de un usuario

Administrar usuarios muestra un único botón con icono de lápiz por usuario. Abre **Permisos**, **Responde a (CC)** y **Modificar correo**. La flecha **Volver a opciones** permite cambiar de apartado conservando la edición local. Navegar entre opciones no escribe datos. Cada apartado guarda únicamente su propia información; los permisos sin guardar no se aplican al guardar los CC o el correo.

**Responde a (CC)** es el nombre visible de los correos en copia. Mantiene el envío como CC; no modifica la cabecera Reply-To de los correos.

Modificar correo actualiza la dirección de acceso y la de las próximas notificaciones. Conserva el identificador de Auth, la identidad de la persona, la contraseña, los permisos, las asignaciones y los datos de las inspecciones históricas. Los correos que ya se enviaron y sus archivos adjuntos se conservan.

## Activación

1. Aplicar en SQL Editor el [paso 17](../supabase/migrations/202611150017_account_email.sql), después del paso 16.
2. Desplegar la API de Render con la ruta `POST /api/accounts/email` y publicar la web actualizada.

El entorno de desarrollo no dispone de acceso administrativo a Supabase ni Render. La migración y la API quedan preparadas y comprobadas localmente; su preparación no implica que estén activadas en producción.

## Consistencia y control de acceso

La API verifica la sesión real y el rol administrativo. Una función protegida reserva el cambio exacto para el usuario, el correo y la revisión solicitados durante diez minutos. Rechaza direcciones ocupadas, altas pendientes, cuentas eliminadas y operaciones incompatibles.

La API utiliza la interfaz administrativa de Supabase Auth para modificar el correo confirmado. Un trigger sincroniza el perfil y confirma la operación dentro de la misma transacción de Auth. Antes de confirmar, vuelve a comprobar la revisión del usuario y que el administrador conserve su acceso. No escribe contraseñas ni edita directamente las identidades del proveedor.

Si se pierde la respuesta después de guardar, la operación persistida confirma el resultado al reintentar. El identificador del intento se conserva en la interfaz y la base también reconoce el mismo cambio pendiente desde otra solicitud. Un cambio completado nunca se vuelve a aplicar sobre una edición posterior. Cada cambio confirmado registra el administrador, el correo anterior, el nuevo y el identificador de operación en la auditoría. Las invitaciones completadas conservan su solicitud original, pero dejan de reservar permanentemente el correo anterior.
