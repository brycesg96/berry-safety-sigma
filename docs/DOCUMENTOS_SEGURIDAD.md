# Yo Seguro — envío múltiple y Consulta de Documentos

El módulo acredita la **recepción** de ATS, PETAR y checklists. No aprueba documentos ni sustituye la validación operativa correspondiente.

## Activación — paso 26

1. Requiere los pasos anteriores, incluido el paso 25 ya confirmado.
2. Ejecuta el contenido completo de [202611220026_yo_seguro_batches.sql](../supabase/migrations/202611220026_yo_seguro_batches.sql) en una consulta nueva de **Supabase → SQL Editor**.
3. El resultado debe mostrar `yo_seguro_version: 202611220026`.
4. Actualiza la web. No hay que modificar Render, Make ni configurar nuevas claves.

El script es transaccional y repetible. Conserva documentos y auditoría anteriores, incorpora los envíos múltiples y sus lugares de trabajo, y revoca la función de aprobación de Yo Seguro. Sus columnas de revisión históricas se conservan por trazabilidad; ya no se usan en la consulta. Las inspecciones mantienen su flujo propio.

## Trabajador: Ingresar sin cuenta

El acceso abre únicamente el formulario de **Yo Seguro**. No crea cuentas de Auth ni permite buscar, leer, descargar o retirar archivos. El cliente público está separado de las sesiones de cuenta guardadas en el navegador.

1. Escribe tus nombres y apellidos: las iniciales se convierten a mayúscula al escribir.
2. Elige directamente tu **Área**. Debajo aparece la gerencia correspondiente; la relación se obtiene del catálogo del servidor.
3. Marca uno o varios tipos: ATS, PETAR, Checklist. Cada tipo permite varios archivos, por ejemplo dos ATS, dos PETAR y tres checklists.
4. Indica la actividad común, por ejemplo **Mantenimiento de Cortinas**. Elige **Sede** y **Lugar de Trabajo**; este último corresponde a la zona del catálogo vigente de inspecciones. Estos datos son compartidos por todos los archivos del envío.
5. La **fecha y hora de envío** son de solo lectura. La recepción definitiva utiliza la hora del servidor y la fecha de Lima, iguales para todos los documentos del envío.
6. Adjunta los archivos y pulsa **Enviar documentos**. La confirmación solo aparece cuando todos los objetos están almacenados y el servidor registró el envío completo.

Se admiten PDF, JPG, PNG y WebP, hasta **10 MB por archivo** y **50 archivos por envío**. Un PDF puede contener varias páginas. Cada archivo conserva su tipo e identificador; un envío comparte constancia y sello de recepción.

**Reintentar envío** conserva permisos, archivos y progreso. Si falla el segundo archivo, se continúa con los pendientes; las subidas confirmadas no se repiten. Si se perdió la respuesta después del registro, se recupera la misma constancia. **Empezar de nuevo** permite descartar ese intento y seleccionar otros archivos. La selección solo existe en la memoria del formulario abierto; no se presenta como un guardado sin conexión.

El nombre es declarado por el trabajador, no es una identidad autenticada. **Enviar otros documentos** conserva en el formulario abierto los datos comunes y limpia los archivos y la actividad. La persona puede guardar una captura de su constancia; el acceso público no consulta estados posteriores.

## Con cuenta: Consulta de Documentos

El apartado se titula **Consulta de Documentos** y muestra: «Consulta los documentos de gestión de seguridad enviados a la plataforma».

- Gerencia y área; Administración consulta todas las gerencias. Cada cuenta regular conserva su gerencia autorizada y puede consultar todas sus áreas.
- Tipo de documento con **selección múltiple**.
- **Buscar por persona**: nombre de quien envió los archivos, sin filtrar por actividad.
- Recepción con fecha y hora, nombre, actividad, tipo, ubicación y archivo. Se puede ver y descargar cada documento.
- Actualización automática de nuevos envíos mediante Realtime, respetando RLS. Una comprobación de respaldo cada 15 segundos y al recuperar el foco cubre eventos perdidos y cambios de permisos. Se pausa en pestañas ocultas o sin conexión; la actualización de fondo conserva la lista visible.

No se muestran estados, aprobaciones, solicitudes de corrección ni comentarios de revisión. Administración conserva el retiro de registros de la lista activa para mantenimiento, con trazabilidad.

La gerencia autorizada se fija en PostgreSQL a partir del perfil existente al activar el paso 25 o del primer perfil válido al completar el ingreso. Editar después el perfil o los metadatos de Auth no cambia ese permiso. Administración puede modificarlo desde **Gestión de Usuarios → Administrar usuarios → Editar usuario → Yo Seguro**. Se mantienen los límites de historial de las cuentas reincorporadas y el cierre de acceso de las inhabilitadas.

## Almacenamiento y privacidad

El catálogo público expone solo nombres e identificadores de áreas/gerencias y Sedes/zonas activas. No expone personas, puestos, correos, instalaciones ni documentos. La selección de área y de Lugar de Trabajo se comprueba nuevamente al registrar; no se aceptan zonas de otra Sede.

La reserva usa un permiso aleatorio de 256 bits y vence a los **90 minutos**. Cada objeto tiene su ruta exclusiva, sin permisos públicos de lectura, listado, sobrescritura o borrado. La finalización comprueba todos los objetos, sus tipos y tamaños antes de insertar los registros en una transacción. El endpoint de archivo individual no puede confirmar parcialmente un envío múltiple. El recibo público devuelve únicamente identificador, cantidad y momento de recepción.

Las cuotas existentes del paso 25 cuentan todos los archivos reservados, también los intentos incompletos: por defecto 500/hora, 2.000/día, 120/hora por origen de red y 2 GiB en 24 horas. El propietario puede ajustar `berry_private.yo_seguro_limits` según capacidad, volumen y redes compartidas. Los permisos individuales anteriores conservan su vencimiento original de 30 minutos. Las cuotas no aumentan el almacenamiento contratado.

El navegador comprueba firma básica y extensión; Storage limita tipo y tamaño; PostgreSQL comprueba los metadatos almacenados. Estas validaciones no equivalen a análisis antivirus. Los objetos de intentos interrumpidos permanecen privados y su limpieza corresponde al mantenimiento del proyecto. No se borran documentos automáticamente.

## Verificación

`npm run test:supabase` ejecuta funciones y políticas reales en PostgreSQL: aislamiento por gerencia, recepción anónima sin cuentas nuevas, reserva y confirmación idempotentes, atomicidad de múltiples archivos, relación Sede/zona, hora del servidor, tipo/tamaño, vencimiento y cuotas. Verifica también que ni Administración use la aprobación retirada por API.

`tests/yo-seguro-guest.spec.ts` cubre la recepción y los reintentos; `tests/safety-documents.spec.ts`, la búsqueda por persona, selección de tipos, acceso privado y actualización automática. Los recorridos bloquean tráfico HTTP y WebSocket externo no simulado. Nunca crean usuarios ni suben documentos reales.
