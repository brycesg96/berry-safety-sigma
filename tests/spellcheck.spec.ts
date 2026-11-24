import { openWorkspaceProfile } from './workspace-profile-fixture';
import { test, expect } from './test-fixture';

test('corrector nativo en español solo para los cinco campos de redacción de la inspección', async ({ page }) => {
  await page.route('**/api/people?*', route => route.fulfill({ json: { people: [] } }));
  await page.route('**/api/inspections/send', route => route.fulfill({ json: { ok: true, defaults: null } }));
  await page.goto('./');
  await expect(page.getByRole('button', { name: 'Continuar', exact: true })).toBeEnabled();
  await page.evaluate(async () => {
    const { newInspection, newObservation, persistInspection } = await import('/src/model.ts');
    await persistInspection({ ...newInspection({ name: 'Autora', email: 'bryx.96@gmail.com', accountId: 'demo-admin' }),
      area: 'Taller', type: 'Planeada', inspectionTime: '08:30', inspectionPeriod: 'AM', objective: 'Revisar las condiciones.',
      responsibles: [{ id: 'responsible', personId: 'demo-inspector', name: 'Destinataria', email: 'bcespedes@hortifrut.com' }, { id: 'second-recipient', personId: 'demo-admin', name: 'Jefa de prueba', email: 'bryx.96@gmail.com' }],
      observations: [{ ...newObservation(), description: 'Falta una protección.', correctiveAction: 'Instalar la protección.', dueDate: '2026-11-10' }],
      unfavorableCause: 'Falta de mantenimiento.', closingRemarks: 'Mantener las revisiones periódicas.' });
  });
  await page.reload();
  const check = async (label: string, enabled: boolean) => {
    const field = page.getByRole('textbox', { name: label, exact: true });
    await expect(field).toBeVisible();
    expect(await field.evaluate(element => (element as HTMLElement).spellcheck)).toBe(enabled);
    if (enabled) await expect(field).toHaveAttribute('lang', 'es-PE');
  };
  await expect(page.getByRole('button', { name: 'Continuar', exact: true })).toBeEnabled();
  await check('Objetivo de la inspección interna', true);
  await expect(page.getByRole('textbox', { name: 'Área e instalación inspeccionada', exact: true })).toHaveCount(0);
  await expect(page.getByRole('region', { name: 'Área e instalación inspeccionada', exact: true })).toContainText('Taller');
  await page.getByRole('button', { name: '02 Observaciones', exact: true }).click();
  await check('Descripción', true); await check('Acción a tomar', true);
  await page.getByRole('button', { name: '04 Cierre', exact: true }).click();
  await check('Descripción de la causa ante resultados desfavorables de la inspección', true);
  await check('Conclusiones y recomendaciones', true); await expect(page.locator('.registration-person-meta').getByRole('textbox')).toHaveCount(0);
  await openWorkspaceProfile(page);
  await check('Nombres y apellidos', false);
});
