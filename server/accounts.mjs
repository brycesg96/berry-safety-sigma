import { randomUUID } from 'node:crypto';
import { bodyOf, loadConfig, reply } from './make-test.mjs';
import { newPasswordError, TEMPORARY_PASSWORD } from '../shared/account-rules.mjs';

export const ACCOUNTS_PATH = '/api/accounts';
export const PASSWORD_PATH = '/api/accounts/password';
class ApiError extends Error {
  constructor(status, code, message) { super(message); this.status = status; this.code = code; }
}
const unavailable = () => new ApiError(503, 'ACCOUNTS_UNAVAILABLE', 'La gestión de usuarios aún no está configurada.');
export function supabaseServerConfig(env) {
  try {
    const url = new URL(env.SUPABASE_URL || 'https://rwacygoxhkxxxkvushmb.supabase.co');
    if (url.protocol !== 'https:' || !/^[a-z0-9]{20}\.supabase\.co$/.test(url.hostname) || url.origin + '/' !== url.href) return null;
    const key = env.SUPABASE_SECRET_KEY || '';
    let secret = /^sb_secret_[A-Za-z0-9_-]{20,}$/.test(key);
    if (!secret && key.startsWith('eyJ')) {
      try { secret = JSON.parse(Buffer.from(key.split('.')[1], 'base64url')).role === 'service_role'; } catch { /* Reject invalid keys. */ }
    }
    return secret ? { url: url.origin, key } : null;
  } catch { return null; }
}
function normalizedAccount(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).some(key => !['email', 'full_name', 'area', 'job_title', 'role', 'supervisor_emails'].includes(key))) throw new ApiError(400, 'INVALID_ACCOUNT', 'Revisa los datos de la cuenta.');
  const result = { email: typeof input.email === 'string' ? input.email.trim().toLowerCase() : '', full_name: typeof input.full_name === 'string' ? input.full_name.trim() : '', area: typeof input.area === 'string' ? input.area.trim() : '', job_title: typeof input.job_title === 'string' ? input.job_title.trim() : '', role: input.role || 'inspector', supervisor_emails: input.supervisor_emails || [] };
  const emailValid = value => typeof value === 'string' && value.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
  if (!emailValid(result.email) || !result.full_name || [result.full_name, result.area, result.job_title].some(value => value.length > 250) || !['admin', 'inspector'].includes(result.role) || !Array.isArray(result.supervisor_emails) || result.supervisor_emails.length > 50 || result.supervisor_emails.some(value => !emailValid(value))) throw new ApiError(400, 'INVALID_ACCOUNT', 'Completa el nombre, un correo válido y el rol. Revisa también los correos en copia.');
  result.supervisor_emails = [...new Set(result.supervisor_emails.map(value => value.trim().toLowerCase()))];
  return result;
}

