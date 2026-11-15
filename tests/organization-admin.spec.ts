import { organizationLabel } from '../src/organization-label';
import { test, expect } from '@playwright/test';
import type { BrowserContext, Page } from '@playwright/test';
import { catalogFromNodes, INITIAL_ORGANIZATION_NODES } from '../src/organization-catalog';
import type { OrganizationNode } from '../src/organization-catalog';
import { selectValue } from './select-fixture';
import report from '../reference/organization-import.json' with { type: 'json' };

const project = 'https://rwacygoxhkxxxkvushmb.supabase.co';
const admin = 'aa000000-0000-4000-8000-000000000001', member = 'aa000000-0000-4000-8000-000000000002';
const management = 'ab000000-0000-4000-8000-000000000001', area = 'ab000000-0000-4000-8000-000000000002', job = 'ab000000-0000-4000-8000-000000000003';
const seed: OrganizationNode[] = [
  { id: management, kind: 'management', parent_id: null, name: 'Gerencia de prueba', enabled: true, revision: 1 },
  { id: area, kind: 'area', parent_id: management, name: 'Área de prueba', enabled: true, revision: 1 },
  { id: job, kind: 'position', parent_id: area, name: 'Supervisora de prueba', enabled: true, revision: 1 },
];
const stateOf = () => ({ nodes: structuredClone(seed), writes: [] as Record<string, unknown>[], profileWrites: [] as Record<string, unknown>[], failSave: false, catalogFails: false, paths: [] as string[] });
type State = ReturnType<typeof stateOf>;
async function mock(context: BrowserContext, state: State, id = admin, first = false) {
  const profile = { id, email: id === admin ? 'admin@example.invalid' : 'persona@example.invalid', full_name: id === admin ? 'Administradora de prueba' : 'Persona de prueba', management: first ? '' : 'Gerencia de prueba', area: first ? '' : 'Área de prueba', job_title: first ? '' : 'Supervisora de prueba', role: id === admin ? 'admin' : 'inspector', enabled: true, must_change_password: false, can_create_inspections: true, can_receive_inspections: true };
  const metadata: Record<string, unknown> = first ? { berry_profile_setup_required: true } : { berry_profile_setup_completed_at: '2026-11-01T12:00:00Z' };
  const user = { id, aud: 'authenticated', role: 'authenticated', email: profile.email, app_metadata: { provider: 'email' }, user_metadata: metadata, identities: [], created_at: new Date().toISOString() };
  const token = `eyJhbGciOiJIUzI1NiJ9.${Buffer.from(JSON.stringify({ sub: id, iat: 100, exp: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url')}.fictitious`;
  await context.route(`${project}/**`, async route => {
    const request = route.request(), url = new URL(request.url()), path = url.pathname;
    state.paths.push(path);
    if (request.method() === 'OPTIONS') return route.fulfill({ status: 204 });
    if (path === '/auth/v1/token') return route.fulfill({ json: { access_token: token, token_type: 'bearer', expires_in: 3600, refresh_token: 'fictitious', user } });
    if (path === '/auth/v1/user') { if (request.method() === 'PUT') Object.assign(metadata, request.postDataJSON().data); return route.fulfill({ json: user }); }
    if (path === '/auth/v1/logout') return route.fulfill({ status: 204 });
    if (path === '/rest/v1/rpc/berry_schema_status') return route.fulfill({ json: { schema_version: '202611070001', sync_ready: true, stage: 'reports', organization_catalog_version: '202611150014' } });
    if (path === '/rest/v1/berry_profiles') {
      if (request.method() === 'PATCH') { const update = request.postDataJSON(); state.profileWrites.push(update); Object.assign(profile, update); }
      return route.fulfill({ json: url.searchParams.has('id') ? profile : [profile] });
    }
    if (path === '/rest/v1/rpc/berry_organization_catalog') return route.fulfill({ status: state.catalogFails ? 503 : 200, json: state.catalogFails ? { message: 'offline' } : catalogFromNodes(state.nodes) });
    if (path === '/rest/v1/rpc/berry_admin_organization') return route.fulfill({ status: id === admin ? 200 : 403, json: id === admin ? state.nodes : { code: '42501' } });
    if (path === '/rest/v1/rpc/berry_manage_organization' || path === '/rest/v1/rpc/berry_manage_organization_v2') {
      expect(id).toBe(admin); const body = request.postDataJSON(); state.writes.push(body);
      if (state.failSave) return route.fulfill({ status: 503, json: { message: 'offline' } });
      const old = state.nodes.find(node => node.id === body.p_id);
      if (old && body.p_expected !== old.revision) return route.fulfill({ status: 409, json: { code: '40001' } });
      const next: OrganizationNode = { id: body.p_id, kind: body.p_kind, parent_id: body.p_parent_id, name: body.p_name, enabled: body.p_enabled, revision: old ? old.revision + 1 : 1, ...(body.p_nomenclature !== undefined || old?.nomenclature !== undefined ? { nomenclature: body.p_nomenclature ?? old?.nomenclature ?? '' } : {}) };
      state.nodes = [...state.nodes.filter(node => node.id !== next.id), next];
      return route.fulfill({ json: next });
    }
    if (path === '/rest/v1/rpc/berry_cloud_session') return route.fulfill({ json: id });
    if (path === '/rest/v1/berry_inspections') return route.fulfill({ json: [] });
    if (path === '/rest/v1/rpc/berry_cloud_tombstones') return route.fulfill({ json: [] });
    throw new Error(`Unexpected operation: ${request.method()} ${path}`);
  });
  return { profile, metadata };
}
async function login(page: Page, id = admin, section = 'areas') {
  await page.goto(`./?acceso=cuenta&seccion=${section}`);
  await page.getByRole('textbox', { name: 'Correo electrónico', exact: true }).fill(id === admin ? 'admin@example.invalid' : 'persona@example.invalid');
  await page.getByLabel(/^Contraseña/).fill('Fictitious!47');
  await page.getByRole('button', { name: 'Iniciar sesión', exact: true }).click();
}

