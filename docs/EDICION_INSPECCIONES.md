# Edición administrativa de inspecciones abiertas

En **Panel de inspecciones → Revisar → Editar inspección**, un administrador puede corregir los campos iniciales del informe: datos generales, responsables del área, inspectores adicionales, observaciones y fotografías, resultados, conclusiones y responsables del registro con sus fechas y firmas. Los informes cerrados conservan la consulta y las descargas.

La autoría original, el identificador, el código confirmado y el registro del envío se conservan. Guardar una edición no reserva otro correlativo ni envía un correo adicional. Los destinatarios nuevos ven la inspección en su cuenta; los retirados pierden su acceso. El cambio y su administrador quedan en la auditoría.

Los levantamientos existentes conservan sus acciones, fechas y evidencias para que los nuevos responsables los continúen. Si cambia el contenido original de una observación, su estado vuelve a **Pendiente**, conservando su avance, y requiere otra revisión. Cambiar únicamente los destinatarios conserva las decisiones existentes. Las observaciones retiradas salen del informe activo y el cambio queda auditado.

El guardado prepara una versión, genera su Excel y lo sube antes de publicar los cambios. La confirmación verifica nuevamente permisos, destinatarios y revisión. Sustituye el documento activo y retira los Excel anteriores de esa inspección, incluso si cambia la fecha y su carpeta mensual. Si falla la subida, sigue activo el documento anterior. Si se interrumpe después de confirmar, **Reintentar guardado** o **Completar actualización del Excel** permite terminar sin duplicar códigos ni correos. Los borradores de edición sin guardar permanecen solamente en la pestaña abierta.

## Activación

1. En Supabase SQL Editor, ejecutar **todo el contenido** de [upgrade-workspace.sql](../supabase/operations/upgrade-workspace.sql). Instala únicamente lo pendiente de los pasos 5 a 10 y conserva los datos. El resultado incluye `admin_edit_version: 202611090010`.
2. En Render, abrir **berry-safety-api → Manual Deploy → Deploy latest commit**. Mantener las variables existentes.
3. Recargar la aplicación y entrar con una cuenta administradora.

El SQL también aplica la ubicación compuesta (Sede, Zona e instalación/actividad) a los nuevos registros. La celda existente «Área inspeccionada» contiene el texto completo. Los informes históricos mantienen su área y ofrecen actualizar sede y zona expresamente. Puerto Morín no aparece entre las opciones.

El autor deja de cambiar directamente el estado de los levantamientos: espera el envío y después aprueba o solicita ajustes. La restricción se aplica también en la función protegida de Supabase. El nombre del responsable permanece en solo lectura, sin candado y con la tipografía normal.

## Verificación

Pruebas de PostgreSQL con roles/RLS y datos ficticios verifican autoría, asignaciones, preservación de avances, rechazo de versiones antiguas, caducidad, requisitos de ubicación, auditoría, correlativos y reemplazo de archivos. Las pruebas de API simulan Auth, Storage y correo; comprueban bytes, código y recuperación de fallos. Las pruebas de navegador cubren edición, cancelación, reintentos, bloqueo de informes cerrados, Excel resultante y teléfono. No crean usuarios ni envían correos reales.
