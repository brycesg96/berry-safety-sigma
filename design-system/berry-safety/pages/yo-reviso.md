# ¡Yo Reviso!

Extiende MASTER.md y las pautas de UI/UX Pro Max, diseño y componentes compartidos ya utilizadas en Yo Seguro. Se mantienen Manrope/DM Sans locales, Brand/Hortifrut, campos, botones, Modal, SignaturePad y Select de la plataforma.

El acceso es una franja compacta con icono de extintor, título, subtítulo y flecha. El módulo usa tinta azul pizarra, superficies claras y un acento bronce para Extintores. Esta variación distingue la revisión de equipos sin convertir la entrada en otra portada dominante.

Tres tarjetas con iconos identifican Extintores, Lavaojos y Duchas lavaojos. La selección tiene texto y estado accesible, además del color; los formatos aún no disponibles lo explican expresamente. La ficha usa una lista de datos, evitando campos de edición innecesarios para quien inspecciona. La revisión anterior ocupa una tarjeta breve: fecha y estado. Los datos personales solo aparecen en el historial autorizado.

La búsqueda requiere el código exacto y espera 450 ms al escribir. Las respuestas antiguas no sustituyen el equipo actual. El estado de la nueva inspección comienza vacío. Se conservan firma, fotos y valores durante reintentos y se pide descartar explícitamente antes de cambiar de equipo con una revisión en curso.

Los controles táctiles tienen al menos 44 px, el formulario adapta columnas en teléfono y no hay desplazamiento horizontal a 390, 768 y 1440 px. No se añaden desplegables nativos: Select conserva el foco en el disparador al abrir, sin activar el teclado de pantalla. Los colores de ayuda, valores de solo lectura y placeholders se ajustan a contraste AA dentro del módulo. Las transiciones respetan movimiento reducido y no desplazan controles mientras se rellenan datos.

Se verifican controles, foco, contraste, privacidad y confirmación real mediante Playwright y Axe. No se incorporan librerías ni animaciones nuevas que interfieran con GSAP o Framer Motion.