test('catálogo IPERC inicial respeta gerencias naranjas, empleados, practicantes y las exclusiones confirmadas', () => {
  expect(report.counts).toMatchObject({ managements: 18, areas: 60, positions: 300 });
  expect(report.excluded_managements).toHaveLength(10);
  expect(INITIAL_ORGANIZATION_NODES.filter(node => node.kind === 'position')).toHaveLength(300);
  for (const name of report.excluded_managements) expect(INITIAL_ORGANIZATION_NODES.some(node => node.name === name)).toBe(false);
  expect(INITIAL_ORGANIZATION_NODES.filter(node => node.kind === 'position').some(node => /\b(PRACTICANTE|OBRERO|OPERARIO|PE[ÓO]N)\b/.test(node.name) || ['OPERADOR CCTV', 'OPERADOR DE MAQUINARIA'].includes(node.name))).toBe(false);
  expect(new Set(INITIAL_ORGANIZATION_NODES.map(node => node.id)).size).toBe(INITIAL_ORGANIZATION_NODES.length);
  expect(catalogFromNodes(INITIAL_ORGANIZATION_NODES)).toHaveLength(18);
});

for (const width of [1366, 390]) test(`administrar listas comparte cambios con otra cuenta, permite añadir un puesto omitido y conserva valores históricos (${width}px)`, async ({ browser, page, context }) => {
  await page.setViewportSize({ width, height: 900 }); const state = stateOf(); await mock(context, state); await login(page);
  await expect(page.getByRole('heading', { name: 'Gestión de Áreas', exact: true })).toBeVisible();
  await page.getByRole('button', { name: organizationLabel('Gerencia de prueba'), exact: true }).click(); await page.getByRole('button', { name: organizationLabel('Área de prueba'), exact: true }).click();
  await page.getByRole('button', { name: 'Añadir puesto', exact: true }).click(); const dialog = page.getByRole('dialog', { name: 'Añadir puesto', exact: true });
  await dialog.getByLabel('Nombre del puesto').fill('Operario autorizado'); state.failSave = true; await dialog.getByRole('button', { name: 'Guardar', exact: true }).click();
  await expect(dialog.getByRole('alert')).toContainText('No pudimos confirmar'); await expect(dialog.getByLabel('Nombre del puesto')).toHaveValue('Operario autorizado');
  state.failSave = false; await dialog.getByRole('button', { name: 'Guardar', exact: true }).click(); await expect(dialog).toHaveCount(0);
  expect(state.writes[0].p_id).toBe(state.writes[1].p_id); await expect(page.getByRole('region', { name: 'Puestos', exact: true })).toContainText(organizationLabel('Operario autorizado'));
  const device = await browser.newContext();
  try {
    const person = await mock(device, state, member, true); const other = await device.newPage(); await login(other, member, 'perfil');
    await selectValue(other.getByRole('combobox', { name: 'Gerencia', exact: true }), 'Gerencia de prueba'); await selectValue(other.getByRole('combobox', { name: 'Área', exact: true }), 'Área de prueba'); await selectValue(other.getByRole('combobox', { name: 'Puesto', exact: true }), 'Operario autorizado');
    await other.getByRole('button', { name: 'Guardar y continuar', exact: true }).click(); await expect(other.getByRole('heading', { name: 'Mis inspecciones', exact: true })).toBeVisible();
    expect(person.profile.job_title).toBe('Operario autorizado'); expect(person.metadata.berry_profile_setup_required).toBe(false);
    await page.getByRole('button', { name: 'Editar puesto ' + organizationLabel('Operario autorizado'), exact: true }).click(); await page.getByRole('dialog').getByLabel('Nombre del puesto').fill('Operario actualizado'); await page.getByRole('dialog').getByRole('button', { name: 'Guardar', exact: true }).click();
    await expect(page.getByRole('region', { name: 'Puestos', exact: true })).toContainText(organizationLabel('Operario actualizado')); expect(person.profile.job_title).toBe('Operario autorizado');
    await other.goto('./?acceso=cuenta&seccion=perfil'); await expect(other.getByRole('combobox', { name: 'Puesto', exact: true })).toHaveText(organizationLabel('Operario autorizado'));
    await other.getByRole('combobox', { name: 'Puesto', exact: true }).click(); await expect(other.getByRole('option', { name: organizationLabel('Operario actualizado'), exact: true })).toBeVisible(); await other.getByRole('searchbox', { name: 'Buscar puestos', exact: true }).press('Escape');
    await page.getByRole('button', { name: 'Retirar gerencia ' + organizationLabel('Gerencia de prueba'), exact: true }).click(); await page.getByRole('dialog').getByRole('button', { name: 'Retirar', exact: true }).click(); await expect(page.getByRole('button', { name: organizationLabel('Gerencia de prueba'), exact: true })).toHaveCount(0);
    expect(person.profile.management).toBe('Gerencia de prueba'); expect(person.profile.job_title).toBe('Operario autorizado');
    await page.getByRole('checkbox', { name: 'Mostrar elementos retirados', exact: true }).check(); await expect(page.getByRole('button', { name: organizationLabel('Gerencia de prueba'), exact: true })).toBeVisible(); await page.getByRole('button', { name: 'Restaurar gerencia ' + organizationLabel('Gerencia de prueba'), exact: true }).click();
    await expect(page.getByRole('region', { name: 'Gerencias', exact: true })).not.toContainText('Retirado'); await page.getByRole('button', { name: organizationLabel('Gerencia de prueba'), exact: true }).click(); await page.getByRole('button', { name: organizationLabel('Área de prueba'), exact: true }).click();
    await page.locator('.organization-admin').screenshot({ path: test.info().outputPath(`gestion-areas-${width}.png`) }); expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  } finally { await device.close(); }
});

