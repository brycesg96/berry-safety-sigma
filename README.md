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
2. **Observaciones:** registros repetibles, descripción, medida correctiva, criticidad alta/media/baja, fecha de compromiso manual y hasta ocho fotografías por observación. Se requiere al menos una observación para continuar.
3. **Resumen:** recuento por criticidad, evidencias, acciones y fechas, con acceso a la edición.
4. **Cierre:** conclusiones, recomendaciones e identificación del inspector.
5. **Revisión y envío:** revisión de información y destinatarios, y descarga de un informe Excel con fotografías integradas.

El menú lateral se convierte en un panel desplegable en móvil. Incluye perfil local editable, guía rápida y lista de inspecciones con búsqueda, filtro, continuación y eliminación con confirmación.

## Guardado y alcance de esta versión

- El espacio de pruebas conserva los borradores y fotografías en **IndexedDB del navegador**. El espacio autenticado conecta las nuevas inspecciones a Supabase al activar la tercera migración; permite retomar borradores, enviar y revisar desde otros dispositivos. Los datos históricos locales no se importan automáticamente.
- Las fotos JPG, PNG y WebP se convierten a JPEG de hasta 1600 píxeles para reducir el almacenamiento. El límite de entrada es de 15 MB por fotografía.
- La demostración incluye las cuentas Bryan `bryx.96@gmail.com` (administrador) y `bcespedes@hortifrut.com` (inspecciones). Los registros locales anteriores se conservan; las altas se gestionan únicamente desde Administrar usuarios con Supabase. `VITE_DIRECTORY_URL` permite añadir un directorio remoto. El acceso real usa correo y contraseña de Supabase; la opción Microsoft fue retirada.
- El Excel utiliza la plantilla oficial proporcionada y conserva sus medidas, formatos y fotografías. El registro autenticado asigna un correlativo anual y guarda el archivo por año y mes de inspección. El paso 4 sustituye el inicial por el único Excel final al aprobar todos los levantamientos.
- El envío de correo utiliza Render, Make y Outlook. La aceptación de Make no confirma por sí sola la entrega al buzón. La opción secundaria de compartir localmente no envía correo.
- El espacio de pruebas conserva perfiles y roles locales. La ruta `?acceso=cuenta` permite entrar con una cuenta habilitada de Supabase y guardar su nombre, área y cargo con permisos del servidor. La tercera etapa habilita el botón Entrar al espacio de trabajo, con borradores privados, directorio real, archivos y seguimiento compartido. Requiere ejecutar su SQL y desplegar la API; conserva el espacio de pruebas y sus informes locales por separado. [Etapas y estado de la conexión](docs/SUPABASE.md).
- Administración del portal incluye creación y consulta de usuarios con contraseña temporal y cambio obligatorio al primer ingreso. Requiere ejecutar la segunda migración y configurar una clave privada **solo en Render**, sin cambios de plan. [Activación única](docs/USUARIOS.md).
- Los registros cerrados admiten descarga directa en PDF con el formato de impresión de la hoja V.01, además de Excel. [Formato y validación](docs/PDF.md).

## Pruebas

```bash
npm test
```

El servidor de pruebas configura un endpoint relativo interceptado por Playwright con datos ficticios, sin consultar ni publicar directorios reales. Las pruebas de Playwright ejecutan el recorrido completo, validación, evidencias y persistencia tras recargar, lectura del Excel generado (incluidas las imágenes), menú móvil, búsqueda, eliminación y comprobación de desbordamiento a cinco tamaños de pantalla.

Por defecto usan Chromium en `/usr/bin/chromium`. En otro equipo se puede indicar `CHROMIUM_PATH=/ruta/a/chromium npm test`, o ajustar la configuración para un navegador instalado por Playwright. El servidor de desarrollo se inicia automáticamente si no está ejecutándose. Las capturas de validación se escriben en `/tmp/berry-desktop.png`, `/tmp/berry-mobile.png` y `/tmp/berry-mobile-menu.png`.

Las pruebas de PDF necesitan `pdftotext`, `pdfinfo` y `pdfimages` (Poppler) para comprobar los archivos con un lector independiente. Las del corrector ortográfico verifican los atributos nativos y el idioma; las líneas rojas y sugerencias requieren que el navegador del usuario tenga activada la revisión en español.

`npm run test:supabase` verifica la estructura inicial, RLS y permisos con PostgreSQL embebido y datos ficticios, sin modificar el proyecto real. `npx playwright test tests/cloud-access.spec.ts` prueba el acceso y el perfil con respuestas de Auth/API interceptadas. El [estado de la integración](docs/SUPABASE.md) distingue el acceso y perfil conectados de la sincronización de inspecciones todavía pendiente.

El flujo de envío de inspecciones con Excel y copias automáticas de jefes/gerentes se describe en [Envío de informes](docs/ENVIO_INFORMES.md). Requiere completar el mapeo de Make y habilitar los informes en Render; las pruebas de conexión siguen sin enviar correo.

Las inspecciones se conservan con Guardar y también al confirmar el envío; los levantamientos usan Guardar avance, con aviso de cambios pendientes. [Funcionamiento del guardado manual](docs/GUARDADO_MANUAL.md).

Los desplegables comparten el diseño de Sede/Zona. [Búsqueda múltiple y áreas organizativas en el panel](docs/FILTROS_PANEL.md).
