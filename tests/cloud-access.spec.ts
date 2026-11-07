import { test, expect } from '@playwright/test';
import type { BrowserContext, Page } from '@playwright/test';

const origin = 'https://rwacygoxhkxxxkvushmb.supabase.co';
const id = '30000000-0000-4000-8000-000000000001';
const email = 'cuenta@example.invalid';
type Profile = { id: string; email: string; full_name: string; area: string; job_title: string; role: string; enabled: boolean };
const initialProfile = (): Profile => ({ id, email, full_name: '', area: '', job_title: '', role: 'admin', enabled: true });
const user = { id, aud: 'authenticated', role: 'authenticated', email, email_confirmed_at: new Date().toISOString(), app_metadata: { provider: 'email', providers: ['email'] }, user_metadata: { role: 'admin', enabled: true }, identities: [], created_at: new Date().toISOString() };
function session() {
  const encoded = Buffer.from(JSON.stringify({ sub: id, exp: Math.floor(Date.now() / 1000) + 3600, role: 'authenticated' })).toString('base64url');
  return { access_token: `eyJhbGciOiJIUzI1NiJ9.${encoded}.signature`, token_type: 'bearer', expires_in: 3600, refresh_token: 'fictitious-refresh-token', user };
}
async function mock(context: BrowserContext, profile = initialProfile()) {
  const state = { profile, loginAllowed: true, saveFails: false, loginBodies: [] as { email: string; password: string }[], updates: [] as Record<string, unknown>[], paths: [] as string[], delayUser: null as Promise<void> | null };
  await context.route('**/api/people?*', route => route.fulfill({ json: { people: [] } }));
  await context.route('**/api/inspections/send', route => route.fulfill({ json: { ok: true, defaults: null } }));
  await context.route(`${origin}/**`, async route => {
    const request = route.request(); const url = new URL(request.url());
    state.paths.push(url.pathname);
    if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' } });
    expect(request.headers().apikey).toMatch(/^sb_publishable_/);
    if (url.pathname === '/auth/v1/token') {
      state.loginBodies.push(request.postDataJSON());
      if (!state.loginAllowed) return route.fulfill({ status: 400, headers: { 'x-supabase-api-version': '2024-01-01' }, json: { code: 'invalid_credentials', msg: 'Invalid login credentials' } });
      return route.fulfill({ json: session() });
    }
    if (url.pathname === '/auth/v1/user') {
      if (state.delayUser) await state.delayUser;
      return route.fulfill({ json: user });
    }
    if (url.pathname === '/auth/v1/logout') return route.fulfill({ status: 204 });
    if (url.pathname === '/rest/v1/berry_profiles') {
      expect(url.searchParams.get('id')).toBe(`eq.${id}`);
      if (!request.headers().authorization?.startsWith('Bearer ey')) return route.fulfill({ status: 401, json: { code: '42501', message: 'permission denied for table berry_profiles' } });
      expect(request.headers().authorization).toMatch(/^Bearer ey/);
      if (request.method() === 'PATCH') {
        const update = request.postDataJSON();
        state.updates.push(update);
        if (state.saveFails) return route.fulfill({ status: 503, json: { message: 'offline' } });
        expect(Object.keys(update).sort()).toEqual(['area', 'full_name', 'job_title']);
        state.profile = { ...state.profile, ...update };
      }
      return route.fulfill({ json: state.profile });
    }
    throw new Error(`Unexpected Supabase operation: ${request.method()} ${url.pathname}`);
  });
  return state;
}
async function login(page: Page) {
  await page.goto('./?acceso=cuenta');
  await page.getByLabel(/^Correo electrónico/).fill(email);
  await page.getByLabel(/^Contraseña/).fill('Fictitious!47');
  await page.getByRole('button', { name: 'Iniciar sesión', exact: true }).click();
}

