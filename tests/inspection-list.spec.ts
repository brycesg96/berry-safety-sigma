import { expectAccessible } from './accessibility-fixture';
import { inspectionFilterButton, selectInspectionFilter } from './list-filter-fixture';
import { selectValue } from './select-fixture';
import { expect, test } from './test-fixture';
import type { Page } from '@playwright/test';

async function storedSnapshot(page: Page) {
  return page.evaluate(async () => {
    const { database } = await import('/src/model.ts');
    const db = await database();
    try {
      return await new Promise<string>((resolve, reject) => {
        const request = db.transaction('inspections', 'readonly').objectStore('inspections').getAll();
        request.onsuccess = () => resolve(JSON.stringify(request.result));
        request.onerror = () => reject(request.error);
      });
    } finally { db.close(); }
  });
}

test('lista responsables y sus áreas, y busca instalación, área y responsable en escritorio y móvil', async ({ page }) => {
  await page.route('**/api/people?*', route => route.fulfill({ json: { people: [] } }));
  await page.route('**/api/inspections/send', route => route.fulfill({ json: { ok: true, defaults: null } }));
  await page.goto('./');
  await expect(page.getByRole('button', { name: 'Continuar', exact: true })).toBeEnabled();
  await page.evaluate(async () => {
    const { newInspection, newObservation, persistInspection } = await import('/src/model.ts');
    const { updateOwnProfile } = await import('/src/accounts.ts');
    updateOwnProfile('demo-inspector', 'María Salazar', 'Mantenimiento');
    const reports = [
      { area: 'Taller de bombas', facility: 'Planta Norte', count: 2, responsibles: [
        { id: 'maria', personId: 'demo-inspector', name: 'María Salazar', email: 'bcespedes@hortifrut.com', area: 'Operaciones' },
        { id: 'ana', name: 'Ana Castillo', email: 'ana@example.com', area: 'Prevención de Riesgos' },
      ] },
      { area: 'Almacén central', facility: 'Planta Sur', count: 1, responsibles: [
        { id: 'carlos', name: 'Carlos Torres', email: 'carlos@example.com', area: 'Logística' },
      ] },
      { area: 'Patio de maniobras', facility: 'Fundo Este', count: 1, responsibles: [
        { id: 'legacy-maria', name: 'María Salazar', email: 'bcespedes@hortifrut.com' },
      ] },
    ];
    for (const report of reports) {
      await persistInspection({
        ...newInspection({ name: 'Autora', email: 'bryx.96@gmail.com', accountId: 'demo-admin' }),
        ...report, date: '2026-11-07', inspectionTime: '09:15', inspectionPeriod: 'PM',
        observations: Array.from({ length: report.count }, () => newObservation()),
      });
    }
  });
  await page.reload();
  await page.getByRole('button', { name: 'Mis inspecciones', exact: true }).click();
  const rows = page.locator('.inspection-list-row');
  await expect(rows).toHaveCount(3);
  expect(await page.evaluate(async () => {
    const { loadInspections } = await import('/src/model.ts');
    return (await loadInspections()).map(item => item.inspector);
  })).toEqual(['Autora', 'Autora', 'Autora']);
  const workshop = rows.filter({ hasText: 'Taller de bombas' });
  await expect(workshop.locator('.list-responsibles')).toHaveText('María Salazar, Ana Castillo');
  await expect(workshop.locator('.list-responsible-areas')).toHaveText('Operaciones / Prevención de Riesgos');
  await expect(workshop.locator('small')).toHaveText(/07 nov\.? 2026 · 09:15 PM — 2 observaciones/);
  await expect(rows.filter({ hasText: 'Almacén central' }).locator('small')).toContainText('1 observación');
  await expect(rows.filter({ hasText: 'Patio de maniobras' }).locator('.list-responsible-areas')).toHaveText('Mantenimiento');

  const search = page.getByRole('textbox', { name: 'Buscar inspecciones', exact: true });
  await expect(search).toHaveAttribute('placeholder', 'Buscar por instalación, por área, responsable');
  for (const [query, areas] of [
    ['PLANTA NORTE', ['Taller de bombas']],
    ['almacen', ['Almacén central']],
    ['maria salazar', ['Taller de bombas', 'Patio de maniobras']],
    ['prevencion', ['Taller de bombas']],
    ['mantenimiento', ['Patio de maniobras']],
    ['carlos', ['Almacén central']],
    ['bcespedes@hortifrut.com', ['Taller de bombas', 'Patio de maniobras']],
    ['no coincide', []],
  ] as const) {
    await search.fill(query);
    await expect(rows).toHaveCount(areas.length);
    for (const area of areas) await expect(rows.filter({ hasText: area })).toBeVisible();
  }
  await search.fill('Planta Norte');
  await selectInspectionFilter(page, 'review');
  await expect(rows).toHaveCount(0);
  await selectInspectionFilter(page, 'draft');
  await expect(rows).toHaveCount(1);
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(workshop.locator('.list-responsibles')).toBeVisible();
  await search.fill('carlos');
  await expect(rows).toHaveCount(1);
  await expect(rows).toContainText('Almacén central');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('rangos de fechas respetan Lima, lunes a domingo, cambios de año y año bisiesto', async () => {
  const { inspectionDateRange, inspectionListToday, matchesInspectionDate } = await import('../src/inspection-list-filters');
  expect(inspectionListToday(new Date('2026-11-16T04:59:59Z'))).toBe('2026-11-15');
  expect(inspectionListToday(new Date('2026-11-16T05:00:00Z'))).toBe('2026-11-16');
  expect(inspectionDateRange('week', '2026-11-15')).toEqual({ from: '2026-11-09', to: '2026-11-15' });
  expect(inspectionDateRange('week', '2026-12-31')).toEqual({ from: '2026-12-28', to: '2027-01-03' });
  expect(inspectionDateRange('month', '2028-02-12')).toEqual({ from: '2028-02-01', to: '2028-02-29' });
  expect(inspectionDateRange('last30', '2026-11-15')).toEqual({ from: '2026-10-17', to: '2026-11-15' });
  expect(matchesInspectionDate('2026-11-01', { from: '2026-11-01', to: '2026-11-14' })).toBe(true);
  expect(matchesInspectionDate('2026-11-14', { from: '2026-11-01', to: '2026-11-14' })).toBe(true);
  expect(matchesInspectionDate('2026-11-15', { from: '', to: '2026-11-14' })).toBe(false);
  expect(matchesInspectionDate('', { from: '', to: '2026-11-14' })).toBe(false);
});

for (const width of [1366, 390]) test(`tarjetas seleccionables combinan estados, fechas y búsqueda sin modificar registros (${width}px)`, async ({ page }) => {
  await page.setViewportSize({ width, height: 1000 }); await page.clock.install({ time: new Date('2026-11-15T15:00:00Z') });
  await page.route('**/api/people?*', route => route.fulfill({ json: { people: [] } })); await page.goto('./');
  await page.evaluate(async () => {
    const { newInspection, newObservation, persistInspection } = await import('/src/model.ts');
    const reports = [
      { area: 'Borrador de hoy', date: '2026-11-15', state: 'draft' },
      { area: 'Corrección de bombas', date: '2026-11-14', state: 'pending' },
      { area: 'Validación de almacén', date: '2026-11-10', state: 'review' },
      { area: 'Cerrada de octubre', date: '2026-10-31', state: 'closed' },
      { area: 'Cerrada de noviembre', date: '2026-11-01', state: 'closed' },
      { area: 'Borrador de otra cuenta', date: '2026-11-15', state: 'draft', owner: 'demo-inspector' },
    ];
    for (const report of reports) {
      const draft = newInspection({ name: 'Inspectora de prueba', email: 'autora@example.invalid', accountId: report.owner || 'demo-admin' }), observation = { ...newObservation(), description: 'Hallazgo', correctiveAction: 'Corregir', dueDate: '2026-11-20' };
      await persistInspection({ ...draft, area: report.area, date: report.date, facility: 'Planta Sur', responsibles: [{ id: 'responsible', personId: 'demo-inspector', name: 'Responsable de prueba', email: 'responsable@example.invalid', area: 'Mantenimiento' }], observations: [observation], ...(report.state !== 'draft' ? { delivery: { sentAt: '2026-11-15T14:00:00Z', recipientIds: ['demo-inspector'], revision: 1, corrections: report.state === 'pending' ? {} : { [observation.id]: { actorId: 'demo-inspector', responsibleName: 'Responsable de prueba', action: 'Acción ejecutada', date: '2026-11-15', photos: [], state: report.state === 'closed' ? 'Ejecutado' : 'Pendiente', proposedState: 'Ejecutado', decision: report.state === 'closed' ? 'approved' : 'review', note: '' } } } } : {}) });
    }
  });
  const before = await storedSnapshot(page);
  await page.reload(); const menu = page.getByRole('button', { name: 'Abrir menú', exact: true }); if (await menu.isVisible()) await menu.click();
  await page.locator('.sidebar-nav').getByRole('button', { name: 'Mis inspecciones', exact: true }).click();
  const rows = page.locator('.inspection-list-row'), group = page.getByRole('group', { name: 'Filtrar inspecciones por estado', exact: true });
  await expect(page.getByRole('list', { name: 'Qué puedes hacer en tus inspecciones', exact: true }).getByRole('listitem')).toHaveCount(3);
  let activeTone = '';
  await expect(group.getByRole('button')).toHaveCount(5); await expect(rows).toHaveCount(5); await expect(inspectionFilterButton(page, 'all')).toHaveAttribute('aria-pressed', 'true');
  for (const [key, count] of [['draft', 1], ['pending', 1], ['review', 1], ['closed', 2]] as const) {
    await expect(inspectionFilterButton(page, key).locator('strong')).toHaveText(String(count)); await selectInspectionFilter(page, key); await expect(rows).toHaveCount(count); await expect(inspectionFilterButton(page, key)).toHaveAttribute('aria-pressed', 'true');
    if (key === 'pending') activeTone = await inspectionFilterButton(page, key).evaluate(element => getComputedStyle(element).backgroundColor);
    if (key === 'closed') {
      await expect(rows.locator('.list-status.status-ready')).toHaveCount(count);
      const closedTone = await inspectionFilterButton(page, key).evaluate(element => getComputedStyle(element).backgroundColor);
      expect(closedTone).not.toBe(activeTone);
      await expect(inspectionFilterButton(page, key).locator('.liquid-glass-surface')).toHaveCSS('background-color', closedTone);
      await expectAccessible(page);
      await page.screenshot({ path: test.info().outputPath(`mis-inspecciones-cerradas-${width}.png`), fullPage: true });
    }
  }
  await inspectionFilterButton(page, 'pending').focus(); await page.keyboard.press('Enter'); await expect(rows).toHaveCount(1); await expect(rows).toContainText('Corrección de bombas');
  await expect(page.getByLabel('Filtrar por estado')).toHaveCount(0); await expect(page.locator('.local-storage-note')).toHaveCount(0);
  const dates = page.getByRole('combobox', { name: 'Filtrar por fecha de inspección', exact: true }); await selectValue(dates, 'today'); await expect(rows).toHaveCount(0); await expect(inspectionFilterButton(page, 'pending').locator('strong')).toHaveText('0');
  await selectInspectionFilter(page, 'all'); await expect(rows).toHaveCount(1); await expect(rows).toContainText('Borrador de hoy');
  await selectValue(dates, 'week'); await expect(rows).toHaveCount(3); await selectValue(dates, 'month'); await expect(rows).toHaveCount(4); await selectValue(dates, 'last30'); await expect(rows).toHaveCount(5);
  await selectValue(dates, 'custom'); await page.getByLabel('Desde', { exact: true }).fill('2026-11-01'); await page.getByLabel('Hasta', { exact: true }).fill('2026-11-14'); await expect(rows).toHaveCount(3);
  await selectInspectionFilter(page, 'pending'); await page.getByRole('textbox', { name: 'Buscar inspecciones', exact: true }).fill('MANTENIMIENTO'); await expect(rows).toHaveCount(1); await expect(rows).toContainText('Corrección de bombas');
  await page.getByLabel('Desde', { exact: true }).fill('2026-11-15'); await expect(page.getByRole('alert')).toContainText('fecha inicial'); await expect(rows).toHaveCount(0);
  await page.getByRole('button', { name: 'Limpiar filtros', exact: true }).click(); await expect(rows).toHaveCount(5); await expect(dates).toHaveText('Todas las fechas'); await expect(inspectionFilterButton(page, 'all')).toHaveAttribute('aria-pressed', 'true');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await group.screenshot({ path: test.info().outputPath(`estados-${width}.png`) }); await page.locator('.inspection-list-toolbar').screenshot({ path: test.info().outputPath(`filtro-fechas-${width}.png`) });
  expect(await storedSnapshot(page)).toBe(before);
});
