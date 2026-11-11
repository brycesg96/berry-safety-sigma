import { test, expect } from '@playwright/test';
import type { BrowserContext, Page } from '@playwright/test';

const origin = 'https://rwacygoxhkxxxkvushmb.supabase.co';
const id = '30000000-0000-4000-8000-000000000001';
const email = 'cuenta@example.invalid';
type Profile = { id: string; email: string; full_name: string; area: string; job_title: string; role: string; enabled: boolean; must_change_password?: boolean; can_create_inspections?: boolean; can_receive_inspections?: boolean; access_revision?: number; supervisor_emails?: string[]; deleted_at?: string | null };
const initialProfile = (): Profile => ({ id, email, full_name: '', area: '', job_title: '', role: 'admin', enabled: true, can_create_inspections: true, can_receive_inspections: true, access_revision: 1 });
const user = { id, aud: 'authenticated', role: 'authenticated', email, email_confirmed_at: new Date().toISOString(), app_metadata: { provider: 'email', providers: ['email'] }, user_metadata: { role: 'admin', enabled: true }, identities: [], created_at: new Date().toISOString() };
function session(identity = user) {
  const encoded = Buffer.from(JSON.stringify({ sub: id, exp: Math.floor(Date.now() / 1000) + 3600, role: 'authenticated' })).toString('base64url');
  return { access_token: `eyJhbGciOiJIUzI1NiJ9.${encoded}.signature`, token_type: 'bearer', expires_in: 3600, refresh_token: 'fictitious-refresh-token', user: identity };
}
async function mock(context: BrowserContext, profile = initialProfile()) {
  const identity = { ...user, user_metadata: { ...user.user_metadata, berry_profile_setup_completed_at: '2026-11-01T12:00:00Z' } as Record<string, unknown> };
  const state = { profile, administrators: [{ id: '30000000-0000-4000-8000-000000000009', full_name: 'Administradora vigente', email: 'admin-vigente@example.invalid' }], contactsFail: false, loginAllowed: true, saveFails: false, loginBodies: [] as { email: string; password: string }[], updates: [] as Record<string, unknown>[], paths: [] as string[], delayUser: null as Promise<void> | null };
  await context.route('**/api/people?*', route => route.fulfill({ json: { people: [] } }));
  await context.route('**/api/inspections/send', route => route.fulfill({ json: { ok: true, defaults: null } }));
  await context.route(`${origin}/**`, async route => {
    const request = route.request(); const url = new URL(request.url());
    state.paths.push(url.pathname);
    if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' } });
    expect(request.headers().apikey).toMatch(/^sb_publishable_/);
    if (url.pathname === '/rest/v1/rpc/berry_schema_status') return route.fulfill({ json: { schema_version: '202611070001', accounts_version: '202611070002', stage: 'accounts', sync_ready: false } });
    if (url.pathname === '/rest/v1/rpc/berry_account_administrators') {
      expect(request.headers().authorization).toMatch(/^Bearer ey/);
      return route.fulfill({ status: state.contactsFail ? 503 : 200, json: state.contactsFail ? { message: 'unavailable' } : state.administrators });
    }
    if (url.pathname === '/auth/v1/token') {
      state.loginBodies.push(request.postDataJSON());
      if (!state.loginAllowed) return route.fulfill({ status: 400, headers: { 'x-supabase-api-version': '2024-01-01' }, json: { code: 'invalid_credentials', msg: 'Invalid login credentials' } });
      return route.fulfill({ json: session(identity) });
    }
    if (url.pathname === '/auth/v1/user') {
      if (state.delayUser) await state.delayUser;
      if (request.method() === 'PUT') Object.assign(identity.user_metadata, request.postDataJSON().data);
      return route.fulfill({ json: identity });
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
test('recuperación: solicita el enlace PKCE y permite cambiar solo la contraseña de la identidad verificada', async ({ page, context }) => {
  await mock(context, { ...initialProfile(), full_name: 'Propietario', area: 'Seguridad', must_change_password: false });
  let target = '';
  await context.route(`${origin}/auth/v1/recover*`, async route => {
    const url = new URL(route.request().url()); target = url.searchParams.get('redirect_to')!;
    expect(new URL(target).searchParams.get('recuperar')).toBe('1');
    const body = route.request().postDataJSON(); expect(body.email).toBe(email); expect(body.code_challenge).toBeTruthy();
    await route.fulfill({ json: {} });
  });
  let passwordCalls = 0;
  await context.route('**/api/accounts/password', async route => { passwordCalls++; expect(route.request().headers().authorization).toMatch(/^Bearer ey/); expect(route.request().postDataJSON()).toEqual({ password: 'Recuperada!47' }); await route.fulfill({ json: { ok: true } }); });
  await page.goto('./?acceso=cuenta'); await page.getByRole('button', { name: 'Olvidé mi contraseña' }).click();
  await page.getByLabel(/^Correo electrónico/).fill(email.toUpperCase()); await page.getByRole('button', { name: 'Enviar enlace de recuperación' }).click();
  await expect(page.getByRole('status')).toContainText('recibirás un enlace'); expect(passwordCalls).toBe(0);
  const callback = new URL(target); callback.searchParams.set('code', 'fictitious-recovery-code'); await page.goto(callback.href);
  await expect(page.getByRole('heading', { name: 'Crea una nueva contraseña' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Gestión de Cuentas', exact: true })).toHaveCount(0);
  await page.getByLabel(/^Nueva contraseña/).fill('Recuperada!47'); await page.getByLabel(/^Repite la nueva contraseña/).fill('Recuperada!47'); await page.getByRole('button', { name: 'Actualizar contraseña', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Inicia sesión', exact: true })).toBeVisible(); expect(passwordCalls).toBe(1);
  expect(await page.evaluate(() => JSON.stringify({ ...localStorage, ...sessionStorage }))).not.toContain('Recuperada!47');
});
test('un enlace de recuperación vencido conserva el acceso cerrado y permite solicitar otro', async ({ page, context }) => {
  await mock(context);
  await page.goto('./?acceso=cuenta&recuperar=1#error=access_denied&error_code=otp_expired');
  await expect(page.getByRole('heading', { name: 'Inicia sesión', exact: true })).toBeVisible();
  await expect(page.getByRole('alert')).toContainText('enlace de recuperación');
  await expect(page.getByLabel(/^Nueva contraseña/)).toHaveCount(0);
});
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
  await expect(page.getByRole('heading', { name: 'Cuenta inhabilitada' })).toBeVisible();
  await expect(page.getByLabel('Nombres y apellidos')).toHaveCount(0);
  state.profile.enabled = true;
  await page.getByRole('button', { name: 'Comprobar acceso', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Mi perfil', exact: true })).toBeVisible();
  await expect(page.locator('.cloud-profile-heading')).toContainText('Usuario');
  await expect(page.locator('.cloud-profile-heading')).not.toContainText('Administrador');
  await expect(page.getByLabel('Correo de tu cuenta')).toHaveValue(email);
  expect(state.updates).toEqual([]);
});

test('guarda solo el perfil propio y se consulta en otro dispositivo, sin cuentas ni inspecciones locales', async ({ browser, page, context }) => {
  const state = await mock(context);
  await login(page);
  await expect(page.getByRole('heading', { name: 'Mi perfil', exact: true })).toBeVisible();
  await expect(page.getByLabel('Correo de tu cuenta')).toHaveAttribute('readonly', '');
  await page.getByLabel('Nombres y apellidos').fill('  Elena de Prueba  ');
  await page.getByLabel(/^Área/).fill(' Prevención ');
  await page.getByLabel('Puesto', { exact: true }).fill(' Supervisora SST ');
  await page.getByRole('button', { name: 'Guardar perfil', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Perfil guardado en tu cuenta.');
  expect(state.updates).toEqual([{ full_name: 'Elena de Prueba', area: 'Prevención', job_title: 'Supervisora SST' }]);
  expect(await page.evaluate(() => localStorage.getItem('berry-demo-accounts-v1'))).toBeNull();
  await page.reload();
  await expect(page.getByLabel('Puesto', { exact: true })).toHaveValue('Supervisora SST');
  const second = await browser.newContext({ viewport: { width: 390, height: 844 } });
  try {
    await mock(second, state.profile);
    const mobile = await second.newPage();
    await login(mobile);
    await expect(mobile.getByLabel('Nombres y apellidos')).toHaveValue('Elena de Prueba');
    await expect(mobile.getByLabel(/^Área/)).toHaveValue('Prevención');
    await expect(mobile.getByLabel('Puesto', { exact: true })).toHaveValue('Supervisora SST');
    expect(await mobile.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  } finally { await second.close(); }
  expect(await page.evaluate(() => JSON.stringify(localStorage))).not.toContain('Fictitious!47');
});

test('un fallo al guardar conserva la edición para reintentar y el cierre de sesión limpia las otras pestañas', async ({ page, context }) => {
  const state = await mock(context, { ...initialProfile(), full_name: 'Elena', area: 'Prevención' });
  await login(page);
  await page.getByLabel('Puesto', { exact: true }).fill('Coordinadora');
  await page.getByRole('button', { name: 'Cerrar sesión en este dispositivo', exact: true }).click();
  await expect(page.getByRole('dialog', { name: '¿Cerrar sesión?' })).toContainText('Tienes cambios sin guardar');
  await page.getByRole('button', { name: 'Seguir editando', exact: true }).click();
  await expect(page.getByLabel('Puesto', { exact: true })).toHaveValue('Coordinadora');
  state.saveFails = true;
  await page.getByRole('button', { name: 'Guardar perfil', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('No se guardó el perfil.');
  await expect(page.getByLabel('Puesto', { exact: true })).toHaveValue('Coordinadora');
  await expect(page.getByText('Perfil guardado en tu cuenta.')).toHaveCount(0);
  state.saveFails = false;
  await page.getByRole('button', { name: 'Guardar perfil', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Perfil guardado en tu cuenta.');
  const second = await context.newPage();
  await second.goto('./?acceso=cuenta');
  await expect(second.getByLabel('Puesto', { exact: true })).toHaveValue('Coordinadora');
  await page.getByRole('button', { name: 'Cerrar sesión en este dispositivo', exact: true }).click();
  for (const tab of [page, second]) {
    await expect(tab.getByRole('heading', { name: 'Inicia sesión', exact: true })).toBeVisible();
    await expect(tab.getByLabel('Puesto', { exact: true })).toHaveCount(0);
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

test('el acceso interno conserva el borrador guardado manualmente y vuelve al espacio de pruebas', async ({ page, context }) => {
  await mock(context);
  await page.goto('./');
  await page.getByLabel('Área inspeccionada').fill('Borrador que debe conservarse');
  await page.getByRole('button', { name: 'Guardar', exact: true }).first().click();
  await expect(page.getByText('Guardado en este navegador', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Mi perfil', exact: true }).click();
  await page.getByRole('button', { name: 'Iniciar sesión con correo', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Inicia sesión', exact: true })).toBeVisible();
  await expect(page).toHaveURL(/acceso=cuenta/);
  await page.getByRole('button', { name: 'Espacio de pruebas', exact: true }).click();
  await expect(page.getByLabel('Área inspeccionada')).toHaveValue('Borrador que debe conservarse');
  await page.reload();
  await expect(page.getByLabel('Área inspeccionada')).toHaveValue('Borrador que debe conservarse');
});

test('el primer ingreso exige una contraseña personal, rechaza la temporal y vuelve al acceso tras actualizar', async ({ page, context }) => {
  const state = await mock(context, { ...initialProfile(), must_change_password: true });
  const passwords: string[] = [];
  await page.route('**/api/accounts/password', async route => {
    expect(route.request().headers().authorization).toMatch(/^Bearer ey/);
    const body = route.request().postDataJSON();
    expect(Object.keys(body)).toEqual(['password']); passwords.push(body.password);
    state.profile.must_change_password = false;
    await route.fulfill({ json: { ok: true } });
  });
  await login(page);
  await expect(page.getByRole('heading', { name: 'Actualiza tu contraseña', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Gestión de Cuentas', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Espacio de pruebas', exact: true })).toHaveCount(0);
  await expect(page.getByLabel('Nombres y apellidos')).toHaveCount(0);
  await page.getByLabel(/^Nueva contraseña/).fill('0123456789');
  await page.getByLabel(/^Repite la nueva contraseña/).fill('0123456789');
  await page.getByRole('button', { name: 'Actualizar contraseña', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('distinta de la temporal'); expect(passwords).toEqual([]);
  await page.getByLabel(/^Nueva contraseña/).fill('MiNueva!Clave47');
  await page.getByRole('button', { name: 'Actualizar contraseña', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('no coinciden'); expect(passwords).toEqual([]);
  await page.getByLabel(/^Repite la nueva contraseña/).fill('MiNueva!Clave47');
  await page.getByRole('button', { name: 'Actualizar contraseña', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Inicia sesión', exact: true })).toBeVisible();
  await expect(page.getByRole('status')).toContainText('Contraseña actualizada.');
  expect(passwords).toEqual(['MiNueva!Clave47']);
  expect(await page.evaluate(() => JSON.stringify({ ...localStorage, ...sessionStorage }))).not.toContain('MiNueva!Clave47');
});

test('el administrador crea usuarios reales sin añadir cuentas locales y conserva el ID al reintentar', async ({ page, context }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mock(context, { ...initialProfile(), full_name: 'Admin', area: 'Seguridad', must_change_password: false });
  const calls: { id: string; body: Record<string, unknown> }[] = [];
  let fail = true;
  await page.route('**/api/accounts', async route => {
    expect(route.request().headers().authorization).toMatch(/^Bearer ey/);
    if (route.request().method() === 'GET') return route.fulfill({ json: { ok: true, accounts: [] } });
    const body = route.request().postDataJSON(); calls.push({ id: route.request().headers()['idempotency-key'], body });
    expect(Object.keys(body)).not.toContain('password');
    if (fail) return route.fulfill({ status: 503, json: { ok: false, message: 'No se confirmó el alta. Reintenta.' } });
    await route.fulfill({ json: { ok: true, account: { id: '30000000-0000-4000-8000-000000000002', ...body, enabled: true, must_change_password: true } } });
  });
  await login(page);
  await page.getByRole('button', { name: 'Gestión de Cuentas', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Gestión de Cuentas', exact: true })).toBeVisible();
  await page.getByLabel('Nombres y apellidos').fill('Persona de Prueba');
  await page.getByLabel(/^Correo del usuario/).fill('persona@example.invalid');
  await page.getByLabel(/^Área/).fill('Mantenimiento');
  await page.getByLabel('Puesto', { exact: true }).fill('Supervisor');
  await page.getByRole('button', { name: 'Mostrar contraseña temporal', exact: true }).click();
  await expect(page.getByLabel('Contraseña temporal', { exact: true })).toHaveValue('0123456789');
  await expect(page.getByLabel('Contraseña temporal', { exact: true })).toHaveAttribute('readonly', '');
  await page.getByRole('switch', { name: 'Inspecciones', exact: true }).click();
  await expect(page.getByRole('switch', { name: 'Inspecciones', exact: true })).toBeChecked();
  await expect(page.getByRole('switch')).toHaveCount(2);
  await page.getByRole('switch', { name: 'Inspecciones', exact: true }).click();
  await expect(page.getByRole('switch', { name: 'Inspecciones', exact: true })).not.toBeChecked();
  await page.getByRole('switch', { name: 'Administrador', exact: true }).click();
  await expect(page.getByRole('switch', { name: 'Inspecciones', exact: true })).toBeChecked();
  await expect(page.getByRole('switch', { name: 'Inspecciones', exact: true })).toBeDisabled();
  await page.getByRole('switch', { name: 'Administrador', exact: true }).click();
  await expect(page.getByRole('switch', { name: 'Administrador', exact: true })).not.toBeChecked();
  await page.getByRole('button', { name: 'Crear usuario', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('No se confirmó el alta.');
  await expect(page.getByLabel(/^Correo del usuario/)).toHaveValue('persona@example.invalid');
  fail = false;
  await page.getByRole('button', { name: 'Crear usuario', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Cuenta creada para persona@example.invalid');
  expect(calls).toHaveLength(2); expect(calls[0].id).toBe(calls[1].id);
  expect(calls[1].body).toMatchObject({ can_create_inspections: true, can_receive_inspections: true, role: 'inspector' });
  await expect(page.locator('.account-row')).toHaveCount(0);
  await page.getByRole('button', { name: 'Gestión de Usuarios', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Crear usuario', exact: true })).toHaveCount(0);
  await expect(page.locator('.account-row')).toContainText('Persona de Prueba');
  await expect(page.locator('.account-row')).toContainText('Contraseña temporal');
  expect(await page.evaluate(() => localStorage.getItem('berry-demo-accounts-v1'))).toBeNull();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});


test('Administrar usuarios llega a la gestión real después de iniciar sesión y conserva el destino al recargar', async ({ page, context }) => {
  await mock(context, { ...initialProfile(), full_name: 'Admin real', area: 'Seguridad', must_change_password: false });
  let lists = 0;
  await page.route('**/api/accounts', route => { lists++; expect(route.request().headers().authorization).toMatch(/^Bearer ey/); return route.fulfill({ json: { ok: true, accounts: [] } }); });
  await page.goto('./');
  await page.getByRole('button', { name: 'Administración', exact: true }).click();
  await page.getByRole('button', { name: 'Administrar usuarios', exact: true }).click();
  await page.getByLabel(/^Correo electrónico/).fill(email); await page.getByLabel(/^Contraseña/).fill('Fictitious!47'); await page.getByRole('button', { name: 'Iniciar sesión', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Crear usuario', exact: true })).toBeVisible();
  await expect(page.getByLabel(/^Correo del usuario/)).toBeVisible(); expect(lists).toBeGreaterThan(0);
  expect(await page.evaluate(() => localStorage.getItem('berry-demo-accounts-v1'))).toBeNull();
  const beforeReload = lists;
  await page.reload(); await expect(page.getByRole('button', { name: 'Crear usuario', exact: true })).toBeVisible(); await expect.poll(() => lists).toBeGreaterThan(beforeReload);
});
test('el enlace a Usuarios no otorga permisos administrativos a una cuenta de inspecciones', async ({ page, context }) => {
  await mock(context, { ...initialProfile(), full_name: 'Inspector real', area: 'Seguridad', role: 'inspector' });
  let lists = 0;
  await page.route('**/api/accounts', route => { lists++; return route.fulfill({ status: 403, json: { ok: false } }); });
  await page.goto('./?acceso=cuenta&seccion=usuarios');
  await page.getByLabel(/^Correo electrónico/).fill(email); await page.getByLabel(/^Contraseña/).fill('Fictitious!47'); await page.getByRole('button', { name: 'Iniciar sesión', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Mi perfil', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Crear usuario', exact: true })).toHaveCount(0); expect(lists).toBe(0);
});


test('Atrás cierra la sesión y vuelve al acceso; recordar cuenta conserva solo el correo', async ({ page, context }) => {
  const state = await mock(context, { ...initialProfile(), full_name: 'Persona recordada', area: 'Seguridad' });
  await page.goto('./?acceso=cuenta');
  await page.getByLabel('Recordar mi cuenta en este dispositivo').check();
  await page.getByLabel(/^Correo electrónico/).fill(email);
  await page.getByLabel(/^Contraseña/).fill('Fictitious!47');
  await page.getByRole('button', { name: 'Iniciar sesión', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Mi perfil', exact: true })).toBeVisible();
  await page.goBack();
  await expect(page.getByRole('dialog', { name: '¿Estás seguro de salir?' })).toBeVisible();
  await page.getByRole('button', { name: 'Seguir en la aplicación', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Mi perfil', exact: true })).toBeVisible();
  await page.goBack();
  await page.getByRole('button', { name: 'Salir', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Inicia sesión', exact: true })).toBeVisible();
  await expect(page.getByLabel(/^Correo electrónico/)).toHaveValue(email);
  await expect(page.getByLabel(/^Contraseña/)).toHaveValue('');
  expect(state.paths).toContain('/auth/v1/logout');
  await page.reload();
  await expect(page.getByLabel(/^Correo electrónico/)).toHaveValue(email);
  expect(await page.evaluate(() => JSON.stringify({ ...localStorage, ...sessionStorage }))).not.toContain('Fictitious!47');
  await page.getByLabel('Recordar mi cuenta en este dispositivo').uncheck();
  await page.reload();
  await expect(page.getByLabel(/^Correo electrónico/)).toHaveValue('');
});

test('Gestión de Usuarios conserva permisos, desactivación y eliminación sin duplicar las inspecciones', async ({ page, context }) => {
  const actor = { ...initialProfile(), full_name: 'Admin real', area: 'Seguridad', must_change_password: false };
  await mock(context, actor);
  let target = { ...actor, id: '30000000-0000-4000-8000-000000000002', email: 'otra@example.invalid', full_name: 'Otra persona', role: 'inspector', can_create_inspections: false, can_receive_inspections: true, access_revision: 1, deleted_at: null as string | null };
  await page.route('**/api/accounts', route => route.fulfill({ json: { ok: true, accounts: [actor, target] } }));
  const changes: any[] = [];
  await page.route('**/api/accounts/manage', route => {
    const body = route.request().postDataJSON(); changes.push(body);
    expect(body.id).toBe(target.id); expect(body.expectedRevision).toBe(target.access_revision);
    target = { ...target, ...body.permissions, access_revision: target.access_revision + 1, ...(body.action === 'delete' ? { enabled: false, deleted_at: '2026-11-08' } : {}) };
    return route.fulfill({ json: { ok: true, account: target } });
  });
  const report = { id: '30000000-0000-4000-8000-000000000003', author_id: target.id, author: target.full_name, email: target.email, area: 'Área ajena', date: '2026-11-05', workflow: 'closed', code: 'IH-2026-010', revision: 7, observation_count: 2 };
  await page.route('**/api/accounts/inspections', route => route.fulfill({ json: { ok: true, inspections: [report] } }));
  let removed = false;
  await page.route('**/api/accounts/inspections/delete', route => { expect(route.request().postDataJSON()).toEqual({ id: report.id, expectedRevision: 7 }); removed = true; return route.fulfill({ json: { ok: true } }); });
  await login(page); await page.getByRole('button', { name: 'Gestión de Cuentas', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Todas las inspecciones', exact: true })).toHaveCount(0);
  await expect(page.locator('.account-row')).toHaveCount(0);
  await page.getByRole('button', { name: 'Gestión de Usuarios', exact: true }).click();
  const row = page.locator('.account-row').filter({ hasText: target.email });
  await row.getByRole('button', { name: 'Editar permisos' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toContainText('Actualmente solo puede recibir inspecciones.');
  await expect(dialog.getByRole('switch')).toHaveCount(2);
  await dialog.getByRole('switch', { name: 'Administrador', exact: true }).click();
  await expect(dialog.getByRole('switch', { name: 'Administrador', exact: true })).toBeChecked();
  await expect(dialog.getByRole('switch', { name: 'Inspecciones', exact: true })).toBeChecked();
  await expect(dialog.getByRole('switch', { name: 'Inspecciones', exact: true })).toBeDisabled();
  await expect(dialog).toContainText('Incluido en Administrador');
  await dialog.getByRole('button', { name: 'Guardar permisos' }).click();
  await expect(page.getByRole('status')).toContainText('Permisos actualizados.');
  expect(changes[0].permissions).toEqual({ enabled: true, role: 'admin', can_create_inspections: true, can_receive_inspections: true });
  await row.getByRole('button', { name: 'Desactivar', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Desactivar', exact: true }).click();
  await expect(row).toContainText('Inhabilitada');
  await row.getByRole('button', { name: 'Reactivar', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Reactivar', exact: true }).click();
  await expect(row).toContainText('Habilitada');
  await row.getByRole('button', { name: `Eliminar cuenta ${target.email}`, exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Eliminar', exact: true }).click();
  await expect(row).toHaveCount(0); expect(changes[3].action).toBe('delete');
  expect(removed).toBe(false);
  await expect(page.getByRole('button', { name: 'Todas las inspecciones', exact: true })).toHaveCount(0);
});


test('una cuenta inhabilitada ve los administradores vigentes y una eliminada no recupera acceso ni aparece como cuenta activa', async ({ page, context }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const state = await mock(context, { ...initialProfile(), full_name: 'Persona inhabilitada', role: 'inspector', enabled: false });
  await login(page);
  await expect(page.getByRole('heading', { name: 'Cuenta inhabilitada', exact: true })).toBeVisible();
  const contacts = page.getByRole('region', { name: 'Administradores de contacto' });
  await expect(contacts).toContainText('Administradora vigente');
  await expect(contacts.getByRole('link')).toHaveText('admin-vigente@example.invalid');
  await expect(page.getByRole('button', { name: 'Entrar al espacio de trabajo' })).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  state.administrators = [{ id: '30000000-0000-4000-8000-000000000010', full_name: 'Administrador nuevo', email: 'admin-nuevo@example.invalid' }];
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await expect(contacts).toContainText('Administrador nuevo');
  await expect(contacts).not.toContainText('Administradora vigente');
  state.profile.deleted_at = '2026-11-08T12:00:00Z';
  await page.getByRole('button', { name: 'Comprobar acceso', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Cuenta eliminada', exact: true })).toBeVisible();
  await expect(contacts).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Comprobar acceso', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Entrar al espacio de trabajo' })).toHaveCount(0);
});


test('Gestión de Cuentas reutiliza la lista al cambiar de sección, la actualiza en segundo plano y limpia la caché al salir', async ({ page, context }) => {
  const actor = { ...initialProfile(), full_name: 'Administrador de prueba', area: 'Seguridad', must_change_password: false };
  await mock(context, actor);
  let version = 'Persona en memoria', calls = 0, block = false;
  let resumes: Array<() => void> = [];
  await page.route('**/api/accounts', async route => {
    calls++;
    if (block) await new Promise<void>(resolve => { resumes.push(resolve); });
    await route.fulfill({ json: { ok: true, accounts: [actor, { ...actor, id: '30000000-0000-4000-8000-000000000002', email: 'persona@example.invalid', full_name: version, role: 'inspector' }] } });
  });
  await login(page); await page.getByRole('button', { name: 'Gestión de Cuentas', exact: true }).click();
  await page.getByRole('button', { name: 'Gestión de Usuarios', exact: true }).click();
  await expect(page.locator('.account-row')).toContainText(['Administrador de prueba', 'Persona en memoria']);
  await page.getByRole('button', { name: 'Mi perfil', exact: true }).click();
  const beforeReturn = calls; block = true;
  await page.getByRole('button', { name: 'Gestión de Cuentas', exact: true }).click();
  await expect.poll(() => calls).toBeGreaterThan(beforeReturn);
  try { await expect(page.locator('.account-row').filter({ hasText: 'Persona en memoria' })).toBeVisible(); }
  finally { version = 'Persona actualizada'; block = false; for (const resume of resumes) resume(); resumes = []; }
  await expect(page.locator('.account-row').filter({ hasText: 'Persona actualizada' })).toBeVisible();
  await page.getByRole('button', { name: 'Cerrar sesión en este dispositivo', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Inicia sesión' })).toBeVisible();
  await page.getByLabel(/^Correo electrónico/).fill(email); await page.getByLabel(/^Contraseña/).fill('Fictitious!47'); await page.getByRole('button', { name: 'Iniciar sesión', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Mi perfil', exact: true })).toBeVisible();
  const beforeSignIn = calls; block = true; await page.getByRole('button', { name: 'Gestión de Cuentas', exact: true }).click();
  await page.getByRole('button', { name: 'Gestión de Usuarios', exact: true }).click();
  await expect.poll(() => calls).toBeGreaterThan(beforeSignIn);
  try { await expect(page.locator('.account-row')).toHaveCount(0); await expect(page.getByText('Consultando cuentas…', { exact: true })).toBeVisible(); }
  finally { block = false; for (const resume of resumes) resume(); resumes = []; }
  await expect(page.locator('.account-row').filter({ hasText: 'Persona actualizada' })).toBeVisible();
});


test('Editar CC conserva valores al fallar, valida correos, guarda sin cambiar permisos y permite borrar todos los CC', async ({page,context}) => {
 const actor={...initialProfile(),full_name:'Administradora',area:'Seguridad',must_change_password:false};await mock(context,actor);
 let target={...actor,id:'30000000-0000-4000-8000-000000000002',email:'persona@example.invalid',full_name:'Persona destinataria',role:'inspector',supervisor_emails:['anterior@example.invalid']};
 let fail=false;const updates:any[]=[];
 await page.route('**/api/accounts',route=>route.fulfill({json:{ok:true,accounts:[actor,target]}}));
 await page.route('**/api/accounts/manage',route=>{
  const body=route.request().postDataJSON();updates.push(body);expect(body.id).toBe(target.id);expect(body.expectedRevision).toBe(target.access_revision);
  if(fail)return route.fulfill({status:503,json:{ok:false,message:'No se pudo guardar. Reintenta.'}});
  target={...target,supervisor_emails:body.permissions.supervisor_emails,access_revision:target.access_revision!+1};return route.fulfill({json:{ok:true,account:target}});
 });
 await login(page);await page.getByRole('button',{name:'Gestión de Cuentas',exact:true}).click();
 await expect(page.getByRole('button',{name:'Agregar Usuario',exact:true})).toHaveAttribute('aria-current','page');await expect(page.locator('.account-row')).toHaveCount(0);
 await page.getByRole('button',{name:'Gestión de Usuarios',exact:true}).click();await expect(page.getByRole('button',{name:'Crear usuario',exact:true})).toHaveCount(0);
 const row=page.locator('.account-row').filter({hasText:target.email});await row.getByRole('button',{name:'Editar CC',exact:true}).click();const dialog=page.getByRole('dialog',{name:'Administradores (CC)',exact:true});
 await expect(dialog.getByLabel('Administradores (CC)')).toHaveValue('anterior@example.invalid');await dialog.getByLabel('Administradores (CC)').fill('no-es-correo');await dialog.getByRole('button',{name:'Guardar CC',exact:true}).click();await expect(dialog.getByRole('alert')).toContainText('correos válidos');expect(updates).toHaveLength(0);
 await dialog.getByLabel('Administradores (CC)').fill('NUEVO@example.invalid, nuevo@example.invalid, segunda@example.invalid');fail=true;await dialog.getByRole('button',{name:'Guardar CC',exact:true}).click();await expect(dialog.getByRole('alert')).toContainText('Reintenta');await expect(dialog.getByLabel('Administradores (CC)')).toHaveValue('NUEVO@example.invalid, nuevo@example.invalid, segunda@example.invalid');
 fail=false;await dialog.getByRole('button',{name:'Guardar CC',exact:true}).click();await expect(page.getByRole('status')).toHaveText('Administradores (CC) actualizados.');expect(target.supervisor_emails).toEqual(['nuevo@example.invalid','segunda@example.invalid']);
 expect(updates[1].permissions).toEqual({enabled:true,role:'inspector',can_create_inspections:true,can_receive_inspections:true,supervisor_emails:['nuevo@example.invalid','segunda@example.invalid']});
 await page.getByRole('button',{name:'Mi perfil',exact:true}).click();await page.getByRole('button',{name:'Gestión de Cuentas',exact:true}).click();await expect(page.getByRole('button',{name:'Gestión de Usuarios',exact:true})).toHaveAttribute('aria-current','page');
 await row.getByRole('button',{name:'Editar CC',exact:true}).click();await expect(dialog.getByLabel('Administradores (CC)')).toHaveValue('nuevo@example.invalid, segunda@example.invalid');
 await page.setViewportSize({width:390,height:844});await page.screenshot({path:test.info().outputPath('editar-cc-telefono.png'),fullPage:true});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await dialog.getByLabel('Administradores (CC)').fill('');await dialog.getByRole('button',{name:'Guardar CC',exact:true}).click();await expect(dialog).toHaveCount(0);expect(target.supervisor_emails).toEqual([]);
 await page.screenshot({path:test.info().outputPath('gestion-usuarios-telefono.png'),fullPage:true});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});

for (const width of [1366, 390]) test(`Gestión de Usuarios busca por nombre, cargo y área entre más de 50 cuentas sin consultar al escribir (${width}px)`, async ({ page, context }) => {
  await page.setViewportSize({ width, height: 900 });
  const actor = { ...initialProfile(), full_name: 'Administradora', area: 'SIGMA', job_title: 'Supervisora', must_change_password: false };
  await mock(context, actor);
  const accounts = [actor, ...Array.from({ length: 60 }, (_, index) => ({ ...actor, id: `33000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`, full_name: index === 37 ? 'José Álvarez' : `Persona ${index + 1}`, email: `persona${index + 1}@example.invalid`, area: index === 37 ? 'Gestión Ambiental' : 'Logística', job_title: index === 37 ? 'Jefe de Producción' : 'Asistente', role: 'inspector' }))];
  let reads = 0, mutations = 0;
  await page.route('**/api/accounts', route => { reads++; return route.fulfill({ json: { ok: true, accounts } }); });
  await page.route('**/api/accounts/manage', route => { mutations++; return route.fulfill({ status: 500, json: { ok: false } }); });
  await login(page); await page.getByRole('button', { name: 'Gestión de Cuentas', exact: true }).click(); await page.getByRole('button', { name: 'Gestión de Usuarios', exact: true }).click();
  const rows = page.locator('.account-row'), search = page.getByRole('searchbox', { name: 'Buscar usuarios por nombre, cargo o área', exact: true });
  await expect(rows).toHaveCount(61); await expect(search).toHaveAttribute('placeholder', 'Buscar por nombre, cargo o área');
  await page.locator('.account-users-heading').screenshot({ path: test.info().outputPath(`buscar-usuarios-${width}.png`) });
  const baseline = reads;
  for (const query of ['  JOSE   alvarez  ', 'JEFE de PRODUCCION', 'gestion ambiental', 'jose produccion ambiental']) {
    await search.fill(query); await expect(rows).toHaveCount(1); await expect(rows).toContainText('José Álvarez'); await expect(page.getByRole('heading', { name: 'Usuarios', exact: false })).toHaveText('Usuarios 1 de 61');
  }
  await page.getByRole('button', { name: 'Agregar Usuario', exact: true }).click(); await page.getByRole('button', { name: 'Gestión de Usuarios', exact: true }).click(); await expect(search).toHaveValue('jose produccion ambiental'); await expect(rows).toHaveCount(1);
  await rows.getByRole('button', { name: 'Editar permisos', exact: true }).click(); await expect(page.getByRole('dialog', { name: 'Permisos de José Álvarez', exact: true })).toBeVisible(); await page.getByRole('dialog').getByRole('button', { name: 'Cancelar', exact: true }).click();
  await search.fill('ninguna coincidencia'); await expect(rows).toHaveCount(0); await expect(page.getByText('No hay usuarios que coincidan con tu búsqueda.', { exact: true })).toBeVisible(); await expect(page.getByRole('heading', { name: 'Usuarios', exact: false })).toHaveText('Usuarios 0 de 61');
  await page.getByRole('button', { name: 'Limpiar búsqueda de usuarios', exact: true }).click(); await expect(rows).toHaveCount(61); await expect(search).toBeFocused(); await expect(search).toHaveValue('');
  await search.fill('   '); await expect(rows).toHaveCount(61); expect(reads).toBe(baseline); expect(mutations).toBe(0);
  await search.fill('gestion ambiental'); accounts[38].area = 'Recursos Humanos'; await page.getByRole('button', { name: 'Actualizar lista', exact: true }).click();
  await expect.poll(() => reads).toBe(baseline + 1); await expect(rows).toHaveCount(0); await expect(search).toHaveValue('gestion ambiental');
  await page.getByRole('button', { name: 'Limpiar búsqueda de usuarios', exact: true }).click(); await expect(rows).toHaveCount(61); expect(mutations).toBe(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
