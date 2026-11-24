# Plataforma de trabajo

Extiende MASTER.md y la dirección de Inicio/Yo Seguro. Implementación en `src/workspace-theme.css`, cargada después de los estilos de los componentes.

## Base común

- Fondo de papel crema, superficies blancas y acciones verde bosque; el olivo acompaña iconos y referencias secundarias.
- Manrope y DM Sans locales, bordes finos, radios de 11 px en controles y 18 px en tarjetas, sombras discretas.
- Las identidades Berry/Hortifrut mantienen sus proporciones y colores. La navegación actual se anuncia también con `aria-current`.
- Se conservan los objetivos táctiles, el foco visible, la búsqueda bajo iniciativa del usuario y el comportamiento del menú móvil.

## Nueva inspección

Cabeceras y pasos sobre superficies claras; guía lateral en verde bosque con contraste alto. Los datos reales de la inspección se disponen en líneas legibles. Nombres, campos, firmas, guardado, validación y orden de pasos conservan su función.

## Mis inspecciones y Buzón

La vista seleccionada usa un fondo verde bosque y texto claro. Los listados tienen divisiones suaves y buscadores visibles. Los vencimientos y estados mantienen su propia identificación textual y cromática.

## Administración

Usuarios, informes y catálogos comparten las superficies y acciones del resto de la plataforma. Los encabezados de tablas son claros; la tabla del panel conserva su cálculo de ocho filas visibles, desplazamiento y cabecera fija. Los catálogos conservan su jerarquía, controles de orden y fuente única.

## Movimiento y accesibilidad

GSAP y Framer Motion mantienen sus elementos actuales. El estilo añade respuestas breves de color y sombra, sin mover los controles de escritura. Movimiento reducido cancela esas transiciones. Los modos de alto contraste conservan bordes de selección con colores del sistema.

Las pruebas revisan contraste con axe, pantallas de 375/1440 px, navegación entre secciones, búsqueda, apertura de documentos, informes cerrados y la distribución del panel. Las pruebas de distribución incluyen tablet y teléfono horizontal. Los datos de las capturas son ficticios y pertenecen al entorno de pruebas.
