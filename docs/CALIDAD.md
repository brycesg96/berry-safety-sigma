# Calidad y disponibilidad de Berry Safety

La publicación en GitHub Pages requiere que pasen tanto la compilación y las pruebas de servidor como todos los recorridos del navegador. Los cambios de una solicitud de incorporación a `main` también ejecutan los recorridos completos. No se publica si falla alguna prueba o si una prueba falla primero y solo pasa al reintentarse.

## Comprobaciones locales

Usa Node.js 24 e instala las dependencias con `npm ci`. Para las pruebas del navegador instala Chromium con `npx playwright install --with-deps chromium` y Poppler (`poppler-utils` en Ubuntu) para revisar los PDF.

| Comando | Qué revisa |
| --- | --- |
| `npm test -- --workers=2` | Recorridos de escritorio y móvil: formularios, permisos, borradores, catálogos, firmas, exportaciones y navegación. |
| `npm run test:api` | Validación, autenticación, adjuntos, duplicados, seguimiento y contratos de la API con servicios simulados. |
| `npm run test:supabase` | Estructura SQL, funciones y reglas de acceso previstas en las migraciones. |
| `npm run test:scripts` | Empaquetado del servidor, caché sin conexión, recordatorios, conservación de archivos y monitor. |
| `python3 -m unittest discover -s reference -p 'test_*.py' -v` | Referencias de numeración y catálogos; requiere `scripts/requirements-import.txt`. |
| `npm run build:pages` | Tipos TypeScript y compilación de producción. |
| `npm run check:availability` | Consultas públicas de disponibilidad, sin modificar registros ni enviar correos. |

Los recorridos usan `tests/test-fixture.ts`: las solicitudes a servicios externos o rutas `/api/` se bloquean salvo cuando el propio test las simula. Esto también se aplica a los contextos adicionales de navegador. El service worker se bloquea durante estas pruebas para que no evite ese aislamiento. Los datos de prueba no se envían a cuentas reales.

## Diagnóstico de fallos

En GitHub → **Actions**, abre la ejecución y descarga el artefacto **diagnostico-playwright**. Contiene el informe HTML, resultados JSON y, cuando falla una prueba, capturas, video y traza. Se conservan durante 14 días. El informe también identifica la prueba y el error en el registro de la ejecución.

Localmente puedes abrir el informe con `npx playwright show-report playwright-report` y una traza con `npx playwright show-trace ruta/al/trace.zip`. La integración continua rechaza `test.only` y permite un reintento para obtener evidencia adicional; ese reintento no convierte una prueba inestable en una publicación aprobada.

## Monitor público

El flujo **Disponibilidad de Berry Safety** se ejecuta cada hora y después de publicar. También puede iniciarse desde **Actions → Run workflow**. GitHub puede retrasar las ejecuciones programadas; no es un servicio de vigilancia en tiempo real.

Comprueba el HTML, sus archivos JavaScript y CSS, `/healthz`, la consulta pública de estado del esquema de Supabase y la existencia de las rutas de envío y eventos de correo. Las consultas tienen un límite de tiempo y un reintento para errores transitorios. Las rutas de correo reciben el origen de la web autorizado por la API.

Cada ejecución genera una tabla en su resumen y el artefacto `disponibilidad-<ejecución>` con `availability.json`, conservado durante 14 días. Un fallo marca la ejecución en rojo. Los avisos de GitHub dependen de las preferencias de notificación del usuario que sigue el repositorio y sus ejecuciones.

Las URL públicas se pueden sustituir con las variables del repositorio `BERRY_HEALTH_WEB_URL` y `BERRY_HEALTH_API_URL`. Esta configuración no requiere nuevas claves, ejecutar SQL ni activar opciones en Render.

## Alcance del seguimiento de correo

El monitor solo confirma que las rutas están instaladas; no envía mensajes, no comprueba credenciales de Make y no acredita recepción en el buzón corporativo. El informe conserva `mailDelivery: "not_tested"`.

La aplicación mantiene separados el envío aceptado y la entrega confirmada. Para confirmar entrega, rechazo o demora se necesita un evento auténtico del proveedor o el seguimiento de Microsoft 365, conectado al receptor firmado descrito en [PRODUCTIVIDAD.md](PRODUCTIVIDAD.md). Un correo en **Enviados** o una ejecución correcta de Make no prueban por sí solos su entrega al destinatario.

Las pruebas automatizadas reducen regresiones en los casos cubiertos. La revisión periódica de disponibilidad complementa esas pruebas con señales de los servicios publicados.
