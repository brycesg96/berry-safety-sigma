# Gerencia, área y ubicación inspeccionada

El perfil utiliza tres desplegables dependientes, **Gerencia → Área → Puesto**, con búsqueda y el mismo componente Select usado por Sede/Zona. La inspección conserva **Gerencia → Área**. El perfil y la inspección tienen valores independientes: cambiar el área personal no altera el área de una inspección guardada.

## Catálogo IPERC importado

La fuente es **ACTUALIZACIÓN DE MATRICES IPERC 2026 - Seguimiento.xlsx**. La primera hoja visible, **Tabla**, contiene las diez gerencias naranjas que se excluyen junto con sus áreas y puestos. Se toman las relaciones de **Puestos O** y se contrastan las condiciones con la hoja oculta **BD Puestos**. Solo se admiten relaciones activas clasificadas inequívocamente como Empleado. Por confirmación expresa del propietario se excluyen también todos los practicantes, Operador CCTV y Operador de maquinaria, aunque algunas filas los etiqueten como empleados.

El resultado son **18 gerencias, 60 áreas y 300 puestos por área**, sin duplicados de la misma relación. Se conservan los nombres oficiales y las siglas del archivo. [Trazabilidad de filas, hash y exclusiones](../reference/organization-import.json). `scripts/import-organization.py` genera la semilla JSON y su bloque SQL a partir del archivo, sin contactar servicios ni aplicar cambios remotos.

Cada entrada del catálogo contiene `management`, su lista `areas` y `positions`, un objeto cuyas claves son las áreas y cuyos valores son sus listas de puestos. La configuración del primer perfil exige que todas las áreas tengan puestos. Elegir otra gerencia limpia el área y puesto anteriores; elegir otra área limpia el puesto. Los valores anteriores se conservan visibles para que su propietario pueda corregirlos, pero una nueva selección debe pertenecer a la relación oficial. No se migra ni se infiere una gerencia a partir de nombres escritos previamente.

## Gestión de áreas e instalaciones

Es una cuarta pestaña del portal, al mismo nivel que Mi perfil, Gestión de Usuarios y Gestión de Inspecciones. Solo un administrador habilitado con contraseña personal puede consultar y modificar la gestión. Permite buscar, añadir, cambiar nombres, cambiar el padre de áreas y puestos, retirar y restaurar elementos. Retirar una gerencia o área oculta sus descendientes mientras esté retirada, pero no altera sus estados individuales ni los textos de los perfiles e informes anteriores. Las áreas sin puestos activos y las gerencias sin áreas completas no se ofrecen como nuevas selecciones del perfil.

Las listas se comparten en Supabase; los cambios se reflejan inmediatamente en la sesión administrativa y se recargan al recuperar el foco o abrir otra vez el perfil. Un fallo de consulta deshabilita las selecciones y ofrece reintentar, sin volver silenciosamente a una semilla anterior. Los nombres históricos quedan visibles en su campo hasta que el usuario elija una relación actual. Cada cambio valida el parentesco y la revisión de edición y queda auditado. Un administrador puede añadir más adelante los puestos operativos que se omitieron de la importación; no existe una prohibición permanente por nombre.

Los nombres se presentan con las tildes de las palabras españolas del catálogo e iniciales mayúsculas y se conservan siglas como SIGMA y TI. Los valores completos usados para validar y guardar cada selección permanecen intactos. Las fichas de responsables del área muestran nombre completo, correo y área; las de inspectores mantienen sus datos organizativos. El bloque del usuario en la barra verde muestra nombre, rol y área, con el puesto debajo y el texto contenido dentro de la barra.

## Abreviatura del área y traslado de Viveros

El [paso 16](../supabase/migrations/202611150016_area_nomenclature.sql), que se ejecuta en SQL Editor después del paso 15, añade **Abreviatura**, opcional y de hasta 50 caracteres, únicamente a la ficha de área. Conserva el nombre completo y utiliza la abreviatura para la presentación del perfil, las listas y las nuevas inspecciones. El desplegable permite buscar tanto por abreviatura como por nombre completo. Sin abreviatura se muestra el nombre con iniciales mayúsculas. La web conserva la edición anterior del catálogo cuando el servidor aún no tiene el paso 16 y muestra el nuevo campo deshabilitado hasta su activación.

La actualización asigna **SIGMA** al área Seguridad Industrial y Gestión Medio Ambiental y mueve **Viveros** desde Gerencia de Producción a Gerencia Corporativa de Viveros, Hubs y Licencias. Conserva el identificador del área y sus cinco puestos. Estos ajustes se ejecutan una sola vez; repetir la instalación respeta las modificaciones posteriores del administrador. Los perfiles existentes conservan sus datos para que sus propietarios puedan alinearlos desde Mi perfil.

Las abreviaturas seleccionadas para la ubicación se conservan en `areaLocation.departmentNomenclature`, junto al nombre completo en `department`. El texto compuesto de nuevas inspecciones, el Excel y el correo usan esa copia. Un cambio posterior de abreviatura no reescribe las ubicaciones históricas ni los archivos almacenados. Los responsables guardan la abreviatura verificada a partir de su perfil real en el servidor. La semilla de vista previa aplica las mismas correcciones mediante [ajustes explícitos](../reference/organization-adjustments.json), separados de las filas originales del Excel.

## Alta y primer ingreso

