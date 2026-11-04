import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import ExcelJS from 'exceljs';
test.beforeEach(async ({ page }) => { await page.route('**/api/people?*', route => route.fulfill({ json: { people: [] } })); });
const png = { name: 'levantamiento.png', mimeType: 'image/png', buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64') };
async function switchTo(page: Page, id: string) {
  await page.getByRole('button', { name: 'Mi perfil', exact: true }).click();
  await page.getByLabel('Cuenta de prueba').selectOption(id);
  await expect(page.getByLabel('Correo de tu cuenta')).toHaveValue(id === 'demo-admin' ? 'bryx.96@gmail.com' : 'bcespedes@hortifrut.com');
  await page.getByRole('button', { name: 'Cerrar ventana', exact: true }).click();
}
async function createReport(page: Page) {
  await page.goto('./');
  await page.getByLabel('Área inspeccionada').fill('Taller - Armonía 2');
  await page.getByLabel('Hora de inspección').fill('07:30'); await page.getByLabel('AM o PM').selectOption('AM');
  await page.getByRole('radio', { name: 'Planeada', exact: true }).check();
  await page.getByLabel('Objetivo de la inspección').fill('Verificar las condiciones de seguridad.');
  await page.getByRole('combobox', { name: /Nombre completo/ }).fill('Bryan');
  await page.getByRole('listbox').getByRole('option', { name: /bcespedes@hortifrut.com/ }).click();
  await page.getByRole('button', { name: 'Continuar', exact: true }).click();
  for (let i = 0; i < 2; i++) {
    await page.getByRole('button', { name: 'Añadir observación', exact: true }).click();
    const card = page.locator('.observation-card').nth(i);
    await card.getByLabel('Descripción de la observación').fill(`Hallazgo ${i + 1}`);
    await card.getByLabel('Medida correctiva').fill(`Corregir hallazgo ${i + 1}`);
    await card.getByLabel('Fecha de Cierre').fill('2026-11-15');
  }
  await page.getByRole('button', { name: 'Continuar', exact: true }).click();
  await page.getByRole('button', { name: 'Continuar', exact: true }).click();
  await page.getByLabel('Conclusiones').fill('Dos condiciones por corregir.');
  await page.getByLabel('Recomendaciones').fill('Verificar el levantamiento.');
  await page.getByRole('button', { name: 'Continuar', exact: true }).click();
  await page.getByRole('button', { name: 'Enviar inspección', exact: true }).click();
  await expect(page.getByText('No se ha enviado ningún correo.')).toBeVisible();
  await page.getByRole('button', { name: 'Enviar a destinatarios de prueba' }).click();
  await expect(page.getByRole('heading', { name: 'Taller - Armonía 2', exact: true })).toBeVisible();
}
async function openReceived(page: Page) {
  await page.getByRole('button', { name: 'Inspecciones recibidas', exact: true }).click();
  await page.getByRole('button', { name: 'Revisar inspección', exact: true }).click();
}
async function openReview(page: Page) {
  await page.getByRole('button', { name: 'Mis inspecciones', exact: true }).click();
  await page.getByLabel('Filtrar por estado').selectOption('review');
  await page.getByRole('button', { name: 'Revisar informe', exact: true }).click();
}
test('destinatario envía evidencias, autor pide ajustes y cierra solo al aprobar todos los hallazgos', async ({ page }) => {
  test.setTimeout(90000);
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto('./');
  await page.getByRole('button', { name: 'Inspecciones recibidas', exact: true }).click();
  await expect(page.getByText('No tienes inspecciones recibidas')).toBeVisible();
  await createReport(page);
  await switchTo(page, 'demo-inspector'); await openReceived(page);
  const cards = page.locator('.followup-card');
  await cards.nth(0).getByLabel('Acción realizada').fill('Se corrigió el primer hallazgo.');
  await cards.nth(0).getByRole('button', { name: 'Enviar a revisión' }).click();
  await expect(cards.nth(0).getByRole('alert')).toContainText('Adjunta al menos una evidencia');
  for (let i = 0; i < 2; i++) {
    await cards.nth(i).getByLabel('Acción realizada').fill(`Corrección ${i + 1} realizada`);
    await cards.nth(i).getByLabel('Añadir evidencias del levantamiento').setInputFiles(png);
    await expect(cards.nth(i).locator('.followup-evidence img')).toHaveCount(1);
    await cards.nth(i).getByRole('button', { name: 'Enviar a revisión' }).click();
    await expect(cards.nth(i).getByText('Levantamiento enviado. Pendiente de revisión del autor.')).toBeVisible();
    await expect(cards.nth(i).locator('.observation-heading .list-status')).toHaveText('Pendiente');
  }
  await page.reload(); await openReceived(page);
  await expect(cards.nth(0).getByLabel('Acción realizada')).toHaveValue('Corrección 1 realizada');
  await switchTo(page, 'demo-admin'); await openReview(page);
  await cards.nth(0).getByRole('button', { name: 'Aprobar levantamiento' }).click();
  await expect(cards.nth(0).locator('.observation-heading .list-status')).toHaveText('Ejecutado');
  await expect(page.getByText('Inspección cerrada: todos los estados están en Ejecutado.')).toHaveCount(0);
  await cards.nth(1).getByLabel('Comentario de revisión').fill('Añadir evidencia del área completa.');
  await cards.nth(1).getByRole('button', { name: 'Solicitar ajustes' }).click();
  await expect(cards.nth(1).getByText('Añadir evidencia del área completa.')).toBeVisible();
  await switchTo(page, 'demo-inspector'); await openReceived(page);
  await expect(cards.nth(0).getByLabel('Acción realizada')).toHaveAttribute('readonly', '');
  await cards.nth(1).getByLabel('Acción realizada').fill('Corrección completada y verificada.');
  await cards.nth(1).getByRole('button', { name: 'Enviar a revisión' }).click();
  await expect(cards.nth(1).getByText('Levantamiento enviado. Pendiente de revisión del autor.')).toBeVisible();
  await switchTo(page, 'demo-admin'); await openReview(page);
  await cards.nth(1).getByRole('button', { name: 'Aprobar levantamiento' }).click();
  await expect(page.getByText('Inspección cerrada: todos los estados están en Ejecutado.')).toBeVisible();
  await cards.first().screenshot({ path: 'test-results/followup-desktop.png' });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await expect.poll(async () => (await page.locator('.sidebar').boundingBox())!.x + (await page.locator('.sidebar').boundingBox())!.width).toBeLessThanOrEqual(1);
  await cards.first().screenshot({ path: 'test-results/followup-mobile.png' });
  await page.setViewportSize({ width: 1280, height: 900 });
  const downloadEvent = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Descargar Excel', exact: true }).click();
  const workbook = new ExcelJS.Workbook(); await workbook.xlsx.readFile((await (await downloadEvent).path())!);
  const content = JSON.stringify(workbook.getWorksheet('Inspección SST')!.getSheetValues());
  expect(content).toContain('LEVANTAMIENTO DE RESULTADOS DE LA INSPECCIÓN'); expect(content).toContain('Ejecutado');
  expect(workbook.getWorksheet('Inspección SST')!.getImages()).toHaveLength(2);
  await page.getByRole('button', { name: 'Mis inspecciones', exact: true }).click();
  await expect(page.locator('.list-stats > div').filter({ hasText: 'Inspecciones cerradas' }).locator('strong')).toHaveText('1');
  await expect(page.locator('.list-stats > div').filter({ hasText: 'Inspecciones a revisar' }).locator('strong')).toHaveText('0');
  await page.getByLabel('Filtrar por estado').selectOption('closed');
  await expect(page.locator('.inspection-list-row')).toHaveCount(1);
  await expect(page.locator('.list-status')).toHaveText('Cerrada');
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: 'test-results/followup-list-mobile.png', fullPage: true });
  expect(errors).toEqual([]);
});

