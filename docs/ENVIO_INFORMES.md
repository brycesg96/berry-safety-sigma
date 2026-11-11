# Envío de informes por Make y Outlook

## Qué está conectado

Enviar inspección abre un formulario de envío real con los responsables elegidos como destinatarios Para. El administrador puede asociar correos de jefes o gerentes a cada cuenta en Administración → Cuentas permitidas → Correos de jefes y gerentes (CC). Son direcciones para copia, no altas de usuarios ni permisos. Se validan y deduplican; quienes ya estén en Para no se repiten en CC. La lista de CC se fija en el primer intento de correo del informe y se conserva en intentos posteriores.

El navegador genera el mismo Excel que usa Descargar Excel, con la plantilla entregada por el propietario, observaciones, fotografías, cierre y responsables del registro. No se asigna ni consume un código IH definitivo al enviar. La numeración central sigue pendiente.

La web llama al backend Node por HTTPS: `POST /api/inspections/send`. La URL privada de Make permanece en `MAKE_WEBHOOK_URL` del servidor. El backend valida los campos, genera un mensaje HTML general y asunto, y envía el Excel en base64 con los destinatarios. No utiliza el cuerpo HTML aportado por un navegador.

El asunto indica área y fecha. El cuerpo utiliza la redacción del propietario, pide revisar el Excel adjunto y muestra área, instalación, fecha y hasta tres compañeros SIGMA. Las observaciones detalladas están en el Excel, no en el mensaje.

## Configuración en Make

Mantener el filtro **send_email igual al booleano true AND mode distinto de test**. Los informes reales llevan `mode:inspection` y `send_email:true`; las pruebas de conexión continúan con `mode:test` y `send_email:false`.

1. Abrir el Custom webhook y seleccionar **Detect new values / Redetermine data structure**. Con el webhook escuchando, usar **Administración → Integraciones → Preparar otra prueba → Probar conexión con Make**. El ejemplo ahora incluye arrays de Outlook y un Excel ficticio válido. No utiliza direcciones reales ni debe pasar el filtro.
2. En **Outlook → To Recipients**, activar **Map** y seleccionar **outlook → para[]**. La colección contiene elementos con `address` (correo) y `name`. Quitar el destinatario fijo de prueba. Verificar en el editor los nombres de los subcampos de la colección; no utilizar el array de textos `destinatarios.para` como una única dirección.
3. En **CC Recipients**, activar **Map** y seleccionar **outlook → cc[]**. Se admite colección vacía. CCO puede quedar vacío.
4. **Subject**: mapear `asunto`. **Body Content**: mapear `cuerpo_html`. **Body Content Type**: HTML.
5. En **Attachments**, añadir un elemento. **File Name**: seleccionar el token `nombre` del primer adjunto. En **Data**, borrar el contenido anterior e insertar la función de Make `toBinary()`; su primer argumento es el token `contenido_base64` del primer adjunto y el segundo es la codificación `base64`. La conversión debe ser una expresión evaluada por Make, no texto añadido al token. Con el webhook número 1, una expresión completa es `{{toBinary(get(1.adjuntos; "1.contenido_base64"); "base64")}}`. Conservar los paréntesis y la función; no dejar `; base64` escrito fuera de ella.
6. Guardar el módulo y el escenario. Para una prueba manual, pulsar **Run once** y esperar datos nuevos. Para procesar futuros envíos automáticamente, activar el escenario solo después de validar destinatarios y adjunto.

El botón de prueba de conexión no envía correos y no convierte las direcciones ficticias en reales. Sirve también para que Make aprenda la estructura nueva. Un Excel de ejemplo no es una inspección registrada.

### Diagnóstico confirmado de adjunto ilegible

El propietario proporcionó un adjunto que Excel y Outlook rechazaban por formato/extensión. Sus 138352 bytes eran texto que comenzaba por `UEsDB` y terminaba literalmente en `; base64`. Al retirar ese sufijo y decodificar el texto se recuperó un XLSX de 103757 bytes, ZIP íntegro y legible, con dos hojas y cuatro imágenes. Esto confirma que el adjunto se había enviado como texto sin aplicar la conversión binaria; no se resuelve cambiando la extensión del archivo.

El archivo reparado permanece en los adjuntos privados del espacio de trabajo; no se publica en Pages ni en el repositorio. Falta aplicar la expresión correcta en el campo Data del escenario y comprobar un nuevo adjunto recibido. Corregir el escenario no modifica archivos de correos ya enviados. Repetir el mismo ID desde la app tampoco vuelve a enviar el informe por la deduplicación existente.

