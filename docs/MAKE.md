# Prueba HTTPS con Make

## Arquitectura revisada y cambio añadido

La web existente es React/TypeScript/Vite, publicada en GitHub Pages. Las inspecciones y evidencias permanecen en IndexedDB del navegador; las cuentas de prueba usan localStorage. `reference/registry.py` es una referencia de numeración, no un backend conectado. No había un servidor operativo que pudiera custodiar un secreto.

Se añade una API Node.js 24 independiente en `server/`. La web llama a `POST /api/integrations/make/test`; la API verifica la clave de prueba y el origen permitido, construye un ejemplo fijo y hace el POST JSON al Custom webhook de Make. No se conecta con el botón de envío de inspecciones, no modifica los borradores, no reserva códigos y no envía correos desde Berry.

```
Administración → Integraciones → API HTTPS de Berry → Custom webhook de Make
                                MAKE_WEBHOOK_URL
                                (secreto del servidor)
```

## Configuración segura

| Variable | Dónde se configura | Uso |
| --- | --- | --- |
| `MAKE_WEBHOOK_URL` | Secretos del servidor | URL completa y vigente del Custom webhook HTTPS. Nunca en `VITE_*`, código, logs ni repositorio. |
| `MAKE_TEST_API_TOKEN` | Secretos del servidor | Clave de prueba aleatoria de al menos 32 caracteres. Solo para esta API, no es una clave de Make. |
| `MAKE_TEST_ENABLED` | Servidor | `false` por defecto; `true` permite enviar exclusivamente el ejemplo ficticio. |
| `BERRY_ALLOWED_ORIGINS` | Servidor | Orígenes exactos autorizados, separados por coma y sin ruta; para Pages: `https://brycesg96.github.io`. |
| `VITE_MAKE_TEST_API_URL` | Variable pública de compilación de la web | URL del endpoint de Berry, por ejemplo `https://mi-api.example/api/integrations/make/test`. **No es la URL de Make.** |

La URL y clave del webhook no se introducen en la pantalla. El administrador introduce la clave de prueba de la API cuando necesita usar el botón; se mantiene en memoria durante esa pantalla y no se guarda en localStorage/sessionStorage ni se incluye en la compilación. Los roles locales no constituyen autenticación real: la API exige su propia clave. Antes de utilizar datos reales deberá conectarse Microsoft y autorización en servidor.

`server/.env.example` contiene solo nombres y ejemplos vacíos. El archivo local `server/.env` es privado, con permisos 600, y está excluido de Git y Docker. No se publica con GitHub Pages. Los secretos de GitHub Actions tampoco crean un servidor ni sirven como variables de ejecución de Pages.

## Alojamiento recomendado: Render

Se incluye `render.yaml` para un servicio Docker gratuito y `server/Dockerfile` sin dependencias adicionales. El servicio arranca desactivado. Su creación requiere la cuenta de Render del propietario; no se ha creado una cuenta ni un servicio externo automáticamente.

1. Crear un **Blueprint** en Render con este repositorio y revisar el servicio `berry-safety-api`. Alternativamente, crear un Web Service Docker con `server/Dockerfile` y contexto raíz.
2. Guardar la URL vigente en el secreto `MAKE_WEBHOOK_URL`. El Blueprint genera `MAKE_TEST_API_TOKEN`; conservarlo en el gestor de secretos y usarlo para la prueba en Administración.
3. En el escenario existente, colocar un filtro entre **Custom webhook** y **Microsoft 365 Email (Outlook) → Send an Email**, con ambas condiciones (AND): `send_email` igual al booleano `true` y `mode` distinto de `test`. Durante esta fase todos los ejemplos llevan `send_email:false` y `mode:test`, por lo que Outlook no debe ejecutarse. Alternativamente, desconectar temporalmente Outlook mientras se comprueba la recepción. El indicador por sí solo no desactiva módulos externos; no utilizar destinatarios reales ni campos de destinatario fijos en Outlook para esta prueba.
4. Configurar `BERRY_ALLOWED_ORIGINS=https://brycesg96.github.io`. Cambiar `MAKE_TEST_ENABLED` a `true` cuando el webhook esté preparado. Render termina HTTPS delante del servidor HTTP del contenedor.
5. Comprobar `https://<servicio>.onrender.com/healthz`; debe devolver `{"status":"ok"}`. El plan gratuito puede tardar en despertar tras inactividad; esperar a que el servicio esté listo antes de la prueba.
6. La publicación de Pages ya utiliza `https://berry-safety-api.onrender.com/api/integrations/make/test` como API pública predeterminada. Para cambiar de alojamiento, en GitHub → **Settings → Secrets and variables → Actions → Variables**, crear `VITE_MAKE_TEST_API_URL` con el nuevo endpoint y volver a ejecutar `pages.yml`. Esta dirección es pública y no contiene la URL ni la clave de Make.
7. Abrir **Administración → Integraciones**, introducir la clave de prueba de la API y pulsar **Probar conexión con Make**. Mientras no exista el alojamiento y esa variable pública, la web muestra el apartado desconectado y el botón deshabilitado.

## Dónde introducir la URL

**En Render:** abrir el servicio `berry-safety-api` → **Environment** → **Add Environment Variable**. Nombre: `MAKE_WEBHOOK_URL`; valor: la URL completa del Custom webhook. Guardar y desplegar de nuevo. No colocar esa URL en la configuración de GitHub Pages ni en un campo de la aplicación.

