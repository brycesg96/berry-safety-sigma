# Interfaz de Berry Safety

Todos los desplegables visibles deben usar `src/Select.tsx` y la apariencia común de Sede/Zona definida en `src/location-fields.css`. `LocationSelect` es el adaptador de ubicaciones del mismo componente. Usa sus opciones de búsqueda y selección múltiple cuando el flujo las requiera; conserva navegación con teclado, accesibilidad y funcionamiento táctil. No añadas desplegables nativos con `<select>` ni diseños distintos para nuevas pantallas. Las sugerencias del directorio mantienen su búsqueda existente y comparten los estilos del menú.

Abrir un desplegable con búsqueda o limpiar su selección nunca debe enfocar el buscador ni activar el teclado de pantalla. El foco permanece en el control de apertura; el usuario entra en la búsqueda pulsando su campo o mediante Tab. Esta regla se aplica a todos los módulos y tipos de dispositivo.