test('permisos, versiones concurrentes y protección del informe enviado', async ({ page }) => {
  await createReport(page);
  const result = await page.evaluate(async () => {
    const { loadInspections, persistInspection, removeInspection } = await import('/src/model.ts');
    const { readAccounts } = await import('/src/accounts.ts');
    const { blankCorrection, saveCorrection, reviewCorrection, inspectionClosed } = await import('/src/follow-up.ts');
    const report = (await loadInspections()).find((d: any) => d.delivery)!;
    const actor = readAccounts().find((a: any) => a.id === 'demo-inspector')!;
    const correction = blankCorrection(report, report.observations[0].id, actor);
    const reject = async (fn: () => Promise<unknown>) => { try { await fn(); return false; } catch { return true; } };
    const outsiderBlocked = await reject(() => saveCorrection(report, report.observations[0].id, 'outsider', correction, false));
    const updated = await saveCorrection(report, report.observations[0].id, actor.id, correction, false);
    const staleBlocked = await reject(() => saveCorrection(report, report.observations[0].id, actor.id, correction, false));
    const selfReviewBlocked = await reject(() => reviewCorrection(updated, report.observations[0].id, actor.id, true, ''));
    const overwriteBlocked = await reject(() => persistInspection({ ...report, delivery: undefined }));
    const deletionBlocked = await reject(() => removeInspection(report.id));
    return { outsiderBlocked, staleBlocked, selfReviewBlocked, overwriteBlocked, deletionBlocked, closed: inspectionClosed(updated) };
  });
  expect(result).toEqual({ outsiderBlocked: true, staleBlocked: true, selfReviewBlocked: true, overwriteBlocked: true, deletionBlocked: true, closed: false });
});
