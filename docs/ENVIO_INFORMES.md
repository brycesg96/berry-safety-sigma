# Envío de informes por Make y Outlook

## Qué está conectado

Enviar inspección abre un formulario de envío real con los responsables elegidos como destinatarios Para. El administrador puede asociar correos de jefes o gerentes a cada cuenta en Administración → Cuentas permitidas → Correos de jefes y gerentes (CC). Son direcciones para copia, no altas de usuarios ni permisos. Se validan y deduplican; quienes ya estén en Para no se repiten en CC. La lista de CC se fija en el primer intento de correo del informe y se conserva en intentos posteriores.

El navegador genera el mismo Excel que usa Descargar Excel, con observaciones, fotografías, cierre y responsables del registro. El formato sigue siendo **provisional**, no la plantilla oficial pendiente de incorporar. No se asigna ni consume un código IH definitivo al enviar. La numeración central sigue pendiente.

La web llama al backend Node por HTTPS: `POST /api/inspections/send`. La URL privada de Make permanece en `MAKE_WEBHOOK_URL` del servidor. El backend valida los campos, genera un mensaje HTML general y asunto, y envía el Excel en base64 con los destinatarios. No utiliza el cuerpo HTML aportado por un navegador.

El asunto indica área y fecha. El cuerpo avisa que se ha compartido un informe de inspección, pide revisar el Excel adjunto y muestra área, fecha e inspector. Las observaciones detalladas están en el Excel, no en el mensaje.

## Configuración en Make

Mantener el filtro **send_email igual al booleano true AND mode distinto de test**. Los informes reales llevan `mode:inspection` y `send_email:true`; las pruebas de conexión continúan con `mode:test` y `send_email:false`.

1. Abrir el Custom webhook y seleccionar **Detect new values / Redetermine data structure**. Con el webhook escuchando, usar **Administración → Integraciones → Preparar otra prueba → Probar conexión con Make**. El ejemplo ahora incluye arrays de Outlook y un Excel ficticio válido. No utiliza direcciones reales ni debe pasar el filtro.
2. En **Outlook → To Recipients**, activar **Map** y seleccionar **outlook → para[]**. La colección contiene elementos con `address` (correo) y `name`. Quitar el destinatario fijo de prueba. Verificar en el editor los nombres de los subcampos de la colección; no utilizar el array de textos `destinatarios.para` como una única dirección.
3. En **CC Recipients**, activar **Map** y seleccionar **outlook → cc[]**. Se admite colección vacía. CCO puede quedar vacío.
4. **Subject**: mapear `asunto`. **Body Content**: mapear `cuerpo_html`. **Body Content Type**: HTML.
5. En **Attachments**, añadir un elemento. **File Name**: `adjuntos[1].nombre`. **Data**: utilizar la función de Make `toBinary()` sobre `adjuntos[1].contenido_base64`, indicando codificación `base64`. Seleccionar los tokens del webhook, no escribir sus nombres como texto literal. Si el editor muestra campos diferentes, revisar esa pantalla antes de probar el envío.
6. Guardar el módulo y el escenario. Para una prueba manual, pulsar **Run once** y esperar datos nuevos. Para procesar futuros envíos automáticamente, activar el escenario solo después de validar destinatarios y adjunto.

El botón de prueba de conexión no envía correos y no convierte las direcciones ficticias en reales. Sirve también para que Make aprenda la estructura nueva. Un Excel de ejemplo no es una inspección registrada.

## Configuración en Render y uso

- `MAKE_WEBHOOK_URL`: secreto ya configurado. Nunca colocar en `VITE_*`.
- `MAKE_TEST_API_TOKEN`: clave de configuración del servidor. Se introduce una vez en **Administración → Integraciones → Activación de envíos**; la API la intercambia por una sesión firmada de ocho horas. La clave original se borra del formulario y no se guarda en localStorage, sessionStorage, IndexedDB ni el bundle.
- `MAKE_REPORTS_ENABLED=true`: añadir esta variable en Environment si aún no existe; habilitar únicamente después de configurar Outlook como arriba. Por defecto false. `MAKE_TEST_ENABLED` sigue siendo independiente.
- `BERRY_ALLOWED_ORIGINS=https://brycesg96.github.io`.
- `REPORT_REGISTRY_PATH`: por defecto `/tmp/berry-report-receipts.sqlite`; para persistencia operativa requiere una base compartida o un disco persistente.

Primero activar los envíos una vez en Administración → Integraciones. Después, completar la inspección, pulsar Enviar inspección, comprobar Para/CC y pulsar **Enviar informe por correo**, sin introducir claves en cada informe. Primero se consulta la habilitación sin llamar Make. Si está desactivada o la clave es incorrecta, se conserva el borrador. El Excel admite hasta **3 MB**; el JSON hasta 5 MB. La API limita nuevos informes a cinco por minuto. Los fallos de autenticación se limitan también.

