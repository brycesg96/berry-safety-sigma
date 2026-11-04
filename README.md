# Berry · Safety Workspace

Aplicación web adaptable a teléfono, tablet y laptop para registrar inspecciones de seguridad y salud en el trabajo. Primera versión funcional en español, construida con React, TypeScript y Vite.

Puedes revisar [las capturas reales de escritorio y teléfono](docs/vistas/README.md) directamente en este repositorio. Son vistas del diseño; la publicación interactiva requiere que GitHub Pages esté activado.

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

1. **Datos generales:** empleador de solo lectura; registro/año, área, fecha, hora, responsable de la inspección; tipo Planeada, No planeada u Otro con detalle; objetivo de hasta 560 caracteres y responsables seleccionados por nombre, con correo automático no editable. [Alcance y conexión del directorio](docs/PRIMER_APARTADO.md).
2. **Observaciones:** registros repetibles, descripción, medida correctiva, criticidad alta/media/baja, fecha de compromiso manual y hasta ocho fotografías por observación. También permite confirmar explícitamente una inspección sin hallazgos.
3. **Resumen:** recuento por criticidad, evidencias, acciones y fechas, con acceso a la edición.
4. **Cierre:** conclusiones, recomendaciones e identificación del inspector.
5. **Revisión y envío:** revisión de información y destinatarios, y descarga de un informe Excel con fotografías integradas.

El menú lateral se convierte en un panel desplegable en móvil. Incluye perfil local editable, guía rápida y lista de inspecciones con búsqueda, filtro, continuación y eliminación con confirmación.

## Guardado y alcance de esta versión

- Los borradores y las fotografías se guardan automáticamente en **IndexedDB del navegador**; el perfil usa almacenamiento local. Se puede retomar una inspección al recargar. No se sincronizan entre dispositivos y se pierden si se borran los datos del sitio.
- Las fotos JPG, PNG y WebP se convierten a JPEG de hasta 1600 píxeles para reducir el almacenamiento. El límite de entrada es de 15 MB por fotografía.
- El directorio real de cuentas aún no está conectado. El buscador requiere configurar `VITE_DIRECTORY_URL` hacia un servicio autenticado; sin esa conexión no se pueden seleccionar responsables nuevos. Las pruebas usan respuestas simuladas, no usuarios reales.
- El Excel es **provisional**: aún falta recibir y mapear la plantilla oficial de la empresa.
- **No se envían correos.** El botón de envío explica que la conexión está pendiente y ofrece descargar el informe. No presenta una confirmación ficticia de envío.
- El perfil es local: no se ha implementado autenticación, control de permisos ni almacenamiento compartido. Esta versión sirve para probar el flujo y el diseño; la operación con varios usuarios requiere el backend descrito en [el alcance del producto](docs/PRODUCTO.md).
- La generación de Excel se carga bajo demanda para no retrasar la pantalla inicial.

## Pruebas

```bash
npm test
```

El servidor de pruebas configura un endpoint relativo interceptado por Playwright con datos ficticios, sin consultar ni publicar directorios reales. Las pruebas de Playwright ejecutan el recorrido completo, validación, evidencias y persistencia tras recargar, lectura del Excel generado (incluidas las imágenes), menú móvil, búsqueda, eliminación y comprobación de desbordamiento a cinco tamaños de pantalla.

Por defecto usan Chromium en `/usr/bin/chromium`. En otro equipo se puede indicar `CHROMIUM_PATH=/ruta/a/chromium npm test`, o ajustar la configuración para un navegador instalado por Playwright. El servidor de desarrollo se inicia automáticamente si no está ejecutándose. Las capturas de validación se escriben en `/tmp/berry-desktop.png`, `/tmp/berry-mobile.png` y `/tmp/berry-mobile-menu.png`.
