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
