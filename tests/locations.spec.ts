import { test, expect } from '@playwright/test';
import type { BrowserContext, Page } from '@playwright/test';
import ExcelJS from 'exceljs';
import { INITIAL_LOCATION_NODES, locationNodeActive } from '../src/location-catalog';
import type { LocationNode } from '../src/location-catalog';
import { catalogFromNodes, INITIAL_ORGANIZATION_NODES } from '../src/organization-catalog';
import { selectValue } from './select-fixture';
import { locationErrors } from '../src/inspection-location';
import { withCatalogOrder, mockCatalogOrder } from './catalog-order-fixture';

const project = 'https://rwacygoxhkxxxkvushmb.supabase.co', admin = '99200000-0000-4000-8000-000000000001';
const site = INITIAL_LOCATION_NODES.find(node => node.kind === 'site' && node.name === 'Fundo')!;
const zone = INITIAL_LOCATION_NODES.find(node => node.parent_id === site.id && node.name === 'Armonía I')!;
const installation = '99200000-0000-4000-8000-000000000002';
const stateOf = (ready = false) => ({ nodes: structuredClone(INITIAL_LOCATION_NODES), ready, writes: [] as Record<string, unknown>[], fail: false });
test('los informes anteriores conservan su ubicación aunque el catálogo retire o cambie sus áreas y lugares', () => {
  const snapshot = { source: 'catalog' as const, site: 'Sede anterior', zone: 'Zona anterior', detail: '', installationPending: true, management: 'Gerencia anterior', department: 'Área anterior' };
  expect(locationErrors(snapshot, true)).toEqual({});
  expect(locationErrors(snapshot)).toHaveProperty('site');
});
async function mock(context: BrowserContext, state: ReturnType<typeof stateOf>) {
  const profile = { id: admin, email: 'admin@example.invalid', full_name: 'Administradora de Prueba', management: 'GERENCIA DE RECURSOS HUMANOS', area: 'SEGURIDAD INDUSTRIAL Y GESTION MEDIO AMBIENTAL', job_title: 'SUPERVISOR SIGMA', enabled: true, role: 'admin', must_change_password: false, can_create_inspections: true, can_receive_inspections: true, access_revision: 1 };
  const user = { id: admin, email: profile.email, aud: 'authenticated', role: 'authenticated', app_metadata: { provider: 'email' }, user_metadata: { berry_profile_setup_completed_at: '2026-11-01T12:00:00Z' }, identities: [], created_at: new Date().toISOString() };
  const token = `eyJhbGciOiJIUzI1NiJ9.${Buffer.from(JSON.stringify({ sub: admin, exp: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url')}.fictitious`;
  await context.route(`${project}/**`, async route => {
    const req = route.request(), path = new URL(req.url()).pathname;
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204 });
    if (path === '/auth/v1/token') return route.fulfill({ json: { access_token: token, token_type: 'bearer', expires_in: 3600, refresh_token: 'fictitious', user } });
    if (path === '/auth/v1/user') return route.fulfill({ json: user });
    if (path === '/rest/v1/berry_profiles') return route.fulfill({ json: new URL(req.url()).searchParams.has('id') ? profile : [profile] });
    if (path === '/rest/v1/rpc/berry_schema_status') return route.fulfill({ json: { schema_version: '202611070001', sync_ready: true, stage: 'reports', organization_catalog_version: '202611150014', location_catalog_version: '202611150019' } });
    if (path === '/rest/v1/rpc/berry_organization_catalog') return route.fulfill({ json: catalogFromNodes(INITIAL_ORGANIZATION_NODES) });
    if (path === '/rest/v1/rpc/berry_admin_organization') return route.fulfill({ json: INITIAL_ORGANIZATION_NODES });
    if (path === '/rest/v1/rpc/berry_location_catalog') return route.fulfill({ json: { installationsReady: state.ready, nodes: state.nodes.filter(node => locationNodeActive(node, state.nodes)) } });
    if (path === '/rest/v1/rpc/berry_admin_locations') return route.fulfill({ json: state.nodes });
    if (path === '/rest/v1/rpc/berry_manage_location') {
      const body = req.postDataJSON(); state.writes.push(body);
      if (state.fail) return route.fulfill({ status: 503, json: { message: 'offline' } });
      const old = state.nodes.find(node => node.id === body.p_id);
      if (old && body.p_expected !== old.revision) return route.fulfill({ status: 409, json: { code: '40001' } });
      const node: LocationNode = { id: body.p_id, kind: body.p_kind, parent_id: body.p_parent_id, name: body.p_name, enabled: body.p_enabled, revision: old ? old.revision + 1 : 1 };
      state.nodes = [...state.nodes.filter(value => value.id !== node.id), node]; return route.fulfill({ json: node });
    }
    if (path === '/rest/v1/rpc/berry_cloud_session') return route.fulfill({ json: admin });
    if (path === '/rest/v1/rpc/berry_cloud_tombstones' || path === '/rest/v1/berry_inspections') return route.fulfill({ json: [] });
    if (path === '/rest/v1/rpc/berry_next_registration') return route.fulfill({ json: { code: 'IH-2026-001', year: 2026, sequence: 1 } });
    throw new Error(`Unexpected request: ${req.method()} ${path}`);
  });
}
async function login(page: Page, section = 'areas') {
  await page.goto(`./?acceso=cuenta&seccion=${section}`);
  await page.getByRole('textbox', { name: 'Correo electrónico', exact: true }).fill('admin@example.invalid');
  await page.getByLabel(/^Contraseña/).fill('Fictitious!47'); await page.getByRole('button', { name: 'Iniciar sesión', exact: true }).click();
}

