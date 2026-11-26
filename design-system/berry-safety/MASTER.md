# Berry Safety — sistema visual

Aplicación interna de seguridad ocupacional. La prioridad es leer, registrar y revisar con claridad en escritorio y teléfono. Se conserva la identidad Hortifrut y el producto existente.

## Dirección

Interfaz corporativa sobria: superficies claras, verdes de marca, jerarquía tipográfica visible y sombras discretas. Se consultó UI UX Pro Max para tipografía, contraste, controles de carga y movimiento. Sus propuestas genéricas de portada comercial, paletas roja/azul y tipografías externas no correspondían al producto: no se persistieron ni aplicaron. La referencia de Berry es este documento: `src/product-theme.css` conserva la base compartida y `src/workspace-theme.css` aplica la dirección Treasury a las pantallas de trabajo.

## Referencia Treasury adaptada

La dirección inspirada en Teal Treasury usa crema y verde bosque en Inicio, Yo Seguro, Nueva inspección, Mis inspecciones, Buzón y Administración, una ilustración propia de documentos con profundidad, y tarjetas que separan persona, actividad y adjuntos. Se mantienen DM Sans/Manrope locales, los logos oficiales y los componentes de la plataforma. Las recomendaciones verificadas de UI UX Pro Max son Minimalism & Swiss Style para herramientas empresariales, jerarquía clara, controles táctiles y movimiento reducido. La búsqueda inicial orientada a portales devolvió un perfil infantil; se descartó y se acotó a herramientas empresariales. No se adoptaron las paletas o fuentes genéricas de ninguno de los resultados.

La portada no muestra cifras, expedientes o testimonios inventados. Los contadores del panel leen las métricas reales existentes. La ilustración no es un control ni una constancia de envío; el formulario conserva sus confirmaciones reales.

## Tokens

| Uso | Valor |
| --- | --- |
| Texto principal | `#183f32` |
| Texto secundario | `#53664f` |
| Acción principal | `#244b38`, texto blanco |
| Acción principal al pasar el cursor | `#183f32` |
| Superficie | `#ffffff` |
| Fondo | `#f7f6f0` |
| Fondo suave | `#f0f1e7` |
| Borde | `#dfe3d5` |
| Foco | `#287452`, contorno de 3 px |
| Error | `#a2342e` |
| Advertencia | `#795217` |

Los tokens nuevos se enlazan con `--ink`, `--green`, `--muted`, `--line` y `--sidebar`. Los estilos compartidos de campos, tarjetas, estados y menús consumen esta misma base.

## Tipografía y distribución

- DM Sans Variable para cuerpo y Manrope Variable para títulos, instaladas localmente.
- Texto de campos de 14 px en escritorio y 16 px en teléfono; etiquetas de 13 px y ayudas de 12 px.
- Títulos de página de 28–40 px y encabezados de sección de 15–22 px.
- Campos de al menos 48 px y acciones principales de al menos 44 px. Los controles de iconos aumentan su área táctil en teléfono.
- Espacios principales de 16, 20, 24 y 28 px; radios de 9–16 px según jerarquía.
- Formularios y filtros pasan a una columna cuando su contenido lo requiere. Los desplegables usan exclusivamente `Select.tsx` y `location-fields.css`.

## Comportamiento

Los mensajes de estado y los comentarios de conversación son superficies diferentes. Color, texto e iconos se complementan. Errores de formularios mantienen los valores y muestran enlaces a los campos afectados. Los indicadores de carga utilizan mensajes reales y siluetas decorativas.

GSAP, Framer Motion y las transiciones CSS conservan elementos propios. Las animaciones son breves, se cancelan al desmontar y respetan movimiento reducido. Los controles de escritura permanecen en posiciones estables. Véase [INTERACCIONES.md](../../docs/INTERACCIONES.md).

## Auditoría

Se verifica acceso, formulario de inspección, documentos, seguimiento, panel y gestión de áreas con axe y recorridos con teclado. Se revisan 375, 390, 768 y 1440 px, además de teléfono horizontal, aumento de texto y movimiento reducido. Una auditoría automática cubre las pantallas y estados evaluados; las siguientes pantallas deben conservar estos criterios.

## Pantallas de trabajo

La nueva capa define valores de marca, nombres semánticos y ajustes por componente. Las superficies son blancas sobre papel crema; el verde bosque identifica acciones y navegación seleccionada. Las etiquetas de error, vencimiento, aprobación y conversación mantienen su significado. Los componentes de la plataforma siguen siendo compartidos, incluido Select y sus reglas de foco.

Se aplicaron las guías instaladas de Marca, Diseño de Sistemas, UI Styling y UI UX Pro Max. Se conservan los componentes React/CSS existentes y los logos oficiales. La búsqueda de UI UX Pro Max verificó Minimalism & Swiss Style para herramientas empresariales; el patrón comercial Hero + Features + CTA no corresponde a estos módulos y se descartó. La distribución operativa y la paleta proceden de Berry y de la dirección aprobada por el propietario.

Véase [Plataforma](pages/plataforma.md) para los criterios de cada módulo y la verificación.

Los listados de Mis inspecciones y Buzón, y la gestión administrativa, usan además `src/WorkspaceUI.tsx` y `src/workspace-unified.css` para compartir cabeceras, filtros, resúmenes y navegación. Se conservan los tokens de esta guía. Véase [Diseño compartido del espacio de trabajo](../../docs/DISENO_ESPACIO_TRABAJO.md).
