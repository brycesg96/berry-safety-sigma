# Seguimiento de inspecciones

Se aplica MASTER.md: papel crema, tarjetas claras, verdes de marca y tipografías locales. La tarjeta inicial agrupa al equipo de inspección y a los responsables del levantamiento. Los nombres tienen espacio completo, con puesto y área debajo, sin correos ni columnas anidadas estrechas. Los títulos de cada equipo usan singular con una persona y plural desde dos; la lista de inspectores elimina duplicados de identidad.

Objetivo, Descripción de la Causa y Conclusiones y Recomendaciones quedan en un único `details` nativo cerrado al entrar. Su resumen se abre con ratón, tacto, Enter o Espacio. No es un selector de opciones y no enfoca campos de búsqueda. El contenido permanece íntegro y se distribuye en tres columnas amplias o una en teléfono.

La navegación de observaciones utiliza pestañas numeradas de 44 × 44 px, separadas 8 px. El fondo ámbar de Pendiente y el verde de Ejecutado usan los mismos tokens que sus etiquetas; el estado ejecutado depende exclusivamente de la aprobación. Un borde y una marca interior identifican la pestaña activa sin cambiar su tono. Los iconos y las descripciones accesibles complementan el color. La fila puede recorrerse horizontalmente sin desbordar la página; flechas, Inicio y Fin permiten recorrerla con teclado.

Solo se muestra un panel a la vez. Los demás permanecen montados y ocultos, con claves estables: cambiar de observación conserva acciones, evidencias, comentarios y notas de revisión sin guardar. Los avisos de salida y las reglas de guardado siguen considerando todos los paneles. Las actualizaciones del informe conservan la selección si su observación sigue existiendo. La selección no mueve la página verticalmente ni depende de una animación.

La conversación tiene una separación de 20 px respecto del bloque anterior, 16 px en teléfono. El título es «Tienes dudas, conversa con el inspector»; se retiran el mensaje vacío y la ayuda redundante del estado. Se conservan el historial, los permisos y el bloqueo del estado hasta la aprobación.

Tras aprobar cada observación, se retira el editor de su conversación. Si hay mensajes humanos conservados, se muestran como «Conversación registrada», sin envío ni controles de escritura. Si no hubo mensajes, no se muestra el apartado; los movimientos de estado vacíos no crean una conversación. Las demás observaciones siguen siendo independientes. El paso 28 aplica la misma regla en el servidor, también para pestañas antiguas y sincronización offline. No se borran eventos existentes.

Se verificó en la skill UI UX Pro Max la recomendación de navegación completa por teclado y, en React, las claves estables. La búsqueda de divulgación progresiva devolvió recomendaciones de tipografía que no correspondían al componente, también tras acotar: no se aplicaron. Para el desplegable se usa como alternativa el patrón HTML nativo ya presente en la plataforma. Los colores siguen la arquitectura de tokens primitivos, semánticos y de componente de la skill Design System.

Se comprueban teclado, contraste, zoom, escritorio, tablet y teléfono; también la preservación de cambios entre pestañas, los colores tras aprobar y la exportación completa de las observaciones.
