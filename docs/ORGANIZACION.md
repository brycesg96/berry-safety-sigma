# Gerencia, área y ubicación inspeccionada

El perfil utiliza tres desplegables dependientes, **Gerencia → Área → Puesto**, con búsqueda y el mismo componente Select usado por Sede/Zona. La inspección conserva **Gerencia → Área**. El perfil y la inspección tienen valores independientes: cambiar el área personal no altera el área de una inspección guardada.

## Catálogo IPERC importado

La fuente es **ACTUALIZACIÓN DE MATRICES IPERC 2026 - Seguimiento.xlsx**. La primera hoja visible, **Tabla**, contiene las diez gerencias naranjas que se excluyen junto con sus áreas y puestos. Se toman las relaciones de **Puestos O** y se contrastan las condiciones con la hoja oculta **BD Puestos**. Solo se admiten relaciones activas clasificadas inequívocamente como Empleado. Por confirmación expresa del propietario se excluyen también todos los practicantes, Operador CCTV y Operador de maquinaria, aunque algunas filas los etiqueten como empleados.

El resultado son **18 gerencias, 60 áreas y 300 puestos por área**, sin duplicados de la misma relación. Se conservan los nombres oficiales y las siglas del archivo. [Trazabilidad de filas, hash y exclusiones](../reference/organization-import.json). `scripts/import-organization.py` genera la semilla JSON y su bloque SQL a partir del archivo, sin contactar servicios ni aplicar cambios remotos.

Cada entrada del catálogo contiene `management`, su lista `areas` y `positions`, un objeto cuyas claves son las áreas y cuyos valores son sus listas de puestos. La configuración del primer perfil exige que todas las áreas tengan puestos. Elegir otra gerencia limpia el área y puesto anteriores; elegir otra área limpia el puesto. Los valores anteriores se conservan visibles para que su propietario pueda corregirlos, pero una nueva selección debe pertenecer a la relación oficial. No se migra ni se infiere una gerencia a partir de nombres escritos previamente.

## Gestión de Áreas

Es una cuarta pestaña del portal, al mismo nivel que Mi perfil, Gestión de Usuarios y Gestión de Inspecciones. Solo un administrador habilitado con contraseña personal puede consultar y modificar la gestión. Permite buscar, añadir, cambiar nombres, cambiar el padre de áreas y puestos, retirar y restaurar elementos. Retirar una gerencia o área oculta sus descendientes mientras esté retirada, pero no altera sus estados individuales ni los textos de los perfiles e informes anteriores. Las áreas sin puestos activos y las gerencias sin áreas completas no se ofrecen como nuevas selecciones del perfil.

Las listas se comparten en Supabase; los cambios se reflejan inmediatamente en la sesión administrativa y se recargan al recuperar el foco o abrir otra vez el perfil. Un fallo de consulta deshabilita las selecciones y ofrece reintentar, sin volver silenciosamente a una semilla anterior. Los nombres históricos quedan visibles en su campo hasta que el usuario elija una relación actual. Cada cambio valida el parentesco y la revisión de edición y queda auditado. Un administrador puede añadir más adelante los puestos operativos que se omitieron de la importación; no existe una prohibición permanente por nombre.

## Alta y primer ingreso

Agregar Usuario solicita nombre, correo y permisos, sin campos de área ni puesto. El alta envía esos dos datos vacíos para conservar la compatibilidad de la API y de PostgreSQL. El usuario cambia su contraseña temporal y luego debe seleccionar su gerencia, área y puesto, guardar el perfil y confirmar su finalización antes de entrar al espacio de trabajo. Si falla el guardado o la confirmación, conserva la edición y permanece en el perfil. La finalización se recuerda en Auth, también entre sesiones y dispositivos. Las cuentas anteriores que ya completaron el perfil no vuelven a pasar obligatoriamente por este paso y pueden alinearse voluntariamente desde Mi perfil.

## Persistencia y compatibilidad

El [paso 13](../supabase/migrations/202611150013_organization.sql), preparado para ejecutarse después del paso 12, añade `management` al perfil con valor inicial vacío. Conserva las políticas de acceso por cuenta y la auditoría. Las identidades seleccionadas guardan una copia de la gerencia obtenida del perfil en el servidor. Las fichas de inspectores y responsables y la lista/búsqueda de usuarios muestran la gerencia junto al área y puesto cuando existe.

El [paso 14](../supabase/migrations/202611150014_organization_catalog.sql) añade el catálogo compartido, carga una sola vez la semilla revisada, protege las mutaciones mediante RPC de administrador y valida las nuevas selecciones de perfil. Repetirlo conserva las altas, renombrados y retiradas posteriores. La interfaz reconoce los servidores anteriores y conserva el guardado previo del perfil ya completado; el primer perfil obligatorio permanece pendiente hasta la activación. No se aplicó SQL a producción desde el entorno de desarrollo. El [script de activación](../supabase/operations/activate-20261115.sql) reúne los pasos 13, 14 y 15 sobre la base existente con los pasos 1–12.

## Formulario y Excel

El campo de ubicación física se llama **Área e instalación inspeccionada**. El Excel individual cambia su rótulo a **ÁREA E INSTALACIÓN INSPECCIONADA** y compone el contenido en este orden:

**Sede – Área – Zona de inspección – Instalación inspeccionada**.

Gerencia y área organizativa se almacenan como `areaLocation.management` y `areaLocation.department`; la gerencia no forma parte de ese texto, según el orden solicitado. La columna `data.area` conserva el texto compuesto, utilizado por búsquedas, correo y nombre del archivo. La exportación también lo recompone desde la ubicación estructurada para evitar textos desactualizados. El servidor aplica el mismo orden y admite los registros anteriores sin área organizativa.

Los informes anteriores que solo tienen un área libre conservan ese texto. No se reescriben archivos históricos almacenados. Se conservan numeración, responsables, firmas y permisos; los cambios del formulario requieren Guardar o Enviar, como antes.
