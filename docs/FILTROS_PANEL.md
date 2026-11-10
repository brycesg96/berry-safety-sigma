# Filtros del panel de inspecciones

Inspector y Responsable del área admiten búsqueda por nombre o correo, sin distinguir mayúsculas o tildes, y selección de varias personas. Dentro de cada lista se incluye cualquiera de las personas seleccionadas. Los criterios de las distintas listas, código, fechas y estado se combinan.

**Área del responsable** utiliza el área organizativa registrada de las personas responsables en cada informe, como SS.GG., Recursos Humanos o Producción. No utiliza el lugar físico del campo Área inspeccionada. Si se combinan un área y responsables concretos, ambos criterios deben corresponder a la misma persona de la inspección. Los informes históricos que no tengan ese dato se agrupan en Sin área registrada.

Los resultados, estadísticas y consolidado utilizan los mismos filtros. El gráfico por área cuenta cada inspección una vez en cada área de sus responsables; una inspección con responsables de áreas distintas puede aparecer en varias barras. Consultar o cambiar filtros no modifica los informes ni inicia solicitudes de escritura.

La tabla conserva Área inspeccionada para identificar el lugar registrado. Esta configuración de filtros puede seguir ajustándose conforme se defina el panel.

## Desplegables comunes

`src/Select.tsx` concentra la apariencia y las interacciones de los desplegables de la plataforma. Usa las clases de Sede/Zona de `src/location-fields.css`; `LocationSelect` adapta las ubicaciones al mismo componente. Admite selección simple, búsqueda opcional y selección múltiple. Las sugerencias del directorio conservan su búsqueda y comparten los estilos del menú. Las nuevas pantallas deben seguir el mismo patrón.