**En desarrollo local:** copiar `server/.env.example` a `server/.env` y completar `MAKE_WEBHOOK_URL` allí, junto con la clave de API y el origen local permitido. El archivo está ignorado por Git; nunca subirlo al repositorio. Para probar, habilitar `MAKE_TEST_ENABLED=true` y arrancar la API y Vite.

Para mapear el escenario en una fase posterior, el JSON incluye `destinatarios.para`, `destinatarios.cc`, `destinatarios.cco`, `asunto` y `cuerpo_html`; el cuerpo es HTML. En esta fase son datos ficticios y el filtro debe impedir el paso a Outlook. El resultado de la app es únicamente el acuse HTTP del webhook; revisar el historial de ejecución en Make para conocer el resultado de cada módulo.

## Desarrollo y pruebas

Node.js 24:

```bash
npm run dev:api
npm run dev
npm run test:api
npm test
```

`dev:api` carga opcionalmente `server/.env`; `start:api` utiliza las variables del alojamiento. Vite solo reenvía la ruta de prueba a `127.0.0.1:8787` durante desarrollo. La interfaz publicada en Pages necesita la API HTTPS externa.

Las pruebas automáticas usan webhooks ficticios y respuestas simuladas; no llaman al webhook real. Verifican el JSON, CORS, autenticación, tamaño de entrada, tiempos de espera, rechazo, reintentos, límites y ausencia de secretos en las respuestas. Las pruebas de la interfaz comprueban éxito, falta de confirmación y clave no persistida; las funcionalidades anteriores siguen cubiertas.

## JSON de ejemplo

La API construye el cuerpo completo; el navegador solo envía `{"action":"make.test"}`. No acepta URL de destino, destinatarios ni datos de una inspección real desde el navegador.

```json
{
  "schema_version": "1.0",
  "source": "Berry Safety / BR Sigma",
  "request_id": "UUID generado para la prueba",
  "mode": "test",
  "send_email": false,
  "es_ejemplo": true,
  "codigo_reservado": false,
  "numero": "IH-2026-001",
  "fecha": "2026-11-04",
  "fundo": "Fundo de prueba - Armonía 2",
  "area": "Taller de Maquinaria",
  "inspector": {"nombre":"Ana de Prueba","correo":"inspector@example.invalid","area":"Seguridad y Salud","cargo":"Inspector SST"},
  "responsable": {"nombre":"Juan de Prueba","correo":"responsable@example.invalid","area":"Mantenimiento","cargo":"Supervisor"},
  "destinatarios": {"para":["responsable@example.invalid"],"cc":["supervisor@example.invalid"],"cco":["auditoria@example.invalid"]},
  "asunto": "[PRUEBA — NO ENVIAR CORREO] Inspección IH-2026-001",
  "cuerpo_html": "<h2>Inspección de prueba</h2><p>Datos ficticios; no enviar correo.</p>"
}
```

Fecha y año usan `America/Lima`. El número es un ejemplo sin reserva de correlativo. `.invalid` no corresponde a buzones reales. No se genera ni adjunta un Excel real en esta fase.

## Interpretar la respuesta

- **Make aceptó la solicitud (HTTP 2xx):** aceptación HTTP del webhook. No demuestra ejecución completa del escenario, almacenamiento ni entrega de correo.
- **Make rechazó (HTTP 410 u otro):** no se confirma recepción correcta; revisar URL vigente y estado del Custom webhook.
- **Timeout o error de red:** recepción no confirmada. El proveedor pudo recibir la solicitud antes del corte; revisar el historial antes de repetir.
- El botón reutiliza el mismo ID al reintentar. La API conserva el resultado diez minutos en memoria y limita nuevas pruebas a cinco por minuto. Ese control es para esta prueba: varias réplicas o reinicios requieren almacenamiento compartido antes de usarlo con informes reales.
- **Preparar otra prueba** genera un ID nuevo en el siguiente envío. No hay reintentos automáticos del servidor.

## Verificación real realizada el 4 de noviembre de 2026

Se ejecutó una única prueba desde la interfaz local, pasando por la API y usando la URL entregada únicamente desde la configuración privada del servidor. Make devolvió **HTTP 410 (Gone)**; la API informó rechazo y no presentó un éxito ficticio. No se confirma recepción correcta en el escenario. La prueba solicitó `send_email:false` y destinatarios ficticios; Berry no llamó a ningún servicio de correo.

Después de que el usuario confirmara nuevamente la URL, se realizó una única prueba adicional a través de la API el 4 de noviembre de 2026 a las 14:59 (hora de Lima). Make respondió **HTTP 200**; la API devolvió `receipt:http_accepted`, con ID `728d0c02-883b-4ed9-bdc0-988f539ba7cf`. Se utilizaron datos ficticios y `send_email:false`. Esto confirma aceptación HTTP, no ejecución completa del escenario ni entrega de correo.

La prueba solo se habilitó en memoria para esa llamada; la configuración local permanece desactivada. El servidor temporal se cerró después de la prueba. La web pública todavía necesita el servicio Render y la variable pública de API descritos arriba.

## Backend Render verificado

El 4 de noviembre de 2026 se comprobó `https://berry-safety-api.onrender.com/healthz`: HTTP 200 y `{"status":"ok"}`. El preflight OPTIONS de la ruta de prueba devolvió HTTP 204 y autorizó el origen `https://brycesg96.github.io`, POST y los encabezados de autenticación y prueba. La publicación web queda configurada para ese endpoint público. Estas comprobaciones no ejecutan Make, no prueban los secretos y no confirman el estado de `MAKE_TEST_ENABLED`; la prueba real del escenario con Outlook sigue pendiente de su filtro y habilitación.