test('añadir gerencia y área, editar con padre válido y rechazar una edición obsoleta conserva el formulario', async ({ page, context }) => {
  const state = stateOf(); await mock(context, state); await login(page);
  await page.getByRole('button', { name: 'Añadir gerencia', exact: true }).click(); await page.getByRole('dialog').getByLabel('Nombre de la gerencia').fill('Gerencia nueva'); await page.getByRole('dialog').getByRole('button', { name: 'Guardar', exact: true }).click();
  await page.getByRole('button', { name: 'Añadir área', exact: true }).click(); await page.getByRole('dialog').getByLabel('Nombre del área').fill('Área nueva'); await page.getByRole('dialog').getByRole('button', { name: 'Guardar', exact: true }).click();
  await page.getByRole('button', { name: 'Editar área ' + organizationLabel('Área nueva'), exact: true }).click(); await selectValue(page.getByRole('dialog').getByRole('combobox', { name: 'Gerencia', exact: true }), management);
  const target = state.nodes.find(node => node.name === 'Área nueva')!; target.revision++; target.name = 'Área modificada en otra sesión';
  await page.getByRole('dialog').getByLabel('Nombre del área').fill('Mi edición'); await page.getByRole('dialog').getByRole('button', { name: 'Guardar', exact: true }).click(); await expect(page.getByRole('dialog').getByRole('alert')).toContainText('otra sesión'); await expect(page.getByRole('dialog').getByLabel('Nombre del área')).toHaveValue('Mi edición');
  await page.getByRole('dialog').getByRole('button', { name: 'Cancelar', exact: true }).click(); await page.getByRole('button', { name: 'Actualizar listas', exact: true }).click(); await expect(page.getByRole('region', { name: 'Áreas', exact: true })).toContainText(organizationLabel('Área modificada en otra sesión'));
});