/** Auth admin keys, passwords and provider bodies never enter logs or replies. */
export function createAccountsHandler({ env = process.env, fetchImpl = fetch, now = () => new Date(), timeoutMs = 10000 } = {}) {
  const { origins } = loadConfig({ ...env, MAKE_TEST_ENABLED: 'false' });
  const config = supabaseServerConfig(env);
  const attempts = new Map();
  async function upstream(path, { method = 'GET', body, token } = {}) {
    if (!config) throw unavailable();
    let response;
    try {
      response = await fetchImpl(config.url + path, { method, headers: { apikey: config.key, Authorization: `Bearer ${token || config.key}`, 'Content-Type': 'application/json', Accept: 'application/json' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: AbortSignal.timeout(timeoutMs), redirect: 'error' });
      const content = response.status === 204 ? '' : await response.text();
      const data = content.trim() ? JSON.parse(content) : null;
      return { ok: response.ok, status: response.status, data };
    } catch { throw new ApiError(503, 'PROVIDER_UNCONFIRMED', 'No pudimos confirmar la operación. Revisa tu conexión y vuelve a intentarlo.'); }
  }
  async function rpc(name, body, token) {
    const result = await upstream(`/rest/v1/rpc/${name}`, { method: 'POST', body, token });
    if (!result.ok) {
      const code = result.data?.code;
      if (code === '23505') throw new ApiError(409, 'ACCOUNT_EXISTS', 'Ese correo ya tiene una cuenta o un alta pendiente con otros datos.');
      if (code === '55P03' || code === '40001') throw new ApiError(409, 'OPERATION_BUSY', 'Hay otra operación en curso. Espera un momento y vuelve a intentarlo.');
      if (code === '42501') throw new ApiError(403, 'ACCESS_DENIED', 'Tu cuenta no tiene permiso para esta operación.');
      if (code === '22023') throw new ApiError(400, 'INVALID_ACCOUNT', 'Revisa los datos de la cuenta.');
      if (code === 'PGRST202' || code === '42703') throw new ApiError(503, 'ACCOUNTS_MIGRATION_REQUIRED', 'Falta instalar la actualización de gestión de usuarios.');
      throw unavailable();
    }
    return result.data;
  }
  async function authorize(req, needsAdmin) {
    const authorization = req.headers.authorization || '';
    if (!authorization.startsWith('Bearer ') || authorization.length > 8000) throw new ApiError(401, 'SESSION_REQUIRED', 'Inicia sesión con tu cuenta de Berry Safety.');
    const token = authorization.slice(7);
    const auth = await upstream('/auth/v1/user', { token });
    if (!auth.ok || !auth.data?.id) throw new ApiError(401, 'SESSION_INVALID', 'Tu sesión no es válida. Vuelve a iniciar sesión.');
    const result = await upstream(`/rest/v1/berry_profiles?id=eq.${encodeURIComponent(auth.data.id)}&select=id,role,enabled,must_change_password,credentials_valid_after`, { token });
    if (!result.ok) throw unavailable();
    const profile = Array.isArray(result.data) ? result.data[0] : null;
    if (!profile?.enabled || profile.id !== auth.data.id) throw new ApiError(403, 'ACCOUNT_DISABLED', 'Tu cuenta está pendiente de habilitación.');
    let issuedAt = 0;
    try { issuedAt = JSON.parse(Buffer.from(token.split('.')[1], 'base64url')).iat; } catch { /* Auth has validated the JWT; malformed claims still fail closed. */ }
    if (profile.credentials_valid_after > 0 && (!Number.isSafeInteger(issuedAt) || issuedAt <= profile.credentials_valid_after)) throw new ApiError(401, 'SESSION_EXPIRED', 'La contraseña cambió. Inicia sesión con tu nueva contraseña.');
    if (needsAdmin && (profile.role !== 'admin' || profile.must_change_password !== false)) throw new ApiError(403, 'ADMIN_REQUIRED', profile.must_change_password ? 'Actualiza tu contraseña temporal antes de continuar.' : 'Esta función requiere una cuenta administradora.');
    return { token, profile };
  }
  return async function handle(req, res) {
    const origin = req.headers.origin;
    const cors = origins.has(origin) ? { 'Access-Control-Allow-Origin': origin, Vary: 'Origin', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Access-Control-Allow-Headers': 'Authorization, Content-Type, Idempotency-Key' } : {};
    const fail = error => reply(res, error.status || 503, { ok: false, code: error.code || 'ACCOUNTS_UNAVAILABLE', message: error instanceof ApiError ? error.message : 'No pudimos completar la operación.' }, cors);
    try {
      if (!origin || !origins.has(origin)) throw new ApiError(403, 'ORIGIN_NOT_ALLOWED', 'Origen de la aplicación no permitido.');
      if (req.method === 'OPTIONS') { res.writeHead(204, { 'Cache-Control': 'no-store', ...cors }); res.end(); return; }
      if (![ACCOUNTS_PATH, PASSWORD_PATH].includes(req.url) || !['GET', 'POST'].includes(req.method) || req.url === PASSWORD_PATH && req.method !== 'POST') throw new ApiError(405, 'METHOD_NOT_ALLOWED', 'Método no permitido.');
      if (!config) throw unavailable();
      const time = now().getTime(), address = req.socket.remoteAddress || 'unknown';
      for (const [key, value] of attempts) if (value.until <= time) attempts.delete(key);
      const entry = attempts.get(address) || { count: 0, until: time + 60000 };
      if (entry.count >= 30) throw new ApiError(429, 'RATE_LIMITED', 'Espera un minuto antes de volver a intentarlo.');
      attempts.set(address, { ...entry, count: entry.count + 1 });
      if (attempts.size > 1000) attempts.delete(attempts.keys().next().value);
      const actor = await authorize(req, req.url === ACCOUNTS_PATH);
      if (req.method === 'GET') { reply(res, 200, { ok: true, accounts: await rpc('berry_admin_accounts', {}, actor.token) }, cors); return; }
      if ((req.headers['content-type'] || '').split(';')[0].trim().toLowerCase() !== 'application/json') throw new ApiError(415, 'JSON_REQUIRED', 'Envía la solicitud en formato JSON.');
      let input;
      try { input = await bodyOf(req, 65536); } catch { throw new ApiError(400, 'INVALID_BODY', 'La solicitud no es válida.'); }
      if (req.url === PASSWORD_PATH) {
        if (!input || Object.keys(input).length !== 1 || !Object.hasOwn(input, 'password')) throw new ApiError(400, 'INVALID_PASSWORD', 'Revisa la nueva contraseña.');
        const error = newPasswordError(input.password);
        if (error) throw new ApiError(400, 'INVALID_PASSWORD', error);
        const operationId = randomUUID();
        const operation = action => rpc('berry_password_operation', { p_user_id: actor.profile.id, p_operation_id: operationId, p_action: action });
        await operation('begin');
        try {
          const changed = await upstream(`/auth/v1/admin/users/${encodeURIComponent(actor.profile.id)}`, { method: 'PUT', body: { password: input.password } });
          if (!changed.ok && !['same_password'].includes(changed.data?.code || changed.data?.error_code)) throw new ApiError(400, 'PASSWORD_REJECTED', 'No se pudo actualizar la contraseña. Prueba otra combinación de caracteres.');
          await operation('complete');
        } catch (error) { try { await operation('failed'); } catch { /* Keep the account blocked if the result is uncertain. */ } throw error; }
        try { await upstream('/auth/v1/logout?scope=global', { method: 'POST', token: actor.token }); } catch { /* The database already rejects JWTs issued before this password change. */ }
        reply(res, 200, { ok: true, message: 'Contraseña actualizada. Inicia sesión con tu nueva contraseña.' }, cors);
        return;
      }
      const account = normalizedAccount(input);
      const requestedId = req.headers['idempotency-key'];
      if (typeof requestedId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(requestedId)) throw new ApiError(400, 'REQUEST_ID_REQUIRED', 'El alta necesita un identificador único.');
      const reserved = await rpc('berry_prepare_account', { p_request_id: requestedId, p_input: account }, actor.token);
      let userId = reserved.user_id || await rpc('berry_find_account_request', { p_request_id: reserved.request_id });
      if (!userId) {
        const created = await upstream('/auth/v1/admin/users', { method: 'POST', body: { email: account.email, password: TEMPORARY_PASSWORD, email_confirm: true, user_metadata: { full_name: account.full_name }, app_metadata: { berry_request_id: reserved.request_id } } });
        if (!created.ok) {
          userId = await rpc('berry_find_account_request', { p_request_id: reserved.request_id });
          if (!userId) throw new ApiError(created.status === 422 || created.status === 409 ? 409 : 503, 'ACCOUNT_NOT_CREATED', 'No se confirmó el alta. El correo puede estar registrado. Reintenta conservando los mismos datos.');
        } else userId = created.data?.id;
      }
      if (!userId) throw unavailable();
      const profile = await rpc('berry_finish_account', { p_request_id: reserved.request_id, p_user_id: userId }, actor.token);
      reply(res, 200, { ok: true, account: profile, message: profile.must_change_password ? 'Cuenta creada. El usuario deberá cambiar su contraseña temporal al entrar.' : 'La cuenta ya está creada y conserva su contraseña personal.' }, cors);
    } catch (error) { fail(error); }
  };
}