for (const width of [1366, 768, 390]) test(`instalación queda bloqueada y la ubicación se muestra únicamente en una etiqueta que coincide con el Excel (${width}px)`, async ({ page }) => {
  await page.setViewportSize({ width, height: 850 }); await page.goto('./');
  await selectValue(page.getByRole('combobox', { name: 'Sede', exact: true }), site.id);
  await selectValue(page.getByRole('combobox', { name: 'Zona de inspección', exact: true }), zone.id);
  await selectValue(page.getByRole('combobox', { name: 'Gerencia', exact: true }), 'GERENCIA DE RECURSOS HUMANOS');
  await selectValue(page.getByRole('combobox', { name: 'Área', exact: true }), 'SEGURIDAD INDUSTRIAL Y GESTION MEDIO AMBIENTAL');
  await expect(page.getByRole('combobox', { name: 'Instalación', exact: true })).toBeDisabled();
  await expect(page.getByText('Lista de instalaciones pendiente. Esta opción permanecerá bloqueada hasta que se cargue la lista.', { exact: true })).toBeVisible();
  const summary = page.getByRole('region', { name: 'Área e instalación inspeccionada', exact: true });
  await expect(summary.locator('input,textarea')).toHaveCount(0); await expect(summary.locator('.inspection-area-prefix')).toHaveText('Fundo – Armonía I – SIGMA');
  const encoded = await page.evaluate(async () => {
    const { buildExcel } = await import('/src/export.ts'); const { newInspection } = await import('/src/model.ts'); const { INITIAL_LOCATION_NODES } = await import('/src/location-catalog.ts');
    const site = INITIAL_LOCATION_NODES.find(node => node.name === 'Fundo')!, zone = INITIAL_LOCATION_NODES.find(node => node.parent_id === site.id && node.name === 'Armonía I')!;
    const draft = { ...newInspection({ name: 'Inspectora', email: 'inspectora@example.invalid' }), type: 'Planeada' as const, inspectionTime: '09:30', inspectionPeriod: 'AM' as const, objective: 'Verificar condiciones.', area: 'Fundo – Armonía I – SIGMA', areaLocation: { source: 'catalog' as const, siteId: site.id, zoneId: zone.id, site: site.name, zone: zone.name, detail: '', installationPending: true, management: 'GERENCIA DE RECURSOS HUMANOS', department: 'SEGURIDAD INDUSTRIAL Y GESTION MEDIO AMBIENTAL', departmentDisplay: 'SIGMA' }, responsibles: [{ id: '1', personId: '1', name: 'Jefa', email: 'jefa@example.invalid' }, { id: '2', personId: '2', name: 'Responsable', email: 'persona@example.invalid' }] };
    const file = await buildExcel(draft); let binary = ''; for (let i = 0; i < file.bytes.length; i += 32768) binary += String.fromCharCode(...file.bytes.subarray(i, i + 32768)); return btoa(binary);
  });
  const book = new ExcelJS.Workbook(); await book.xlsx.load(Buffer.from(encoded, 'base64') as any); expect(book.getWorksheet('V.01')!.getCell('A11').text).toBe('Fundo – Armonía I – SIGMA');
  await summary.screenshot({ path: test.info().outputPath(`ubicacion-etiqueta-${width}.png`) }); expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

for (const width of [1366, 390]) test(`dos apartados administran áreas y lugares; sedes y zonas se editan, las instalaciones siguen pendientes (${width}px)`, async ({ page, context }) => {
  await page.setViewportSize({ width, height: 900 }); const state = stateOf(); await mock(context, state); await login(page);
  await expect(page.getByRole('heading', { name: 'Gestión De Áreas E Instalaciones', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Instalaciones', exact: true }).click(); await page.getByRole('button', { name: 'Fundo', exact: true }).click(); await page.getByRole('button', { name: 'Armonía I', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Añadir instalación', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Editar zona Armonía I', exact: true }).click();
  const dialog = page.getByRole('dialog'); await expect(page.getByRole('button', { name: 'Áreas', exact: true })).toBeDisabled();
  await dialog.getByLabel('Nombre de la zona').fill('Zona Corregida'); state.fail = true; await dialog.getByRole('button', { name: 'Guardar', exact: true }).click(); await expect(dialog.getByRole('alert')).toContainText('No pudimos confirmar');
  state.fail = false; await dialog.getByRole('button', { name: 'Guardar', exact: true }).click(); await expect(dialog).toHaveCount(0); expect(state.writes[0].p_id).toBe(state.writes[1].p_id);
  await page.getByRole('button', { name: 'Retirar zona Zona Corregida', exact: true }).click(); await page.getByRole('dialog').getByRole('button', { name: 'Retirar', exact: true }).click();
  await page.getByRole('checkbox', { name: 'Mostrar elementos retirados', exact: true }).check(); await page.getByRole('button', { name: 'Restaurar zona Zona Corregida', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Zona Corregida', exact: true })).toBeVisible(); await page.locator('.organization-columns').screenshot({ path: test.info().outputPath(`catalogo-instalaciones-${width}.png`) });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('una lista cargada habilita instalación por zona y cambiar sede o zona elimina una selección anterior', async ({ page, context }) => {
  const state = stateOf(true); state.nodes.push({ id: installation, kind: 'installation', parent_id: zone.id, name: 'Taller de Prueba', enabled: true, revision: 1 }); await mock(context, state); await login(page, '');
  await expect(page.getByRole('heading', { name: 'Mis inspecciones', exact: true })).toBeVisible();
  await page.locator('.sidebar-nav').getByRole('button', { name: 'Nueva inspección', exact: true }).click();
  await selectValue(page.getByRole('combobox', { name: 'Sede', exact: true }), site.id); await selectValue(page.getByRole('combobox', { name: 'Zona de inspección', exact: true }), zone.id);
  await selectValue(page.getByRole('combobox', { name: 'Instalación', exact: true }), installation);
  await expect(page.locator('.inspection-location-summary')).toContainText('Fundo – Armonía I – Taller de Prueba');
  const otherZone = INITIAL_LOCATION_NODES.find(node => node.parent_id === site.id && node.id !== zone.id)!; await selectValue(page.getByRole('combobox', { name: 'Zona de inspección', exact: true }), otherZone.id);
  await expect(page.getByRole('combobox', { name: 'Instalación', exact: true })).toHaveAttribute('data-value', ''); await expect(page.locator('.inspection-location-summary')).not.toContainText('Taller de Prueba');
});

for (const width of [1366, 768, 390]) test(`ordenar sedes, zonas e instalaciones persiste y se aplica a la nueva inspección (${width}px)`, async ({ page, context }) => {
  await page.setViewportSize({ width, height: 900 }); const state = stateOf(true);
  state.nodes = withCatalogOrder([...state.nodes,
    { id: installation, kind: 'installation', parent_id: zone.id, name: 'Taller de Prueba', enabled: true, revision: 1 },
    { id: 'another-installation', kind: 'installation', parent_id: zone.id, name: 'Almacén de Prueba', enabled: true, revision: 1 },
  ]);
  await mock(context, state); const order = await mockCatalogOrder(context, state); await login(page);
  await page.getByRole('button', { name: 'Instalaciones', exact: true }).click(); await page.getByRole('button', { name: 'Ordenar listas', exact: true }).click();
  order.fail = true; await page.getByRole('button', { name: 'Mover al principio: Fundo', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('No pudimos confirmar');
  order.fail = false; await page.getByRole('button', { name: 'Mover al principio: Fundo', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Sedes', exact: true }).locator('.organization-node-name').first()).toHaveText('Fundo');
  await page.getByRole('button', { name: 'Fundo', exact: true }).click();
  await page.getByRole('button', { name: 'Mover al principio: Tumi', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Zonas', exact: true }).locator('.organization-node-name').first()).toHaveText('Tumi');
  await page.getByRole('button', { name: 'Bajar: Tumi', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Zonas', exact: true }).locator('.organization-node-name').nth(1)).toHaveText('Tumi');
  await page.getByRole('button', { name: 'Mover al principio: Tumi', exact: true }).click();
  await page.getByRole('button', { name: 'Armonía I', exact: true }).click();
  await page.getByRole('button', { name: 'Mover al principio: Taller de Prueba', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Instalaciones', exact: true }).locator('.organization-node-name').first()).toHaveText('Taller de Prueba');
  await page.locator('.organization-columns').screenshot({ path: test.info().outputPath(`orden-instalaciones-${width}.png`) });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole('button', { name: 'Terminar de ordenar', exact: true }).click(); await page.reload();
  await page.getByRole('button', { name: 'Instalaciones', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Sedes', exact: true }).locator('.organization-node-name').first()).toHaveText('Fundo');
  await page.goto('./?acceso=cuenta');
  await expect(page.getByRole('heading', { name: 'Mis inspecciones', exact: true })).toBeVisible();
  const nav = page.locator('.sidebar-nav');
  const menu = page.getByRole('button', { name: 'Abrir menú', exact: true });
  if (await menu.isVisible() && await menu.getAttribute('aria-expanded') !== 'true') await menu.click();
  await nav.getByRole('button', { name: 'Nueva inspección', exact: true }).click();
  await page.getByRole('combobox', { name: 'Sede', exact: true }).click();
  await page.getByRole('listbox').locator('[role="option"][data-value]:not([data-value=""])').first().click();
  await expect(page.getByRole('combobox', { name: 'Sede', exact: true })).toHaveText('Fundo');
  await page.getByRole('combobox', { name: 'Zona de inspección', exact: true }).click();
  await expect(page.getByRole('listbox').locator('[role="option"]:not([data-value=""])').first()).toHaveText('Tumi');
  await page.getByRole('listbox').getByRole('option', { name: 'Armonía I', exact: true }).click();
  await page.getByRole('combobox', { name: 'Instalación', exact: true }).click();
  await expect(page.getByRole('listbox').locator('[role="option"]:not([data-value=""])').first()).toHaveText('Taller de Prueba');
});
