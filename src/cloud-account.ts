import { supabaseClient } from './supabase';
import { mailEndpoint } from './mail-api';

const columns = '*';
export type CloudProfile = {
  id: string; email: string; full_name: string; area: string; job_title: string;
  role: 'admin' | 'inspector'; enabled: boolean;
  must_change_password?: boolean;
  supervisor_emails?: string[];
};

function profileRow(value: unknown, userId: string): CloudProfile {
  const row = value as CloudProfile | null;
  if (!row || typeof row.id !== 'string' || !row.id || row.id !== userId || typeof row.email !== 'string' ||
      !['full_name', 'area', 'job_title'].every(key => typeof (row as unknown as Record<string, unknown>)[key] === 'string') ||
      !['admin', 'inspector'].includes(row.role) || typeof row.enabled !== 'boolean' || row.must_change_password !== undefined && typeof row.must_change_password !== 'boolean') {
    throw new Error('No pudimos consultar tu perfil. Comprueba que tu cuenta esté habilitada.');
  }
  return { ...row, must_change_password: row.must_change_password === true };
}

export async function loadCloudProfile(expectedUserId: string, isCurrent: () => boolean): Promise<CloudProfile> {
  const client = supabaseClient();
  // Validate the session with Auth. Neither the local test account selector nor
  // editable user metadata supplies identity, role or access to this profile.
  const { data: identity, error: identityError } = await client.auth.getUser();
  if (!isCurrent() || identityError || identity.user?.id !== expectedUserId) throw new Error('No pudimos verificar tu sesión. Vuelve a iniciar sesión.');
  const { data, error } = await client.from('berry_profiles').select(columns).eq('id', identity.user.id).maybeSingle();
  if (error) throw new Error('No pudimos consultar tu perfil. Revisa tu conexión y vuelve a intentarlo.');
  return profileRow(data, identity.user.id);
}

export async function saveCloudProfile(userId: string, values: { full_name: string; area: string; job_title: string }, isCurrent: () => boolean): Promise<CloudProfile> {
  const update = { full_name: values.full_name.trim(), area: values.area.trim(), job_title: values.job_title.trim() };
  if (!update.full_name || !update.area) throw new Error('Completa tus nombres y apellidos y tu área.');
  if (Object.values(update).some(value => value.length > 250)) throw new Error('Cada campo admite hasta 250 caracteres.');
  const client = supabaseClient();
  const { data: identity, error: identityError } = await client.auth.getUser();
  if (!isCurrent() || identityError || identity.user?.id !== userId) throw new Error('Tu sesión cambió. Vuelve a iniciar sesión antes de guardar.');
  // This allowlist deliberately excludes email, enabled and role. PostgreSQL
  // also enforces column grants, own-row RLS and enabled status on this update.
  const { data, error } = await client.from('berry_profiles').update(update).eq('id', userId).select(columns).maybeSingle();
  if (error || !data) throw new Error('No se guardó el perfil. Revisa tu conexión y que tu cuenta siga habilitada.');
  const result = profileRow(data, userId);
  if (!result.enabled) throw new Error('Tu cuenta está pendiente de habilitación.');
  return result;
}

async function accountRequest(path: string, options: { method?: string; body?: unknown; requestId?: string } = {}) {
  const endpoint = mailEndpoint(path);
  if (!endpoint) throw new Error('La gestión de usuarios aún no está configurada.');
  const { data: { session } } = await supabaseClient().auth.getSession();
  if (!session) throw new Error('Vuelve a iniciar sesión para continuar.');
  let response: Response;
  try {
    response = await fetch(endpoint, { method: options.method || 'GET', headers: { Authorization: `Bearer ${session.access_token}`, 'Content-Type': 'application/json', ...(options.requestId ? { 'Idempotency-Key': options.requestId } : {}) }, ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }), signal: AbortSignal.timeout(55000), cache: 'no-store', redirect: 'error' });
  } catch { throw new Error('No pudimos confirmar la operación. Conserva los datos y vuelve a intentarlo.'); }
  const result = await response.json().catch(() => null);
  if (!response.ok || !result?.ok) {
    if (response.status === 404) throw new Error('Falta actualizar el servidor de gestión de usuarios.');
    throw new Error(result?.message || 'No pudimos completar la operación.');
  }
  return result;
}
export async function cloudAccounts(): Promise<CloudProfile[]> {
  const result = await accountRequest('/api/accounts');
  if (!Array.isArray(result.accounts)) throw new Error('No pudimos consultar las cuentas.');
  return result.accounts.map((row: CloudProfile) => profileRow(row, row.id));
}
export async function createCloudAccount(input: { full_name: string; email: string; area: string; job_title: string; role: string; supervisor_emails: string[] }, requestId: string): Promise<CloudProfile> {
  const result = await accountRequest('/api/accounts', { method: 'POST', body: input, requestId });
  return profileRow(result.account, result.account?.id);
}
export async function changeCloudPassword(password: string) {
  await accountRequest('/api/accounts/password', { method: 'POST', body: { password } });
}
