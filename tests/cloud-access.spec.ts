import { openWorkspaceProfile } from './workspace-profile-fixture';
import { test, expect } from './test-fixture';
import type { BrowserContext, Page } from '@playwright/test';
import { mockOrganizationCatalog } from './organization-fixture';
import { selectValue } from './select-fixture';

const origin = 'https://rwacygoxhkxxxkvushmb.supabase.co';
const id = '30000000-0000-4000-8000-000000000001';
const email = 'cuenta@example.invalid';
type Profile = { id: string; email: string; full_name: string; area: string; management?: string; job_title: string; role: string; enabled: boolean; must_change_password?: boolean; can_create_inspections?: boolean; can_receive_inspections?: boolean; access_revision?: number; supervisor_emails?: string[]; deleted_at?: string | null };
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
        expect(Object.keys(update).sort()).toEqual(['area', 'full_name', 'job_title', ...(state.profile.management !== undefined ? ['management'] : [])].sort());
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
  await expect(page.getByRole('button', { name: 'Gestión de Usuarios', exact: true })).toHaveCount(0);
  await page.getByLabel(/^Nueva contraseña/).fill('Recuperada!47'); await page.getByLabel(/^Repite la nueva contraseña/).fill('Recuperada!47'); await page.getByRole('button', { name: 'Actualizar contraseña', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Inicia sesión', exact: true })).toBeVisible(); expect(passwordCalls).toBe(1);
  expect(await page.evaluate(() => JSON.stringify({ ...localStorage, ...sessionStorage }))).not.toContain('Recuperada!47');
});

