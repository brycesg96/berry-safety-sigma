# Prioridades, historial, correo y trabajo sin conexión

Esta actualización incluye todas las mejoras autorizadas excepto los QR. Conserva los informes, las cuentas y los permisos existentes.

## Activación de la base de datos: paso 23

Ejecutar [activate-productivity-20261117.sql](../supabase/operations/activate-productivity-20261117.sql) en el editor SQL de Supabase después de los pasos 1–22. Es repetible; no borra ni reescribe inspecciones ni fabrica un historial anterior. Todas las tablas nuevas tienen RLS y las funciones administrativas y del servidor están separadas de las funciones de usuario.

Volver a entrar después de ejecutarlo. La consulta `select public.berry_schema_status();` debe incluir `productivity_version: 202611170023`. Los comentarios anteriores se conservan; los nuevos movimientos quedan registrados desde la activación.

## Buzón e indicadores

El Buzón ofrece Pendientes, Vencidas, Por vencer (hoy y los próximos tres días), En espera de respuesta, Por validar / aprobar y Cerradas. Las prioridades pueden coincidir: una inspección pendiente de revisión también puede tener una observación vencida. Aprobar y ejecutar es el criterio de cierre; marcar Ejecutado sin aprobación no elimina el vencimiento.

Gestión de Inspecciones muestra el porcentaje de observaciones aprobadas, las vencidas, la proporción de inspecciones cerradas y el tiempo medio entre envío y cierre. Se puede agrupar por gerencia o área y se respetan los filtros del panel. Las fechas históricas ausentes se muestran como Sin datos; no se deducen ni inventan tiempos de atención.

Las listas personales consultan metadatos en bloques de 100; las evidencias se descargan cuando se abre el registro. El panel administrativo utiliza páginas de 100 con cursor y conserva los filtros y las identidades vinculadas.

## Conversación e historial

Los participantes pueden añadir comentarios sin sustituir los anteriores. Cada comentario y movimiento incluye identidad y fecha. Las revisiones, solicitudes de corrección y cambios de estado se conservan en una sección separada de la conversación. El acceso sigue los permisos del informe y el archivo administrativo; no se permite editar o borrar el historial desde el cliente.

Los comentarios internos no se incorporan al informe oficial Excel/PDF. La conversación se actualiza al recuperar foco y periódicamente mientras la página está visible.

## Preparación para trabajar sin conexión

Abrir la aplicación e iniciar sesión con conexión en cada dispositivo. Abrir también los informes que se quieran tener disponibles con sus evidencias. El navegador descarga los archivos públicos de la aplicación; el perfil verificado, el directorio y las inspecciones se guardan por usuario. El perfil disponible sin conexión tiene una vigencia de 24 horas; el acceso inicial y los cambios de contraseña/permisos requieren conexión. El navegador también debe conservar una sesión recuperable; si ha vencido, hay que reconectarse para iniciar sesión.

Guardar un borrador o un avance sin conexión lo conserva en IndexedDB, incluidas las evidencias. Enviar un levantamiento sin conexión lo deja pendiente de sincronización y muestra una confirmación local, sin afirmar que el servidor ya lo recibió. Los comentarios también pueden quedar en la cola. La sesión y los permisos se verifican de nuevo al sincronizar.

La banda superior muestra los pendientes y permite sincronizar o descargar una copia. Un conflicto de versión no sobreescribe el servidor: se conserva el avance y se presenta para revisión. Los cambios de levantamiento usan un identificador de operación estable para que una respuesta perdida no duplique el movimiento. La numeración y el envío inicial del informe por correo requieren conexión.

Una nueva versión se instala sin recargar automáticamente un formulario con cambios. El aviso Actualizar aplicación comprueba los cambios pendientes antes de activar la actualización. El almacenamiento local depende de que el navegador permita IndexedDB y conserve los datos del sitio.

## Servicio de correo y confirmaciones

Desplegar el backend Node actualizado en Render. Solo después de activar el paso 23, configurar en el servidor:

```text
MAIL_TRACKING_ENABLED=true
MAIL_EVENTS_SECRET=<secreto aleatorio de al menos 32 caracteres>
```

No colocar secretos en variables VITE, el repositorio, capturas ni el navegador. Si estas variables no están configuradas, el envío actual sigue funcionando y la aplicación no inventa confirmaciones de entrega.

