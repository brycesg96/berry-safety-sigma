# Documentos de seguridad: ATS, PETAR y checklists

El apartado **Documentos de seguridad** está disponible en el espacio autenticado. Cada cuenta habilitada puede cargar y consultar sus documentos, aunque no tenga permisos para crear o recibir inspecciones. Las cuentas que solo utilizan documentos entran directamente a este apartado. Administración consulta los envíos del equipo y puede aprobarlos o solicitar correcciones con un comentario.

## Activación — paso 24

1. Requiere las migraciones anteriores, incluido el paso 23.
2. En Supabase → **SQL Editor**, abre una consulta nueva y ejecuta el contenido completo de [202611220024_safety_documents.sql](../supabase/migrations/202611220024_safety_documents.sql).
3. El resultado final debe mostrar `safety_documents_version: 202611220024`.
4. Recarga Berry y entra con una cuenta habilitada. No hay que configurar Render, Make ni claves nuevas.

El script usa una transacción y puede repetirse. Crea una tabla con RLS, el bucket privado `berry-safety-documents` y las operaciones protegidas de registro, revisión y retiro. Conserva las inspecciones, las cuentas, sus permisos y la numeración existentes. La consulta de estado del módulo requiere sesión: sin la migración, la web presenta un estado de preparación y no afirma haber guardado archivos.

## Uso

- Selecciona ATS, PETAR o Checklist, escribe el nombre o actividad e indica la fecha. Lugar de trabajo es opcional.
- Adjunta un archivo PDF, JPG, PNG o WebP de hasta 10 MB. Un PDF puede contener varias páginas; cada registro conserva un archivo.
- Espera la confirmación de registro. Puedes abrir la vista previa o descargar el archivo desde la lista privada.
- Si se pierde la respuesta después de subirlo, **Reintentar envío** conserva el identificador y confirma el mismo registro, sin subir otra copia. Los metadatos permanecen bloqueados durante ese intento para evitar confirmar un contenido diferente.
- Administración abre **Revisar** y puede aprobar o solicitar correcciones. Pedir correcciones requiere un comentario. Una revisión desactualizada conserva el comentario y requiere volver a abrir la versión actual.
- Para una versión corregida se sube un registro nuevo. El comentario y el estado del anterior se conservan.
- El trabajador puede retirar registros pendientes o con correcciones; Administración también puede retirar registros aprobados. Retirar archiva el registro, conserva su trazabilidad y lo oculta de las listas activas.

## Privacidad y persistencia

La autorización se verifica en PostgreSQL y Storage, además de los controles de la interfaz. Un trabajador no puede consultar archivos ajenos, cambiar su aprobación ni sobrescribir archivos registrados. Las cuentas deshabilitadas y las sesiones revocadas no tienen acceso. Se respetan los límites de historial de las cuentas reincorporadas.

Los archivos no se guardan en IndexedDB ni en la caché sin conexión. Vista previa y descarga utilizan la sesión del usuario y direcciones temporales del navegador; la vista previa libera su dirección al cerrarse. Sin conexión se conserva la selección solamente mientras permanezca abierto el formulario; no se presenta como una carga completada.

El cliente comprueba el tamaño y la firma básica del archivo; Storage restringe tamaño y tipos MIME. La función de registro comprueba la existencia y los metadatos almacenados. Estas validaciones no equivalen a un análisis antivirus. Los archivos que quedan subidos sin registro por una conexión interrumpida se conservan para confirmar el mismo intento; el mantenimiento del almacenamiento corresponde a Administración del proyecto.

Las decisiones generan registros en la auditoría del servidor. El módulo no envía correos ni cambia el circuito de notificaciones de inspecciones.

## Verificación

`npm run test:supabase` incluye pruebas reales de RLS y funciones PostgreSQL con usuarios ficticios: aislamiento, permisos, MIME/tamaño, reintentos, revisiones simultáneas, archivo y límites de historial. `tests/safety-documents.spec.ts` comprueba carga, descarga, vista previa, revisión y errores mediante servicios simulados; nunca sube documentos a cuentas reales durante la prueba.