Se conserva la opción secundaria **Compartir solo en este navegador** para revisar el flujo local sin enviar correos. El seguimiento de levantamientos todavía se almacena en IndexedDB y no se sincroniza entre dispositivos.

## Estado e idempotencia

El informe se congela localmente antes de solicitar el envío y el resultado queda guardado en Mis inspecciones → Revisar informe. La API usa el UUID de la inspección como `request_id` e `Idempotency-Key`. Repetir ese ID consulta el intento previo: no genera otro POST a Make mientras exista su registro.

Un journal SQLite reclama el ID **antes** de llamar Make. Conserva el hash de metadatos y el recibo; no guarda token, URL privada, Excel ni informe completo. Dos solicitudes iguales simultáneas llaman una sola vez a Make; cambios en los metadatos del mismo ID devuelven conflicto. El primer archivo es el que se envía: una copia regenerada del Excel no produce otro envío. Un intento ambiguo tras reinicio del proceso queda sin confirmar y no se reenvía automáticamente. Los rechazos de Make también quedan registrados; se revisan manualmente antes de plantear otro informe o una recuperación administrativa.

**Límite material del plan gratuito de Render:** el journal sobrevive a reinicios del proceso mientras permanezca el mismo archivo. Un despliegue nuevo, reemplazo del servicio o pérdida del filesystem puede eliminarlo; tampoco es compartido entre réplicas. No garantiza deduplicación permanente ni exactamente una entrega de correo. Antes del uso operativo, conectar almacenamiento persistente/compartido y deduplicación de `request_id` en Make. Revisar el historial antes de reenviar informes previos después de un despliegue.

- **Make aceptó (HTTP 2xx):** el webhook aceptó la solicitud y el adjunto. No confirma que Outlook se haya ejecutado ni que el destinatario haya recibido correo.
- **Rechazado / recepción no confirmada:** consultar la ejecución en Make antes de cualquier reenvío. No hay reintentos automáticos.
- **Resultado de Outlook:** revisar el módulo en Make y el buzón receptor. Falta implementar un retorno autenticado o consulta de estados para mostrar la confirmación de Outlook en la app.

## Acceso en esta fase

Las cuentas, asociaciones y perfiles siguen siendo locales de prueba. La API exige una sesión temporal firmada o la clave compartida de configuración (compatibilidad con clientes anteriores); los roles del navegador no constituyen autenticación Microsoft ni autorización del servidor. El poseedor de la clave puede solicitar envíos a direcciones validadas. Antes de habilitar el uso operativo multiusuario, conectar identidades Microsoft, directorio y asociaciones autoritativas en servidor; entonces ya no se pedirá esta clave compartida a los usuarios.

## Captura de campos nuevos verificada

El 4 de noviembre de 2026 a las 18:07 (Lima), el usuario confirmó el webhook esperando nuevos valores. Se envió una sola prueba ficticia a través de la API local con `outlook` y `adjuntos`; Make respondió HTTP 200 al ID `07e6e0d3-9092-4533-8236-f1b80ab3d560`, con `send_email:false`. Falta confirmar en la pantalla de Make los campos detectados y mapearlos en Outlook. Esto no fue un envío de correo real.

## Sesión de envíos para las pruebas

`POST /api/mail/session` comprueba la clave de configuración en servidor y devuelve un token firmado con HMAC-SHA256, vinculado al origen permitido y con caducidad de ocho horas. La activación no llama Make ni Outlook. La clave original solo viaja por HTTPS para activar la sesión, se borra del campo al terminar y nunca se persiste en el cliente.

El token temporal se guarda en sessionStorage de la pestaña para sobrevivir a recargas. Si sessionStorage no está disponible, se mantiene en memoria y la recarga requiere reactivar. La sesión sirve para varias inspecciones y para las pruebas de Make. Al expirar o ante HTTP 401 se deshabilita localmente; se reactiva desde Administración → Integraciones. No se renueva automáticamente usando otro token temporal.

**Desactivar en esta pestaña** elimina la sesión del cliente; una copia del token que ya existiera conserva su validez hasta caducar. Rotar `MAKE_TEST_API_TOKEN` en Render invalida también todas las sesiones emitidas con la clave anterior. No se utiliza una clave pública embebida ni se abre la API anónimamente.

La habilitación se comparte entre las cuentas locales de prueba de esa pestaña: no identifica a una persona ni reemplaza el inicio de sesión Microsoft o los permisos del servidor. Sigue pendiente sustituirla por autenticación real antes del uso operativo multiusuario. No cambian los controles de deduplicación ni el estado pendiente de confirmación de Outlook.
