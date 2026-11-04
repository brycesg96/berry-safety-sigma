import { readAccounts } from './accounts';
export type DirectoryPerson = { id: string; name: string; email: string; area?: string; jobTitle?: string };
export type DirectoryResult = { status: 'ready'; people: DirectoryPerson[] } | { status: 'unconfigured'; people: [] };

/** The administrator's authenticated user directory; never infer email from a name. */
export async function searchDirectory(query: string, signal: AbortSignal): Promise<DirectoryResult> {
  const endpoint = import.meta.env.VITE_DIRECTORY_URL;
  const normalize = (text: string) => text.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();
  const term = normalize(query.trim());
  const local = readAccounts().filter(a => a.enabled && normalize(`${a.name} ${a.email}`).includes(term)).map(a => ({ id: a.id, name: a.name, email: a.email, area: a.area, jobTitle: a.jobTitle }));
  if (!endpoint) return { status: 'ready', people: local.slice(0, 20) };
  const url = new URL(endpoint, window.location.origin);
  if (!['https:', 'http:'].includes(url.protocol)) throw new Error('Directorio no disponible.');
  url.searchParams.set('search', query.trim());
  const response = await fetch(url, { signal, credentials: 'include', cache: 'no-store', headers: { Accept: 'application/json' } });
  if (!response.ok) throw new Error('No se pudo consultar el directorio. Inténtalo de nuevo.');
  const data: unknown = await response.json();
  if (!data || typeof data !== 'object' || !('people' in data) || !Array.isArray(data.people)) throw new Error('El directorio no está disponible.');
  const ids = new Set<string>();
  const people = data.people.filter((p): p is DirectoryPerson => {
    if (!p || typeof p !== 'object' || typeof p.id !== 'string' || !p.id.trim() || typeof p.name !== 'string' || !p.name.trim() || typeof p.email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(p.email.trim()) || ids.has(p.id)) return false;
    ids.add(p.id); return true;
  }).map(p => ({ id: p.id, name: p.name.trim(), email: p.email.trim(), area: typeof p.area === 'string' ? p.area.trim() : '', jobTitle: typeof p.jobTitle === 'string' ? p.jobTitle.trim() : '' })).slice(0, 20);
  const seen = new Set(people.map(p => p.email.toLowerCase()));
  for (const p of local) if (!ids.has(p.id) && !seen.has(p.email.toLowerCase())) { people.push(p); ids.add(p.id); seen.add(p.email.toLowerCase()); }
  return { status: 'ready', people: people.slice(0, 20) };
}
