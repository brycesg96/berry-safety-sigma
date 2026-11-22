import { test, expect } from './test-fixture';

for (const width of [1366, 390]) test(`buscador de recibidas combina estado, registro, área e inspector sin modificar informes (${width}px)`, async ({ page }) => {
  await page.setViewportSize({ width, height: 900 }); await page.route('**/api/people?*', route => route.fulfill({ json: { people: [] } })); await page.goto('./');
  const before = await page.evaluate(async () => {
    const { newInspection, newObservation, persistInspection, loadInspections } = await import('/src/model.ts');
    const reports = [
      { area: 'Taller de maquinaria', facility: 'Fundo Norte', inspector: 'José Pérez', code: 'IH-2026-051', closed: false, assigned: true },
      { area: 'Almacén de Producción', facility: 'Fundo Sur', inspector: 'Ana Torres', code: 'IH-2026-052', closed: false, assigned: true },
      { area: 'Taller cerrado', facility: 'Fundo Norte', inspector: 'José Pérez', code: 'IH-2026-053', closed: true, assigned: true },
      { area: 'Taller ajeno', facility: 'Fundo Norte', inspector: 'José Pérez', code: 'IH-2026-054', closed: false, assigned: false },
    ];
    for (const report of reports) {
      const draft = newInspection({ name: report.inspector, email: 'autor@example.invalid', accountId: 'demo-inspector' }), observation = newObservation('2026-12-01');
      await persistInspection({ ...draft, area: report.area, facility: report.facility, inspector: report.inspector, observations: [observation], serverRegistration: { inspectionId: draft.id, code: report.code, acceptedAt: '2026-11-15T15:00:00Z' }, delivery: { sentAt: '2026-11-15T15:00:00Z', recipientIds: report.assigned ? ['demo-admin'] : ['other-account'], revision: 1, corrections: report.closed ? { [observation.id]: { actorId: 'demo-admin', responsibleName: 'Responsable', action: 'Corregido.', date: '2026-11-15', photos: [], state: 'Ejecutado', proposedState: 'Ejecutado', decision: 'approved', note: '' } } : {} } });
    }
    return JSON.stringify(await loadInspections());
  });
  await page.reload(); const menu = page.getByRole('button', { name: 'Abrir menú', exact: true }); if (await menu.isVisible()) await menu.click();
  await page.locator('.sidebar-nav').getByRole('button', { name: 'Buzón de Inspecciones', exact: true }).click();
  const search = page.getByRole('textbox', { name: 'Buscar en Buzón de Inspecciones', exact: true }), rows = page.locator('.inspection-list-row');
  await expect(rows).toHaveCount(2); await expect(rows.filter({ hasText: 'Taller ajeno' })).toHaveCount(0);
  for (const [query, title] of [['052', 'Almacén de Producción'], ['PRODUCCION', 'Almacén de Producción'], ['JOSE', 'Taller de maquinaria'], ['norte', 'Taller de maquinaria']] as const) {
    await search.fill(query); await expect(rows).toHaveCount(1); await expect(rows).toContainText(title);
  }
  await page.getByRole('button', { name: 'Cerradas', exact: true }).click(); await expect(search).toHaveValue('norte'); await expect(rows).toHaveCount(1); await expect(rows).toContainText('Taller cerrado');
  await search.fill('051'); await expect(rows).toHaveCount(0); await expect(page.getByRole('heading', { name: 'No encontramos inspecciones', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Pendientes', exact: true }).click(); await expect(rows).toHaveCount(1); await expect(rows).toContainText('Taller de maquinaria');
  await search.fill('no coincide'); await expect(rows).toHaveCount(0); await page.getByRole('button', { name: 'Limpiar búsqueda', exact: true }).click(); await expect(rows).toHaveCount(2);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.locator('.received-search-toolbar').screenshot({ path: test.info().outputPath(`buscador-recibidas-${width}.png`) });
  expect(await page.evaluate(async () => { const { loadInspections } = await import('/src/model.ts'); return JSON.stringify(await loadInspections()); })).toBe(before);
});
