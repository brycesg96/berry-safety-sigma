import { createClient } from '@supabase/supabase-js';
import type { SupabaseClient } from '@supabase/supabase-js';
import { SUPABASE_PROJECT } from './supabase-project';

// A configured client is not a completed migration: cloud mode is enabled only
// after the protected workflow RPCs are installed. Legacy local records are
// kept separately until their identity mapping can be reviewed for import.
let client: SupabaseClient | undefined;
export function supabaseConfig() {
  const address = import.meta.env.VITE_SUPABASE_URL?.trim() || SUPABASE_PROJECT.url;
  const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim() || SUPABASE_PROJECT.publishableKey;
  if (!address || !key) throw new Error('Falta configurar el proyecto de Supabase.');
  const url = new URL(address);
  if (url.protocol !== 'https:' || !/^[a-z0-9]{20}\.supabase\.co$/.test(url.hostname) || url.username || url.password || url.search || url.hash || !['', '/'].includes(url.pathname)) throw new Error('La URL de Supabase no es válida.');
  if (!/^sb_publishable_[A-Za-z0-9_-]{20,}$/.test(key)) throw new Error('La web necesita la clave pública Publishable de Supabase.');
  return { url: url.origin, key };
}

export function supabaseClient() {
  if (!client) {
    const { url, key } = supabaseConfig();
    client = createClient(url, key, { auth: { storageKey: 'berry-supabase-auth-v1', flowType: 'pkce', persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } });
  }
  return client;
}

export async function supabaseFoundationStatus() {
  const { data, error } = await supabaseClient().rpc('berry_schema_status');
  if (error) throw new Error('Falta ejecutar o verificar el script inicial de Supabase.');
  if (data?.schema_version !== '202611070001') throw new Error('La estructura de Supabase no coincide con la versión de la app.');
  return data as { schema_version: string; stage: string; sync_ready: boolean };
}
