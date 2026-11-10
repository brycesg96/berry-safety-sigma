import { selectValue } from './select-fixture';
import { selectLocation } from './location-fixture';
import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import ExcelJS from 'exceljs';
test.beforeEach(async ({ page }) => { await page.route('**/api/people?*', route => route.fulfill({ json: { people: [] } })); });
const png = { name: 'levantamiento.png', mimeType: 'image/png', buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64') };
async function switchTo(page: Page, id: string) {
  await page.getByRole('button', { name: 'Mi perfil', exact: true }).click();
  await selectValue(page.getByLabel('Cuenta de prueba'), id);
  await expect(page.getByLabel('Correo de tu cuenta')).toHaveValue(id === 'demo-admin' ? 'bryx.96@gmail.com' : 'bcespedes@hortifrut.com');
  await page.getByRole('button', { name: 'Cerrar ventana', exact: true }).click();
}
async function createReport(page: Page) {
  await page.goto('./');
  await page.getByLabel('Área inspeccionada').fill('Taller - Armonía 2');
  await selectLocation(page, 'Sede', 'Fundo'); await selectLocation(page, 'Zona de inspección', 'Armonía II');
  await page.getByLabel('Hora de inspección').fill('07:30'); await selectValue(page.getByLabel('AM o PM'), 'AM');
  await page.getByRole('radio', { name: 'Planeada', exact: true }).check();
  await page.getByRole('textbox', { name: 'Objetivo de la inspección interna', exact: true }).fill('Verificar las condiciones de seguridad.');
  await page.getByRole('combobox', { name: /Nombre completo/ }).fill('bcespedes@hortifrut.com');
  await page.getByRole('listbox').getByRole('option', { name: /bcespedes@hortifrut.com/ }).click();
  await page.getByRole('button', { name: 'Continuar', exact: true }).click();
  for (let i = 0; i < 2; i++) {
    await page.getByRole('button', { name: 'Añadir observación', exact: true }).click();
    const card = page.locator('.observation-card').nth(i);
    await card.getByLabel('Descripción').fill(`Hallazgo ${i + 1}`);
    await card.getByLabel('Acción a tomar').fill(`Corregir hallazgo ${i + 1}`);
    await card.getByLabel('Fecha de Cierre').fill('2026-11-15');
  }
  await page.getByRole('button', { name: 'Continuar', exact: true }).click();
  await page.getByRole('button', { name: 'Continuar', exact: true }).click();
  await page.getByRole('textbox', { name: 'CONCLUSIONES Y RECOMENDACIONES', exact: true }).fill('Dos condiciones por corregir.');
  await page.getByRole('textbox', { name: 'DESCRIPCIÓN DE LA CAUSA ANTE RESULTADOS DESFAVORABLES DE LA INSPECCIÓN', exact: true }).fill('Verificar el levantamiento.');
  await page.getByRole('button', { name: 'Continuar', exact: true }).click();
  await page.getByRole('button', { name: 'Guardar', exact: true }).first().click();await page.getByRole('button', { name: 'Enviar inspección', exact: true }).click();
  await page.getByText('Compartir solo en este navegador', { exact: true }).click();
  await expect(page.getByText('No se ha enviado ningún correo.')).toBeVisible();
  await page.getByRole('button', { name: 'Enviar a destinatarios de prueba' }).click();
  await expect(page.getByRole('heading', { name: 'Fundo – Armonía II – Taller - Armonía 2', exact: true })).toBeVisible();
}
async function openReceived(page: Page) {
  await page.getByRole('button', { name: 'Inspecciones recibidas', exact: true }).click();
  await page.getByRole('button', { name: 'Revisar inspección', exact: true }).click();
}
async function openReview(page: Page) {
  await page.getByRole('button', { name: 'Mis inspecciones', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Mis inspecciones', exact: true }).locator('.nav-count')).toHaveText('1');
  await selectValue(page.getByLabel('Filtrar por estado'), 'review');
  await page.getByRole('button', { name: 'Revisar informe', exact: true }).click();
}
test('destinatario envía evidencias, autor pide ajustes y cierra solo al aprobar todos los hallazgos', async ({ page }) => {
  test.setTimeout(90000);
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto('./');
  await page.getByRole('button', { name: 'Inspecciones recibidas', exact: true }).click();
  await expect(page.getByText('No tienes inspecciones recibidas')).toBeVisible();
  await createReport(page);
  const breadcrumb = page.getByRole('navigation', { name: 'Ruta de navegación' });
  await expect(breadcrumb.locator('li')).toHaveText(['Espacio de trabajo', 'Mis inspecciones', 'En levantamiento']);
  await expect(page.getByRole('button', { name: 'Mis inspecciones', exact: true })).toHaveClass(/active/);
  await expect(page.getByRole('button', { name: 'Descargar PDF', exact: true })).toHaveCount(0);
  await switchTo(page, 'demo-inspector');
  await expect(page.getByRole('button', { name: 'Inspecciones recibidas', exact: true }).locator('.nav-count')).toHaveText('1');
  await openReceived(page);
  await expect(breadcrumb.locator('li')).toHaveText(['Espacio de trabajo', 'Inspecciones recibidas', 'Pendientes']);
  const cards = page.locator('.followup-card');
  await expect(cards.nth(0).getByLabel('Estado', { exact: true })).toHaveAttribute('data-value', 'Pendiente');
  await selectValue(cards.nth(0).getByLabel('Estado', { exact: true }), 'Ejecutado');
  await cards.nth(0).getByLabel('Acción realizada').fill('Se corrigió el primer hallazgo.');
  await cards.nth(0).getByRole('button', { name: 'Guardar avance' }).click();await cards.nth(0).getByRole('button', { name: 'Enviar a revisión' }).click();
  await expect(cards.nth(0).getByRole('alert')).toContainText('Adjunta al menos una evidencia');
  for (let i = 0; i < 2; i++) {
    const state = 'Ejecutado';
    await selectValue(cards.nth(i).getByLabel('Estado', { exact: true }), state);
    await cards.nth(i).getByLabel('Acción realizada').fill(`Corrección ${i + 1} realizada`);
    await cards.nth(i).getByLabel('Añadir evidencias del levantamiento').setInputFiles(png);
    await expect(cards.nth(i).locator('.followup-evidence img')).toHaveCount(1);
    await cards.nth(i).getByRole('button', { name: 'Guardar avance' }).click();await cards.nth(i).getByRole('button', { name: 'Enviar a revisión' }).click();
    await expect(cards.nth(i).getByText('Levantamiento enviado. Pendiente de revisión del autor.')).toBeVisible();
    await expect(cards.nth(i).locator('.observation-heading .list-status')).toHaveText(state);
    await expect(cards.nth(i).getByLabel('Estado', { exact: true })).toBeEnabled();
  }
  await page.reload(); await openReceived(page);
  await expect(cards.nth(0).getByLabel('Acción realizada')).toHaveValue('Corrección 1 realizada');
  await switchTo(page, 'demo-admin'); await openReview(page);
  await expect(breadcrumb.locator('li')).toHaveText(['Espacio de trabajo', 'Mis inspecciones', 'Inspecciones a revisar']);
  await page.getByRole('button', { name: 'Volver a Mis inspecciones', exact: true }).click();
  await expect(page.getByLabel('Filtrar por estado')).toHaveAttribute('data-value', 'review');
  await page.getByRole('button', { name: 'Revisar informe', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Guardar estado', exact: true })).toHaveCount(0);
  await expect(cards.nth(0).getByLabel('Estado', { exact: true })).toBeDisabled();
  const name = cards.nth(0).getByLabel('Apellidos y nombres del responsable del levantamiento');
  await expect(name).toHaveAttribute('readonly', '');
  expect(await name.evaluate(node => getComputedStyle(node).fontSize)).toBe(await cards.nth(0).getByLabel('Acción realizada').evaluate(node => getComputedStyle(node).fontSize));
  expect(await name.evaluate(node => node.parentElement?.querySelector('svg') === null)).toBe(true);
  await page.reload(); await openReview(page);
  await expect(cards.nth(0).getByLabel('Estado', { exact: true })).toHaveAttribute('data-value', 'Ejecutado');
  await expect(cards.nth(0).getByLabel('Acción realizada')).toHaveValue('Corrección 1 realizada');
  await expect(cards.nth(0).locator('.followup-evidence img')).toHaveCount(1);
  await cards.nth(0).getByRole('button', { name: 'Aprobar levantamiento' }).click();
  await expect(cards.nth(0).locator('.observation-heading .list-status')).toHaveText('Ejecutado');
  await expect(cards.nth(0).getByLabel('Estado', { exact: true })).toHaveAttribute('data-value', 'Ejecutado');
  await expect(cards.nth(0).getByLabel('Estado', { exact: true })).toBeDisabled();
  await expect(page.getByText('Inspección cerrada: todos los estados están en Ejecutado.')).toHaveCount(0);
  await cards.nth(1).getByLabel('Comentario de revisión').fill('Añadir evidencia del área completa.');
  await cards.nth(1).getByRole('button', { name: 'Solicitar ajustes' }).click();
  await expect(cards.nth(1).getByText('Añadir evidencia del área completa.')).toBeVisible();
  await expect(cards.nth(1).getByLabel('Estado', { exact: true })).toHaveAttribute('data-value', 'Pendiente');
  await expect(cards.nth(1).locator('.observation-heading .list-status')).toHaveText('Pendiente');
  await expect(cards.nth(1).getByRole('status')).toHaveText('Ajustes solicitados. La observación volvió a Pendiente.');
  await page.reload();
  await page.getByRole('button', { name: 'Mis inspecciones', exact: true }).click();
  await selectValue(page.getByLabel('Filtrar por estado'), 'pending');
  await page.getByRole('button', { name: 'Revisar informe', exact: true }).click();
  await expect(cards.nth(1).getByLabel('Estado', { exact: true })).toHaveAttribute('data-value', 'Pendiente');
  await expect(cards.nth(0).getByLabel('Estado', { exact: true })).toHaveAttribute('data-value', 'Ejecutado');
  await expect(cards.nth(1).getByText('Añadir evidencia del área completa.')).toBeVisible();
  await switchTo(page, 'demo-inspector'); await openReceived(page);
  await expect(cards.nth(1).getByLabel('Estado', { exact: true })).toHaveAttribute('data-value', 'Pendiente');
  await expect(cards.nth(1).getByLabel('Acción realizada')).toHaveValue('Corrección 2 realizada');
  await expect(cards.nth(1).locator('.followup-evidence img')).toHaveCount(1);
  await expect(cards.nth(0).getByLabel('Acción realizada')).toHaveAttribute('readonly', '');
  await selectValue(cards.nth(0).getByLabel('Estado', { exact: true }), 'Pendiente');
  await cards.nth(0).getByRole('button', { name: 'Guardar estado', exact: true }).click();
  await expect(cards.nth(0).getByText('Levantamiento enviado. Pendiente de revisión del autor.')).toBeVisible();
  await selectValue(cards.nth(0).getByLabel('Estado', { exact: true }), 'Ejecutado');
  await cards.nth(0).getByRole('button', { name: 'Guardar estado', exact: true }).click();
  await expect(cards.nth(0).locator('.observation-heading .list-status')).toHaveText('Ejecutado');
  await cards.nth(1).getByLabel('Acción realizada').fill('Corrección completada y verificada.');
  await selectValue(cards.nth(1).getByLabel('Estado', { exact: true }), 'Ejecutado');
  await cards.nth(1).getByRole('button', { name: 'Guardar avance' }).click();await cards.nth(1).getByRole('button', { name: 'Enviar a revisión' }).click();
  await expect(cards.nth(1).getByText('Levantamiento enviado. Pendiente de revisión del autor.')).toBeVisible();
  await expect(page.getByText('Inspección cerrada: todos los estados están en Ejecutado.')).toHaveCount(0);
  await switchTo(page, 'demo-admin'); await openReview(page);
  await expect(cards.nth(0).getByLabel('Estado', { exact: true })).toHaveAttribute('data-value', 'Ejecutado');
  await expect(cards.nth(1).getByLabel('Estado', { exact: true })).toHaveAttribute('data-value', 'Ejecutado');
  await cards.nth(0).getByRole('button', { name: 'Aprobar levantamiento' }).click();
  await cards.nth(1).getByRole('button', { name: 'Aprobar levantamiento' }).click();
  await expect(page.getByText('Inspección cerrada: todos los estados están en Ejecutado.')).toBeVisible();
  await expect(breadcrumb.locator('li')).toHaveText(['Espacio de trabajo', 'Mis inspecciones', 'Inspecciones cerradas']);
  await expect(page.getByRole('button', { name: 'Descargar PDF', exact: true })).toBeEnabled();
  for (let i = 0; i < 2; i++) await expect(cards.nth(i).getByLabel('Estado', { exact: true })).toBeDisabled();
  const closedGuards = await page.evaluate(async () => {
    const { loadInspections } = await import('/src/model.ts');
    const { saveCorrectionState, saveCorrection, reviewCorrection } = await import('/src/follow-up.ts');
    const report = (await loadInspections()).find(d => d.delivery)!;
    const id = report.observations[0].id;
    const reject = async (fn: () => Promise<unknown>) => { try { await fn(); return false; } catch { return true; } };
    return Promise.all([
      reject(() => saveCorrectionState(report, id, 'demo-admin', 'Pendiente')),
      reject(() => saveCorrectionState(report, id, 'demo-inspector', 'Pendiente')),
      reject(() => saveCorrection(report, id, 'demo-inspector', report.delivery!.corrections[id], false)),
      reject(() => reviewCorrection(report, id, 'demo-admin', false, 'Cambiar un informe cerrado')),
    ]);
  });
  expect(closedGuards).toEqual([true, true, true, true]);
  await cards.first().screenshot({ path: 'test-results/followup-desktop.png' });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await expect.poll(async () => (await page.locator('.sidebar').boundingBox())!.x + (await page.locator('.sidebar').boundingBox())!.width).toBeLessThanOrEqual(1);
  await cards.first().screenshot({ path: 'test-results/followup-mobile.png' });
  await page.setViewportSize({ width: 1280, height: 900 });
  const downloadEvent = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Descargar Excel', exact: true }).click();
  const workbook = new ExcelJS.Workbook(); await workbook.xlsx.readFile((await (await downloadEvent).path())!);
  const content = JSON.stringify(workbook.getWorksheet('V.01')!.getSheetValues());
  expect(content).toContain('LEVANTAMIENTO DE RESULTADOS DE LA INSPECCIÓN'); expect(content).toContain('Ejecutado');
  expect(workbook.getWorksheet('V.01')!.getImages()).toHaveLength(3); // Logo and two correction photos.
  await page.getByRole('button', { name: 'Mis inspecciones', exact: true }).click();
  await expect(page.locator('.list-stats > div').filter({ hasText: 'Inspecciones cerradas' }).locator('strong')).toHaveText('1');
  await expect(page.locator('.list-stats > div').filter({ hasText: 'Inspecciones a revisar' }).locator('strong')).toHaveText('0');
  await expect(page.getByRole('button', { name: 'Mis inspecciones', exact: true }).locator('.nav-count')).toHaveCount(0);
  await selectValue(page.getByLabel('Filtrar por estado'), 'closed');
  await expect(page.locator('.inspection-list-row')).toHaveCount(1);
  await expect(page.locator('.list-status')).toHaveText('Cerrada');
  await switchTo(page, 'demo-inspector');
  const inbox = page.getByRole('button', { name: 'Inspecciones recibidas', exact: true });
  await expect(inbox.locator('.nav-count')).toHaveCount(0);
  await inbox.click();
  await expect(page.getByRole('button', { name: 'Pendientes', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByText('No tienes inspecciones pendientes', { exact: true })).toBeVisible();
  await expect(page.locator('.inspection-list-row')).toHaveCount(0);
  await page.getByRole('button', { name: 'Cerradas', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Cerradas', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.inspection-list-row')).toHaveCount(1);
  await expect(page.locator('.inspection-list-info')).toContainText('Cerrada');
  await page.getByRole('button', { name: 'Revisar inspección', exact: true }).click();
  await expect(breadcrumb.locator('li')).toHaveText(['Espacio de trabajo', 'Inspecciones recibidas', 'Cerradas']);
  await expect(page.getByRole('button', { name: 'Inspecciones recibidas', exact: true })).toHaveClass(/active/);
  await page.getByRole('button', { name: 'Volver a Inspecciones recibidas', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Cerradas', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'Revisar inspección', exact: true }).click();
  await expect(cards.nth(0).getByLabel('Estado', { exact: true })).toBeDisabled();
  await expect(cards.nth(1).getByLabel('Estado', { exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Volver', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Cerradas', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.inspection-list-row')).toHaveCount(1);
  await page.getByRole('button', { name: 'Pendientes', exact: true }).click();
  await expect(page.locator('.inspection-list-row')).toHaveCount(0);
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: 'test-results/followup-list-mobile.png', fullPage: true });
  expect(errors).toEqual([]);
});

test('autor y destinatario ven al mismo responsable antes de guardar y tras registrar el levantamiento', async ({ page }) => {
  test.setTimeout(60000);
  await page.goto('./');
  await page.evaluate(async () => {
    const { updateOwnProfile } = await import('/src/accounts.ts');
    updateOwnProfile('demo-admin', 'Autora de inspección', 'Seguridad');
    updateOwnProfile('demo-inspector', 'Responsable destinataria', 'Taller');
  });
  await createReport(page);
  const cards = page.locator('.followup-card');
  const name = 'Apellidos y nombres del responsable del levantamiento';
  await expect(page.locator('.followup-context')).toContainText('Autora de inspección');
  for (let index = 0; index < 2; index++) {
    await expect(cards.nth(index).getByLabel(name)).toHaveValue('Responsable destinataria');
    await expect(cards.nth(index).getByLabel(name)).toHaveAttribute('readonly', '');
  }
  await switchTo(page, 'demo-inspector'); await openReceived(page);
  await expect(cards.first().getByLabel(name)).toHaveValue('Responsable destinataria');
  await expect(cards.first().getByLabel(name)).toHaveAttribute('readonly', '');
  await cards.first().getByLabel(name).focus(); await page.keyboard.press('ControlOrMeta+A'); await page.keyboard.insertText('Nombre no permitido');
  await expect(cards.first().getByLabel(name)).toHaveValue('Responsable destinataria');
  await cards.first().getByRole('button', { name: 'Guardar avance', exact: true }).click();
  await expect(cards.first().getByText('Avance guardado.', { exact: true })).toBeVisible();
  await switchTo(page, 'demo-admin');
  await page.getByRole('button', { name: 'Mis inspecciones', exact: true }).click();
  await page.getByRole('button', { name: 'Revisar informe', exact: true }).click();
  await expect(cards.first().getByLabel(name)).toHaveValue('Responsable destinataria');
  await expect(cards.nth(1).getByLabel(name)).toHaveValue('Responsable destinataria');
  const downloadEvent = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Descargar Excel', exact: true }).click();
  const book = new ExcelJS.Workbook(); await book.xlsx.readFile((await (await downloadEvent).path())!);
  expect(book.getWorksheet('V.01')!.getCell('G20').value).toBe('Responsable destinataria');
  expect(book.getWorksheet('V.01')!.getCell('G21').value).toBe('Responsable destinataria');
  await page.reload();
  await page.getByRole('button', { name: 'Mis inspecciones', exact: true }).click();
  await page.getByRole('button', { name: 'Revisar informe', exact: true }).click();
  await expect(cards.first().getByLabel(name)).toHaveValue('Responsable destinataria');
  await expect(cards.nth(1).getByLabel(name)).toHaveValue('Responsable destinataria');
});

test('permisos, versiones concurrentes y protección del informe enviado', async ({ page }) => {
  await createReport(page);
  const result = await page.evaluate(async () => {
    const { loadInspections, persistInspection, removeInspection } = await import('/src/model.ts');
    const { readAccounts } = await import('/src/accounts.ts');
    const { blankCorrection, saveCorrection, saveCorrectionState, reviewCorrection, inspectionClosed } = await import('/src/follow-up.ts');
    const report = (await loadInspections()).find((d: any) => d.delivery)!;
    const actor = readAccounts().find((a: any) => a.id === 'demo-inspector')!;
    const correction = blankCorrection(report, report.observations[0].id);
    const reject = async (fn: () => Promise<unknown>) => { try { await fn(); return false; } catch { return true; } };
    const outsiderBlocked = await reject(() => saveCorrection(report, report.observations[0].id, 'outsider', correction, false));
    const updated = await saveCorrection(report, report.observations[0].id, actor.id, { ...correction, responsibleName: 'Nombre manipulado' }, false);
    const identityPreserved = updated.delivery!.corrections[report.observations[0].id].responsibleName === report.responsibles[0].name;
    const staleBlocked = await reject(() => saveCorrection(report, report.observations[0].id, actor.id, correction, false));
    const selfReviewBlocked = await reject(() => reviewCorrection(updated, report.observations[0].id, actor.id, true, ''));
    const outsiderStateBlocked = await reject(() => saveCorrectionState(updated, report.observations[0].id, 'outsider', 'Ejecutado'));
    const invalidStateBlocked = await reject(() => saveCorrectionState(updated, report.observations[0].id, actor.id, 'Otro' as any));
    const ownerStateBlocked = await reject(() => saveCorrectionState(updated, report.observations[0].id, report.ownerId, 'Ejecutado'));
    const changed = await saveCorrectionState(updated, report.observations[0].id, actor.id, 'Ejecutado');
    const staleStateBlocked = await reject(() => saveCorrectionState(updated, report.observations[0].id, actor.id, 'Pendiente'));
    const overwriteBlocked = await reject(() => persistInspection({ ...report, delivery: undefined }));
    const deletionBlocked = await reject(() => removeInspection(report.id));
    return { ownerStateBlocked, identityPreserved, outsiderBlocked, staleBlocked, selfReviewBlocked, outsiderStateBlocked, invalidStateBlocked, staleStateBlocked, overwriteBlocked, deletionBlocked, closed: inspectionClosed(changed) };
  });
  expect(result).toEqual({ ownerStateBlocked: true, identityPreserved: true, outsiderBlocked: true, staleBlocked: true, selfReviewBlocked: true, outsiderStateBlocked: true, invalidStateBlocked: true, staleStateBlocked: true, overwriteBlocked: true, deletionBlocked: true, closed: false });
});

test('levantamiento manual conserva cambios en pantalla y solo persiste al pulsar Guardar avance',async({page})=>{
 await createReport(page);await switchTo(page,'demo-inspector');await openReceived(page);
 const card=page.locator('.followup-card').first();await card.getByLabel('Acción realizada').fill('Avance manual pendiente');
 await page.waitForTimeout(1200);
 const read=()=>page.evaluate(async()=>{const {loadInspections}=await import('/src/model.ts');const d=(await loadInspections()).find(d=>d.delivery)!;return d.delivery!.corrections[d.observations[0].id]?.action;});
 expect(await read()).not.toBe('Avance manual pendiente');await page.getByRole('button',{name:'Volver',exact:true}).click();await expect(page.getByRole('alert')).toContainText('Hay cambios sin guardar');
 await card.getByRole('button',{name:'Guardar avance',exact:true}).click();await expect(card.getByText('Avance guardado.',{exact:true})).toBeVisible();expect(await read()).toBe('Avance manual pendiente');
 await card.getByLabel('Acción realizada').fill('Cambio posterior sin guardar');await page.waitForTimeout(1200);expect(await read()).toBe('Avance manual pendiente');
 await card.getByRole('button',{name:'Enviar a revisión'}).click();await expect(card.getByRole('alert')).toContainText('Pulsa Guardar avance');expect(await read()).toBe('Avance manual pendiente');
});
