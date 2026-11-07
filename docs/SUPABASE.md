# Almacenamiento compartido y trazabilidad

## Alcance solicitado el 7 de noviembre de 2026

El propietario creó la organización Free Berry Safety y el proyecto `berry-safety`, disponible en `https://rwacygoxhkxxxkvushmb.supabase.co`. Proporcionó su clave pública Publishable. El 7 de noviembre ejecutó la migración inicial desde SQL Editor: `berry_schema_status()` respondió HTTP 200 con versión `202611070001`, etapa `foundation` y `sync_ready: false`. Después creó y confirmó su primera cuenta de Auth y mostró el resultado de habilitarla como administradora.

La ruta `?acceso=cuenta` conecta el inicio de sesión por correo/contraseña y el perfil propio con Supabase. Las inspecciones y las cuentas del espacio de pruebas continúan en cada navegador hasta completar funciones de escritura, archivos e importación. Entrar al portal de cuenta no cambia las identidades ni los informes de prueba.

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

La creación de la cuenta o del proyecto de Supabase no sincroniza por sí sola las inspecciones. Este documento distingue el acceso y el perfil ya conectados del guardado y seguimiento de informes todavía pendientes.

## Primera etapa preparada: estructura y permisos

- Cliente: `src/supabase.ts`, con los datos públicos del proyecto en `src/supabase-project.ts` y sustituciones opcionales mediante `VITE_SUPABASE_URL` y `VITE_SUPABASE_PUBLISHABLE_KEY`. Solo acepta una URL HTTPS del proyecto y una clave `sb_publishable_`. Se prepara bajo demanda, con una sesión propia de Berry; no sustituye el selector de cuentas del espacio de pruebas. `.env.example` contiene los nombres de configuración sin ninguna contraseña ni clave privada.
- Script para SQL Editor: [202611070001_foundation.sql](../supabase/migrations/202611070001_foundation.sql). Crea siete tablas `berry_*`: perfiles, inspecciones, destinatarios, levantamientos, documentos, auditoría y textos compartidos. Crea dos buckets privados: `berry-evidence` y `berry-documents`. No importa datos del navegador ni solicita correos.
- Los perfiles nuevos quedan como inspector deshabilitado, incluso si la metadata del usuario intenta declarar que es administrador. La primera cuenta administradora se habilitará desde SQL Editor una vez creada y comprobada su identidad.
- La API permite leer el perfil propio, el directorio habilitado y los registros asignados según las políticas. Solo nombre, área y cargo del perfil propio admiten edición directa. Las escrituras de informes, destinatarios, levantamientos, documentos e historial quedan cerradas hasta implementar las operaciones del servidor con las reglas del flujo.
- Las políticas de acceso de los archivos privados siguen a las inspecciones. Los buckets aún no permiten subir archivos desde la app; esa operación se añadirá junto a sus permisos de escritura. Cada archivo admite hasta 15 MB, dentro de la cuota global del plan Free.
- El historial se registra mediante triggers y no admite escritura ni borrado por cuentas del navegador. Se registran actor autenticado, entidad, operación, fecha y valores anteriores/nuevos; las operaciones del administrador SQL pueden tener actor nulo.
- `berry_schema_status()` es una consulta pública sin datos personales: informa versión `202611070001`, etapa `foundation` y `sync_ready: false`. Sirve para comprobar la instalación sin hacer pasar esta etapa por sincronización completa.

El script otorga explícitamente los permisos necesarios y habilita RLS en las siete tablas; permite trabajar con **Automatically expose new tables** desmarcado. Se ejecuta en una transacción y se puede repetir sin borrar registros ni restablecer los perfiles existentes. La clave Publishable no permite ejecutar DDL; esta primera instalación requiere SQL Editor del propietario.

### Instalación realizada

1. El propietario copió el script completo `supabase/migrations/202611070001_foundation.sql` en SQL Editor y mostró «Success. No rows returned».
2. La comprobación pública confirmó que la estructura está instalada; no creó usuarios ni informes.
3. Creó una cuenta mediante Authentication → Users → Add user → Create new user, conservando su contraseña en privado y con el correo confirmado.
4. SQL Editor habilitó únicamente ese perfil confirmado como administrador; el propietario mostró una fila con `admin` y `enabled: true`. Esta promoción no usa metadata editable ni una función pública de autoasignación.

### Acceso y perfil

