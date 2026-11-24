# Yo Seguro

Extiende MASTER.md. Se consultó UI/UX Pro Max para nuevo flujo móvil y recuperación de errores. Los resultados genéricos de portada comercial, vídeo y fuentes Fira/Inter no encajan con Berry: no se adoptan. Se aplican las recomendaciones verificadas de controles táctiles, feedback de confirmación, foco y recuperación sin perder archivos.

Acceso público: cabecera Hortifrut/Berry, portada crema con títulos verde bosque e ilustración propia de ATS, PETAR y Checklist, título Yo Seguro, promesa concreta, tres indicaciones (identificar, adjuntar, enviar). Formulario en dos bloques, selector visual de tipos con casillas accesibles, campos grandes y botón de envío de ancho completo. En teléfono se suprime el dibujo y la ayuda lateral para priorizar el formulario. Confirmación dedicada con foco, constancia y opción de otro envío.

Acceso con cuenta: cabecera compacta de Yo Seguro con alcance de gerencia, filtros comunes y documentos agrupados por área. Se conservan los Select de plataforma, tipografía local, colores y tokens de Berry. El acceso sin cuenta no incluye navegación al espacio de trabajo ni controles de consulta.

Animaciones breves en portada/biblioteca mediante el GSAP ya instalado; no se mueven controles mientras se escribe ni se añaden librerías, vídeos o imágenes externas. Se respeta reducir movimiento.

## Presentación y respuesta visual

La portada usa el mensaje «Un espacio seguro para ti», los tres checks indicados por el propietario y un acceso directo al formulario. La ilustración refleja ATS/PETAR/Checklist; su animación es breve y se ejecuta al entrar o cambiar de tipo. La preparación se calcula con nombre/área válidos y archivos de los tipos elegidos, actividad y ubicación completos: llegar al final significa **listo para enviar**, y la recepción solo se confirma después de la respuesta del servidor. Las tarjetas y el archivo tienen respuesta visual con posiciones estables. GSAP conserva la entrada del contenedor. `safety-scene-motion.ts` controla únicamente la ilustración decorativa y coordina entrada y perspectiva en propiedades separadas. CSS controla los estados de selección y preparación; los controles reales permanecen estables. Todas las animaciones nuevas se desactivan al reducir movimiento.

Los buscadores de Select usan una sola superficie con borde discreto y foco gris. La regla común en `location-fields.css` evita que los estilos generales de inputs añadan otro marco verde dentro de ese buscador. Se conserva el foco visible de teclado y el mismo componente para toda la plataforma.

## Recepción múltiple y consulta

Área es la selección inicial y la gerencia derivada aparece como ayuda pequeña. Los nombres se capitalizan al escribir. La fecha y hora son de solo lectura; la confirmación usa el sello del servidor. Las casillas de tipos habilitan grupos de archivos independientes con opción de añadir y quitar antes de enviar. Todos comparten actividad, Sede y Lugar de Trabajo. La consulta usa búsqueda por persona y tipos múltiples; no presenta estados ni aprobación. La actualización de fondo mantiene las filas visibles para evitar parpadeos.

## Consulta agrupada por envío

Cada envío tiene una tarjeta con persona, actividad, recepción, lugar y tipos incluidos, seguida de todos sus archivos. Se agrupa por `batch_id`; documentos históricos sin ese identificador conservan su independencia. Compartir nombre no fusiona personas ni trabajos. La paginación recupera hasta 20 envíos completos por página y los filtros de tipo seleccionan envíos que contienen cualquiera de esos tipos, conservando el resto de sus adjuntos. Los nombres de gerencias y áreas siguen procediendo de Administración → Gestión de Áreas y usan `organizationLabel`.

La tarjeta de cada envío usa un desplegable nativo `details/summary`, cerrado al iniciar la consulta. Su encabezado conserva persona, actividad, fecha, lugar, tipos y cantidad de adjuntos. El indicador gira al abrir y respeta movimiento reducido. Los archivos y sus acciones se muestran dentro del desplegable. La actualización automática conserva el estado de apertura del envío visible.
