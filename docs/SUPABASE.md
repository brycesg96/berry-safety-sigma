# Almacenamiento compartido y trazabilidad

## Alcance solicitado el 7 de noviembre de 2026

El propietario creó la organización Free Berry Safety y el proyecto `berry-safety`, disponible en `https://rwacygoxhkxxxkvushmb.supabase.co`. Proporcionó su clave pública Publishable. El 7 de noviembre ejecutó la migración inicial desde SQL Editor: `berry_schema_status()` respondió HTTP 200 con versión `202611070001`, etapa `foundation` y `sync_ready: false`. Después creó y confirmó su primera cuenta de Auth y mostró el resultado de habilitarla como administradora.

La ruta `?acceso=cuenta` conecta el inicio de sesión por correo/contraseña con Supabase. En la etapa de informes, el ingreso normal abre directamente **Mis inspecciones**; el perfil y la administración se abren desde **Tu perfil → Ir a mi cuenta**. La tercera etapa conecta las nuevas inspecciones, evidencias y levantamientos al espacio de trabajo autenticado. Su activación requiere el script 3 y desplegar la API actualizada. Las inspecciones y cuentas anteriores del espacio de pruebas permanecen en su navegador y no se importan automáticamente. Entrar al portal de cuenta no cambia las identidades ni los informes de prueba.