test('inicio con contraseña: error claro y sin acceso, sin persistir contraseña', async ({ page, context }) => {
  const state = await mock(context); state.loginAllowed = false;
  await page.goto('./?acceso=cuenta');
  await page.getByLabel(/^Correo electrónico/).fill('CUENTA@example.invalid');
  await page.getByLabel(/^Contraseña/).fill('Fictitious!47');
  await page.getByRole('button', { name: 'Mostrar contraseña', exact: true }).click();
  await expect(page.getByLabel(/^Contraseña/)).toHaveAttribute('type', 'text');
  await page.getByRole('button', { name: 'Iniciar sesión', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('El correo o la contraseña no son correctos.');
  await expect(page.getByLabel(/^Contraseña/)).toHaveValue('');
  expect(state.loginBodies).toHaveLength(1);
  expect(state.loginBodies[0]).toMatchObject({ email, password: 'Fictitious!47' });
  expect(state.paths.filter(path => path.startsWith('/rest/'))).toEqual([]);
  await expect(page.getByLabel('Nombres y apellidos')).toHaveCount(0);
  expect(await page.evaluate(() => JSON.stringify({ ...localStorage, ...sessionStorage }))).not.toContain('Fictitious!47');
});

test('perfil y rol provienen de la cuenta del servidor; una cuenta pendiente no se habilita con metadata ni selector local', async ({ page, context }) => {
  const state = await mock(context, { ...initialProfile(), role: 'inspector', enabled: false });
  await page.addInitScript(() => localStorage.setItem('berry-demo-accounts-v1', JSON.stringify([{ id: 'demo-admin', name: 'Administrador local', email: 'admin@example.invalid', area: 'Local', jobTitle: 'Local', role: 'admin', enabled: true }])));
  await login(page);
  await expect(page.getByRole('heading', { name: 'Cuenta pendiente de habilitación' })).toBeVisible();
  await expect(page.getByLabel('Nombres y apellidos')).toHaveCount(0);
  state.profile.enabled = true;
  await page.getByRole('button', { name: 'Comprobar acceso', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Tu perfil', exact: true })).toBeVisible();
  await expect(page.locator('.cloud-profile-heading')).toContainText('Inspecciones');
  await expect(page.locator('.cloud-profile-heading')).not.toContainText('Administración');
  await expect(page.getByLabel('Correo de tu cuenta')).toHaveValue(email);
  expect(state.updates).toEqual([]);
});

test('guarda solo el perfil propio y se consulta en otro dispositivo, sin cuentas ni inspecciones locales', async ({ browser, page, context }) => {
  const state = await mock(context);
  await login(page);
  await expect(page.getByRole('heading', { name: 'Tu perfil', exact: true })).toBeVisible();
  await expect(page.getByLabel('Correo de tu cuenta')).toHaveAttribute('readonly', '');
  await page.getByLabel('Nombres y apellidos').fill('  Elena de Prueba  ');
  await page.getByLabel(/^Área/).fill(' Prevención ');
  await page.getByLabel('Cargo', { exact: true }).fill(' Supervisora SST ');
  await page.getByRole('button', { name: 'Guardar perfil', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Perfil guardado en tu cuenta.');
  expect(state.updates).toEqual([{ full_name: 'Elena de Prueba', area: 'Prevención', job_title: 'Supervisora SST' }]);
  expect(await page.evaluate(() => localStorage.getItem('berry-demo-accounts-v1'))).toBeNull();
  await page.reload();
  await expect(page.getByLabel('Cargo', { exact: true })).toHaveValue('Supervisora SST');
  const second = await browser.newContext({ viewport: { width: 390, height: 844 } });
  try {
    await mock(second, state.profile);
    const mobile = await second.newPage();
    await login(mobile);
    await expect(mobile.getByLabel('Nombres y apellidos')).toHaveValue('Elena de Prueba');
    await expect(mobile.getByLabel(/^Área/)).toHaveValue('Prevención');
    await expect(mobile.getByLabel('Cargo', { exact: true })).toHaveValue('Supervisora SST');
    expect(await mobile.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  } finally { await second.close(); }
  expect(await page.evaluate(() => JSON.stringify(localStorage))).not.toContain('Fictitious!47');
});

test('un fallo al guardar conserva la edición para reintentar y el cierre de sesión limpia las otras pestañas', async ({ page, context }) => {
  const state = await mock(context, { ...initialProfile(), full_name: 'Elena', area: 'Prevención' });
  await login(page);
  await page.getByLabel('Cargo', { exact: true }).fill('Coordinadora');
  await page.getByRole('button', { name: 'Cerrar sesión en este dispositivo', exact: true }).click();
  await expect(page.getByRole('dialog', { name: '¿Cerrar sesión?' })).toContainText('Tienes cambios sin guardar');
  await page.getByRole('button', { name: 'Seguir editando', exact: true }).click();
  await expect(page.getByLabel('Cargo', { exact: true })).toHaveValue('Coordinadora');
  state.saveFails = true;
  await page.getByRole('button', { name: 'Guardar perfil', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('No se guardó el perfil.');
  await expect(page.getByLabel('Cargo', { exact: true })).toHaveValue('Coordinadora');
  await expect(page.getByText('Perfil guardado en tu cuenta.')).toHaveCount(0);
  state.saveFails = false;
  await page.getByRole('button', { name: 'Guardar perfil', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Perfil guardado en tu cuenta.');
  const second = await context.newPage();
  await second.goto('./?acceso=cuenta');
  await expect(second.getByLabel('Cargo', { exact: true })).toHaveValue('Coordinadora');
  await page.getByRole('button', { name: 'Cerrar sesión en este dispositivo', exact: true }).click();
  for (const tab of [page, second]) {
    await expect(tab.getByRole('heading', { name: 'Inicia sesión', exact: true })).toBeVisible();
    await expect(tab.getByLabel('Cargo', { exact: true })).toHaveCount(0);
  }
});

test('cerrar sesión mientras llega el perfil no restaura datos de una cuenta anterior', async ({ page, context }) => {
  const state = await mock(context, { ...initialProfile(), full_name: 'Nombre privado', area: 'Prevención' });
  let release!: () => void;
  state.delayUser = new Promise<void>(resolve => { release = resolve; });
  await login(page);
  await expect(page.getByRole('button', { name: 'Cerrar sesión en este dispositivo', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Cerrar sesión en este dispositivo', exact: true }).click();
  release();
  await expect(page.getByRole('heading', { name: 'Inicia sesión', exact: true })).toBeVisible();
  await expect(page.getByText('Nombre privado')).toHaveCount(0);
});

test('el acceso interno guarda el borrador local, conserva la confirmación de salida y vuelve al espacio de pruebas', async ({ page, context }) => {
  await mock(context);
  await page.goto('./');
  await page.getByLabel('Área inspeccionada').fill('Borrador que debe conservarse');
  await page.getByRole('button', { name: 'Mi perfil', exact: true }).click();
  await page.getByRole('button', { name: 'Iniciar sesión con correo', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Inicia sesión', exact: true })).toBeVisible();
  await expect(page).toHaveURL(/acceso=cuenta/);
  await page.goBack();
  await expect(page.getByRole('dialog', { name: '¿Estás seguro de salir?' })).toBeVisible();
  await page.getByRole('button', { name: 'Seguir en la aplicación', exact: true }).click();
  await expect(page).toHaveURL(/acceso=cuenta/);
  await page.getByRole('button', { name: 'Espacio de pruebas', exact: true }).click();
  await expect(page.getByLabel('Área inspeccionada')).toHaveValue('Borrador que debe conservarse');
  await page.reload();
  await expect(page.getByLabel('Área inspeccionada')).toHaveValue('Borrador que debe conservarse');
});