for (const width of [1366, 768, 390]) test(`el lápiz reúne permisos, CC y correo, vuelve sin guardar y conserva el intento ante un conflicto (${width}px)`, async ({ page, context }) => {
  await page.setViewportSize({ width, height: 800 });
  const actor = { ...initialProfile(), full_name: 'Administradora', area: 'SIGMA', job_title: 'Supervisora', must_change_password: false };
  await mock(context, actor);
  let target = { ...actor, id: '30000000-0000-4000-8000-000000000002', full_name: 'Persona de Prueba', email: 'anterior@example.invalid', role: 'inspector', supervisor_emails: ['copia@example.invalid'] };
  await page.route('**/api/accounts', route => route.fulfill({ json: { ok: true, accounts: [actor, target] } }));
  const writes: { body: any; operation: string | undefined }[] = []; let duplicate = true;
  await page.route('**/api/accounts/email', route => {
    const body = route.request().postDataJSON(); writes.push({ body, operation: route.request().headers()['idempotency-key'] });
    if (duplicate) return route.fulfill({ status: 409, json: { ok: false, message: 'Ese correo ya tiene una cuenta.' } });
    target = { ...target, email: body.email, access_revision: target.access_revision! + 1 };
    return route.fulfill({ json: { ok: true, account: target } });
  });
  await login(page); await page.getByRole('button', { name: 'Gestión de Usuarios', exact: true }).click(); await page.getByRole('button', { name: 'Administrar usuarios', exact: true }).click();
  const row = page.locator('.account-row').filter({ hasText: target.full_name });
  await expect(row.getByRole('button', { name: 'Permisos', exact: true })).toHaveCount(0);
  await row.getByRole('button', { name: 'Editar usuario Persona de Prueba', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('button', { name: 'Permisos', exact: true })).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Responde a (CC)', exact: true })).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Modificar correo', exact: true })).toBeVisible();
  await dialog.screenshot({ path: test.info().outputPath(`opciones-usuario-${width}.png`) });
  await dialog.getByRole('button', { name: 'Permisos', exact: true }).click(); await expect(dialog.getByRole('button', { name: 'Volver a opciones', exact: true })).toBeFocused();
  await dialog.getByRole('switch', { name: 'Administrador', exact: true }).click();
  await dialog.getByRole('button', { name: 'Volver a opciones', exact: true }).click(); await expect(dialog.getByRole('button', { name: 'Permisos', exact: true })).toBeFocused();
  await dialog.getByRole('button', { name: 'Responde a (CC)', exact: true }).click(); await dialog.getByLabel('Responde a (CC):', { exact: true }).fill('pendiente@example.invalid');
  await dialog.getByRole('button', { name: 'Volver a opciones', exact: true }).click(); await dialog.getByRole('button', { name: 'Permisos', exact: true }).click();
  await expect(dialog.getByRole('switch', { name: 'Administrador', exact: true })).toBeChecked();
  await dialog.getByRole('button', { name: 'Volver a opciones', exact: true }).click(); await dialog.getByRole('button', { name: 'Responde a (CC)', exact: true }).click();
  await expect(dialog.getByLabel('Responde a (CC):', { exact: true })).toHaveValue('pendiente@example.invalid'); expect(writes).toHaveLength(0);
  await dialog.getByRole('button', { name: 'Volver a opciones', exact: true }).click(); await dialog.getByRole('button', { name: 'Modificar correo', exact: true }).click();
  await dialog.getByLabel('Nuevo correo electrónico').fill(' NUEVO@example.invalid '); await dialog.getByRole('button', { name: 'Guardar correo', exact: true }).click();
  await expect(dialog.getByRole('alert')).toContainText('ya tiene una cuenta'); await expect(dialog.getByLabel('Nuevo correo electrónico')).toHaveValue('NUEVO@example.invalid');
  duplicate = false; await dialog.getByRole('button', { name: 'Guardar correo', exact: true }).click(); await expect(dialog).toHaveCount(0);
  expect(writes).toHaveLength(2); expect(writes[0].operation).toBe(writes[1].operation); expect(writes[1].body).toEqual({ id: target.id, expectedRevision: 1, email: 'nuevo@example.invalid' });
  expect(target.role).toBe('inspector'); expect(target.supervisor_emails).toEqual(['copia@example.invalid']); await expect(row).toContainText('nuevo@example.invalid');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
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
  await page.getByRole('textbox', { name: 'Objetivo de la inspección interna', exact: true }).fill('Borrador que debe conservarse');
  await page.getByRole('button', { name: 'Guardar', exact: true }).first().click();
  await expect(page.getByText('Guardado en este navegador', { exact: true })).toBeVisible();
  await openWorkspaceProfile(page);
  await page.getByRole('button', { name: 'Iniciar sesión con correo', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Inicia sesión', exact: true })).toBeVisible();
  await expect(page).toHaveURL(/acceso=cuenta/);
  await page.getByRole('button', { name: 'Espacio de pruebas', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Objetivo de la inspección interna', exact: true })).toHaveValue('Borrador que debe conservarse');
  await page.reload();
  await expect(page.getByRole('textbox', { name: 'Objetivo de la inspección interna', exact: true })).toHaveValue('Borrador que debe conservarse');
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
  await expect(page.getByRole('button', { name: 'Gestión de Usuarios', exact: true })).toHaveCount(0);
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
  await page.getByRole('button', { name: 'Gestión de Usuarios', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Gestión de Usuarios', exact: true })).toBeVisible();
  await page.getByLabel('Nombres y apellidos').fill('  jOSÉ ÁNGEL nÚÑEZ  ');
  await expect(page.getByLabel('Nombres y apellidos')).toHaveValue('  José Ángel Núñez  ');
  await expect(page.getByText('Escribe nombres y apellidos con sus iniciales en mayúscula.', { exact: true })).toHaveCount(0);
  await page.getByLabel(/^Correo del usuario/).fill('persona@example.invalid');
  await expect(page.getByLabel('Área', { exact: true })).toHaveCount(0);
  await expect(page.getByLabel('Puesto', { exact: true })).toHaveCount(0);
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
  expect(calls[1].body).toMatchObject({ full_name: 'José Ángel Núñez', area: '', job_title: '', can_create_inspections: true, can_receive_inspections: true, role: 'inspector' });
  await expect(page.locator('.account-row')).toHaveCount(0);
  await page.getByRole('button', { name: 'Administrar usuarios', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Crear usuario', exact: true })).toHaveCount(0);
  await expect(page.locator('.account-row')).toContainText('José Ángel Núñez');
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
  await expect(page.getByLabel(/^Correo del usuario/)).toBeVisible(); await expect.poll(() => lists).toBeGreaterThan(0);
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

test('Administrar usuarios conserva permisos, desactivación y eliminación sin duplicar las inspecciones', async ({ page, context }) => {
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
  await login(page); await page.getByRole('button', { name: 'Gestión de Usuarios', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Todas las inspecciones', exact: true })).toHaveCount(0);
  await expect(page.locator('.account-row')).toHaveCount(0);
  await page.getByRole('button', { name: 'Administrar usuarios', exact: true }).click();
  const row = page.locator('.account-row').filter({ hasText: target.email });
  await row.getByRole('button', { name: `Editar usuario ${target.full_name}`, exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Permisos', exact: true }).click();
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


test('Gestión de Usuarios reutiliza la lista al cambiar de sección, la actualiza en segundo plano y limpia la caché al salir', async ({ page, context }) => {
  const actor = { ...initialProfile(), full_name: 'Administrador de prueba', area: 'Seguridad', must_change_password: false };
  await mock(context, actor);
  let version = 'Persona en memoria', calls = 0, block = false;
  let resumes: Array<() => void> = [];
  await page.route('**/api/accounts', async route => {
    calls++;
    if (block) await new Promise<void>(resolve => { resumes.push(resolve); });
    await route.fulfill({ json: { ok: true, accounts: [actor, { ...actor, id: '30000000-0000-4000-8000-000000000002', email: 'persona@example.invalid', full_name: version, role: 'inspector' }] } });
  });
  await login(page); await page.getByRole('button', { name: 'Gestión de Usuarios', exact: true }).click();
  await page.getByRole('button', { name: 'Administrar usuarios', exact: true }).click();
  await expect(page.locator('.account-row')).toContainText(['Administrador de prueba', 'Persona en memoria']);
  await page.getByRole('button', { name: 'Mi perfil', exact: true }).click();
  const beforeReturn = calls; block = true;
  await page.getByRole('button', { name: 'Gestión de Usuarios', exact: true }).click();
  await expect.poll(() => calls).toBeGreaterThan(beforeReturn);
  try { await expect(page.locator('.account-row').filter({ hasText: 'Persona en memoria' })).toBeVisible(); }
  finally { version = 'Persona actualizada'; block = false; for (const resume of resumes) resume(); resumes = []; }
  await expect(page.locator('.account-row').filter({ hasText: 'Persona actualizada' })).toBeVisible();
  await page.getByRole('button', { name: 'Cerrar sesión en este dispositivo', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Inicia sesión' })).toBeVisible();
  await page.getByLabel(/^Correo electrónico/).fill(email); await page.getByLabel(/^Contraseña/).fill('Fictitious!47'); await page.getByRole('button', { name: 'Iniciar sesión', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Mi perfil', exact: true })).toBeVisible();
  const beforeSignIn = calls; block = true; await page.getByRole('button', { name: 'Gestión de Usuarios', exact: true }).click();
  await page.getByRole('button', { name: 'Administrar usuarios', exact: true }).click();
  await expect.poll(() => calls).toBeGreaterThan(beforeSignIn);
  try { await expect(page.locator('.account-row')).toHaveCount(0); await expect(page.getByText('Consultando cuentas…', { exact: true })).toBeVisible(); }
  finally { block = false; for (const resume of resumes) resume(); resumes = []; }
  await expect(page.locator('.account-row').filter({ hasText: 'Persona actualizada' })).toBeVisible();
});


test('Responde a (CC) conserva valores al fallar, valida correos, guarda sin cambiar permisos y permite borrar todos los CC', async ({page,context}) => {
 const actor={...initialProfile(),full_name:'Administradora',area:'Seguridad',must_change_password:false};await mock(context,actor);
 let target={...actor,id:'30000000-0000-4000-8000-000000000002',email:'persona@example.invalid',full_name:'Persona destinataria',role:'inspector',supervisor_emails:['anterior@example.invalid']};
 let fail=false;const updates:any[]=[];
 await page.route('**/api/accounts',route=>route.fulfill({json:{ok:true,accounts:[actor,target]}}));
 await page.route('**/api/accounts/manage',route=>{
  const body=route.request().postDataJSON();updates.push(body);expect(body.id).toBe(target.id);expect(body.expectedRevision).toBe(target.access_revision);
  if(fail)return route.fulfill({status:503,json:{ok:false,message:'No se pudo guardar. Reintenta.'}});
  target={...target,supervisor_emails:body.permissions.supervisor_emails,access_revision:target.access_revision!+1};return route.fulfill({json:{ok:true,account:target}});
 });
 await login(page);await page.getByRole('button',{name:'Gestión de Usuarios',exact:true}).click();
 await expect(page.getByRole('button',{name:'Agregar Usuario',exact:true})).toHaveAttribute('aria-current','page');await expect(page.locator('.account-row')).toHaveCount(0);
 await expect(page.locator('.administration-actor')).toHaveText('AdministradoraAdministrador');
 await expect(page.getByLabel('Responde a (CC):')).toHaveAttribute('placeholder','persona1@hortifrut.com, persona2@hortifrut.com');
 await page.getByRole('button',{name:'Administrar usuarios',exact:true}).click();await expect(page.getByRole('button',{name:'Crear usuario',exact:true})).toHaveCount(0);
 const row=page.locator('.account-row').filter({hasText:target.email});await row.getByRole('button',{name:`Editar usuario ${target.full_name}`,exact:true}).click();await page.getByRole('dialog').getByRole('button',{name:'Responde a (CC)',exact:true}).click();const dialog=page.getByRole('dialog',{name:'Responde a (CC)',exact:true});
 await expect(dialog.getByLabel('Responde a (CC):')).toHaveAttribute('placeholder','persona1@hortifrut.com, persona2@hortifrut.com');
 await expect(dialog).toContainText('Separa los correos con comas. Las personas indicadas recibirán una copia de las próximas notificaciones dirigidas a este usuario.');
 await expect(dialog.getByLabel('Responde a (CC):')).toHaveValue('anterior@example.invalid');await dialog.getByLabel('Responde a (CC):').fill('no-es-correo');await dialog.getByRole('button',{name:'Guardar CC',exact:true}).click();await expect(dialog.getByRole('alert')).toContainText('correos válidos');expect(updates).toHaveLength(0);
 await dialog.getByLabel('Responde a (CC):').fill('NUEVO@example.invalid, nuevo@example.invalid, segunda@example.invalid');fail=true;await dialog.getByRole('button',{name:'Guardar CC',exact:true}).click();await expect(dialog.getByRole('alert')).toContainText('Reintenta');await expect(dialog.getByLabel('Responde a (CC):')).toHaveValue('NUEVO@example.invalid, nuevo@example.invalid, segunda@example.invalid');
 fail=false;await dialog.getByRole('button',{name:'Guardar CC',exact:true}).click();await expect(page.getByRole('status')).toHaveText('Correos en copia actualizados.');expect(target.supervisor_emails).toEqual(['nuevo@example.invalid','segunda@example.invalid']);
 expect(updates[1].permissions).toEqual({enabled:true,role:'inspector',can_create_inspections:true,can_receive_inspections:true,supervisor_emails:['nuevo@example.invalid','segunda@example.invalid']});
 await page.getByRole('button',{name:'Mi perfil',exact:true}).click();await page.getByRole('button',{name:'Gestión de Usuarios',exact:true}).click();await expect(page.getByRole('button',{name:'Administrar usuarios',exact:true})).toHaveAttribute('aria-current','page');
 await row.getByRole('button',{name:`Editar usuario ${target.full_name}`,exact:true}).click();await page.getByRole('dialog').getByRole('button',{name:'Responde a (CC)',exact:true}).click();await expect(dialog.getByLabel('Responde a (CC):')).toHaveValue('nuevo@example.invalid, segunda@example.invalid');
 await page.setViewportSize({width:390,height:844});await page.screenshot({path:test.info().outputPath('editar-cc-telefono.png'),fullPage:true,animations:'disabled'});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await dialog.screenshot({path:test.info().outputPath('partes-interesadas.png'),animations:'disabled'});
 await dialog.getByLabel('Responde a (CC):').fill('');await dialog.getByRole('button',{name:'Guardar CC',exact:true}).click();await expect(dialog).toHaveCount(0);expect(target.supervisor_emails).toEqual([]);
 await page.screenshot({path:test.info().outputPath('gestion-usuarios-telefono.png'),fullPage:true,animations:'disabled'});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});

for (const width of [1366, 390]) test(`Administrar usuarios busca por nombre, cargo y área entre más de 50 cuentas sin consultar al escribir (${width}px)`, async ({ page, context }) => {
  await page.setViewportSize({ width, height: 900 });
  const actor = { ...initialProfile(), full_name: 'Administradora', area: 'SIGMA', job_title: 'Supervisora', must_change_password: false };
  await mock(context, actor);
  const accounts = [actor, ...Array.from({ length: 60 }, (_, index) => ({ ...actor, id: `33000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`, full_name: index === 37 ? 'José Álvarez' : `Persona ${index + 1}`, email: `persona${index + 1}@example.invalid`, area: index === 37 ? 'Gestión Ambiental' : 'Logística', job_title: index === 37 ? 'Jefe de Producción' : 'Asistente', role: 'inspector' }))];
  let reads = 0, mutations = 0;
  await page.route('**/api/accounts', route => { reads++; return route.fulfill({ json: { ok: true, accounts } }); });
  await page.route('**/api/accounts/manage', route => { mutations++; return route.fulfill({ status: 500, json: { ok: false } }); });
  await login(page); await page.getByRole('button', { name: 'Gestión de Usuarios', exact: true }).click(); await page.getByRole('button', { name: 'Administrar usuarios', exact: true }).click();
  await expect(page.locator('.administration-actor')).toHaveText('AdministradoraAdministrador');
  await page.locator('.cloud-administration .page-heading').screenshot({ path: test.info().outputPath(`administrador-${width}.png`) });
  const rows = page.locator('.account-row'), search = page.getByRole('searchbox', { name: 'Buscar usuarios por nombre, gerencia, área o cargo', exact: true });
  await expect(rows).toHaveCount(61); await expect(search).toHaveAttribute('placeholder', 'Buscar por nombre, gerencia, área o cargo');
  await page.locator('.account-users-heading').screenshot({ path: test.info().outputPath(`buscar-usuarios-${width}.png`) });
  const baseline = reads;
  for (const query of ['  JOSE   alvarez  ', 'JEFE de PRODUCCION', 'gestion ambiental', 'jose produccion ambiental']) {
    await search.fill(query); await expect(rows).toHaveCount(1); await expect(rows).toContainText('José Álvarez'); await expect(page.getByRole('heading', { name: 'Usuarios', exact: false, level: 2 })).toHaveText('Usuarios 1 de 61');
  }
  await page.getByRole('button', { name: 'Agregar Usuario', exact: true }).click(); await page.getByRole('button', { name: 'Administrar usuarios', exact: true }).click(); await expect(search).toHaveValue('jose produccion ambiental'); await expect(rows).toHaveCount(1);
  await rows.getByRole('button', { name: 'Editar usuario José Álvarez', exact: true }).click(); await page.getByRole('dialog').getByRole('button', { name: 'Permisos', exact: true }).click(); await expect(page.getByRole('dialog', { name: 'Permisos de José Álvarez', exact: true })).toBeVisible(); await page.getByRole('dialog').getByRole('button', { name: 'Cancelar', exact: true }).click();
  await search.fill('ninguna coincidencia'); await expect(rows).toHaveCount(0); await expect(page.getByText('No hay usuarios que coincidan con tu búsqueda.', { exact: true })).toBeVisible(); await expect(page.getByRole('heading', { name: 'Usuarios', exact: false, level: 2 })).toHaveText('Usuarios 0 de 61');
  await page.getByRole('button', { name: 'Limpiar búsqueda de usuarios', exact: true }).click(); await expect(rows).toHaveCount(61); await expect(search).toBeFocused(); await expect(search).toHaveValue('');
  await search.fill('   '); await expect(rows).toHaveCount(61); expect(reads).toBe(baseline); expect(mutations).toBe(0);
  await search.fill('gestion ambiental'); accounts[38].area = 'Recursos Humanos'; await page.getByRole('button', { name: 'Actualizar lista', exact: true }).click();
  await expect.poll(() => reads).toBe(baseline + 1); await expect(rows).toHaveCount(0); await expect(search).toHaveValue('gestion ambiental');
  await page.getByRole('button', { name: 'Limpiar búsqueda de usuarios', exact: true }).click(); await expect(rows).toHaveCount(61); expect(mutations).toBe(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

for (const width of [1366,390]) test(`perfil autenticado conserva gerencia y área sin cambiar permisos (${width}px)`, async({page,context})=>{
 await page.setViewportSize({width,height:900});await mockOrganizationCatalog(page);
 const profile={...initialProfile(),full_name:'Persona de prueba',area:'Área anterior',job_title:'Supervisora',management:'',must_change_password:false};
 const state=await mock(context,profile);await login(page);await page.goto('./?acceso=cuenta&seccion=perfil');
 await selectValue(page.getByRole('combobox',{name:'Gerencia',exact:true}),'Gerencia de prueba A');
 await selectValue(page.getByRole('combobox',{name:'Área',exact:true}),'Área de prueba A2');
 await selectValue(page.getByRole('combobox',{name:'Puesto',exact:true}),'Puesto de prueba A2');
 state.saveFails=true;await page.getByRole('button',{name:'Guardar perfil',exact:true}).click();
 await expect(page.getByRole('combobox',{name:'Área',exact:true})).toHaveText('Área de Prueba A2');
 await expect(page.getByRole('alert')).toContainText('No se guardó el perfil');
 state.saveFails=false;await page.getByRole('button',{name:'Guardar perfil',exact:true}).click();
 await expect(page.getByText('Perfil guardado en tu cuenta.',{exact:true})).toBeVisible();
 expect(state.profile.management).toBe('Gerencia de prueba A');expect(state.profile.area).toBe('Área de prueba A2');
 expect(state.profile.job_title).toBe('Puesto de prueba A2');
 expect(state.profile.role).toBe('admin');expect(state.profile.enabled).toBe(true);
 expect(Object.keys(state.updates.at(-1)!).sort()).toEqual(['area','full_name','job_title','management']);
 await page.reload();await expect(page.getByRole('combobox',{name:'Gerencia',exact:true})).toHaveText('Gerencia de Prueba a');
 await expect(page.getByRole('combobox',{name:'Área',exact:true})).toHaveText('Área de Prueba A2');
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});

for (const width of [1366,390]) test(`una cuenta eliminada requiere elegir identidad; un fallo conserva la elección y reintenta sin duplicar el alta (${width}px)`,async({page,context})=>{
 await page.setViewportSize({width,height:900});await mock(context,{...initialProfile(),full_name:'Administradora',area:'Seguridad',job_title:'Supervisora',must_change_password:false});
 await page.route('**/rest/v1/rpc/berry_schema_status',route=>route.fulfill({json:{schema_version:'202611070001',sync_ready:false,stage:'reports',account_identity_version:'202611150015'}}));
 const previous={id:'30000000-0000-4000-8000-000000000008',person_id:'30000000-0000-4000-8000-000000000008',email:'persona@example.invalid',full_name:'Persona de Prueba',management:'Gerencia anterior',area:'Área anterior',job_title:'Puesto anterior',deleted_at:'2026-11-01T12:00:00Z',enabled:false,access_revision:4,same_email:true,owns_email:true,can_restore:true,can_rehire:true,restore_until:'2099-12-01T12:00:00Z'};
 let normalCreates=0,fail=true;const attempts:{id:string;body:any}[]=[];
 await page.route('**/api/accounts',route=>{if(route.request().method()==='POST')normalCreates++;return route.fulfill({json:{ok:true,accounts:[]}});});
 await page.route('**/api/accounts/matches',route=>route.fulfill({json:{ok:true,matches:[previous]}}));
 await page.route('**/api/accounts/resolve',route=>{attempts.push({id:route.request().headers()['idempotency-key'],body:route.request().postDataJSON()});return route.fulfill({status:fail?503:200,json:fail?{ok:false,message:'No pudimos confirmar la operación. Reintenta conservando los datos.'}:{ok:true,account:{...initialProfile(),id:'30000000-0000-4000-8000-000000000009',person_id:previous.person_id,email:previous.email,full_name:previous.full_name,must_change_password:true}}});});
 await page.goto('./?acceso=cuenta&seccion=usuarios');await page.getByLabel(/^Correo electrónico/).fill(email);await page.getByLabel(/^Contraseña/).fill('Fictitious!47');await page.getByRole('button',{name:'Iniciar sesión',exact:true}).click();
 await page.getByLabel('Nombres y apellidos').fill(previous.full_name);await page.getByLabel('Correo del usuario').fill(previous.email);await page.getByRole('button',{name:'Crear usuario',exact:true}).click();
 const dialog=page.getByRole('dialog',{name:'Encontramos una cuenta con datos coincidentes',exact:true});await expect(dialog).toBeVisible();await expect(dialog.getByRole('button',{name:'Crear acceso',exact:true})).toBeDisabled();expect(normalCreates).toBe(0);
 await dialog.getByRole('radio',{name:/Es la misma persona que regresa/}).check();await dialog.getByRole('button',{name:'Crear acceso',exact:true}).click();await expect(dialog.getByRole('alert')).toContainText('No pudimos confirmar');await expect(dialog.getByRole('radio',{name:/Es la misma persona que regresa/})).toBeChecked();
 fail=false;await dialog.getByRole('button',{name:'Crear acceso',exact:true}).click();await expect(dialog).toHaveCount(0);await expect(page.getByRole('status')).toContainText('Acceso creado para persona@example.invalid');expect(attempts).toHaveLength(2);expect(attempts[0].id).toBe(attempts[1].id);expect(attempts[1].body).toMatchObject({previousId:previous.id,expectedRevision:4,mode:'rehire'});expect(normalCreates).toBe(0);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});

test('correo de una cuenta vigente bloquea otro alta; una restauración vencida no se ofrece como válida',async({page,context})=>{
 await mock(context,{...initialProfile(),full_name:'Administradora',area:'Seguridad',job_title:'Supervisora',must_change_password:false});await page.route('**/rest/v1/rpc/berry_schema_status',route=>route.fulfill({json:{schema_version:'202611070001',sync_ready:false,stage:'reports',account_identity_version:'202611150015'}}));
 let active=true,mutations=0;
 const candidate=()=>({id:'30000000-0000-4000-8000-000000000008',person_id:'30000000-0000-4000-8000-000000000008',email:'persona@example.invalid',full_name:'Persona de Prueba',management:'',area:'',job_title:'',deleted_at:active?null:'2025-01-01T12:00:00Z',enabled:active,access_revision:4,same_email:true,owns_email:true,can_restore:false,can_rehire:!active,restore_until:active?null:'2025-04-01T12:00:00Z'});
 await page.route('**/api/accounts',route=>route.fulfill({json:{ok:true,accounts:[]}}));await page.route('**/api/accounts/matches',route=>route.fulfill({json:{ok:true,matches:[candidate()]}}));await page.route('**/api/accounts/resolve',route=>{mutations++;return route.fulfill({json:{ok:false}});});
 await page.goto('./?acceso=cuenta&seccion=usuarios');await page.getByLabel(/^Correo electrónico/).fill(email);await page.getByLabel(/^Contraseña/).fill('Fictitious!47');await page.getByRole('button',{name:'Iniciar sesión',exact:true}).click();await page.getByLabel('Nombres y apellidos').fill('Persona de Prueba');await page.getByLabel('Correo del usuario').fill('persona@example.invalid');await page.getByRole('button',{name:'Crear usuario',exact:true}).click();
 for(const radio of await page.getByRole('dialog').getByRole('radio').all()) await expect(radio).toBeDisabled();await expect(page.getByRole('dialog')).toContainText('pertenece a una cuenta vigente');await page.getByRole('dialog').getByRole('button',{name:'Cancelar',exact:true}).click();
 active=false;await page.getByRole('button',{name:'Crear usuario',exact:true}).click();await expect(page.getByRole('dialog').getByRole('radio',{name:/Restablecer una eliminación/})).toBeDisabled();await expect(page.getByRole('dialog').getByRole('radio',{name:/Es otra persona/})).toBeEnabled();expect(mutations).toBe(0);
});

test('restablecer por error usa la cuenta anterior y explica la recuperación limitada a pendientes',async({page,context})=>{
 await mock(context,{...initialProfile(),full_name:'Administradora',area:'Seguridad',job_title:'Supervisora',must_change_password:false});await page.route('**/rest/v1/rpc/berry_schema_status',route=>route.fulfill({json:{schema_version:'202611070001',sync_ready:false,stage:'reports',account_identity_version:'202611150015'}}));
 const old='30000000-0000-4000-8000-000000000008',candidate={id:old,person_id:old,email:'persona@example.invalid',full_name:'Persona de Prueba',management:'',area:'',job_title:'',deleted_at:'2026-11-01T12:00:00Z',enabled:false,access_revision:4,same_email:true,owns_email:true,can_restore:true,can_rehire:true,restore_until:'2099-12-01T12:00:00Z'};let normal=0;
 await page.route('**/api/accounts',route=>{if(route.request().method()==='POST')normal++;return route.fulfill({json:{ok:true,accounts:[]}});});await page.route('**/api/accounts/matches',route=>route.fulfill({json:{ok:true,matches:[candidate]}}));await page.route('**/api/accounts/resolve',route=>{expect(route.request().postDataJSON()).toMatchObject({previousId:old,mode:'restore'});return route.fulfill({json:{ok:true,account:{...initialProfile(),id:old,email:candidate.email,full_name:candidate.full_name,must_change_password:true}}});});
 await page.goto('./?acceso=cuenta&seccion=usuarios');await page.getByLabel(/^Correo electrónico/).fill(email);await page.getByLabel(/^Contraseña/).fill('Fictitious!47');await page.getByRole('button',{name:'Iniciar sesión',exact:true}).click();await page.getByLabel('Nombres y apellidos').fill(candidate.full_name);await page.getByLabel('Correo del usuario').fill(candidate.email);await page.getByRole('button',{name:'Crear usuario',exact:true}).click();
 const dialog=page.getByRole('dialog');await expect(dialog).toContainText('inspecciones que estaban pendientes al eliminarla');await dialog.getByRole('radio',{name:/Restablecer una eliminación/}).check();await dialog.getByRole('button',{name:'Restablecer cuenta',exact:true}).click();await expect(dialog).toHaveCount(0);await expect(page.getByRole('status')).toContainText('Cuenta restablecida');expect(normal).toBe(0);
});

test('un alta interrumpida se retoma con su opción y datos originales aunque el navegador haya perdido el intento local',async({page,context})=>{
 await mock(context,{...initialProfile(),full_name:'Administradora',area:'Seguridad',job_title:'Supervisora',must_change_password:false});await page.route('**/rest/v1/rpc/berry_schema_status',route=>route.fulfill({json:{schema_version:'202611070001',sync_ready:false,stage:'reports',account_identity_version:'202611150015'}}));
 const old='30000000-0000-4000-8000-000000000008',values={email:'persona@example.invalid',full_name:'Nombre de la solicitud original',area:'',job_title:'',role:'inspector',supervisor_emails:[],can_create_inspections:false,can_receive_inspections:false};
 const candidate={id:old,person_id:old,email:values.email,full_name:'Persona anterior',management:'',area:'',job_title:'',deleted_at:'2026-11-01T12:00:00Z',enabled:false,access_revision:5,same_email:true,owns_email:false,can_restore:false,can_rehire:false,restore_until:null,pending:{mode:'rehire',input:values}};
 await page.route('**/api/accounts',route=>route.fulfill({json:{ok:true,accounts:[]}}));await page.route('**/api/accounts/matches',route=>route.fulfill({json:{ok:true,matches:[candidate,{...candidate,id:'30000000-0000-4000-8000-000000000009',deleted_at:null,enabled:true,owns_email:true,pending:null}]}}));await page.route('**/api/accounts/resolve',route=>{expect(route.request().postDataJSON()).toMatchObject({mode:'rehire',previousId:old,account:values});return route.fulfill({json:{ok:true,account:{...initialProfile(),id:'30000000-0000-4000-8000-000000000009',email:values.email,full_name:values.full_name,must_change_password:true}}});});
 await page.goto('./?acceso=cuenta&seccion=usuarios');await page.getByLabel(/^Correo electrónico/).fill(email);await page.getByLabel(/^Contraseña/).fill('Fictitious!47');await page.getByRole('button',{name:'Iniciar sesión',exact:true}).click();await page.getByLabel('Nombres y apellidos').fill('Nombre editado después');await page.getByLabel('Correo del usuario').fill(values.email);await page.getByRole('button',{name:'Crear usuario',exact:true}).click();
 const dialog=page.getByRole('dialog');await expect(dialog).toContainText('Nombre de la solicitud original');await expect(dialog.getByRole('radio',{name:/Es la misma persona que regresa/})).toBeChecked();await expect(dialog.getByRole('radio',{name:/Es otra persona/})).toBeDisabled();await dialog.getByRole('button',{name:'Retomar operación',exact:true}).click();await expect(dialog).toHaveCount(0);await expect(page.getByRole('status')).toContainText('Acceso creado');
});
