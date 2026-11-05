import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createApi } from './index.mjs';
import { buildSample, loadConfig, MAKE_TEST_PATH } from './make-test.mjs';
const token = 'test-only-key-'.repeat(4);
const webhook = 'https://hook.us2.make.com/fictitious-test-endpoint';
const env = { BERRY_PROTOTYPE_MODE: 'false', MAKE_TEST_ENABLED: 'true', MAKE_TEST_API_TOKEN: token, MAKE_WEBHOOK_URL: webhook, BERRY_ALLOWED_ORIGINS: 'https://berry.example', NODE_ENV: 'production' };
async function api(t, options = {}) {
  const calls = [];
  const server = createApi({ env, fetchImpl: async (...args) => { calls.push(args); return new Response('Accepted', { status: 200 }); }, ...options });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => { server.closeAllConnections(); server.close(resolve); }));
  const base = `http://127.0.0.1:${server.address().port}`;
  const send = async ({ id = randomUUID(), authorization = `Bearer ${token}`, origin = 'https://berry.example', body = JSON.stringify({ action: 'make.test' }), contentType = 'application/json' } = {}) => {
    const response = await fetch(base + MAKE_TEST_PATH, { method: 'POST', headers: { Authorization: authorization, Origin: origin, 'Content-Type': contentType, 'Idempotency-Key': id }, body });
    return { status: response.status, data: await response.json(), headers: response.headers };
  };
  return { calls, send, base };
}
test('desactivado por defecto; health no expone configuración', async t => {
  const { calls, send, base } = await api(t, { env: { BERRY_ALLOWED_ORIGINS: 'https://berry.example' } });
  assert.equal((await send()).status, 503); assert.equal(calls.length, 0);
  assert.deepEqual(await (await fetch(base + '/healthz')).json(), { status: 'ok' });
});
test('configuración HTTPS de Make, token fuerte y orígenes exactos', () => {
  assert.equal(loadConfig(env).webhook, webhook);
  for (const value of ['http://hook.us2.make.com/private', 'https://evil.example/private', 'https://hook.us2.make.com/private?key=secret', 'https://user:secret@hook.us2.make.com/private']) assert.throws(() => loadConfig({ ...env, MAKE_WEBHOOK_URL: value }), /webhook HTTPS válido/);
  assert.throws(() => loadConfig({ ...env, MAKE_TEST_API_TOKEN: 'short' }), /32 caracteres/);
  assert.throws(() => loadConfig({ ...env, BERRY_ALLOWED_ORIGINS: '*' }), /origen inválido/);
  assert.throws(() => loadConfig({ ...env, BERRY_ALLOWED_ORIGINS: 'http://berry.example' }), /HTTPS/);
});
test('auth, CORS, formato JSON y carga fija bloquean solicitudes no permitidas', async t => {
  const { calls, send, base } = await api(t);
  assert.equal((await send({ authorization: 'Bearer incorrect' })).status, 401);
  assert.equal((await send({ origin: 'https://evil.example' })).status, 403);
  assert.equal((await send({ contentType: 'text/plain' })).status, 415);
  assert.equal((await send({ body: '{' })).status, 400);
  assert.equal((await send({ body: JSON.stringify({ action: 'make.test', send_email: true }) })).status, 400);
  assert.equal((await send({ body: JSON.stringify({ action: 'make.test', webhook_url: 'https://evil.example' }) })).status, 400);
  assert.equal((await send({ body: JSON.stringify({ action: 'make.test', extra: 'x'.repeat(5000) }) })).status, 413);
  assert.equal(calls.length, 0);
  const preflight = await fetch(base + MAKE_TEST_PATH, { method: 'OPTIONS', headers: { Origin: 'https://berry.example', 'Access-Control-Request-Method': 'POST' } });
  assert.equal(preflight.status, 204); assert.equal(preflight.headers.get('access-control-allow-origin'), 'https://berry.example');
  const blocked = await fetch(base + MAKE_TEST_PATH, { method: 'OPTIONS', headers: { Origin: 'https://evil.example' } });
  assert.equal(blocked.status, 403); assert.equal(blocked.headers.get('access-control-allow-origin'), null);
});
test('POST real del handler: JSON ficticio completo, secretos solo en el servidor y acuse limitado a HTTP', async t => {
  let captured;
  const { send } = await api(t, { now: () => new Date('2026-11-04T15:00:00Z'), fetchImpl: async (url, options) => { captured = { url, options }; return new Response(`secret body ${webhook} ${token}`, { status: 202 }); } });
  const id = randomUUID(); const result = await send({ id });
  assert.equal(result.status, 200); assert.equal(result.data.receipt, 'http_accepted'); assert.equal(result.data.upstream_status, 202); assert.equal(result.data.email_requested, false); assert.equal(result.data.request_id, id);
  assert.equal(captured.url, webhook); assert.equal(captured.options.method, 'POST'); assert.equal(captured.options.redirect, 'error');
  assert.equal(captured.options.headers['Content-Type'], 'application/json'); assert.equal(captured.options.headers.Authorization, undefined);
  const payload = JSON.parse(captured.options.body);
  assert.equal(payload.numero, 'IH-2026-001'); assert.equal(payload.fecha, '2026-11-04'); assert.equal(payload.mode, 'test'); assert.equal(payload.send_email, false); assert.equal(payload.codigo_reservado, false);
  for (const key of ['fundo', 'area', 'inspector', 'responsable', 'asunto', 'cuerpo_html']) assert.ok(payload[key]);
  for (const field of ['para', 'cc', 'cco']) assert.ok(payload.destinatarios[field].every(email => email.endsWith('@example.invalid')));
  const output = JSON.stringify(result.data); assert.ok(!output.includes(webhook)); assert.ok(!output.includes(token)); assert.ok(!output.includes('secret body'));
});
test('error y timeout no se presentan como recepción correcta', async t => {
  const rejected = await api(t, { fetchImpl: async () => new Response(`provider secret ${webhook}`, { status: 429 }) });
  const result = await rejected.send(); assert.equal(result.status, 502); assert.equal(result.data.code, 'MAKE_REJECTED'); assert.equal(result.data.upstream_status, 429); assert.ok(!JSON.stringify(result).includes(webhook));
  const timed = await api(t, { timeoutMs: 10, fetchImpl: async (_url, options) => new Promise((_resolve, reject) => options.signal.addEventListener('abort', () => reject(options.signal.reason))) });
  const timeout = await timed.send(); assert.equal(timeout.status, 504); assert.equal(timeout.data.receipt, 'unconfirmed'); assert.equal(timeout.data.ok, false);
});
test('reintentos concurrentes de la misma prueba llaman una sola vez a Make', async t => {
  let calls = 0;
  const { send } = await api(t, { fetchImpl: async () => { calls++; await new Promise(resolve => setTimeout(resolve, 10)); return new Response('Accepted'); } });
  const id = randomUUID(); const results = await Promise.all([send({ id }), send({ id })]);
  assert.equal(calls, 1); assert.deepEqual(results[0].data, results[1].data); assert.equal(results[0].data.ok, true);
});
test('las pruebas nuevas se limitan a cinco por minuto', async t => {
  const { calls, send } = await api(t);
  for (let i = 0; i < 5; i++) assert.equal((await send()).status, 200);
  assert.equal((await send()).status, 429); assert.equal(calls.length, 5);
});
test('fecha de Perú y cambio de año sin reservar correlativos', () => {
  assert.equal(buildSample('sample', new Date('2027-01-01T04:59:59Z')).numero, 'IH-2026-001');
  assert.equal(buildSample('sample', new Date('2027-01-01T05:00:00Z')).numero, 'IH-2027-001');
});

test('prototipo permite probar sin clave, exige origen permitido y continúa sin solicitar correo',async t=>{
 const {send,calls}=await api(t,{env:{...env,BERRY_PROTOTYPE_MODE:'true'}});
 assert.equal((await send({authorization:''})).status,200);
 assert.equal(JSON.parse(calls[0][1].body).send_email,false);
 assert.equal((await send({authorization:'',origin:'https://evil.example'})).status,403);
 assert.equal((await send({authorization:'',origin:''})).status,403);
});
