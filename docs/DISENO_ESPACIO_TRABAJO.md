# Diseño compartido de inspecciones y administración

Mis inspecciones y Buzón de Inspecciones usan los mismos componentes de presentación en `src/WorkspaceUI.tsx`: cabecera, filtros de estado y resúmenes. `src/workspace-unified.css` define su presentación y la de los módulos administrativos con la paleta original de Berry: papel crema, verde bosque, superficies blancas y acentos salvia.

## Mis inspecciones y Buzón

Ambas pantallas tienen una cabecera con icono, contexto, título, descripción y las tres indicaciones del recorrido. Las cinco tarjetas de estado comparten tamaño, contadores, foco y selección; Cerradas conserva su azul propio. Los listados comparten buscador, separadores, identificación del registro, estado y acción de revisión.

Mis inspecciones mantiene borradores, filtros de fechas, creación y revisión de correcciones recibidas. Sus filas muestran responsables y sus áreas. Buzón mantiene prioridades, fechas de vencimiento y la atención de los hallazgos asignados; sus filas muestran el inspector que envió el informe. Unificar su presentación no mezcla los registros ni los permisos de ambos recorridos.

## Administración

La navegación reúne Usuarios, Áreas e Instalaciones, Inspecciones y Mi perfil en accesos con icono, descripción breve y estado de selección visible. Conserva las comprobaciones de cuenta administradora y el bloqueo de navegación durante operaciones o cambios pendientes.

- **Gestión de Usuarios:** cabecera común, resumen de cuentas registradas, activas e inhabilitadas, y pestañas para altas y consulta. Los contadores se calculan con las cuentas ya consultadas. El buscador, los permisos, los correos en copia y las acciones de cuenta mantienen sus funciones.
- **Áreas e Instalaciones:** cabecera común, resúmenes de datos activos y tres columnas numeradas que expresan la jerarquía. Gerencia → Área → Puesto y Sede → Zona → Instalación conservan sus relaciones y su orden. Administración continúa siendo la fuente matriz.
- **Gestión de Inspecciones:** cabecera con descarga del consolidado, estadísticas antes de los filtros, gráficos y tabla sobre superficies comunes. Los filtros siguen aplicándose a los datos, estadísticas y exportación; la tabla mantiene su cabecera fija y el desplazamiento interior.

## Interacción y datos

Se utilizan los Select existentes: abrir un desplegable no enfoca su buscador ni activa el teclado en pantalla. El foco visible, los controles táctiles y la búsqueda por iniciativa del usuario se mantienen. Las respuestas de color y sombra son breves y respetan movimiento reducido.

Esta entrega no requiere SQL. No altera datos, aprobación de observaciones, identidad del responsable real, permisos del servidor ni formatos Excel/PDF. Las comprobaciones existentes cubren búsquedas, acceso, catálogos, orden, cambios pendientes, descarga de informes, contraste y adaptación a teléfono/tablet/escritorio con datos ficticios.
