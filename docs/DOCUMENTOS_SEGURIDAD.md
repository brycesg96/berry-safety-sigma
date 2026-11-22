# Yo Seguro — recepción y consulta de documentos

**Sin cuenta:** el trabajador pulsa **Ingresar sin cuenta** en el inicio de sesión y entra únicamente a **Yo Seguro**. Indica su nombre, gerencia y área, elige ATS/PETAR/Checklist y envía un PDF o foto. El acceso público muestra solamente el formulario y una confirmación de ese envío. No ofrece búsquedas, archivos, revisiones, inspecciones ni administración, y no crea una cuenta anónima de Auth.

**Con cuenta:** **Yo Seguro** es una biblioteca privada. Cada cuenta habilitada consulta todos los documentos de las áreas de su misma gerencia; Administración conserva la consulta general y la revisión. La gerencia autorizada queda vinculada en PostgreSQL: se toma del perfil existente al activar el módulo o del primer perfil válido al completar el ingreso. Editar después el perfil o los metadatos de Auth no cambia ese permiso. Administración puede modificarlo o retirarlo desde **Gestión de Usuarios → Administrar usuarios → Editar usuario → Yo Seguro**. Se puede buscar por actividad y filtrar por área, tipo y estado; Administración también filtra por gerencia. Los resultados se agrupan por área y conservan la paginación.

## Activación — paso 25

1. Requiere las migraciones anteriores, incluido el paso 24 ya confirmado.
2. En Supabase → **SQL Editor**, abre una consulta nueva y ejecuta el contenido completo de [202611220025_yo_seguro.sql](../supabase/migrations/202611220025_yo_seguro.sql).
3. El resultado debe mostrar `yo_seguro_version: 202611220025`.
4. Publica/actualiza la web y recarga Berry. No hay que configurar Render, Make, claves nuevas ni el inicio de sesión anónimo de Supabase.

El paso 25 es transaccional y repetible. Conserva los archivos, los registros y la auditoría del paso 24. Clasifica los documentos anteriores cuando el perfil del remitente tiene una relación inequívoca de gerencia y área; los registros sin coincidencia mantienen su acceso anterior para propietario/Administración, y se muestran sin área asignada. El script no modifica las reglas de las inspecciones ni sus permisos.

## Envío sin cuenta

- Elige gerencia y área del catálogo vigente. Son los mismos elementos que se administran en **Gestión De Áreas E Instalaciones**; no se mantiene una segunda lista.
- Escribe tus nombres y apellidos y la actividad; indica fecha y, opcionalmente, lugar de trabajo.
- Adjunta un archivo PDF, JPG, PNG o WebP de hasta **10 MB**. Un PDF puede contener varias páginas. Cada registro conserva un archivo.
- Espera **Documento recibido** y su constancia `YS-…`. La confirmación solo aparece cuando PostgreSQL verificó el objeto y confirmó el registro.
- **Reintentar envío** conserva el identificador, permiso y archivo de ese intento. Si se pierde una respuesta, no se duplica la subida ni el registro. Los datos permanecen bloqueados durante el intento; **Empezar de nuevo** permite restablecer el formulario si venció el permiso o cambió el catálogo.
- **Enviar otro documento** conserva nombre y área solo en la memoria del formulario abierto. No se guardan documentos ni datos del trabajador en el almacenamiento local.
- El nombre es declarado por quien envía; no constituye una identidad autenticada. La biblioteca distingue **Sin cuenta**. Este acceso no permite consultar posteriormente la revisión ni recibir mensajes: esa siguiente etapa todavía no se incorpora.

## Consulta con cuenta

La cuenta debe tener una gerencia autorizada activa para consultar los documentos del equipo. Los cambios y revocaciones se comprueban en servidor y quedan en la auditoría; una reinstalación del script no revierte una revocación ni reclasifica el histórico. Las cuentas sin permisos de inspección pueden entrar directamente a Yo Seguro, manteniendo separados ambos permisos. Las cuentas de otras gerencias no acceden a los registros ni a sus bytes aunque conozcan una dirección de archivo o manipulen filtros. Las cuentas deshabilitadas, sesiones revocadas y límites de historial de reincorporación se verifican en servidor.

La vista previa y descarga usan la sesión autenticada. Administración puede aprobar, solicitar correcciones (con comentario obligatorio) y retirar registros de la lista activa conservando la trazabilidad. Los comentarios de revisión son internos a las cuentas autorizadas; no se muestran en el acceso público ni se envían por correo. Una corrección de archivo se recibe como un envío nuevo.

## Recepción privada y límites

El catálogo público expone únicamente nombres e identificadores de gerencias/áreas activas; no expone puestos, personas, correos ni documentos. El cliente público está separado del cliente de cuenta: nunca lee o modifica una sesión de usuario guardada en ese navegador.

Antes de subir, PostgreSQL reserva un permiso aleatorio de 256 bits, válido por **30 minutos**, asociado a un único archivo, nombre, área y tamaño. Storage solo permite insertar en esa ruta reservada; no concede lectura, listado, eliminación ni sobrescritura al acceso sin cuenta. La confirmación valida tipo MIME, tamaño real almacenado y relación activa de área/gerencia, y devuelve únicamente un recibo mínimo. Se conservan permisos/hash de recepción en el esquema privado para deduplicación; no se devuelven filas completas al público.

La reserva limita también intentos incompletos: por defecto, 500 reservas/hora, 2.000/día, 120/hora por origen de red y 2 GiB de bytes reservados en 24 horas. El propietario del proyecto puede ajustar `berry_private.yo_seguro_limits` según el volumen y las redes compartidas de los fundos. El límite por red usa los encabezados del proxy; los presupuestos globales siguen aplicándose aunque ese encabezado no esté disponible o no sea fiable. No sustituye un servicio de prevención de abuso ni aumenta la capacidad contratada de Supabase.

El navegador valida firma básica y extensión; Storage restringe tamaño y tipos MIME. Estas validaciones no equivalen a un análisis antivirus. Los objetos de envíos interrumpidos quedan privados para poder reintentar durante la vigencia del permiso; su limpieza corresponde al mantenimiento del proyecto. No se realizan borrados automáticos de documentos ni cambios de plan.

## Verificación

`npm run test:supabase` ejecuta políticas, funciones y permisos en PostgreSQL con usuarios ficticios: envío sin cuenta, ausencia de nuevas cuentas, acceso por gerencia, reintentos, archivo, MIME/tamaño, vencimiento, cuotas, metadatos falsos y aislamiento de bytes. `tests/yo-seguro-guest.spec.ts` cubre el flujo público; `tests/safety-documents.spec.ts`, la biblioteca y revisión privadas. Los recorridos usan servicios simulados y bloquean toda petición externa no prevista: no crean cuentas ni suben documentos reales.