Agregar Usuario solicita nombre, correo y permisos, sin campos de área ni puesto. El alta envía esos dos datos vacíos para conservar la compatibilidad de la API y de PostgreSQL. El usuario cambia su contraseña temporal y luego debe seleccionar su gerencia, área y puesto, guardar el perfil y confirmar su finalización antes de entrar al espacio de trabajo. Si falla el guardado o la confirmación, conserva la edición y permanece en el perfil. La finalización se recuerda en Auth, también entre sesiones y dispositivos. Las cuentas anteriores que ya completaron el perfil no vuelven a pasar obligatoriamente por este paso y pueden alinearse voluntariamente desde Mi perfil.

## Persistencia y compatibilidad

El [paso 13](../supabase/migrations/202611150013_organization.sql), preparado para ejecutarse después del paso 12, añade `management` al perfil con valor inicial vacío. Conserva las políticas de acceso por cuenta y la auditoría. Las identidades seleccionadas guardan una copia de la gerencia obtenida del perfil en el servidor. Las fichas de inspectores y la lista/búsqueda de usuarios muestran la gerencia junto al área y puesto cuando existe; los responsables del área muestran su área.

El [paso 14](../supabase/migrations/202611150014_organization_catalog.sql) añade el catálogo compartido, carga una sola vez la semilla revisada, protege las mutaciones mediante RPC de administrador y valida las nuevas selecciones de perfil. Repetirlo conserva las altas, renombrados y retiradas posteriores. La interfaz reconoce los servidores anteriores y conserva el guardado previo del perfil ya completado; el primer perfil obligatorio permanece pendiente hasta la activación. No se aplicó SQL a producción desde el entorno de desarrollo. El [script de activación](../supabase/operations/activate-20261115.sql) reúne los pasos 13, 14 y 15 sobre la base existente con los pasos 1–12.

## Formulario y Excel

El campo de ubicación física se llama **Área e instalación inspeccionada**. El Excel individual cambia su rótulo a **ÁREA E INSTALACIÓN INSPECCIONADA** y compone el contenido en este orden:

**Sede – Zona de inspección – Área – Instalación inspeccionada**.

Gerencia y área organizativa se almacenan como `areaLocation.management` y `areaLocation.department`; la gerencia no forma parte de ese texto, según el orden solicitado. La columna `data.area` conserva el texto compuesto, utilizado por búsquedas, correo y nombre del archivo. La exportación también lo recompone desde la ubicación estructurada para evitar textos desactualizados. El servidor aplica el mismo orden y admite los registros anteriores sin área organizativa.

Los informes anteriores que solo tienen un área libre conservan ese texto. No se reescriben archivos históricos almacenados. Se conservan numeración, responsables, firmas y permisos; los cambios del formulario requieren Guardar o Enviar, como antes.

El [paso 18](../supabase/migrations/202611150018_location_order.sql), posterior al paso 17, añade el orden **Sede → Zona → Área → Instalación** a las ubicaciones nuevas o editadas. El campo, el texto guardado, el Excel y el correo utilizan el mismo orden. La ubicación conserva `textOrder: "site-zone-area"` para recordar el formato elegido; los informes anteriores sin ese indicador mantienen su composición original. La migración no modifica registros ni archivos existentes.

## Áreas e instalaciones

El apartado se llama **Gestión de áreas e instalaciones** y tiene dos pestañas. **Áreas** conserva Gerencia → Área → Puesto y la abreviatura del área. **Instalaciones** administra Sede → Zona → Instalación con búsqueda, altas, edición, cambio de padre, retirada y restauración. Sus operaciones tienen control de revisión, validación del parentesco y auditoría, y solo las puede ejecutar un administrador habilitado.

La semilla física conserva únicamente las cinco sedes y diecinueve zonas ya proporcionadas por el propietario. No se extraen instalaciones de informes anteriores ni se inventan opciones. La lista oficial de instalaciones se recibirá después: hasta entonces, el selector **Instalación** y su alta administrativa permanecen bloqueados con **Lista de instalaciones pendiente**. Las sedes y zonas sí se pueden administrar. Las inspecciones nuevas pueden completarse con Sede, Zona y Área mientras siga pendiente esa lista.

En la inspección, **Área e instalación inspeccionada** se muestra después de los desplegables como una etiqueta verde, sin caja ni texto editable. Compone **Sede – Zona – Área (o su abreviatura) – Instalación**, omitiendo únicamente los componentes pendientes. El mismo texto se conserva en el registro y en el Excel. Cambiar sede limpia zona e instalación; cambiar zona limpia instalación. Las ubicaciones se vinculan a identificadores del catálogo y guardan sus nombres como una copia histórica: editar o retirar lugares no reescribe los informes anteriores.

El [paso 19](../supabase/migrations/202611150019_location_catalog.sql), posterior al paso 18, activa el catálogo compartido y la validación de ubicaciones. El [script conjunto de los pasos 18 y 19](../supabase/operations/activate-locations-20261115.sql) se ejecuta sobre una base con el paso 17 y conserva registros, archivos, numeración y cambios administrativos al repetirse. Hasta activarlo, las cuentas en la nube conservan el formulario anterior para poder seguir trabajando; al entrar de nuevo, se habilita el formulario con la etiqueta verde. No requiere otro cambio de API en Render.

Cuando se reciba la lista oficial, se importarán las instalaciones bajo sus zonas y se activará `berry_private.location_settings.installations_ready`. Este indicador queda apagado en esta entrega. Una vez activado, Instalación pasa a ser obligatoria para las inspecciones nuevas; los informes enviados durante la etapa pendiente conservan su contenido y pueden seguir su proceso de cierre.
