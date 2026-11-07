# Berry · Safety Workspace

Seguimiento: [lista de pendientes](docs/PENDIENTES.md). Administración: [cuentas y acceso de prueba](docs/ADMINISTRACION.md). Numeración: [códigos de inspección](docs/CODIGOS_INSPECCION.md).

Aplicación web adaptable a teléfono, tablet y laptop para registrar inspecciones de seguridad y salud en el trabajo. Primera versión funcional en español, construida con React, TypeScript y Vite.

Puedes revisar [las capturas reales de escritorio y teléfono](docs/vistas/README.md) directamente en este repositorio. Son vistas del diseño; la publicación interactiva requiere que GitHub Pages esté activado.

## Integración de prueba con Make

Se añade una API Node.js independiente en `server/` y Administración → Integraciones. Solo envía un JSON ficticio al webhook desde el servidor, con `send_email:false`; no modifica el flujo de inspecciones ni envía correos desde Berry. GitHub Pages mantiene la interfaz estática y necesita una API HTTPS externa para habilitar el botón. Consulta [configuración segura, despliegue en Render y resultado de la prueba](docs/MAKE.md).

## Desarrollo

Requisitos: Node.js 22 o posterior y npm. En el entorno de desarrollo se validó con Node.js 24.

```bash
cd /workspace/berry-safety-sigma
npm ci
npm run dev
```

El servidor usa el puerto 5173. Para una compilación de producción:

```bash
npm run build
npm run preview
```

`dist/` contiene los archivos para un alojamiento web estático con HTTPS. El guardado de fotos requiere un contexto seguro (HTTPS o localhost). Las tipografías se sirven con la aplicación; no hay servicios externos de fuentes.

## Publicación de prueba

El flujo `.github/workflows/pages.yml` prepara la publicación en GitHub Pages al actualizar `main` o ejecutarlo manualmente. La compilación específica `npm run build:pages` usa la ruta del repositorio y escribe en `dist-pages/`. Consulta [los pasos de activación y verificación](docs/PUBLICACION.md). Tener el flujo en el repositorio no confirma que GitHub Pages esté activado ni que la web esté publicada.

## Flujo implementado

1. **Datos generales:** empleador de solo lectura; código pendiente de asignación al registrar el envío, área, fecha, hora, responsable de la inspección; tipo Planeada, No planeada u Otro con detalle; objetivo de hasta 560 caracteres y responsables seleccionados por nombre, con correo automático no editable. [Alcance y conexión del directorio](docs/PRIMER_APARTADO.md).
2. **Observaciones:** registros repetibles, descripción, medida correctiva, criticidad alta/media/baja, fecha de compromiso manual y hasta ocho fotografías por observación. También permite confirmar explícitamente una inspección sin hallazgos.
3. **Resumen:** recuento por criticidad, evidencias, acciones y fechas, con acceso a la edición.
4. **Cierre:** conclusiones, recomendaciones e identificación del inspector.
5. **Revisión y envío:** revisión de información y destinatarios, y descarga de un informe Excel con fotografías integradas.

El menú lateral se convierte en un panel desplegable en móvil. Incluye perfil local editable, guía rápida y lista de inspecciones con búsqueda, filtro, continuación y eliminación con confirmación.

## Guardado y alcance de esta versión

- Los borradores y las fotografías se guardan automáticamente en **IndexedDB del navegador**; el perfil usa almacenamiento local. Se puede retomar una inspección al recargar. No se sincronizan entre dispositivos y se pierden si se borran los datos del sitio.
- Las fotos JPG, PNG y WebP se convierten a JPEG de hasta 1600 píxeles para reducir el almacenamiento. El límite de entrada es de 15 MB por fotografía.
- La demostración incluye las cuentas Bryan `bryx.96@gmail.com` (administrador) y `bcespedes@hortifrut.com` (inspecciones). Las altas locales de Administración aparecen en el directorio de ese navegador. `VITE_DIRECTORY_URL` permite añadir un directorio remoto; Microsoft y la sincronización real siguen pendientes.
- El Excel utiliza la plantilla oficial proporcionada y conserva sus medidas, formatos y fotografías. El código definitivo sigue pendiente del registro central.
- El envío de correo utiliza Render, Make y Outlook. La aceptación de Make no confirma por sí sola la entrega al buzón. La opción secundaria de compartir localmente no envía correo.
- El perfil y los roles son locales de prueba: no se ha implementado autenticación ni control de permisos en el servidor ni almacenamiento compartido. Esta versión sirve para probar el flujo y el diseño; la operación con varios usuarios requiere el backend descrito en [el alcance del producto](docs/PRODUCTO.md).
- Los registros cerrados admiten descarga directa en PDF con el formato de impresión de la hoja V.01, además de Excel. [Formato y validación](docs/PDF.md).

## Pruebas

```bash
npm test
```

El servidor de pruebas configura un endpoint relativo interceptado por Playwright con datos ficticios, sin consultar ni publicar directorios reales. Las pruebas de Playwright ejecutan el recorrido completo, validación, evidencias y persistencia tras recargar, lectura del Excel generado (incluidas las imágenes), menú móvil, búsqueda, eliminación y comprobación de desbordamiento a cinco tamaños de pantalla.

Por defecto usan Chromium en `/usr/bin/chromium`. En otro equipo se puede indicar `CHROMIUM_PATH=/ruta/a/chromium npm test`, o ajustar la configuración para un navegador instalado por Playwright. El servidor de desarrollo se inicia automáticamente si no está ejecutándose. Las capturas de validación se escriben en `/tmp/berry-desktop.png`, `/tmp/berry-mobile.png` y `/tmp/berry-mobile-menu.png`.

Las pruebas de PDF necesitan `pdftotext`, `pdfinfo` y `pdfimages` (Poppler) para comprobar los archivos con un lector independiente. Las del corrector ortográfico verifican los atributos nativos y el idioma; las líneas rojas y sugerencias requieren que el navegador del usuario tenga activada la revisión en español.

El flujo de envío de inspecciones con Excel y copias automáticas de jefes/gerentes se describe en [Envío de informes](docs/ENVIO_INFORMES.md). Requiere completar el mapeo de Make y habilitar los informes en Render; las pruebas de conexión siguen sin enviar correo.
