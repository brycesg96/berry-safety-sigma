import { readFileSync } from 'node:fs';
import { createHash, randomUUID, timingSafeEqual } from 'node:crypto';

export const MAKE_TEST_PATH = '/api/integrations/make/test';
export function loadConfig(env) {
  const enabled = env.MAKE_TEST_ENABLED === 'true';
  const token = env.MAKE_TEST_API_TOKEN || '';
  let webhook;
  if (enabled) {
    try {
      webhook = new URL(env.MAKE_WEBHOOK_URL || '');
      if (webhook.protocol !== 'https:' || !/^hook\.(?:[a-z0-9-]+\.)?make\.com$/i.test(webhook.hostname) || webhook.username || webhook.password || webhook.search || webhook.hash || webhook.port || !/^\/[A-Za-z0-9_-]+$/.test(webhook.pathname)) throw new Error();
    } catch { throw new Error('MAKE_WEBHOOK_URL debe ser un webhook HTTPS válido de Make.'); }
    if (token.length < 32) throw new Error('MAKE_TEST_API_TOKEN debe tener al menos 32 caracteres.');
  }
  const origins = new Set((env.BERRY_ALLOWED_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean));
  for (const origin of origins) {
    let url;
    try { url = new URL(origin); } catch { throw new Error('BERRY_ALLOWED_ORIGINS contiene un origen inválido.'); }
    if (url.origin !== origin || (url.protocol !== 'https:' && !(env.NODE_ENV !== 'production' && url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname)))) throw new Error('Los orígenes deben ser HTTPS; localhost HTTP se permite solo en desarrollo.');
  }
  if (enabled && !origins.size) throw new Error('Configura BERRY_ALLOWED_ORIGINS antes de habilitar la prueba.');
  return { enabled, token, webhook: webhook?.href, origins };
}
export const secureEqual = (a, b) => timingSafeEqual(createHash('sha256').update(a).digest(), createHash('sha256').update(b).digest());
export function buildSample(requestId, now = new Date()) {
  const date = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Lima', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
  const number = `IH-${date.slice(0, 4)}-001`;
  return {
    schema_version: '1.0', source: 'Berry Safety / BR Sigma', request_id: requestId, mode: 'test', send_email: false,
    es_ejemplo: true, codigo_reservado: false, numero: number, fecha: date,
    fundo: 'Fundo de prueba - Armonía 2', area: 'Taller de Maquinaria',
    inspector: { nombre: 'Ana de Prueba', correo: 'inspector@example.invalid', area: 'Seguridad y Salud', cargo: 'Inspector SST' },
    responsable: { nombre: 'Juan de Prueba', correo: 'responsable@example.invalid', area: 'Mantenimiento', cargo: 'Supervisor' },
    outlook: { para: [{ address: 'responsable@example.invalid', name: 'Juan de Prueba' }], cc: [{ address: 'supervisor@example.invalid', name: '' }], cco: [] },
    adjuntos: [{ nombre: 'EJEMPLO-NO-ES-INFORME.xlsx', tipo: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', contenido_base64: readFileSync(new URL('./fixtures/example.xlsx', import.meta.url)).toString('base64') }],
    destinatarios: { para: ['responsable@example.invalid'], cc: ['supervisor@example.invalid'], cco: ['auditoria@example.invalid'] },
    asunto: `[PRUEBA — NO ENVIAR CORREO] Inspección ${number}`,
    cuerpo_html: `<h2>Inspección de prueba — Berry Safety / BR Sigma</h2><p>Este mensaje contiene datos ficticios. No enviar correo.</p><table><tr><th>Número de ejemplo</th><td>${number}</td></tr><tr><th>Fecha</th><td>${date}</td></tr><tr><th>Fundo</th><td>Fundo de prueba - Armonía 2</td></tr><tr><th>Área</th><td>Taller de Maquinaria</td></tr></table><p>No se ha reservado ningún código ni registrado una inspección real.</p>`,
  };
}
export function reply(res, status, data, cors = {}) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', ...cors });
  res.end(JSON.stringify(data));
}
export async function bodyOf(req, limit = 4096) {
  return new Promise((resolve, reject) => {
    let bytes = 0, done = false; let chunks = [];
    req.on('data', chunk => {
      if (done) return; bytes += chunk.length;
      if (bytes > limit) { done = true; chunks = []; reject(new Error('BODY_TOO_LARGE')); return; }
      chunks.push(chunk);
    });
    req.on('end', () => { if (done) return; done = true; try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); } catch { reject(new Error('INVALID_JSON')); } });
    req.on('error', () => reject(new Error('INVALID_BODY')));
    req.on('aborted', () => reject(new Error('INVALID_BODY')));
  });
}
/** No URL, token, provider response body or inspection data is written to logs. */
export function createMakeTestHandler({ env = process.env, fetchImpl = fetch, now = () => new Date(), timeoutMs = 10000 } = {}) {
  const config = loadConfig(env);
  const requests = new Map(); const unauthorized = new Map(); let attempts = [];
  return async function handle(req, res) {
    const origin = req.headers.origin;
    const cors = origin && config.origins.has(origin) ? { 'Access-Control-Allow-Origin': origin, Vary: 'Origin', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Authorization, Content-Type, Idempotency-Key' } : {};
    const fail = (status, code, message) => reply(res, status, { ok: false, code, message }, cors);
    if (req.url === '/healthz' && req.method === 'GET') { reply(res, 200, { status: 'ok' }); return; }
    if (req.url !== MAKE_TEST_PATH) { fail(404, 'NOT_FOUND', 'Ruta no disponible.'); return; }
    if (origin && !config.origins.has(origin)) { fail(403, 'ORIGIN_NOT_ALLOWED', 'Origen de la aplicación no permitido.'); return; }
    if (req.method === 'OPTIONS') { res.writeHead(204, { ...cors, 'Cache-Control': 'no-store' }); res.end(); return; }
    if (req.method !== 'POST') { fail(405, 'METHOD_NOT_ALLOWED', 'Esta ruta solo acepta POST.'); return; }
    if (!config.enabled) { fail(503, 'TEST_DISABLED', 'La prueba de Make está desactivada en el servidor.'); return; }
    const time = now().getTime();
    for (const [key, value] of requests) if (value.expires <= time) requests.delete(key);
    for (const [key, value] of unauthorized) if (value.expires <= time) unauthorized.delete(key);
    const ip = req.socket.remoteAddress || 'unknown';
    if ((unauthorized.get(ip)?.count || 0) >= 10) { fail(429, 'RATE_LIMITED', 'Demasiados intentos. Espera un minuto antes de repetir.'); return; }
    const authorization = req.headers.authorization || '';
    if (!authorization.startsWith('Bearer ') || !secureEqual(authorization.slice(7), config.token)) {
      const entry = unauthorized.get(ip); unauthorized.set(ip, { count: (entry?.count || 0) + 1, expires: entry?.expires || time + 60000 });
      if (unauthorized.size > 1000) unauthorized.delete(unauthorized.keys().next().value);
      fail(401, 'UNAUTHORIZED', 'La clave de prueba no es válida.'); return;
    }
    if (!((req.headers['content-type'] || '').split(';')[0].trim().toLowerCase() === 'application/json')) { fail(415, 'JSON_REQUIRED', 'Envía la solicitud en formato JSON.'); return; }
    let input;
    try { input = await bodyOf(req); } catch (error) { fail(error.message === 'BODY_TOO_LARGE' ? 413 : 400, 'INVALID_BODY', 'La solicitud JSON no es válida o supera el límite permitido.'); return; }
    if (!input || Array.isArray(input) || input.action !== 'make.test' || Object.keys(input).some(key => key !== 'action')) { fail(400, 'INVALID_ACTION', 'Esta ruta solo permite la prueba ficticia de Make.'); return; }
    const requestId = req.headers['idempotency-key'];
    if (typeof requestId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(requestId)) { fail(400, 'REQUEST_ID_REQUIRED', 'La prueba necesita un identificador único válido.'); return; }
    const existing = requests.get(requestId);
    if (existing) { const result = await existing.result; reply(res, result.status, result.body, cors); return; }
    attempts = attempts.filter(t => time - t < 60000);
    if (attempts.length >= 5) { fail(429, 'RATE_LIMITED', 'Límite de cinco pruebas por minuto. Espera antes de repetir.'); return; }
    attempts.push(time);
    const pending = (async () => {
      const payload = buildSample(requestId, now());
      try {
        const upstream = await fetchImpl(config.webhook, { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/plain', 'X-Berry-Mode': 'test' }, body: JSON.stringify(payload), redirect: 'error', signal: AbortSignal.timeout(timeoutMs) });
        await upstream.body?.cancel();
        if (!upstream.ok) return { status: 502, body: { ok: false, code: 'MAKE_REJECTED', receipt: 'rejected', request_id: requestId, upstream_status: upstream.status, message: 'Make rechazó la solicitud de prueba. No se confirma recepción correcta.' } };
        return { status: 200, body: { ok: true, receipt: 'http_accepted', request_id: requestId, upstream_status: upstream.status, submitted_at: now().toISOString(), email_requested: false, message: 'Make aceptó la solicitud HTTP. Esto no confirma la ejecución completa del escenario ni el envío de correo.' } };
      } catch (error) {
        const timeout = error?.name === 'TimeoutError' || error?.name === 'AbortError';
        return { status: timeout ? 504 : 502, body: { ok: false, code: timeout ? 'MAKE_TIMEOUT' : 'MAKE_UNCONFIRMED', receipt: 'unconfirmed', request_id: requestId, message: 'No se pudo confirmar la recepción. Revisa el historial de Make antes de repetir la prueba.' } };
      }
    })();
    requests.set(requestId, { expires: time + 600000, result: pending });
    const result = await pending; reply(res, result.status, result.body, cors);
  };
}