La aplicación inicializa una fila por destinatario y solicitud. `POST /api/mail/events` admite eventos normalizados:

```json
{
  "event_id": "identificador-unico-del-proveedor",
  "request_id": "uuid-request_id-enviado-a-Make",
  "recipient": "persona@example.invalid",
  "state": "submitted",
  "provider_id": "identificador-del-mensaje",
  "detail": "Aceptado por Outlook",
  "occurred_at": "2026-11-17T13:00:00Z"
}
```

Estados: `submitted` (el módulo de envío terminó correctamente), `delivered` (el proveedor confirmó entrega), `bounced` (rechazo) y `deferred` (aplazamiento). Un HTTP 200 de Make o la aparición en Enviados **solo permiten registrar submitted** cuando se ha confirmado que Outlook se ejecutó; nunca delivered. La cuenta personal Outlook actual no proporciona por sí sola eventos de entrega: para estos eventos hace falta una fuente de Microsoft 365 o un proveedor con esa capacidad. La pantalla conserva Sin confirmar hasta que llegue un evento auténtico.

Firmar el cuerpo JSON exacto con HMAC-SHA256:

```text
X-Berry-Timestamp: segundos Unix actuales
X-Berry-Signature: sha256=hex(HMAC_SHA256(secreto, timestamp + "." + cuerpo_JSON_exacto))
```

La firma debe generarse en Make o en un adaptador de confianza. La tolerancia de reloj es cinco minutos. Reintentar un evento conserva su `event_id`, `occurred_at` y contenido; se renueva el timestamp de la firma. El servidor deduplica, rechaza destinatarios desconocidos y no permite que un evento submitted/deferred atrasado borre una entrega o rechazo final.

Se incluye `scripts/post-mail-event.mjs` para probar el adaptador desde un entorno privado con `MAIL_EVENTS_SECRET` y `BERRY_MAIL_EVENTS_ENDPOINT`; recibe un archivo JSON y no imprime secretos. No utilizarlo para inventar entregas: el estado debe venir de la fuente de correo.

## Recordatorios automáticos

1. Con el paso 23 activo, abrir Gestión de Inspecciones → Recordatorios automáticos y configurar anticipación, frecuencia y habilitación.
2. En Render, configurar `REMINDERS_ENABLED=true` y `REMINDERS_CRON_SECRET` con otro secreto aleatorio de al menos 32 caracteres. Mantener `MAKE_REPORTS_ENABLED=true`.
3. En GitHub → Settings → Secrets and variables → Actions, añadir los secretos `BERRY_REMINDERS_ENDPOINT` (`https://berry-safety-api.onrender.com/api/reminders/run`) y `BERRY_REMINDERS_CRON_SECRET` con el mismo valor de Render.
4. En Make, verificar que el filtro permite `send_email=true` y los modos `inspection` y `reminder`, excluyendo `test`. El recordatorio conserva `outlook.para`, `outlook.cc`, `asunto`, `cuerpo_html` y el Excel adjunto, por lo que se puede reutilizar el mapeo existente. Cada recordatorio lleva su propio request_id, sin registrar otra inspección ni consumir correlativos.
5. Ejecutar una vez el workflow Recordatorios de inspecciones y revisar el resultado. Después se programa diariamente a las 08:20 de Perú. GitHub puede demorar el inicio de una ejecución programada.

Cada lote reclama hasta diez recordatorios y da prioridad a los que aún no se han notificado. El proceso diario continúa con nuevos lotes hasta vaciar los pendientes, con un máximo de veinte lotes o cuatro minutos por ejecución. Se avisa al responsable del levantamiento cuando debe actuar, y al autor cuando debe revisar. Se excluyen inspecciones cerradas, cuentas deshabilitadas, permisos retirados y cuentas reincorporadas sin acceso al informe histórico. La frecuencia se conserva en PostgreSQL, sobrevive a reinicios y evita repetir el mismo periodo. Un resultado ambiguo no provoca un reenvío inmediato.

El cron y los eventos se mantienen deshabilitados por defecto hasta que se configure el servicio externo. No se puede activar la entrega confirmada únicamente publicando la web ni ejecutando SQL.