La prueba debe empezar en el plan Free, sin contratar servicios de pago ni cambiar de plan automáticamente. Referencia oficial consultada: [precios](https://supabase.com/pricing), 1 GB de archivos y 500 MB de base de datos. La duración deseada de la prueba es de aproximadamente dos meses. Controlar especialmente el volumen de fotos, sus originales, firmas y versiones de Excel; conservar información no debe depender de borrados automáticos silenciosos. Un proyecto Free puede pausarse tras una semana de inactividad.

## Información que debe conservarse

- Cuentas, perfiles, áreas, cargos, roles, destinatarios y asociaciones de jefes/gerentes.
- Borradores con todos sus campos, observaciones, fotografías, ediciones de imágenes y firmas, para retomarlos desde otro dispositivo.
- Inspecciones enviadas, sus destinatarios y el Excel enviado mientras estén abiertas. Según la decisión posterior del propietario, al aprobar todos los levantamientos el Excel final sustituye al inicial: queda un único documento alojado. La trazabilidad de los datos se conserva en auditoría.
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
2. Definir acceso autenticado con correo y contraseña de Supabase, permisos de filas y almacenamiento, y los roles necesarios. El propietario retiró la propuesta de Microsoft el 8 de noviembre de 2026.
3. Crear el esquema persistente, almacenamiento de evidencias/documentos y registro de eventos. Separar estados del hallazgo, aprobación y entrega de correo.
4. Conectar cuentas, borradores, envíos, levantamientos y revisión a los datos compartidos. Mostrar si los cambios están guardados en servidor o todavía pendientes de sincronización. Mantener una copia local útil para fallos de conexión.
5. Incorporar versiones de Excel, generación/envío coherentes con el registro, correlativos y deduplicación persistente. Un reintento conserva el mismo envío y archivo.
6. Preparar una importación revisable de los datos existentes en el navegador hacia las cuentas verificadas; no borrar las copias locales hasta confirmar la importación y su consulta desde otro dispositivo.
7. Validar con sesiones de navegador independientes: crear un borrador en un equipo, retomarlo en otro, enviar a un destinatario, registrar y revisar un levantamiento, solicitar ajustes, aprobar y cerrar. Comprobar historial, documentos originales, permisos, guardados simultáneos, cortes de conexión y ausencia de duplicados.

La creación de la cuenta o del proyecto de Supabase no sincroniza por sí sola las inspecciones. Este documento distingue el acceso y las cuentas ya activados de la tercera migración preparada y pendiente de ejecutar en el proyecto real.

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

- Abrir `https://brycesg96.github.io/berry-safety-sigma/?acceso=cuenta`, también disponible desde Tu perfil o Administración → Usuarios → Administrar usuarios en el espacio de pruebas.
- `CloudAccess.tsx` usa Auth por correo/contraseña, restaura la sesión y permite cerrarla en el dispositivo. No incluye registro público, invitaciones, restablecimiento por correo ni Microsoft. Las contraseñas se envían únicamente a Auth, se vacían del formulario tras el intento y no se guardan en los perfiles o el almacenamiento de la app. El SDK conserva la sesión de Auth con su clave propia.
- `cloud-account.ts` verifica la identidad con `auth.getUser()` y consulta exclusivamente su fila `berry_profiles`. Nombre, área y cargo se guardan en la base real mediante una lista explícita de columnas y RLS; correo, rol y habilitación no son editables. Una identidad autenticada sin perfil habilitado ve únicamente su estado de acceso y puede volver a comprobarlo o cerrar sesión.
- Un fallo al guardar mantiene el texto para reintentar. La salida con cambios pendientes pide confirmación. El guardado no muestra éxito antes de la respuesta del servidor y las respuestas de otra sesión no repueblan el perfil después de salir.
- El portal no carga, importa ni sobrescribe registros de IndexedDB. Entrar desde el espacio de pruebas guarda antes su borrador; al volver se conserva el flujo local y su selector. La confirmación de salida se mantiene entre ambas vistas.
- Pendiente de configuración del propietario: en Authentication → Sign In / Providers, desactivar **Allow new users to sign up** si el piloto utilizará únicamente altas manuales. Las nuevas cuentas permanecen deshabilitadas por defecto aunque el registro público esté permitido. No se ha verificado este ajuste desde la cuenta del propietario.

La tercera etapa descrita abajo incorpora las operaciones autenticadas y versionadas de inspecciones. La importación revisable de los datos locales por identidad verificada sigue pendiente.

### Segunda etapa preparada: altas y contraseña temporal

El propietario solicitó que la administración cree cuentas desde la app, con contraseña temporal `0123456789` y cambio obligatorio al primer ingreso. La implementación incluye formulario y listado de cuentas reales en Administración del portal, rutas protegidas de la API de Render y [la segunda migración](../supabase/migrations/202611070002_accounts.sql).

La segunda migración conserva las cuentas existentes. Las nuevas tienen `must_change_password: true` y no pueden leer informes o archivos, editar perfiles ni administrar cuentas hasta completar el cambio. Solo el servidor puede finalizarlo; el navegador no puede quitar el requisito. Se conservan las identidades del actor en auditoría, los reintentos de alta no duplican usuarios ni restablecen contraseñas y el cambio invalida JWT anteriores.

**Activación confirmada el 8 de noviembre:** el propietario ejecutó el script 2 y mostró el despliegue de Render del commit `6fde0aa` como Live. La API pública confirmó `accounts_version: 202611070002`; la API de Render respondió salud HTTP 200, preflight de cuentas HTTP 204 y `SESSION_REQUIRED` HTTP 401 sin sesión. La verificación de una alta real y su primer ingreso debe hacerla el propietario desde su sesión. La clave privada se introdujo directamente en Render; no se ha recibido por chat ni se han creado cuentas reales desde las herramientas. [Pasos completos y límites de esta entrega](USUARIOS.md).

### Archivo por año y mes acordado el 8 de noviembre

Los documentos se organizarán automáticamente en el bucket privado `berry-documents` por **fecha de inspección**: `2026/11-NOVIEMBRE`, `2026/12-DICIEMBRE`, `2027/01-ENERO`. Una inspección de noviembre enviada en diciembre permanece en noviembre. Las carpetas son prefijos de los archivos de Storage; no requieren crearlas manualmente ni mantener tareas de fin de mes.

`shared/archive-path.mjs` valida la fecha y compone la ruta. El identificador de inspección y el hash de los bytes separan informes con el mismo nombre y conservan las versiones sin sobrescribir el Excel enviado. El correlativo acordado es anual y compartido: `IH-2026-001`, `IH-2026-002`; cambia a `IH-2027-001` al comenzar el año del registro en hora de Perú. Descargar borradores y probar usuarios no consume números. La conexión de registro, archivo y envío debe conservar una misma inspección, código y archivo al reintentar.

### Verificaciones

`npm run test:supabase` ejecuta diecisiete comprobaciones con PostgreSQL embebido mediante PGlite. Simula únicamente los contratos mínimos de las tablas/plataforma Auth y Storage: el SQL de Berry, RLS, permisos y triggers se ejecutan de verdad. Prueba separación entre autores/destinatarios, cuentas pendientes, rechazo de autoasignación de administrador, archivos privados, auditoría, reintentos, cambio de contraseña y conservación de las cuentas. Estas pruebas no crean usuarios ni informes en el proyecto real.

`tests/supabase-foundation.spec.ts` comprueba el cliente con una API interceptada: abrir el espacio de pruebas no inicia sesión ni cambia su almacenamiento; una consulta explícita reconoce que la estructura sigue sin estar lista para sincronizar. `tests/cloud-access.spec.ts` comprueba el acceso, el perfil, el aislamiento de cuentas locales, fallos de guardado, sesiones entre pestañas y consulta desde un segundo contexto móvil con Auth/API interceptados. Estas pruebas no crean cuentas reales ni envían correo. La ejecución en SQL Editor real está verificada; el inicio de sesión del propietario y la prueba completa de inspecciones con dos dispositivos deben confirmarse al completar cada etapa.


## Tercera etapa: espacio de trabajo compartido y archivo mensual

Implementación preparada el 8 de noviembre. **Activación confirmada por el propietario:** mostró «Success. No rows returned» del script 3 y Render `6e0639a` como Live el 8 de noviembre. La prueba operativa desde sus cuentas permanece pendiente. No requiere claves nuevas, carpetas manuales, cambio de plan ni cambios en Make.

### Activación única

1. Abrir [202611080003_reports.sql en texto](https://raw.githubusercontent.com/brycesg96/berry-safety-sigma/main/supabase/migrations/202611080003_reports.sql). Copiar **todo el contenido SQL**, no pegar la dirección del enlace.
2. Supabase → SQL Editor → nueva consulta → pegar el contenido completo y ejecutar. El script requiere los pasos 1 y 2 ya instalados, usa una transacción, habilita RLS y conserva los datos existentes. No ejecutar otra vez los scripts 1 o 2 sobre esta etapa: sus guardas impiden restablecer reglas anteriores.
3. Render → berry-safety-api → Manual Deploy → Deploy latest commit. Conservar las variables privadas actuales y esperar «Live».
4. Recargar `https://brycesg96.github.io/berry-safety-sigma/?acceso=cuenta`, entrar con la cuenta real, completar/guardar el perfil y pulsar **Entrar al espacio de trabajo**. El botón aparece cuando `berry_schema_status()` devuelve `reports_version: 202611080003` y `sync_ready: true`.
5. Probar un borrador en una laptop y retomarlo con la misma cuenta en un teléfono. Las cuentas creadas en Administración usan primero la contraseña temporal y deben cambiarla antes de acceder a datos. El correo de prueba real lo solicita el propietario desde su sesión; las herramientas de validación no envían correos.

### Datos y archivos

- El directorio de este espacio usa solo los perfiles habilitados reales. Los borradores son privados del autor; después del registro, los destinatarios asignados ven el mismo informe, fotografías y levantamientos desde cualquier dispositivo con su sesión.
- Se guardan todos los campos, firmas, fotografías procesadas y originales editables en tablas y buckets privados. Las imágenes usan referencias de Storage; no se meten imágenes base64 en JSON ni en la auditoría. La copia local de ediciones pendientes protege fallos de conexión, sin convertir el selector local en una identidad válida.
- Cada guardado comprueba una revisión. Dos dispositivos no sobrescriben cambios silenciosamente: el obsoleto conserva su edición y puede reintentar o pulsar Abrir versión guardada; esa sustitución exige confirmación en la app. Las listas se actualizan al abrirlas, recuperar el foco y cada 20 segundos mientras están visibles. El formulario de seguimiento se actualiza al volver a abrir para preservar ediciones que todavía no se han guardado.
- El envío exige JWT verificado en `/api/reports/send`, aunque esté habilitado el prototipo. Usa el UUID estable, la revisión guardada y el hash del Excel. La base reserva temporalmente un candidato anual sin consumir número; Render valida el ZIP, modifica exclusivamente B5 con el código, guarda el archivo inmutable y finaliza la transacción que confirma código, destinatarios, documento y trabajo de correo.
- Si falla el archivo, el contador no avanza. Una reserva dura 90 segundos y serializa brevemente registros del mismo año. Un cambio de año regenera el candidato antes de confirmar. Los códigos admiten 1000 y más; el año corresponde al registro en Perú, mientras la carpeta corresponde siempre a la fecha de inspección.
- Ruta de ejemplo: `berry-documents/2026/11-NOVIEMBRE/{inspección}/{sha256}/REG_INS_TALLER_05.11.2026.xlsx`. Los prefijos aparecen al guardar el primer archivo de ese mes. El hash y el UUID evitan colisiones. Al completar el paso 4, el cierre sustituye el archivo inicial por el final y retira el objeto anterior.
- El Excel adjunto es exactamente el archivo almacenado, verificado por SHA-256. Descargar Excel antes de cualquier levantamiento recupera ese original; después de registrar levantamientos genera el informe actualizado a partir de los datos compartidos. El PDF del registro cerrado se genera al descargar con el formato existente del informe. Con el paso 4, el Excel final se almacena al aprobar todas las observaciones y sustituye al inicial. No se archiva automáticamente cada PDF descargado.
- El correo mantiene el cuerpo aprobado, los tres compañeros SIGMA, el asunto y el nombre del adjunto. El trabajo persistente se reclama una sola vez antes de llamar Make: doble clic, reinicio o respuesta perdida no duplican correos. Un rechazo o resultado ambiguo conserva el informe y su código; no hay reenvío automático. «Comprobar envío» puede procesar un trabajo que siga en cola, pero nunca repite uno ya reclamado. La aceptación HTTP no confirma entrega a Outlook. Un cierre abrupto entre reclamar y llamar Make puede requerir revisión manual del envío.
- Autor y destinatarios mantienen los selectores Pendiente/Ejecutado hasta cerrar; aprobar pone Ejecutado y solicitar ajustes pone Pendiente. Solo la aprobación de todos los hallazgos en Ejecutado cierra y bloquea el informe. La auditoría conserva los actores y las versiones anteriores/nuevas de informes, asignaciones, documentos y levantamientos. No se incluye todavía una pantalla para explorar ese historial; los registros permanecen protegidos en la base.

### Conservación de pruebas anteriores

El espacio de pruebas y su IndexedDB permanecen accesibles. Esta entrega no transforma automáticamente cuentas locales en usuarios verificados ni migra inspecciones históricas; requiere un mapeo revisable. El administrador real `bryx96@gmail.com` y el correo de demostración `bryx.96@gmail.com` son identidades distintas. El envío del prototipo sigue disponible pero no reserva códigos oficiales ni archiva en Supabase. Para probar la nueva persistencia se debe entrar en el espacio autenticado.

### Validación de esta etapa

17 comprobaciones ejecutan SQL, roles, RLS y triggers de Berry en PostgreSQL embebido, con contratos mínimos de Auth/Storage. Incluyen idempotencia, auditoría, privacidad, guardados obsoletos, archivos huérfanos, mes de inspección, correlativos entre meses, cambio anual, secuencia 1000, revisión/cierre y preservación al repetir migraciones. Las 39 comprobaciones de API incluyen los bytes exactos archivados/adjuntos, Excel legible con CRC, rechazo de acceso, fallo de subida, reinicios y resultados ambiguos sin correo duplicado. Las 60 pruebas de navegadores interceptan los servicios externos con datos ficticios, comprueban dos dispositivos y ambos roles, y no crean cuentas ni correos reales. La activación remota y una prueba operativa desde las cuentas del propietario siguen siendo necesarias.


## Cuarta etapa: un único Excel final después del cierre

El propietario solicitó expresamente retirar el archivo inicial al aprobar **todas** las observaciones. [202611080004_final_archive.sql](../supabase/migrations/202611080004_final_archive.sql) añade ese reemplazo al paso 3 ya instalado. Esta etapa necesita ejecutar solo el script 4 y desplegar la API más reciente en Render, conservando sus variables. El paso 3 incorpora una guarda para impedir que una consulta antigua restablezca el estado de esta versión.

La aprobación completa cierra el informe con todos sus estados en Ejecutado. La app genera el Excel con los hallazgos originales, acciones realizadas, comentario del revisor cuando exista, responsables, fechas, estados, fotografías y firmas. Las acciones y comentarios se añaden a la celda de la medida correctiva, conservando la plantilla. El servicio autenticado valida el paquete y el código, guarda el final en el mismo año/mes de inspección y actualiza **la misma fila** de documento. Un índice único impide tener dos filas de Excel para una inspección.

Después retira de Storage el objeto inicial y confirma `final_excel_stored`. Queda un único Excel alojado y las descargas de autor y destinatarios recuperan ese final, verificando su SHA-256. No se crea otro correlativo ni se solicita otro correo. El adjunto que ya recibió el buzón es la copia enviada entonces; el reemplazo corresponde al archivo alojado en Supabase.

Si falla la subida, el inicial sigue disponible. Si se interrumpe la retirada del inicial, una cola privada conserva la tarea y un reintento o la siguiente apertura continúa el reemplazo. Una respuesta perdida después de borrar es idempotente. Dos dispositivos que intenten finalizar conservan el primer final confirmado y retiran el segundo archivo sobrante. El navegador no puede borrar documentos ni ejecutar las funciones de confirmación/limpieza; esas operaciones requieren el servidor y una identidad autorizada para el informe cerrado.

El archivo final admite 15 MB, el límite del bucket; el envío inicial conserva el límite de adjunto de 3 MB. No se borran registros, evidencias ni auditoría: se retira exclusivamente el Excel sustituido. Los históricos anteriores/nuevos de los datos y del cambio de metadatos permanecen en la auditoría protegida. Hasta activar el paso 4, el paso 3 mantiene su comportamiento anterior.

Pruebas: 21 comprobaciones PostgreSQL y 43 de API, además del recorrido con dos sesiones que cierra, simula una subida fallida, reintenta, verifica los textos reales del levantamiento y descarga los bytes exactos del único final alojado. Ninguna prueba envía correos o modifica cuentas reales.


## Quinta etapa: permisos independientes y gestión administrativa

El [paso 5](../supabase/migrations/202611080005_access_controls.sql) requiere el paso 4, conserva los datos y añade Hacer inspecciones, Recibir inspecciones y Administrador como accesos independientes. Las funciones y RLS verifican estos permisos con la identidad autenticada; ocultar controles en el navegador no es el control de acceso. La administración permite delegar accesos, deshabilitar/retirar cuentas y retirar inspecciones de cualquier autor conservando sus códigos.

La actualización incluye comprobaciones de versiones, protección del último administrador utilizable y rechazo de borradores retirados por el administrador o por el reinicio excepcional. Ver los [pasos operativos del propietario](REINICIO_PILOTO.md). No se ejecutan automáticamente ni se considera confirmada su activación remota.

La interfaz actual agrupa crear y recibir en un único interruptor **Inspecciones**. **Administrador** incluye ambas funciones automáticamente. Activarlo envía ambas capacidades como verdaderas y desactivarlo envía ambas como falsas; activar Administrador habilita también Inspecciones y la base garantiza que un administrador habilitado conserve ambas capacidades. La base conserva sus comprobaciones actuales y las cuentas previas con acceso parcial conservan su permiso hasta una decisión explícita del administrador. El paso 5, todavía pendiente de instalación en el proyecto del propietario al comprobar su versión pública, incorpora esta regla; las actualizaciones posteriores se documentan a continuación.


Actualización del espacio de trabajo (pasos 5 a 12)

Para el proyecto que ya tiene instalado el archivo final del paso 4, ejecutar el **contenido completo** de [upgrade-workspace.sql](../supabase/operations/upgrade-workspace.sql) en una consulta nueva de Supabase SQL Editor. Es un instalador atómico: instala los pasos que faltan, conserva los registros y el correlativo, y al finalizar muestra `next_registration_version: 202611090012`. Repetirlo después de completarlo no modifica datos. No ejecutar los scripts antiguos por separado sobre una versión posterior.

Después, en Render → berry-safety-api → Manual Deploy → Deploy latest commit, conservando las variables actuales. La publicación web se realiza por GitHub Pages. No se considera confirmada la instalación remota hasta consultar la versión y comprobar una operación real con el usuario.

- Paso 6: el nombre de archivo visible conserva las tildes; solo el nombre interno de Storage se normaliza a ASCII. Se conservan las referencias antiguas, el mes de la fecha de inspección y las comprobaciones de hash/registro. La corrección se aplica tanto al primer envío como al archivo final.
- Paso 7: **Panel de inspecciones**, solo para administradores, con filtros, estadísticas y consolidado de texto sin imágenes en dos hojas de Excel. El administrador puede consultar registros enviados/cerrados de otros autores y sus archivos, incluidos autores retirados. Los borradores ajenos siguen siendo privados. La consulta no modifica levantamientos ni dispara correos o reemplazos de archivos.
- Paso 8: Información general conserva `additionalInspectors`; Cierre utiliza `registrationParticipants` independiente. Cada grupo incluye automáticamente al autor autenticado y permite hasta tres personas adicionales. El Excel conserva **Cargo:**, muestra el grupo de inspección en J11 y el grupo de registro en las filas de firma; una cuarta fila de firma se añade únicamente cuando corresponde. No se modifica ningún informe ya enviado. Los documentos históricos sin el nuevo campo conservan su lista original de firmantes.

La interfaz reutiliza en memoria las listas de administración, los datos del panel y las imágenes con rutas inmutables al volver a una sección; revalida los permisos y los datos con el servidor. Cambiar de identidad o cerrar sesión borra esa caché. No se guarda la contraseña en esa memoria.


El [paso 9: identidad del responsable del levantamiento](../supabase/migrations/202611090009_correction_identity.sql) fija el nombre con la persona registrada como responsable principal al asignar el informe. Se muestra igual para destinatarios y revisor, sin edición manual. Las operaciones de guardar, enviar, cambiar estado y revisar lo obtienen del registro de asignación y descartan un nombre enviado por el cliente; `actorId` sigue registrando la cuenta que realizó cada operación. El cambio de nombre posterior del perfil no modifica esa identidad histórica. La instalación no reescribe inspecciones ni archivos existentes. Para una instalación que ya tiene el paso 8 basta ejecutar el contenido del nuevo paso 9; el instalador general también lo incorpora de forma idempotente. No requiere cambiar variables ni desplegar la API de Render.

## Paso 10: correcciones administrativas y ubicación

El [paso 10](../supabase/migrations/202611090010_admin_edit.sql) permite corregir informes abiertos de cualquier autor con una sesión administradora. Mantiene código, autoría, avances y auditoría, cambia asignaciones y reemplaza el Excel activo antes de retirar versiones anteriores. La nueva ruta de API es `/api/reports/revise`; requiere desplegar Render. Incluye la ubicación compuesta y limita el cambio directo del estado a los destinatarios. Véase [Edición administrativa](EDICION_INSPECCIONES.md). El instalador general se regenera con `node supabase/operations/build-upgrade.mjs`.

## Paso 11: Administradores (CC) editables

El [paso 11](../supabase/migrations/202611090011_account_copies.sql) amplía la función autenticada `berry_manage_account` con una lista opcional `supervisor_emails`. Conserva permisos, estado y versiones cuando solo se editan copias, valida hasta 50 correos y normaliza duplicados. Omitir la lista conserva el valor anterior y enviar `[]` lo vacía. Solo un administrador vigente puede cambiarla; el historial de inspecciones y documentos permanece intacto. La API existente transmite este campo sin cambios de rutas, configuración ni despliegue. Sobre el paso 10 basta ejecutar el archivo 11 completo; el instalador general también lo incorpora.

## Paso 12: siguiente correlativo en el editor

El [paso 12](../supabase/migrations/202611090012_next_registration.sql) añade una consulta autenticada del siguiente correlativo anual compartido. Exige una cuenta habilitada que pueda crear inspecciones y respeta el año de Lima. No reserva números ni escribe en el contador. La interfaz consulta cada cinco segundos mientras se completa el informe y al recuperar foco/conexión; el envío conserva la reserva y confirmación transaccionales existentes.

Sobre el paso 10 ya instalado se puede ejecutar únicamente el [instalador breve](../supabase/operations/upgrade-registration-preview.sql), que incorpora los pasos 11 y 12 pendientes de forma atómica. No requiere otro despliegue de Render.
