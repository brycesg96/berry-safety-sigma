# Gerencia, área y ubicación inspeccionada

Se preparan dos desplegables dependientes, **Gerencia → Área**, con búsqueda y el mismo componente Select usado por Sede/Zona. El perfil y la inspección tienen valores independientes: cambiar el área personal no altera el área de una inspección guardada.

## Catálogo pendiente

La organización aún debe proporcionar su relación oficial de gerencias y áreas. `src/organization-catalog.ts` permanece vacío; no se incluyen opciones inventadas. Mientras tanto, Gerencia permanece sin opciones y el perfil conserva su campo de área actual para permitir altas y ediciones existentes. Los dos selectores de la inspección quedan preparados y sin selección obligatoria hasta cargar la lista.

Cada entrada del catálogo contiene `management` y su lista `areas`. Con la lista cargada, elegir otra gerencia limpia el área anterior y ofrece únicamente las áreas de la nueva gerencia. Los valores anteriores se conservan visibles; no se migra ni se infiere una gerencia a partir de nombres escritos previamente.

## Persistencia y compatibilidad

El [paso 13](../supabase/migrations/202611150013_organization.sql), preparado para ejecutarse después del paso 12, añade `management` al perfil con valor inicial vacío. Conserva las políticas de acceso por cuenta y la auditoría. Las identidades seleccionadas guardan una copia de la gerencia obtenida del perfil en el servidor. Las fichas de inspectores y responsables y la lista/búsqueda de usuarios muestran la gerencia junto al área y puesto cuando existe.

La interfaz reconoce si el servidor todavía no tiene ese campo y conserva el guardado anterior de nombre, área y puesto. La ampliación se probó en PostgreSQL local; no se ejecutó en producción. Antes de activar el catálogo definitivo se debe instalar el paso 13 y publicar la web actualizada.

## Formulario y Excel

El campo de ubicación física se llama **Área e instalación inspeccionada**. El Excel individual cambia su rótulo a **ÁREA E INSTALACIÓN INSPECCIONADA** y compone el contenido en este orden:

**Sede – Área – Zona de inspección – Instalación inspeccionada**.

Gerencia y área organizativa se almacenan como `areaLocation.management` y `areaLocation.department`; la gerencia no forma parte de ese texto, según el orden solicitado. La columna `data.area` conserva el texto compuesto, utilizado por búsquedas, correo y nombre del archivo. La exportación también lo recompone desde la ubicación estructurada para evitar textos desactualizados. El servidor aplica el mismo orden y admite los registros anteriores sin área organizativa.

Los informes anteriores que solo tienen un área libre conservan ese texto. No se reescriben archivos históricos almacenados. Se conservan numeración, responsables, firmas y permisos; los cambios del formulario requieren Guardar o Enviar, como antes.