## Configuración en Render y uso

- `MAKE_WEBHOOK_URL`: secreto ya configurado. Nunca colocar en `VITE_*`.
- `MAKE_TEST_API_TOKEN`: configuración privada que se conserva en Render para los clientes antiguos y el modo autenticado. El modo prototipo global no pide esta clave al usuario ni la incluye en el navegador.
- `BERRY_PROTOTYPE_MODE`: el valor predeterminado del proyecto es `true`, por petición del propietario para la presentación. Cualquier dispositivo que abra la web puede enviar sin activación local. Poner `false` restaura la exigencia de credenciales del servidor; la autenticación real para producción sigue pendiente.
- `MAKE_REPORTS_ENABLED=true`: añadir esta variable en Environment si aún no existe; habilitar únicamente después de configurar Outlook como arriba. Por defecto false. `MAKE_TEST_ENABLED` sigue siendo independiente.
- `BERRY_ALLOWED_ORIGINS=https://brycesg96.github.io`.
- `REPORT_REGISTRY_PATH`: por defecto `/tmp/berry-report-receipts.sqlite`; para persistencia operativa requiere una base compartida o un disco persistente.

Completar la inspección, pulsar Enviar inspección, comprobar Para/CC y pulsar **Enviar informe por correo**. No se pide clave ni activación, tampoco al cambiar de navegador, PC o teléfono. Primero se consulta la habilitación sin llamar Make. Si está desactivada o la clave es incorrecta, se conserva el borrador. El Excel admite hasta **3 MB**; el JSON hasta 5 MB. La API limita nuevos informes a cinco por minuto. Los fallos de autenticación se limitan también.

Se conserva la opción secundaria **Compartir solo en este navegador** para revisar el flujo local sin enviar correos. El seguimiento de levantamientos todavía se almacena en IndexedDB y no se sincroniza entre dispositivos.

## Estado e idempotencia

El informe se congela localmente antes de solicitar el envío y el resultado queda guardado en los datos de la inspección. La vista de seguimiento no muestra el bloque de correo, CC ni los detalles de Make: está dedicada al registro y revisión de levantamientos. El formulario de envío permanece en Enviar inspección. La API usa el UUID de la inspección como `request_id` e `Idempotency-Key`. Repetir ese ID consulta el intento previo: no genera otro POST a Make mientras exista su registro.

Un journal SQLite reclama el ID **antes** de llamar Make. Conserva el hash de metadatos y el recibo; no guarda token, URL privada, Excel ni informe completo. Dos solicitudes iguales simultáneas llaman una sola vez a Make; cambios en los metadatos del mismo ID devuelven conflicto. El primer archivo es el que se envía: una copia regenerada del Excel no produce otro envío. Un intento ambiguo tras reinicio del proceso queda sin confirmar y no se reenvía automáticamente. Los rechazos de Make también quedan registrados; se revisan manualmente antes de plantear otro informe o una recuperación administrativa.

**Límite material del plan gratuito de Render:** el journal sobrevive a reinicios del proceso mientras permanezca el mismo archivo. Un despliegue nuevo, reemplazo del servicio o pérdida del filesystem puede eliminarlo; tampoco es compartido entre réplicas. No garantiza deduplicación permanente ni exactamente una entrega de correo. Antes del uso operativo, conectar almacenamiento persistente/compartido y deduplicación de `request_id` en Make. Revisar el historial antes de reenviar informes previos después de un despliegue.

- **Make aceptó (HTTP 2xx):** el webhook aceptó la solicitud y el adjunto. No confirma que Outlook se haya ejecutado ni que el destinatario haya recibido correo.
- **Rechazado / recepción no confirmada:** consultar la ejecución en Make antes de cualquier reenvío. No hay reintentos automáticos.
- **Resultado de Outlook:** revisar el módulo en Make y el buzón receptor. Falta implementar un retorno autenticado o consulta de estados para mostrar la confirmación de Outlook en la app.

## Acceso global para la presentación

Por petición expresa del propietario, el proyecto funciona como **prototipo global sin autenticación de envíos**: no depende de una sesión, del navegador, de una cuenta Microsoft ni de un token público embebido. No se publican la URL de Make ni la clave privada de Render. La app llama al backend sin Authorization y el backend llama al webhook configurado en el servidor.

