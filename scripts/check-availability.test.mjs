import test from 'node:test';
import assert from 'node:assert/strict';
import { checkAvailability } from './check-availability.mjs';

function fixture(overrides = {}) {
  const calls = [];
  const fetchImpl = async (url, options) => {
    const path = new URL(url).pathname;
    calls.push({ path, method: options.method, headers: options.headers });
    if (overrides[path]) return overrides[path](calls.filter(call => call.path === path).length);
    if (path === '/berry-safety-sigma/') return new Response('<div id="root"></div><script type="module" src="/berry-safety-sigma/assets/app.js"></script><link rel="stylesheet" href="/berry-safety-sigma/assets/app.css">');
    if (path.endsWith('.js')) return new Response(null, { headers: { 'content-type': 'application/javascript' } });
    if (path.endsWith('.css')) return new Response(null, { headers: { 'content-type': 'text/css' } });
    if (path === '/healthz') return Response.json({ status: 'ok', revision: 'a'.repeat(40) });
    if (path.includes('berry_schema_status')) return Response.json({ sync_ready: true, reports_version: '202611080003', productivity_version: '202611170023' });
    return Response.json({ code: 'METHOD_NOT_ALLOWED' }, { status: 405 });
  };
  return { calls, fetchImpl };
}

test('checks production HTML, assets, database and API without sending mail or modifying records', async () => {
  const mock = fixture();
  const report = await checkAvailability({ fetchImpl: mock.fetchImpl, delay: async () => {} });
  assert.equal(report.ok, true); assert.equal(report.checks.length, 5);
  assert.equal(report.mailDelivery, 'not_tested');
  assert.ok(mock.calls.every(call => ['GET', 'HEAD'].includes(call.method)));
  assert.equal(mock.calls.filter(call => call.method === 'HEAD').length, 2);
  assert.ok(mock.calls.filter(call => call.path.startsWith('/api/')).every(call => call.headers.Origin === 'https://brycesg96.github.io'));
});
test('a missing production asset fails the result while preserving diagnostics for the other services', async () => {
  const mock = fixture({ '/berry-safety-sigma/assets/app.js': () => new Response(null, { status: 404 }) });
  const report = await checkAvailability({ fetchImpl: mock.fetchImpl, delay: async () => {} });
  assert.equal(report.ok, false); assert.equal(report.checks[1].ok, false); assert.equal(report.checks[3].ok, true);
});
test('a transient cold-start error is retried once and a persistent error remains a failure', async () => {
  let mock = fixture({ '/healthz': attempt => attempt === 1 ? new Response(null, { status: 503 }) : Response.json({ status: 'ok' }) });
  assert.equal((await checkAvailability({ fetchImpl: mock.fetchImpl, delay: async () => {} })).ok, true);
  assert.equal(mock.calls.filter(call => call.path === '/healthz').length, 2);
  mock = fixture({ '/healthz': () => new Response(null, { status: 503 }) });
  assert.equal((await checkAvailability({ fetchImpl: mock.fetchImpl, delay: async () => {} })).ok, false);
});
test('an incomplete schema or missing mail endpoint cannot report a healthy system or delivered email', async () => {
  const mock = fixture({
    '/rest/v1/rpc/berry_schema_status': () => Response.json({ sync_ready: false }),
    '/api/mail/events': () => Response.json({ code: 'NOT_FOUND' }, { status: 404 }),
  });
  const report = await checkAvailability({ fetchImpl: mock.fetchImpl, delay: async () => {} });
  assert.equal(report.ok, false); assert.equal(report.checks[3].ok, false); assert.equal(report.checks[4].ok, false);
  assert.equal(report.mailDelivery, 'not_tested');
});
test('the monitor refuses URLs containing credentials or query parameters', async () => {
  await assert.rejects(checkAvailability({ webURL: 'https://user:private@example.invalid/' }), /sin credenciales/);
  await assert.rejects(checkAvailability({ apiURL: 'https://example.invalid/?token=private' }), /sin credenciales/);
});