test('usuario sin administración no consulta la gestión y un fallo del catálogo no ofrece listas antiguas', async ({ page, context }) => {
  const state = stateOf(); await mock(context, state, member); await login(page, member);
  await expect(page.getByRole('heading', { name: 'Mi perfil', exact: true })).toBeVisible(); await expect(page.getByRole('button', { name: 'Gestión de Áreas', exact: true })).toHaveCount(0); expect(state.paths).not.toContain('/rest/v1/rpc/berry_admin_organization');
  state.catalogFails = true; await page.reload(); await expect(page.getByRole('button', { name: 'Reintentar catálogo', exact: true })).toBeVisible(); await expect(page.getByRole('combobox', { name: 'Gerencia', exact: true })).toBeDisabled();
  state.catalogFails = false; await page.getByRole('button', { name: 'Reintentar catálogo', exact: true }).click(); await expect(page.getByRole('combobox', { name: 'Gerencia', exact: true })).toBeEnabled();
});

test('nomenclatura es opcional solo en áreas y se comparte con el perfil sin renombrar su selección canónica', async ({ browser, page, context }) => {
  const state = stateOf(); state.nodes.forEach(node => { node.nomenclature = ''; });
  await mock(context, state); await login(page);
  await page.getByRole('button', { name: organizationLabel('Gerencia de prueba'), exact: true }).click();
  await page.getByRole('button', { name: 'Editar área ' + organizationLabel('Área de prueba'), exact: true }).click();
  const dialog = page.getByRole('dialog'); await dialog.getByLabel('Abreviatura', { exact: true }).fill('PRB');
  await dialog.getByRole('button', { name: 'Guardar', exact: true }).click(); await expect(dialog).toHaveCount(0);
  expect(state.writes.at(-1)).toMatchObject({ p_id: area, p_name: 'Área de prueba', p_nomenclature: 'PRB' });
  const device = await browser.newContext();
  try {
    await mock(device, state, member, true); const other = await device.newPage(); await login(other, member, 'perfil');
    await selectValue(other.getByRole('combobox', { name: 'Gerencia', exact: true }), 'Gerencia de prueba');
    await selectValue(other.getByRole('combobox', { name: 'Área', exact: true }), 'Área de prueba');
    await expect(other.getByRole('combobox', { name: 'Área', exact: true })).toHaveText('PRB');
    await selectValue(other.getByRole('combobox', { name: 'Puesto', exact: true }), 'Supervisora de prueba');
    await other.getByRole('button', { name: 'Guardar y continuar', exact: true }).click();
    await expect(other.getByRole('heading', { name: 'Mis inspecciones', exact: true })).toBeVisible();
    expect(state.profileWrites.at(-1)).toMatchObject({ management: 'Gerencia de prueba', area: 'Área de prueba', job_title: 'Supervisora de prueba' });
    await expect(other.locator('.user-role-area')).toContainText('PRB');
    await page.getByRole('button', { name: 'Editar gerencia ' + organizationLabel('Gerencia de prueba'), exact: true }).click();
    await expect(page.getByRole('dialog').getByLabel('Abreviatura', { exact: true })).toHaveCount(0);
  } finally { await device.close(); }
});
