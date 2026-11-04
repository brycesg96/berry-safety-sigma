/** Local test accounts only. These roles are NOT server-side access control. */
export type AccountRole = 'admin' | 'inspector';
export type DemoAccount = { id: string; name: string; email: string; area: string; role: AccountRole; enabled: boolean };
const KEY = 'berry-demo-accounts-v1';
const ACTIVE = 'berry-demo-active-account';
export const ADMIN_ID = 'demo-admin';
export const INSPECTOR_ID = 'demo-inspector';
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const accountEmail = (value: string) => value.trim().toLowerCase();
function seeds(): DemoAccount[] {
  const adminEmail = accountEmail(import.meta.env.VITE_DEMO_ADMIN_EMAIL || 'bryx.96@gmail.com');
  const inspectorEmail = accountEmail(import.meta.env.VITE_DEMO_INSPECTOR_EMAIL || 'bcespedes@hortifrut.com');
  if (!emailPattern.test(adminEmail) || !emailPattern.test(inspectorEmail) || adminEmail === inspectorEmail) throw new Error('Revisa los correos de las cuentas de prueba: deben ser válidos y distintos.');
  return [
    { id: ADMIN_ID, name: import.meta.env.VITE_DEMO_ADMIN_NAME?.trim() || 'Bryan', email: adminEmail, area: '', role: 'admin', enabled: true },
    { id: INSPECTOR_ID, name: import.meta.env.VITE_DEMO_INSPECTOR_NAME?.trim() || 'Bryan', email: inspectorEmail, area: '', role: 'inspector', enabled: true },
  ];
}
function valid(value: unknown): value is DemoAccount {
  if (!value || typeof value !== 'object') return false;
  const a = value as DemoAccount;
  return typeof a.id === 'string' && !!a.id && typeof a.name === 'string' && !!a.name.trim() && typeof a.email === 'string' && emailPattern.test(a.email) && typeof a.area === 'string' && ['admin', 'inspector'].includes(a.role) && typeof a.enabled === 'boolean';
}
export function readAccounts(): DemoAccount[] {
  let stored: DemoAccount[] = [];
  try { const data: unknown = JSON.parse(localStorage.getItem(KEY) || '[]'); if (Array.isArray(data)) stored = data.filter(valid); } catch { /* Seeds remain available in memory. */ }
  const initial = seeds().map(seed => {
    const saved = stored.find(a => a.id === seed.id);
    return { ...seed, ...(saved ? { name: saved.name, area: saved.area, enabled: saved.enabled } : {}), ...(seed.id === ADMIN_ID ? { enabled: true } : {}) };
  });
  const ids = new Set(initial.map(a => a.id)), emails = new Set(initial.map(a => a.email));
  for (const a of stored) if (!ids.has(a.id) && !emails.has(accountEmail(a.email))) { initial.push({ ...a, email: accountEmail(a.email) }); ids.add(a.id); emails.add(accountEmail(a.email)); }
  return initial;
}
function persist(accounts: DemoAccount[]) {
  localStorage.setItem(KEY, JSON.stringify(accounts));
  window.dispatchEvent(new Event('berry-accounts-changed'));
  return accounts;
}
export function activeAccountId(accounts: DemoAccount[]) {
  try { const id = localStorage.getItem(ACTIVE); if (accounts.some(a => a.id === id && a.enabled)) return id!; } catch { /* Use the default test administrator. */ }
  return ADMIN_ID;
}
export function selectTestAccount(id: string) {
  if (!readAccounts().some(a => a.id === id && a.enabled)) throw new Error('La cuenta no tiene acceso habilitado.');
  localStorage.setItem(ACTIVE, id);
}
function requireAdministrator(accounts: DemoAccount[], actorId: string) {
  if (!accounts.some(a => a.id === actorId && a.enabled && a.role === 'admin')) throw new Error('Esta función requiere la cuenta administradora.');
}
export function addAccount(actorId: string, values: { name: string; email: string; role: AccountRole }) {
  const accounts = readAccounts(); requireAdministrator(accounts, actorId);
  const name = values.name.trim(), email = accountEmail(values.email);
  if (!name || !emailPattern.test(email) || !['admin', 'inspector'].includes(values.role)) throw new Error('Completa el nombre, un correo válido y el rol.');
  if (accounts.some(a => accountEmail(a.email) === email)) throw new Error('Este correo ya tiene una cuenta. Puedes revisar o reactivar su acceso.');
  return persist([...accounts, { id: crypto.randomUUID(), name, email, area: '', role: values.role, enabled: true }]);
}
export function editAccount(actorId: string, targetId: string, values: { name: string; role: AccountRole; enabled: boolean }) {
  const accounts = readAccounts(); requireAdministrator(accounts, actorId);
  const target = accounts.find(a => a.id === targetId);
  if (!target || !values.name.trim() || !['admin', 'inspector'].includes(values.role)) throw new Error('Completa el nombre y un rol válido.');
  if (targetId === ADMIN_ID && (values.role !== 'admin' || !values.enabled)) throw new Error('La cuenta administradora inicial se configura desde el entorno.');
  if (targetId === INSPECTOR_ID && values.role !== 'inspector') throw new Error('La cuenta de inspecciones inicial conserva su rol.');
  if (targetId === actorId && (!values.enabled || values.role !== 'admin')) throw new Error('No puedes retirar tu propio acceso de administración durante esta sesión.');
  return persist(accounts.map(a => a.id === targetId ? { ...a, name: values.name.trim(), role: values.role, enabled: values.enabled } : a));
}
export function updateOwnProfile(accountId: string, name: string, area: string) {
  const accounts = readAccounts();
  if (!name.trim() || !area.trim() || !accounts.some(a => a.id === accountId && a.enabled)) throw new Error('Completa tus nombres y apellidos y tu área.');
  return persist(accounts.map(a => a.id === accountId ? { ...a, name: name.trim(), area: area.trim() } : a));
}
