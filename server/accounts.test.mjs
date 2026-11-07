import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createApi } from './index.mjs';
import { TEMPORARY_PASSWORD } from '../shared/account-rules.mjs';

const origin = 'https://berry.example';
const project = 'https://rwacygoxhkxxxkvushmb.supabase.co';
const secret = 'sb_secret_fictitious_server_key_123456789012345';
const actorId = '60000000-0000-4000-8000-000000000001';
const userId = '60000000-0000-4000-8000-000000000002';
const requestId = '60000000-0000-4000-8000-000000000003';
const jwt = `eyJhbGciOiJIUzI1NiJ9.${Buffer.from(JSON.stringify({ sub: actorId, iat: 100 })).toString('base64url')}.fictitious`;
const account = { email: 'new@example.invalid', full_name: 'Nueva Persona', area: 'Prevención', job_title: 'Supervisora', role: 'inspector', supervisor_emails: [] };
const response = (data, status = 200) => new Response(data === null ? null : JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
async function setup(t, extra = {}) {
  const state = { calls: [], role: 'admin', enabled: true, temporary: false, credentialsAfter: 0, authValid: true, recovered: false, created: false, passwordRejected: false, prepareConflict: false, ...extra };
  const env = { BERRY_ALLOWED_ORIGINS: origin, NODE_ENV: 'production', BERRY_PROTOTYPE_MODE: 'true', SUPABASE_URL: project, SUPABASE_SECRET_KEY: secret, ...(extra.env || {}) };
  const server = createApi({ env, fetchImpl: async (address, options) => {
    const url = new URL(address), path = url.pathname;
    const body = options.body ? JSON.parse(options.body) : undefined;
    state.calls.push({ path, body, method: options.method, headers: options.headers });
    assert.equal(url.origin, project);
    assert.equal(options.headers.apikey, secret);
    if (path === '/auth/v1/user') return state.authValid ? response({ id: actorId, user_metadata: { role: 'admin' } }) : response({ message: 'private provider diagnostic' }, 401);
    if (path === '/rest/v1/berry_profiles') return response([{ id: actorId, role: state.role, enabled: state.enabled, must_change_password: state.temporary, credentials_valid_after: state.credentialsAfter }]);
    if (path === '/rest/v1/rpc/berry_admin_accounts') return response([{ ...account, id: userId, enabled: true, must_change_password: true }]);
    if (path === '/rest/v1/rpc/berry_prepare_account') return state.prepareConflict ? response({ code: '23505', message: 'private SQL diagnostic' }, 409) : response({ request_id: requestId, user_id: state.created ? userId : null });
    if (path === '/rest/v1/rpc/berry_find_account_request') return response(state.recovered || state.created ? userId : null);
    if (path === '/auth/v1/admin/users') { state.created = true; return response({ id: userId }); }
    if (path === '/rest/v1/rpc/berry_finish_account') return response({ ...account, id: userId, enabled: true, must_change_password: true });
    if (path === '/rest/v1/rpc/berry_password_operation') return response(null);
    if (path === `/auth/v1/admin/users/${actorId}`) return state.passwordRejected ? response({ code: 'weak_password', message: `private ${secret}` }, 422) : response({ id: actorId });
    if (path === '/auth/v1/logout') return response(null, 204);
    throw new Error(`Unexpected path: ${path}`);
  } });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => { server.closeAllConnections(); server.close(resolve); }));
  const send = async (path = '/api/accounts', body, overrides = {}) => {
    const res = await fetch(`http://127.0.0.1:${server.address().port}${path}`, { method: body === undefined ? 'GET' : 'POST', headers: { Origin: origin, Authorization: `Bearer ${jwt}`, 'Content-Type': 'application/json', 'Idempotency-Key': requestId, ...overrides }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    const data = await res.json();
    assert.ok(!JSON.stringify(data).includes(secret));
    return { status: res.status, data, headers: res.headers };
  };
  return { state, send };
}

test('account routes fail closed without a private server key or valid Origin/JWT, even in prototype mode', async t => {
  const absent = await setup(t, { env: { SUPABASE_SECRET_KEY: '' } });
  assert.equal((await absent.send()).status, 503); assert.equal(absent.state.calls.length, 0);
  const api = await setup(t);
  assert.equal((await api.send('/api/accounts', undefined, { Origin: 'https://other.example' })).status, 403);
  assert.equal((await api.send('/api/accounts', undefined, { Authorization: '' })).status, 401);
  assert.equal(api.state.calls.length, 0);
  api.state.authValid = false;
  const rejected = await api.send(); assert.equal(rejected.status, 401);
  assert.ok(!JSON.stringify(rejected.data).includes('private provider diagnostic'));
});

test('server profile role, enabled status, password requirement and credential epoch authorize administration', async t => {
  const api = await setup(t, { role: 'inspector' });
  assert.equal((await api.send()).status, 403);
  api.state.role = 'admin'; api.state.temporary = true;
  assert.equal((await api.send()).status, 403);
  api.state.temporary = false; api.state.enabled = false;
  assert.equal((await api.send()).status, 403);
  api.state.enabled = true; api.state.credentialsAfter = 100;
  assert.equal((await api.send()).status, 401);
  assert.ok(api.state.calls.every(call => !call.path.includes('/admin/users')));
});

test('administrators create confirmed users with the requested temporary password and trusted metadata, without email invitations', async t => {
  const api = await setup(t);
  const created = await api.send('/api/accounts', { ...account, email: 'NEW@example.invalid' });
  assert.equal(created.status, 200);
  const auth = api.state.calls.find(call => call.path === '/auth/v1/admin/users');
  assert.equal(auth.body.password, TEMPORARY_PASSWORD); assert.equal(auth.body.email_confirm, true);
  assert.equal(auth.body.email, account.email); assert.deepEqual(auth.body.app_metadata, { berry_request_id: requestId });
  const finish = api.state.calls.find(call => call.path === '/rest/v1/rpc/berry_finish_account');
  assert.equal(finish.headers.Authorization, `Bearer ${jwt}`);
  assert.equal(created.data.account.must_change_password, true);
  assert.ok(!JSON.stringify(created.data).includes(TEMPORARY_PASSWORD));
  assert.equal(created.headers.get('cache-control'), 'no-store');
  assert.equal((await api.send('/api/accounts', { ...account, actor_id: userId })).status, 400);
  assert.equal((await api.send('/api/accounts', { ...account, password: 'override' })).status, 400);
});

test('retries reuse the same Auth identity and cannot reset or adopt unrelated accounts', async t => {
  const api = await setup(t);
  assert.equal((await api.send('/api/accounts', account)).status, 200);
  assert.equal((await api.send('/api/accounts', account)).status, 200);
  assert.equal(api.state.calls.filter(call => call.path === '/auth/v1/admin/users').length, 1);
  const recovered = await setup(t, { recovered: true });
  assert.equal((await recovered.send('/api/accounts', account)).status, 200);
  assert.equal(recovered.state.calls.filter(call => call.path === '/auth/v1/admin/users').length, 0);
  const conflict = await setup(t, { prepareConflict: true });
  assert.equal((await conflict.send('/api/accounts', account)).status, 409);
  assert.equal(conflict.state.calls.filter(call => call.path === '/auth/v1/admin/users').length, 0);
});

test('password change rejects the temporary password and targets only the authenticated identity with a server-only completion', async t => {
  const api = await setup(t, { role: 'inspector', temporary: true });
  assert.equal((await api.send('/api/accounts/password', { password: TEMPORARY_PASSWORD })).status, 400);
  assert.equal((await api.send('/api/accounts/password', { password: 'Personal!47', user_id: userId })).status, 400);
  const result = await api.send('/api/accounts/password', { password: 'Personal!47' });
  assert.equal(result.status, 200); assert.ok(!JSON.stringify(result.data).includes('Personal!47'));
  const operations = api.state.calls.filter(call => call.path === '/rest/v1/rpc/berry_password_operation');
  assert.deepEqual(operations.map(call => call.body.p_action), ['begin', 'complete']);
  assert.ok(operations.every(call => call.body.p_user_id === actorId && call.headers.Authorization === `Bearer ${secret}`));
  assert.equal(api.state.calls.filter(call => call.path.startsWith('/auth/v1/admin/users/'))[0].path, `/auth/v1/admin/users/${actorId}`);
  assert.ok(api.state.calls.some(call => call.path === '/auth/v1/logout'));
});

test('a rejected password never clears the requirement and provider diagnostics never reach the browser', async t => {
  const api = await setup(t, { role: 'inspector', temporary: true, passwordRejected: true });
  const result = await api.send('/api/accounts/password', { password: 'Personal!47' });
  assert.equal(result.status, 400);
  const operations = api.state.calls.filter(call => call.path === '/rest/v1/rpc/berry_password_operation');
  assert.deepEqual(operations.map(call => call.body.p_action), ['begin', 'failed']);
  assert.ok(!JSON.stringify(result.data).includes('private'));
});
