# Filtros de Gestión de Inspecciones

Inspector y Responsable del área admiten búsqueda por nombre o correo, sin distinguir mayúsculas o tildes, y selección de varias personas. Dentro de cada lista se incluye cualquiera de las personas seleccionadas. Los criterios de las distintas listas, número de registro, fechas y estado se combinan.

**Área** utiliza el área organizativa registrada de las personas responsables en cada informe, como SS.GG., Recursos Humanos o Producción. No utiliza el lugar físico del campo Área e instalación inspeccionada. Si se combinan un área y responsables concretos, ambos criterios deben corresponder a la misma persona de la inspección. Los informes históricos que no tengan ese dato se agrupan en Sin área registrada.

**Gerencia** ofrece búsqueda y usa `areaLocation.management`, la gerencia del área inspeccionada. Cuando ese dato no existe en un informe anterior, utiliza las gerencias que quedaron registradas de sus responsables; si tampoco existen, se agrupa en **Sin gerencia registrada**. El gráfico **Inspecciones por gerencia** permite filtrar pulsando una barra. Cada inspección cuenta una sola vez en cada gerencia, aunque varias personas pertenezcan a ella. En los informes que usan las gerencias de los responsables, los filtros combinados de gerencia, área y persona deben coincidir en una misma persona. No se infieren ni se reescriben los datos históricos.

Los resultados, estadísticas y consolidado utilizan los mismos filtros. El gráfico por área cuenta cada inspección una vez en cada área de sus responsables; una inspección con responsables de áreas distintas puede aparecer en varias barras. Consultar o cambiar filtros no modifica los informes ni inicia solicitudes de escritura.

La tabla conserva Área e instalación inspeccionada para identificar el lugar registrado. Esta configuración de filtros puede seguir ajustándose conforme se defina el panel.

## Desplazamiento de la tabla

El recuadro de inspecciones registradas muestra hasta ocho filas completas, con su altura real según los nombres y textos. A partir de la novena aparece desplazamiento vertical dentro del recuadro. Los encabezados permanecen fijos; se conserva el desplazamiento horizontal en móvil y se puede recorrer el recuadro con el teclado. Cambiar filtros recalcula el alto y, si quedan ocho o menos resultados, elimina el desplazamiento vertical sobrante. El total, las gráficas y el consolidado siguen incluyendo todos los resultados filtrados, aunque no estén visibles en las primeras ocho filas.

## Desplegables comunes

`src/Select.tsx` concentra la apariencia y las interacciones de los desplegables de la plataforma. Usa las clases de Sede/Zona de `src/location-fields.css`; `LocationSelect` adapta las ubicaciones al mismo componente. Admite selección simple, búsqueda opcional y selección múltiple. Las sugerencias del directorio conservan su búsqueda y comparten los estilos del menú. Las nuevas pantallas deben seguir el mismo patrón.
