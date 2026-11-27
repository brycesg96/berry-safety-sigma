# ¡Yo Reviso! · Inspección de Equipos de Emergencia

El **paso 31** incorpora el consolidado de extintores, los antecedentes de la base anterior y la asignación de gerencia/área usuarias en campo. Consulta [Inventario de extintores](INVENTARIO_EXTINTORES.md) para preparar y cargar los datos privados. Las instrucciones siguientes describen el recorrido base del paso 30; la aplicación mantiene su compatibilidad durante la actualización.

El acceso está dentro de **Yo Seguro**, tanto en el recorrido sin cuenta como en el espacio autenticado. Extintores es el primer formato habilitado. Lavaojos y Duchas lavaojos muestran «Formato pendiente» hasta disponer de sus modelos; todavía no reciben inspecciones.

## Registrar las fichas reales

Antes de inspeccionar un equipo por primera vez, una cuenta de **Administración** debe abrir Yo Seguro → ¡Yo Reviso! → **Registrar equipo**. Registrar su código exacto, área y ubicación; completar serie, marca, tipo/agente, capacidad, fabricación, vencimiento y pruebas hidrostáticas según su ficha real. Las áreas proceden de Administración → Gestión de Áreas y determinan la gerencia del equipo.

No se importan equipos desde la captura de Power Apps ni se crean registros ficticios. El código identifica un equipo y no cambia al editar la ficha. Administración puede actualizar sus datos o retirarlo del catálogo; las inspecciones anteriores conservan la información que tenían al registrarse. Las fechas técnicas se ingresan desde la ficha: la aplicación no calcula plazos de mantenimiento o certificaciones.

## Inspeccionar sin cuenta o con cuenta

1. Elegir Extintores y escribir el código completo. La búsqueda automática carga su ficha y la fecha y estado de la última inspección disponible.
2. Indicar nombres y apellidos y número de legajo. Con cuenta, el nombre queda vinculado al perfil autenticado. La fecha comienza en el día actual de Lima y se puede cambiar por una fecha anterior; el mes se deriva de ella.
3. Elegir **Operativo**, **Requiere atención** o **Fuera de servicio**. Nunca se copia automáticamente el estado anterior. Los dos últimos requieren observaciones.
4. Firmar en pantalla o adjuntar una imagen de la firma y, opcionalmente, añadir hasta ocho fotos.
5. Registrar la inspección. La constancia solo aparece después de que el servidor confirme el registro y sus archivos, con fecha de recepción del servidor.

Un envío interrumpido conserva los datos, firma y fotos mientras la pantalla siga abierta. **Reintentar inspección** usa el mismo identificador y evita duplicar un registro ya recibido. Si la ficha cambió o venció el permiso, **Actualizar ficha y preparar nuevo envío** conserva el formulario y permite revisar los datos actualizados. La pantalla avisa antes de descartar una revisión en curso. El registro necesita conexión; no hay una cola de envíos sin conexión.

## Consultar inspecciones recibidas

Con cuenta, buscar el código permite abrir **Revisiones recibidas** cuando el equipo pertenece al alcance autorizado. Las cuentas normales consultan su gerencia; Administración puede consultar todas. Cada detalle contiene responsable, legajo, fecha, estado, observaciones, ficha capturada, firma y fotografías. El historial se pagina de diez en diez.

El recorrido público únicamente devuelve la ficha del equipo activo y la fecha y estado de su última inspección. No expone el historial detallado, nombres anteriores, legajos, observaciones, firmas ni fotografías. Abrir el acceso público en un navegador que conserva una sesión utiliza un cliente independiente y registra el envío como sin cuenta. Un nombre declarado sin sesión no equivale a una identidad autenticada.

## Base de datos y archivos

Requiere el **paso 30**, `supabase/migrations/202611250030_yo_reviso.sql`, después de las migraciones anteriores. Ejecutar el archivo completo devuelve `yo_reviso_version: 202611250030`. La disponibilidad pública se comprueba mediante `berry_emergency_status()`; no se requiere una clave privada en la aplicación.

Las fichas están en `berry_emergency_equipment` y las revisiones inmutables en `berry_emergency_inspections`. Los archivos se guardan en el bucket privado `berry-emergency-evidence`. El servidor reserva rutas concretas por envío, valida los metadatos de todos los archivos y publica el registro de forma atómica. Firma PNG de hasta 1 MB y evidencias PNG/JPG/WebP de hasta 2 MB después de prepararlas. El permiso de carga dura 90 minutos y se aplican límites de volumen y frecuencia. Las políticas de lectura usan el alcance de Yo Seguro, los permisos de cuenta y el límite de historial configurado.

No incluye QR, geolocalización, avisos por correo ni exportación a un formato oficial de inspección de equipos.

## Verificación

`npm run test:supabase` verifica permisos, lectura pública reducida, identidad de cuenta, archivos privados, atomicidad, reintentos, conflictos y límites con PostgreSQL embebido. `npx playwright test tests/emergency-inspections.spec.ts` comprueba el recorrido sin cuenta en teléfono, tablet y escritorio, firma, evidencias, registro administrativo, consulta privada, accesibilidad y recuperación ante fallos, con datos de prueba interceptados.