Cualquier persona que abra la web del prototipo puede utilizar este envío. Se conserva la validación de datos y adjuntos, el límite de cinco informes nuevos por minuto y la deduplicación por ID. Se exige el origen web permitido; CORS no constituye autenticación y no evita clientes externos que construyan solicitudes con ese origen. Las cuentas y asociaciones siguen siendo locales de prueba.

Los interruptores globales `MAKE_REPORTS_ENABLED` y `MAKE_TEST_ENABLED` siguen funcionando independientemente. `BERRY_PROTOTYPE_MODE=false` desactiva el acceso global y restaura la autorización del servidor para los clientes autenticados anteriores. Antes del uso operativo multiusuario, sustituir el acceso del prototipo por Microsoft y autorización real en servidor.

La API de sesiones anterior se conserva por compatibilidad durante el despliegue, pero la web nueva no la utiliza ni guarda credenciales o tokens de correo en el navegador. El bloqueo de activación que deshabilitaba Enviar informe por correo fue retirado completamente.

## Cuerpo del correo acordado

Se ha registrado una inspección de seguridad y salud en el trabajo correspondiente a:

**Área e instalación:** [Área] / [Instalación]

**Fecha de inspección:** [DD.MM.AAAA]

**Compañeros SIGMA:** [Nombre 1], [Nombre 2] y [Nombre 3]

Encontrarán el registro de la inspección en el **archivo Excel adjunto**. Por favor, revisen los hallazgos y gestionen las acciones propuestas para su atención y seguimiento.

**Berry Safety**

Estos valores se rellenan automáticamente. Con una sola persona se usa «Compañero SIGMA»; con dos o tres, «Compañeros SIGMA». Se utiliza el mismo equipo del apartado Realizado por, incluido el autor, y esos participantes no se añaden automáticamente como destinatarios. `inspection.inspectors` admite de una a tres personas distintas, empezando por el autor; los clientes anteriores que omiten el campo conservan la mención del inspector principal.

Si la inspección no tiene una instalación separada, se muestra solo el área y se omite la barra. El HTML conserva el escape de los datos de área, instalación y compañeros. El cuerpo ya no incluye saludo, «BR Sigma» ni el aviso de código pendiente. Make sigue usando `cuerpo_html`, sin modificar el mapeo. La nueva redacción requiere desplegar la última versión del backend en Render.

El asunto se conserva: `Informe de inspección de seguridad - [Área] - [AAAA-MM-DD]`.

## Plantilla y textos reutilizables (6 de noviembre de 2026)

El Excel usa el formato entregado por el propietario, con su hoja de valoración, tamaños y ajustes de impresión. Descarga y adjunto usan el mismo generador. El nombre se deriva tanto en navegador como en API con `shared/report-filename.mjs`: `REG_INS_ÁREA EN MAYÚSCULAS_DD.MM.AAAA.xlsx`, tomando la fecha de inspección. El Dockerfile incluye esa carpeta compartida.

Desde el 11 de noviembre, objetivo, descripción de la causa y conclusiones se reutilizan por cuenta. Una cuenta sin historial propio empieza con los tres campos vacíos. Solo Guardar o confirmar el envío con éxito actualiza los textos recordados; escribir sin guardar no lo hace. Los borradores existentes conservan su contenido y los informes recibidos nunca proporcionan textos para nuevas inspecciones. En otra sesión se recuperan de los registros guardados del autor. La copia del navegador también está separada por identificador de cuenta y se ignora la antigua copia global sin dueño verificable.

La consulta histórica de solo lectura `POST /api/inspections/send` con `{ "action": "inspection.defaults" }` permanece disponible por compatibilidad, pero la interfaz actual no la consume ni consulta `berry_shared_texts`. No se requiere migración SQL para separar los textos de las cuentas. Las precargas sin otras modificaciones no generan borradores vacíos.

El servidor conserva por compatibilidad el recibo y los textos históricos de informes aceptados por Make en SQLite. Una consulta, un rechazo o un reintento de un ID ya recibido no sustituye ese registro. La aceptación de Make sigue sin confirmar entrega a Outlook. Esta copia histórica compartida no se utiliza para completar formularios actuales.

El SQLite del prototipo vive por defecto en `/tmp` y Render puede eliminarlo al sustituir la instancia. Los textos personales del espacio de trabajo autenticado se recuperan de las inspecciones guardadas en Supabase, sin depender de esa copia histórica de SQLite.
