# Coincidencias, reincorporación y restablecimiento

Agregar Usuario comprueba nombres y correos mediante una consulta exclusiva de administradores. Una coincidencia no concede acceso ni restablece credenciales automáticamente. El administrador identifica la cuenta coincidente y elige explícitamente:

- **Es la misma persona que regresa:** se crea otro usuario de Auth y otro perfil para el período nuevo. Se conserva el `person_id` histórico para agrupar los filtros. No se copian ni reasignan inspecciones, destinatarios, documentos o permisos del acceso anterior.
- **Es otra persona:** se crea otro usuario de Auth y otro `person_id`, aunque coincidan el nombre y el correo con una cuenta eliminada. No se vincula el historial anterior.
- **Restablecer una eliminación por error:** disponible hasta tres meses calendario desde la eliminación, calculados en America/Lima, mientras el acceso anterior no haya sido reemplazado. Reutiliza su UUID anterior, recupera los permisos registrados antes de eliminarla y exige una nueva contraseña personal a partir de una temporal.

Ante la referencia del propietario a «sus pendientes», la restauración personal recupera solo las inspecciones que estaban pendientes cuando se eliminó la cuenta, incluyendo borradores propios y asignaciones existentes, y permite trabajar en registros nuevos. Las inspecciones que ya estaban cerradas al eliminarla no reaparecen en el espacio personal. Una segunda restauración no amplía un ámbito que ya estaba limitado. Los permisos de revisión global de Gestión de Inspecciones siguen siendo una atribución administrativa independiente: el rol administrador no se obtiene por una coincidencia de identidad.

Un correo de una cuenta vigente no se puede reutilizar para otra identidad activa. Las coincidencias por nombre con correos diferentes se pueden tratar como personas distintas. El plazo se comprueba nuevamente en el servidor, no depende de la fecha del navegador y no se extiende dejando una solicitud abierta.

## Separación entre identidad y acceso

`berry_profiles.id` sigue siendo el UUID de Auth que controla autoría, destinatarios, correcciones, archivos y cachés por cuenta. `person_id` solo agrupa a la misma persona en los filtros administrativos; nunca sustituye a `auth.uid()` ni a los UUID de destinatarios en los controles de acceso. Los perfiles actuales de una persona tienen una restricción de unicidad. La identidad histórica no se deduce de nombres o correos.

Si se necesita liberar el correo de un acceso eliminado, la API verifica la operación administrativa y retira su login de Auth con un correo técnico no utilizable, una contraseña aleatoria y un bloqueo. El correo original permanece en `contact_email` y en los informes históricos. La base solo confirma esa fase después de verificar el marcador del servidor en Auth. No se adopta un usuario existente por su correo. Una cuenta vigente no puede pasar por esta retirada.

La restauración accidental requiere otro marcador de Auth, invalida los tokens previos mediante la fecha de credenciales y mantiene el cambio de contraseña obligatorio. Sus inspecciones pendientes se conservan en una concesión privada explícita; las políticas de lectura, documentos y RPC del flujo comprueban ese ámbito. Los usuarios normales no pueden leer o escribir las tablas privadas de operaciones ni modificar su `person_id` o ámbito histórico.

## Reintentos y filtros

Cada intento usa una operación persistente. Un error de red conserva la elección y permite continuar con los mismos datos. Al volver desde otro navegador se muestra la solicitud pendiente y se retoma su opción original; no se permiten cambios de identidad a mitad de una retirada. Otro administrador habilitado puede retomar una operación pendiente con sus mismos datos; ese cambio de responsable queda auditado. Una restauración vencida se cancela como solicitud de restauración y deja disponibles las otras modalidades, sin habilitar la cuenta.

Al repetir una operación completada se devuelve su resultado, sin crear otro usuario ni reiniciar su contraseña personal. Los filtros administrativos agrupan los distintos accesos de una misma persona en una opción y mantienen separadas a personas diferentes. Si sus nombres y correos coinciden, el texto diferencia cuenta actual y registro anterior con contexto adicional. Los criterios usan identidades estables, no la igualdad del correo.

## Activación

El [paso 15](../supabase/migrations/202611150015_account_identity.sql) requiere el catálogo del paso 14 y conserva las inspecciones, archivos, numeración y autorías. La web detecta `account_identity_version` antes de utilizar el flujo nuevo, por lo que conserva el alta anterior hasta activarlo.

1. Desplegar en Render la versión actualizada de `berry-safety-api`.
2. Ejecutar en SQL Editor de Supabase el [script preparado con los pasos 13–15](../supabase/operations/activate-20261115.sql), sobre el proyecto con los pasos 1–12 instalados.
3. Abrir o recargar la web publicada.

El script puede repetirse sin reimportar la semilla ni deshacer modificaciones de gerencias, identidades o cuentas ya completadas. Las pruebas de PostgreSQL ejecutan RLS, permisos, auditoría, límites de restauración y denegación de archivos y registros antiguos; los tests de API verifican los cambios de Auth y su recuperación ante errores.
