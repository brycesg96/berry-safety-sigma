# Inspecciones asignadas y levantamientos

## Probar el flujo actual

La entrega entre cuentas y los levantamientos siguen siendo una demostración local. Las cuentas comparten informes enviados dentro del mismo navegador y origen; abrir otro teléfono, otra sesión privada u otro navegador no sincroniza esos datos. El envío por correo mediante Render, Make y Outlook se gestiona por separado; ver [Envío de informes](ENVIO_INFORMES.md).

1. Con la cuenta autora, completa el informe y pulsa **Enviar inspección → Enviar a destinatarios de prueba**. Todos los correos seleccionados deben pertenecer a cuentas habilitadas en Administración. El envío local conserva los destinatarios, congela el informe y no asigna un número de registro definitivo.
2. Abre **Mi perfil → Cuenta de prueba**, selecciona la cuenta destinataria y cierra el perfil. En **Inspecciones asignadas**, abre el informe. Los borradores sin enviar no aparecen.
3. En cada hallazgo, registra apellidos y nombres del responsable del levantamiento, acción realizada, Fecha de Cierre, **Estado** y registro fotográfico del levantamiento. Antes de registrar un avance, el nombre inicial es el del primer responsable destinatario indicado en la inspección, tanto para el autor como para los destinatarios. No depende de la cuenta que abre la pantalla. Al guardar, se conserva ese nombre o el que haya indicado el encargado, y se muestra igual al autor, destinatarios y en el Excel. La cuenta que guarda el contenido se registra por separado como actor de la operación. Las fotografías originales y las de corrección se conservan por separado. Se pueden guardar avances sin enviarlos a revisión.
4. El estado inicial es **Pendiente**. El destinatario puede guardar **Pendiente** o **Ejecutado** con **Guardar avance**. Al enviar a revisión en Ejecutado, adjunta al menos una evidencia. El estado seleccionado se conserva al enviar y aparece igual en ambas cuentas y en el Excel; no implica aprobación ni cierra la inspección por sí solo.
5. Cambia a la cuenta autora. En **Mis inspecciones**, la tarjeta seleccionable **Pendientes de validación** muestra los informes con levantamientos enviados a revisión. El autor puede aprobar cada uno desde cualquiera de los dos estados, o solicitar ajustes con un comentario obligatorio. **Aprobar levantamiento** cambia automáticamente el estado a **Ejecutado**; **Solicitar ajustes** lo cambia a **Pendiente** en ambas vistas.
6. Mientras la inspección esté abierta, los destinatarios pueden cambiar el estado; el autor espera el levantamiento y lo aprueba o solicita ajustes, incluso durante la revisión o después de una aprobación individual. Cuando el contenido no es editable, se guarda ese cambio con **Guardar estado**, sin modificar acción, responsable, fecha, fotos ni comentario. Cambiar a Pendiente un hallazgo aprobado lo devuelve a revisión; volver a Ejecutado no lo aprueba automáticamente.
7. Solo cuando todos los hallazgos están **aprobados y en Ejecutado**, la inspección aparece como **Cerrada** en la tarjeta seleccionable **Cerradas**. Desde ese momento se bloquean todos los cambios de estado para ambas partes. Descargar un informe no cierra una inspección. Los informes antiguos preparados pero sin envío se muestran como **Sin enviar**.

Cada revisión modifica un hallazgo. El contenido enviado a revisión o aprobado se conserva sin edición; el estado sigue editable para sus destinatarios mientras la inspección esté abierta. Los devueltos admiten nuevas evidencias y reenvío. Una inspección enviada no se puede editar ni eliminar desde el asistente; las operaciones de levantamiento leen el registro más reciente en una transacción y rechazan versiones antiguas. Se deben guardar los avances de cada levantamiento antes de salir. Las cuentas con varios destinatarios colaboran sobre los mismos hallazgos.

La descarga usa la plantilla proporcionada e incluye responsable, fecha, estado y fotografías del levantamiento. Acción a tomar conserva únicamente la medida correctiva solicitada. Acción realizada y Observación del revisor permanecen dentro de la app y no se exportan. Sigue pendiente conservar versiones finales y asignar el número de registro único mediante el servidor.

## Límites y pendientes

Los controles de cuentas y estados del navegador permiten probar la experiencia, pero no sustituyen autenticación ni autorización del servidor. Falta conectar almacenamiento compartido, roles reales, sincronización, avisos por correo, auditoría de cambios y conservación de documentos. La aprobación corresponde al autor de la inspección en este primer flujo; los permisos adicionales del administrador y la reasignación se definirán después.

## Espacio autenticado actual

El flujo actual usa Supabase para sincronizar informes y levantamientos entre cuentas y dispositivos. La sección inicial describe el modo local de pruebas. El nombre del responsable está fijado a la asignación y no se escribe manualmente. El autor no dispone de «Guardar estado»: aprueba el levantamiento o solicita ajustes, que lo devuelve a Pendiente. El cierre almacena el Excel final reemplazando el inicial. La [edición administrativa de informes abiertos](EDICION_INSPECCIONES.md) conserva los avances y permite corregir destinatarios con auditoría.

## Filtros de Mis inspecciones

Las tarjetas **Todas tus inspecciones**, **Borradores**, **Pendientes de atención**, **Pendientes de validación** y **Cerradas** son botones que filtran la lista por estado. Pendientes de atención reúne los informes enviados que siguen abiertos sin un levantamiento pendiente de revisión; Pendientes de validación reúne los que requieren revisión del inspector. La tarjeta seleccionada queda resaltada y también se puede activar con el teclado.

La búsqueda se combina con las fechas y el estado. Los contadores reflejan la búsqueda y las fechas, independientemente de la tarjeta seleccionada. **Todas tus inspecciones** muestra todos los estados de la cuenta actual, manteniendo la búsqueda y las fechas elegidas.

El desplegable de fechas usa el día de la inspección y permite **Todas las fechas**, **Hoy**, **Esta semana**, **Este mes**, **Últimos 30 días** y **Rango de fechas**. Hoy se calcula con la zona horaria de Lima; la semana va de lunes a domingo, el mes comprende el mes calendario y los últimos 30 días incluyen hoy. Los extremos del rango personalizado son inclusivos y se puede indicar solo uno. Si Desde supera a Hasta, se muestra un aviso y no se presentan resultados hasta corregirlo. **Limpiar filtros** restablece la búsqueda, las fechas y el estado.

Se retiró el aviso con candado situado bajo la lista. Estos filtros solo cambian la presentación; no guardan ni modifican inspecciones, borradores, permisos o números de registro.

## Búsqueda de inspecciones asignadas

La sección **Inspecciones asignadas** indica: «Consulta las inspecciones a tu cargo y da seguimiento al levantamiento de sus observaciones». El buscador consulta únicamente las inspecciones asignadas a la cuenta actual. Busca por número de registro, instalación, área, área organizativa del responsable o nombre del inspector, sin distinguir tildes ni mayúsculas. Se combina con las pestañas Pendientes y Cerradas y conserva la búsqueda al alternar entre ambas. Limpiar búsqueda retira solo el texto y mantiene la pestaña elegida. Si no hay coincidencias, se ofrece cambiar el número, área o inspector buscados. Buscar no modifica informes ni permisos.
