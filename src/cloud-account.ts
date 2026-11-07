import { supabaseClient } from './supabase';

const columns = 'id,email,full_name,area,job_title,role,enabled';
export type CloudProfile = {
  id: string; email: string; full_name: string; area: string; job_title: string;
  role: 'admin' | 'inspector'; enabled: boolean;
};

function profileRow(value: unknown, userId: string): CloudProfile {
  const row = value as CloudProfile | null;
  if (!row || row.id !== userId || typeof row.email !== 'string' ||
      !['full_name', 'area', 'job_title'].every(key => typeof (row as unknown as Record<string, unknown>)[key] === 'string') ||
      !['admin', 'inspector'].includes(row.role) || typeof row.enabled !== 'boolean') {
    throw new Error('No pudimos consultar tu perfil. Comprueba que tu cuenta esté habilitada.');
  }
  return row;
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
