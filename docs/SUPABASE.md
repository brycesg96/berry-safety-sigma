# Almacenamiento compartido y trazabilidad

## Alcance solicitado el 7 de noviembre de 2026

El propietario creó su cuenta de Supabase y pidió continuar la integración al día siguiente. La captura muestra la pantalla de organizaciones, todavía sin organización ni proyecto. No se ha conectado Supabase a la app. La información actual de inspecciones y cuentas continúa en cada navegador.

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
