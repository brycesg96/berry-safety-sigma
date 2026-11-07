import { expect, test } from '@playwright/test';

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
  await page.getByLabel('Filtrar por estado').selectOption('review');
  await expect(rows).toHaveCount(0);
  await page.getByLabel('Filtrar por estado').selectOption('draft');
  await expect(rows).toHaveCount(1);
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(workshop.locator('.list-responsibles')).toBeVisible();
  await search.fill('carlos');
  await expect(rows).toHaveCount(1);
  await expect(rows).toContainText('Almacén central');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