- Abrir `https://brycesg96.github.io/berry-safety-sigma/?acceso=cuenta`, también disponible desde Tu perfil o Administración → Inicio de sesión → Iniciar sesión con correo en el espacio de pruebas.
- `CloudAccess.tsx` usa Auth por correo/contraseña, restaura la sesión y permite cerrarla en el dispositivo. No incluye registro público, invitaciones, restablecimiento por correo ni Microsoft. Las contraseñas se envían únicamente a Auth, se vacían del formulario tras el intento y no se guardan en los perfiles o el almacenamiento de la app. El SDK conserva la sesión de Auth con su clave propia.
- `cloud-account.ts` verifica la identidad con `auth.getUser()` y consulta exclusivamente su fila `berry_profiles`. Nombre, área y cargo se guardan en la base real mediante una lista explícita de columnas y RLS; correo, rol y habilitación no son editables. Una identidad autenticada sin perfil habilitado ve únicamente su estado de acceso y puede volver a comprobarlo o cerrar sesión.
- Un fallo al guardar mantiene el texto para reintentar. La salida con cambios pendientes pide confirmación. El guardado no muestra éxito antes de la respuesta del servidor y las respuestas de otra sesión no repueblan el perfil después de salir.
- El portal no carga, importa ni sobrescribe registros de IndexedDB. Entrar desde el espacio de pruebas guarda antes su borrador; al volver se conserva el flujo local y su selector. La confirmación de salida se mantiene entre ambas vistas.
- Pendiente de configuración del propietario: en Authentication → Sign In / Providers, desactivar **Allow new users to sign up** si el piloto utilizará únicamente altas manuales. Las nuevas cuentas permanecen deshabilitadas por defecto aunque el registro público esté permitido. No se ha verificado este ajuste desde la cuenta del propietario.

El siguiente paso funcional es conectar borradores y archivos privados, destinatarios, envíos, levantamientos y revisión a operaciones autenticadas y versionadas. Después se incorporará la importación de los datos locales por identidad verificada.

### Segunda etapa preparada: altas y contraseña temporal

El propietario solicitó que la administración cree cuentas desde la app, con contraseña temporal `0123456789` y cambio obligatorio al primer ingreso. La implementación incluye formulario y listado de cuentas reales en Administración del portal, rutas protegidas de la API de Render y [la segunda migración](../supabase/migrations/202611070002_accounts.sql).

La segunda migración conserva las cuentas existentes. Las nuevas tienen `must_change_password: true` y no pueden leer informes o archivos, editar perfiles ni administrar cuentas hasta completar el cambio. Solo el servidor puede finalizarlo; el navegador no puede quitar el requisito. Se conservan las identidades del actor en auditoría, los reintentos de alta no duplican usuarios ni restablecen contraseñas y el cambio invalida JWT anteriores.

**Pendiente de activación:** ejecutar el script 2 en SQL Editor y configurar `SUPABASE_URL` y `SUPABASE_SECRET_KEY` directamente en Render, desplegando el último código de su API. La clave privada no se coloca en Pages, `VITE_` ni el chat. No se ha recibido ni utilizado una clave privada del proyecto ni creado cuentas reales desde las herramientas. [Pasos completos y límites de esta entrega](USUARIOS.md).

### Verificaciones

`npm run test:supabase` ejecuta diez comprobaciones con PostgreSQL embebido mediante PGlite. Simula únicamente los contratos mínimos de las tablas/plataforma Auth y Storage: el SQL de Berry, RLS, permisos y triggers se ejecutan de verdad. Prueba separación entre autores/destinatarios, cuentas pendientes, rechazo de autoasignación de administrador, archivos privados, auditoría, reintentos, cambio de contraseña y conservación de las cuentas. Estas pruebas no crean usuarios ni informes en el proyecto real.

`tests/supabase-foundation.spec.ts` comprueba el cliente con una API interceptada: abrir el espacio de pruebas no inicia sesión ni cambia su almacenamiento; una consulta explícita reconoce que la estructura sigue sin estar lista para sincronizar. `tests/cloud-access.spec.ts` comprueba el acceso, el perfil, el aislamiento de cuentas locales, fallos de guardado, sesiones entre pestañas y consulta desde un segundo contexto móvil con Auth/API interceptados. Estas pruebas no crean cuentas reales ni envían correo. La ejecución en SQL Editor real está verificada; el inicio de sesión del propietario y la prueba completa de inspecciones con dos dispositivos deben confirmarse al completar cada etapa.
