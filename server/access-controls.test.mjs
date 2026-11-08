import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Readable } from 'node:stream';
import { createAccountsHandler } from './accounts.mjs';

const owner = '60000000-0000-4000-8000-000000000001';
const target = '60000000-0000-4000-8000-000000000002';
const origin = 'https://berry.example';
const jwt = `eyJhbGciOiJIUzI1NiJ9.${Buffer.from(JSON.stringify({ sub: owner, iat: 100 })).toString('base64url')}.fictitious`;
function setup() {
  const state = { role: 'admin', enabled: true, deleted: false, temporary: false, calls: [], failure: null };
  const respond = (body, status = 200) => new Response(JSON.stringify(body), { status });
  const handle = createAccountsHandler({ env: { BERRY_ALLOWED_ORIGINS: origin, SUPABASE_SECRET_KEY: 'sb_secret_fictitious_key_123456789012345', NODE_ENV: 'production' }, fetchImpl: async (address, options) => {
    const path = new URL(address).pathname, body = options.body && JSON.parse(options.body);
    state.calls.push({ path, body, headers: options.headers, method: options.method });
    if (path === '/auth/v1/user') return respond({ id: owner });
    if (path === '/rest/v1/berry_profiles') return respond([{ id: owner, role: state.role, enabled: state.enabled, deleted_at: state.deleted ? '2026-11-08' : null, must_change_password: state.temporary, credentials_valid_after: 0 }]);
    assert.match(path, /^\/rest\/v1\/rpc\//);
    assert.equal(options.headers.Authorization, `Bearer ${jwt}`);
    return state.failure ? respond(state.failure, 400) : respond(path.endsWith('berry_admin_inspections') ? [{ id: target, revision: 2, code: 'IH-2026-010' }] : { id: target, access_revision: 3 });
  } });
  const send = async (url, body) => {
    const req = Readable.from(body === undefined ? [] : [Buffer.from(JSON.stringify(body))]);
    Object.assign(req, { url, method: body === undefined ? 'GET' : 'POST', headers: { origin, authorization: `Bearer ${jwt}`, 'content-type': 'application/json' }, socket: { remoteAddress: 'mock' } });
    let status, headers, result;
    await handle(req, { writeHead(value, next) { status = value; headers = next; }, end(value) { result = JSON.parse(value); } });
    assert.equal(headers['Cache-Control'], 'no-store');
    return { status, data: result };
  };
  return { state, send };
}
const permissions = { enabled: true, role: 'admin', can_create_inspections: false, can_receive_inspections: true };
test('all administrative endpoints verify the actual profile; user metadata cannot grant access', async () => {
  const { state, send } = setup();
  for (const changes of [{ role: 'inspector' }, { enabled: false }, { deleted: true }, { temporary: true }]) {
    Object.assign(state, { role: 'admin', enabled: true, deleted: false, temporary: false }, changes);
    for (const [path, body] of [['/api/accounts/inspections'], ['/api/accounts/manage', { id: target, expectedRevision: 2, action: 'update', permissions }], ['/api/accounts/inspections/delete', { id: target, expectedRevision: 2 }]]) assert.equal((await send(path, body)).status, 403);
  }
  assert.ok(state.calls.every(call => !call.path.includes('/rpc/')));
});
test('permission switches and inspection deletion use verified JWT RPCs, optimistic versions, and no Auth deletion/mail', async () => {
  const { state, send } = setup();
  assert.equal((await send('/api/accounts/manage', { id: target, expectedRevision: 2, action: 'update', permissions })).status, 200);
  assert.deepEqual(state.calls.at(-1).body, { p_id: target, p_expected: 2, p_action: 'update', p_permissions: permissions });
  assert.equal((await send('/api/accounts/manage', { id: target, expectedRevision: 2, action: 'delete' })).status, 200);
  assert.equal((await send('/api/accounts/inspections')).data.inspections[0].code, 'IH-2026-010');
  assert.equal((await send('/api/accounts/inspections/delete', { id: target, expectedRevision: 2 })).status, 200);
  assert.deepEqual(state.calls.at(-1).body, { p_id: target, p_expected: 2 });
  assert.ok(state.calls.every(call => call.method !== 'DELETE' && !call.path.includes('/admin/users') && !call.path.includes('mail')));
  for (const input of [{ id: target, expectedRevision: 0 }, { id: target, expectedRevision: 2, actor_id: owner }, { id: 'invalid', expectedRevision: 2 }]) assert.equal((await send('/api/accounts/inspections/delete', input)).status, 400);
});
test('stale permission versions and last-admin protections produce actionable messages without private diagnostics', async () => {
  const { state, send } = setup();
  state.failure = { code: '40001', message: 'ACCESS_REVISION_CONFLICT' };
  let result = await send('/api/accounts/manage', { id: target, expectedRevision: 2, action: 'update', permissions });
  assert.equal(result.status, 409); assert.equal(result.data.code, 'ACCESS_CHANGED');
  state.failure = { code: '22023', message: 'LAST_ADMIN_REQUIRED' };
  result = await send('/api/accounts/manage', { id: target, expectedRevision: 2, action: 'delete' });
  assert.equal(result.status, 400); assert.match(result.data.message, /al menos una cuenta administradora/);
  assert.ok(!JSON.stringify(result.data).includes('LAST_ADMIN_REQUIRED'));
});
test('account creation rejects non-boolean permission flags before reserving an Auth identity', async () => {
  const { state, send } = setup();
  assert.equal((await send('/api/accounts', { email: 'new@example.invalid', full_name: 'Nueva', can_create_inspections: 'false' })).status, 400);
  assert.ok(state.calls.every(call => !call.path.includes('/rpc/') && !call.path.includes('/admin/users')));
});
