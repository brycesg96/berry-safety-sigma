# Almacenamiento compartido y trazabilidad

## Alcance solicitado el 7 de noviembre de 2026

El propietario creó la organización Free Berry Safety y el proyecto `berry-safety`, disponible en `https://rwacygoxhkxxxkvushmb.supabase.co`. Proporcionó su clave pública Publishable. La consulta de configuración de Auth respondió HTTP 200 con esa clave. La configuración y el cliente están preparados; la información actual de inspecciones y cuentas continúa en cada navegador hasta completar autenticación, funciones de escritura e importación.

La prueba debe empezar en el plan Free, sin contratar servicios de pago ni cambiar de plan automáticamente. Referencia oficial consultada: [precios](https://supabase.com/pricing), 1 GB de archivos y 500 MB de base de datos. La duración deseada de la prueba es de aproximadamente dos meses. Controlar especialmente el volumen de fotos, sus originales, firmas y versiones de Excel; conservar información no debe depender de borrados automáticos silenciosos. Un proyecto Free puede pausarse tras una semana de inactividad.

## Información que debe conservarse

- Cuentas, perfiles, áreas, cargos, roles, destinatarios y asociaciones de jefes/gerentes.
- Borradores con todos sus campos, observaciones, fotografías, ediciones de imágenes y firmas, para retomarlos desde otro dispositivo.
- Inspecciones enviadas, sus destinatarios y el documento Excel exacto enviado. Conservar ese archivo como versión del envío; descargarlo posteriormente no debe regenerar ni reemplazar silenciosamente el original.
- Avances del levantamiento: responsable, acción realizada, fecha, estado y evidencias, separados del hallazgo original.
- Solicitudes de revisión, comentarios, ajustes, aprobaciones y cierre, con versiones anteriores disponibles para reconstruir el recorrido completo.
- Intentos de correo, recibos de Make y resultado de entrega cuando exista confirmación. Aceptación HTTP de Make y entrega al buzón son estados distintos.
- Textos compartidos de la última inspección enviada, correlativos confirmados y configuración necesaria para mantener la experiencia entre equipos.

## Acceso y trazabilidad

Los autores y destinatarios deben consultar la misma inspección y sus avances desde laptop o teléfono, según sus permisos. Los borradores permanecen privados para su autor. Identificar personas mediante el usuario autenticado del servidor, manteniendo separados al autor, destinatario, responsable del levantamiento y actor de cada operación. El selector local de cuentas de prueba no autentica a nadie.

Registrar en servidor cada operación relevante con identidad del actor, fecha/hora, inspección, observación afectada, revisión anterior y nueva y datos suficientes para conocer el cambio. El historial no debe poder modificarse directamente desde el navegador. Las fotos, firmas y Excel deben estar en almacenamiento privado y seguir los mismos permisos del informe.

Conservar las reglas actuales: el autor y los destinatarios pueden cambiar Pendiente/Ejecutado mientras la inspección esté abierta; aprobar establece Ejecutado y solicitar ajustes establece Pendiente. Cambiar a Pendiente un hallazgo aprobado lo devuelve a revisión. El cierre requiere todos los hallazgos aprobados en Ejecutado y bloquea posteriores cambios. La revisión de versiones y los permisos se comprueban en servidor, también ante peticiones simultáneas y reintentos.

## Orden de implementación previsto

1. Crear organización y proyecto Free desde la cuenta del propietario y configurar credenciales mediante los ajustes privados correspondientes.
2. Definir acceso autenticado para las cuentas habilitadas, permisos de filas y almacenamiento, y los roles necesarios. El proveedor Microsoft podrá incorporarse al acceso según la configuración disponible.
3. Crear el esquema persistente, almacenamiento de evidencias/documentos y registro de eventos. Separar estados del hallazgo, aprobación y entrega de correo.
4. Conectar cuentas, borradores, envíos, levantamientos y revisión a los datos compartidos. Mostrar si los cambios están guardados en servidor o todavía pendientes de sincronización. Mantener una copia local útil para fallos de conexión.
5. Incorporar versiones de Excel, generación/envío coherentes con el registro, correlativos y deduplicación persistente. Un reintento conserva el mismo envío y archivo.
6. Preparar una importación revisable de los datos existentes en el navegador hacia las cuentas verificadas; no borrar las copias locales hasta confirmar la importación y su consulta desde otro dispositivo.
7. Validar con sesiones de navegador independientes: crear un borrador en un equipo, retomarlo en otro, enviar a un destinatario, registrar y revisar un levantamiento, solicitar ajustes, aprobar y cerrar. Comprobar historial, documentos originales, permisos, guardados simultáneos, cortes de conexión y ausencia de duplicados.

La creación de la cuenta o del proyecto de Supabase no sincroniza por sí sola la aplicación. Este documento registra el alcance acordado; la conexión y las verificaciones siguen pendientes.

## Primera etapa preparada: estructura y permisos

- Cliente: `src/supabase.ts`, con los datos públicos del proyecto en `src/supabase-project.ts` y sustituciones opcionales mediante `VITE_SUPABASE_URL` y `VITE_SUPABASE_PUBLISHABLE_KEY`. Solo acepta una URL HTTPS del proyecto y una clave `sb_publishable_`. Se prepara bajo demanda, con una sesión propia de Berry; no sustituye todavía el selector local de cuentas. `.env.example` contiene los nombres de configuración sin ninguna contraseña ni clave privada.
- Script para SQL Editor: [202611070001_foundation.sql](../supabase/migrations/202611070001_foundation.sql). Crea siete tablas `berry_*`: perfiles, inspecciones, destinatarios, levantamientos, documentos, auditoría y textos compartidos. Crea dos buckets privados: `berry-evidence` y `berry-documents`. No importa datos del navegador ni solicita correos.
- Los perfiles nuevos quedan como inspector deshabilitado, incluso si la metadata del usuario intenta declarar que es administrador. La primera cuenta administradora se habilitará desde SQL Editor una vez creada y comprobada su identidad.
- La API permite leer el perfil propio, el directorio habilitado y los registros asignados según las políticas. Solo nombre, área y cargo del perfil propio admiten edición directa. Las escrituras de informes, destinatarios, levantamientos, documentos e historial quedan cerradas hasta implementar las operaciones del servidor con las reglas del flujo.
- Las políticas de acceso de los archivos privados siguen a las inspecciones. Los buckets aún no permiten subir archivos desde la app; esa operación se añadirá junto a sus permisos de escritura. Cada archivo admite hasta 15 MB, dentro de la cuota global del plan Free.
- El historial se registra mediante triggers y no admite escritura ni borrado por cuentas del navegador. Se registran actor autenticado, entidad, operación, fecha y valores anteriores/nuevos; las operaciones del administrador SQL pueden tener actor nulo.
- `berry_schema_status()` es una consulta pública sin datos personales: informa versión `202611070001`, etapa `foundation` y `sync_ready: false`. Sirve para comprobar la instalación sin hacer pasar esta etapa por sincronización completa.

El script otorga explícitamente los permisos necesarios y habilita RLS en las siete tablas; permite trabajar con **Automatically expose new tables** desmarcado. Se ejecuta en una transacción y se puede repetir sin borrar registros ni restablecer los perfiles existentes. La clave Publishable no permite ejecutar DDL; esta primera instalación requiere SQL Editor del propietario.

### Próxima acción del propietario

1. Abrir SQL Editor del proyecto y crear una consulta nueva.
2. Copiar el script completo `supabase/migrations/202611070001_foundation.sql` y ejecutarlo con Run.
3. Confirmar el resultado de éxito. Después se comprobará `berry_schema_status()` desde la conexión pública.

El siguiente paso será configurar el acceso de usuarios: revisar el registro público, crear la primera cuenta de Auth sin compartir su contraseña y asignarle el rol correcto desde SQL Editor. Después se conectarán las funciones de escritura, las pantallas y la migración de los datos locales.

### Verificaciones

`npm run test:supabase` ejecuta siete comprobaciones con PostgreSQL embebido mediante PGlite. Simula únicamente los contratos mínimos de las tablas/plataforma Auth y Storage: el SQL de Berry, RLS, permisos y triggers se ejecutan de verdad. Prueba separación entre autores/destinatarios, cuentas pendientes, rechazo de autoasignación de administrador, archivos privados, auditoría y repetición del script sin pérdida de datos. Estas pruebas no crean usuarios ni informes en el proyecto real.

`tests/supabase-foundation.spec.ts` comprueba el cliente con una API interceptada: al abrir la app no inicia una sesión ni cambia el modo local; una consulta explícita reconoce que la estructura sigue sin estar lista para sincronizar. La ejecución en SQL Editor real y la prueba con dos dispositivos todavía están pendientes.
