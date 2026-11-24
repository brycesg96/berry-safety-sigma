# Movimiento y confirmaciones

Las interacciones conservan los controles, el foco y los flujos de guardado existentes. GSAP y Framer Motion usan elementos distintos: las nuevas animaciones de ordenamiento pertenecen a GSAP; los marcos decorativos de desplazamiento siguen usando Framer Motion.

## Listas ordenables

Sedes, zonas, instalaciones, gerencias, áreas y puestos se desplazan hasta su posición nueva en 220 ms, después de que el servicio confirme el cambio. No se cambia el orden de forma anticipada. Un fallo conserva la lista y su mensaje de error.

`useCatalogOrderMotion` carga el módulo cuando se activa el ordenamiento. Mide las posiciones anteriores y nuevas dentro de cada lista, anima exclusivamente sus filas y limpia las transformaciones al finalizar. Las lecturas de posición se agrupan antes de escribir estilos. Cambiar de sección, desactivar el ordenamiento o activar movimiento reducido cancela las animaciones. Si falla la descarga del módulo, ordenar continúa funcionando.

## Guardar y Guardar Avance

Los botones conservan sus nombres y posición. `SaveButton` muestra un indicador de carga y `aria-busy` durante el guardado, una marca de confirmación cuando corresponde y un icono de aviso ante errores. El color complementa el texto y los iconos.

En una inspección, el estilo de confirmación requiere un guardado terminado y ausencia de cambios posteriores. Editar durante una solicitud no muestra como guardado el texto nuevo. En un levantamiento, el guardado sin conexión conserva el mensaje que indica que está almacenado en el dispositivo y pendiente de sincronización; no se presenta como confirmación del servidor. Preparar una foto no activa el estado de guardado del botón.

## Pasos de inspección

El indicador inferior muestra el paso actual mediante una transición de 240 ms. `aria-current="step"` y las etiquetas siguen identificándolo sin depender del movimiento. La entrada del contenido se reduce a 220 ms; no se desplazan los campos ni se retrasa su disponibilidad. Se conserva el desplazamiento inmediato al encabezado o a la observación que se está editando.

## Accesibilidad y revisión

`prefers-reduced-motion` desactiva el reordenamiento animado y las transiciones nuevas. No se añaden gestos obligatorios ni controles que dependan del cursor. Las pruebas cubren escritorio, 375 y 390 px, teléfono horizontal, cambios durante el guardado, navegación entre pasos y ordenamiento sin el módulo visual.

Como referencia de revisión se usó [UI UX Pro Max](https://github.com/nextlevelbuilder/ui-ux-pro-max-skill), clonado por solicitud del usuario en el espacio de trabajo. Se consultaron sus criterios de indicadores de carga, controles estables y movimiento reducido; la transición de reordenamiento es una implementación específica de Berry. La guía no se carga en la aplicación ni añade dependencias al producto.

## Adaptación Treasury y documentos agrupados

- `SafetyWelcome.tsx` dibuja la ilustración propia y la bienvenida; `safety-treasury.css` delimita sus estilos. `safety-scene-motion.ts` posee las transformaciones de la escena, mientras `AppMotion` conserva sus contenedores habituales y Framer sus componentes existentes. La entrada del marco mueve `y` y opacidad; el scroll usa rotación/escala. Las notas entran por opacidad y el scroll mueve `y`, sin dos animaciones escribiendo la misma propiedad a la vez. Todo se revierte en movimiento reducido o al desmontar.
- `AnimatedCount` anima solamente el texto de las métricas reales del panel durante 420 ms. Movimiento reducido muestra el valor final inmediatamente, incluso si cambia durante la animación. No desplaza controles ni añade anuncios de lectura por cada cuadro.
- Las preguntas frecuentes públicas usan `details/summary` nativos y teclado. No cambian el comportamiento del formulario ni la constancia del servidor.
- La consulta de Yo Seguro agrupa por envío, conserva las acciones de cada archivo y pagina grupos completos. El filtro de tipo recupera los demás adjuntos del envío con SELECT sujetos a los mismos permisos RLS. Una lectura incompleta muestra un error en lugar de presentar una tarjeta parcial.

## Formularios compactos y seguimiento

Los destinatarios del área se buscan por nombre o correo en un solo cuadro. Su área, puesto y correo aparecen como texto pequeño debajo. Los responsables del registro conservan su nombre y firma; correo, puesto y fecha pasan a texto sin cuadros. Los datos y las firmas siguen disponibles para el informe.

La fecha y la hora de una inspección nueva se inicializan una sola vez usando America/Lima y pueden editarse. No se vuelven a calcular al reabrir un borrador. Los valores iniciales generados no cuentan como contenido para crear borradores vacíos; un cambio explícito sí se guarda.

El Buzón presenta acciones con checks y filtros desde la perspectiva del destinatario: Por atender y En revisión del inspector. Las observaciones ya enviadas a revisión no figuran como tareas vencidas o por vencer del destinatario. Mis inspecciones conserva la perspectiva de aprobación del inspector.

El seguimiento muestra los inspectores y todos los responsables asignados al levantamiento, con puesto y área separados por guion, sin correos en esos grupos. Cada observación muestra Responsable del Levantamiento y un Estado de solo lectura. El paso 27 impide también en servidor cambiar el estado sin aprobación. Se retiran el cuadro introductorio y el panel visible de Seguimiento de correos; permanecen las conversaciones, el envío real y la recuperación de envíos fallidos. No se cambia el formato Excel/PDF.

## Desplegables con búsqueda en toda la aplicación

Abrir Select nunca enfoca su búsqueda: la misma regla se aplica con toque, lápiz, mouse y teclado en todos los módulos. Se puede desplazar la lista y elegir directamente. La búsqueda recibe foco solo al pulsar su campo o llegar a él con Tab; entonces se puede escribir. Limpiar una selección tampoco devuelve el foco al buscador. Las flechas, Enter y Escape siguen disponibles desde el control de apertura, con opciones y selección anunciadas mediante ARIA.
