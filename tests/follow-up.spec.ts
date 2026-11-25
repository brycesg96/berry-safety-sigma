import { expectAccessible } from './accessibility-fixture';
import { openWorkspaceProfile } from './workspace-profile-fixture';
import { selectSecondResponsible } from './responsible-fixture';
import { inspectionFilterButton, selectInspectionFilter } from './list-filter-fixture';
import { selectValue } from './select-fixture';
import { selectLocation } from './location-fixture';
import { test, expect } from './test-fixture';
import type { Page } from '@playwright/test';
import ExcelJS from 'exceljs';
test.beforeEach(async ({ page }) => { await page.route('**/api/people?*', route => route.fulfill({ json: { people: [] } })); });
const png = { name: 'levantamiento.png', mimeType: 'image/png', buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64') };
async function switchTo(page: Page, id: string) {
  await openWorkspaceProfile(page);
  await selectValue(page.getByLabel('Cuenta de prueba'), id);
  await expect(page.getByLabel('Correo de tu cuenta')).toHaveValue(id === 'demo-admin' ? 'bryx.96@gmail.com' : 'bcespedes@hortifrut.com');
  await page.getByRole('button', { name: 'Cerrar ventana', exact: true }).click();
}
async function createReport(page: Page) {
  await page.goto('./');
  await page.evaluate(async () => {
    const { readAccounts, addAccount } = await import('/src/accounts.ts');
    if (!readAccounts().some(account => account.email === 'correction@example.invalid')) addAccount('demo-admin', { name: 'Encargada del levantamiento', email: 'correction@example.invalid', role: 'inspector' });
  });
  await selectLocation(page, 'Sede', 'Fundo'); await selectLocation(page, 'Zona de inspección', 'Armonía II');
  await page.getByLabel('Hora de inspección').fill('07:30'); await selectValue(page.getByLabel('AM o PM'), 'AM');
  await page.getByRole('radio', { name: 'Planeada', exact: true }).check();
  await page.getByRole('textbox', { name: 'Objetivo de la inspección interna', exact: true }).fill('Verificar las condiciones de seguridad.');
  await page.getByRole('combobox', { name: /Nombre completo/ }).first().fill('bcespedes@hortifrut.com');
  await page.getByRole('listbox').getByRole('option', { name: /bcespedes@hortifrut.com/ }).click();
  await selectSecondResponsible(page, 'correction@example.invalid');
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
  await page.getByRole('textbox', { name: 'Conclusiones y Recomendaciones', exact: true }).fill('Dos condiciones por corregir.');
  await page.getByRole('textbox', { name: 'Descripción de la Causa ante Resultados Desfavorables de la Inspección', exact: true }).fill('Verificar el levantamiento.');
  await page.getByRole('button', { name: 'Continuar', exact: true }).click();
  await page.getByRole('button', { name: 'Guardar', exact: true }).first().click();await page.getByRole('button', { name: 'Enviar inspección', exact: true }).click();
  await page.getByText('Compartir solo en este navegador', { exact: true }).click();
  await expect(page.getByText('No se ha enviado ningún correo.')).toBeVisible();
  await page.getByRole('button', { name: 'Enviar a destinatarios de prueba' }).click();
  await expect(page.getByRole('heading', { name: 'Fundo – Armonía II – Control de Gestión – Lavadero de Camiones', exact: true })).toBeVisible();
}
async function openReceived(page: Page) {
  await page.getByRole('button', { name: 'Buzón de Inspecciones', exact: true }).click();
  await page.getByRole('button', { name: 'Revisar inspección', exact: true }).click();
}
async function openReview(page: Page) {
  await page.getByRole('button', { name: 'Mis inspecciones', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Mis inspecciones', exact: true }).locator('.nav-count')).toHaveText('1');
  await selectInspectionFilter(page, 'review');
  await page.getByRole('button', { name: 'Revisar informe', exact: true }).click();
}
test('destinatario envía evidencias y solo el inspector puede convertir el estado pendiente en ejecutado',async({page})=>{
 test.setTimeout(90000);await createReport(page);const cards=page.locator('.followup-card');
 await expect(page.getByText('Seguimiento de correos',{exact:true})).toHaveCount(0);
 await expect(page.locator('.followup-people-grid')).not.toContainText('@');
 await expect(page.getByRole('region',{name:'Responsables del Levantamiento',exact:true})).toBeVisible();
 await switchTo(page,'demo-inspector');await openReceived(page);
 await expect(page.locator('.breadcrumbs')).toContainText('Por atender');
 for(let index=0;index<2;index++){
  await page.getByRole('tab',{name:`Observación ${index+1}`,exact:true}).click();
  const card=cards.nth(index);await expect(card.getByRole('combobox',{name:'Estado',exact:true})).toHaveCount(0);await expect(card.locator('.observation-heading .list-status')).toHaveText('Pendiente');await expect(card.getByLabel('Estado',{exact:true})).toHaveCount(0);
  await card.getByLabel('Acción realizada').fill(`Corrección ${index+1} realizada`);await card.getByLabel('Añadir evidencias del levantamiento').setInputFiles(png);
  await expect(card.locator('.followup-evidence img')).toHaveCount(1);await card.getByRole('button',{name:'Enviar levantamiento',exact:true}).click();await expect(card.getByText('Avance guardado y levantamiento enviado a revisión.',{exact:true})).toBeVisible();
  await expect(card.locator('.observation-heading .list-status')).toHaveText('Pendiente');await expect(card.getByRole('button',{name:'Guardar Avance',exact:true})).toHaveCount(0);
 }
 await page.reload();await openReceived(page);await expect(cards.first().getByLabel('Acción realizada')).toHaveValue('Corrección 1 realizada');
 await switchTo(page,'demo-admin');await openReview(page);await expect(page.locator('.breadcrumbs')).toContainText('Por validar / aprobar');
 await cards.first().getByRole('button',{name:'Aprobar levantamiento',exact:true}).click();await expect(cards.first().locator('.observation-heading .list-status')).toHaveText('Ejecutado');
 await expect(page.getByRole('tab',{name:'Observación 1',exact:true})).toHaveAttribute('data-state','executed');
 await page.getByRole('tab',{name:'Observación 2',exact:true}).click();
 await cards.nth(1).getByLabel('Comentario de revisión').fill('Añadir evidencia del área completa.');await cards.nth(1).getByRole('button',{name:'Solicitar Correcciones',exact:true}).click();await expect(cards.nth(1).locator('.observation-heading .list-status')).toHaveText('Pendiente');
 await switchTo(page,'demo-inspector');await openReceived(page);await expect(cards.first().locator('.observation-heading .list-status')).toHaveText('Ejecutado');await expect(cards.first().getByLabel('Acción realizada')).toHaveAttribute('readonly','');
 await page.getByRole('tab',{name:'Observación 2',exact:true}).click();
 await cards.nth(1).getByLabel('Acción realizada').fill('Corrección completada y verificada.');await cards.nth(1).getByRole('button',{name:'Enviar levantamiento',exact:true}).click();await expect(cards.nth(1).locator('.observation-heading .list-status')).toHaveText('Pendiente');
 await switchTo(page,'demo-admin');await openReview(page);await page.getByRole('tab',{name:'Observación 2',exact:true}).click();await cards.nth(1).getByRole('button',{name:'Aprobar levantamiento',exact:true}).click();
 await expect(page.getByRole('tab',{name:'Observación 2',exact:true})).toHaveAttribute('aria-selected','true');await expect(page.getByRole('tab',{name:'Observación 2',exact:true})).toHaveAttribute('data-state','executed');
 await expect(page.getByRole('button',{name:'Descargar PDF',exact:true})).toBeVisible();await expect(page.locator('.breadcrumbs')).toContainText('Inspecciones cerradas');
 for(const card of await cards.all()){await expect(card.locator('.observation-heading .list-status')).toHaveText('Ejecutado');await expect(card.getByLabel('Estado',{exact:true})).toHaveCount(0);}
 const guards=await page.evaluate(async()=>{const{loadInspections}=await import('/src/model.ts');const{saveCorrectionState,saveCorrection,reviewCorrection}=await import('/src/follow-up.ts');const report=(await loadInspections()).find(d=>d.delivery)!;const id=report.observations[0].id;const reject=async(fn:()=>Promise<unknown>)=>{try{await fn();return false;}catch{return true;}};return Promise.all([reject(()=>saveCorrectionState(report,id,'demo-admin','Pendiente')),reject(()=>saveCorrectionState(report,id,'demo-inspector','Pendiente')),reject(()=>saveCorrection(report,id,'demo-inspector',report.delivery!.corrections[id],false)),reject(()=>reviewCorrection(report,id,'demo-admin',false,'Cambio'))]);});expect(guards).toEqual([true,true,true,true]);
 await page.getByRole('tab',{name:'Observación 1',exact:true}).click();await cards.first().screenshot({path:test.info().outputPath('levantamiento-aprobado.png')});await page.setViewportSize({width:390,height:844});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await page.setViewportSize({width:1280,height:900});const download=page.waitForEvent('download');await page.getByRole('button',{name:'Descargar Excel',exact:true}).click();const book=new ExcelJS.Workbook();await book.xlsx.readFile((await(await download).path())!);const text=JSON.stringify(book.getWorksheet('V.01')!.getSheetValues());expect(text).toContain('LEVANTAMIENTO DE RESULTADOS DE LA INSPECCIÓN');expect(text).toContain('Ejecutado');expect(book.getWorksheet('V.01')!.getImages()).toHaveLength(3);
 await switchTo(page,'demo-inspector');await page.getByRole('button',{name:'Buzón de Inspecciones',exact:true}).click();await expect(page.getByRole('button',{name:'Abiertas',exact:true})).toHaveAttribute('aria-pressed','true');await expect(page.locator('.inspection-list-row')).toHaveCount(0);await page.getByRole('button',{name:'Cerradas',exact:true}).click();await expect(page.locator('.inspection-list-row')).toHaveCount(1);
});

test('el Buzón oculta el autor y el inspector conserva la identidad real de quien registra el levantamiento', async ({ page }) => {
  test.setTimeout(60000);
  await page.goto('./');
  await page.evaluate(async () => {
    const { updateOwnProfile } = await import('/src/accounts.ts');
    updateOwnProfile('demo-admin', 'Autora de inspección', 'Seguridad');
    updateOwnProfile('demo-inspector', 'Responsable destinataria', 'Taller');
  });
  await createReport(page);
  const cards = page.locator('.followup-card');
  const name = 'Responsable del Levantamiento';
  await expect(page.locator('.followup-context')).toContainText('Autora de inspección');
  for(let index=0;index<2;index++)await expect(cards.nth(index).getByLabel(name)).toHaveValue('');
  await switchTo(page, 'demo-inspector'); await openReceived(page);
  await expect(page.getByLabel(name)).toHaveCount(0);
  await expect(page.getByRole('region', { name: 'Responsables del Levantamiento', exact: true }).getByText('Responsable destinataria (Tu)', { exact: true })).toBeVisible();
  await cards.first().getByRole('button', { name: 'Guardar Avance', exact: true }).click();
  await expect(cards.first().getByText('Avance guardado.', { exact: true })).toBeVisible();
  await switchTo(page, 'demo-admin');
  await page.getByRole('button', { name: 'Mis inspecciones', exact: true }).click();
  await page.getByRole('button', { name: 'Revisar informe', exact: true }).click();
  await expect(cards.first().getByLabel(name)).toHaveValue('Responsable destinataria');
  await expect(cards.first().getByLabel(name)).toHaveAttribute('readonly', '');
  await expect(cards.nth(1).getByLabel(name)).toHaveValue('');
  const downloadEvent = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Descargar Excel', exact: true }).click();
  const book = new ExcelJS.Workbook(); await book.xlsx.readFile((await (await downloadEvent).path())!);
  expect(book.getWorksheet('V.01')!.getCell('G20').text).toBe('Encargada del levantamiento');
  expect(book.getWorksheet('V.01')!.getCell('G21').text).toBe('Encargada del levantamiento');
  await page.reload();
  await page.getByRole('button', { name: 'Mis inspecciones', exact: true }).click();
  await page.getByRole('button', { name: 'Revisar informe', exact: true }).click();
  await expect(cards.first().getByLabel(name)).toHaveValue('Responsable destinataria');
  await expect(cards.first().getByLabel(name)).toHaveAttribute('readonly', '');
  await expect(cards.nth(1).getByLabel(name)).toHaveValue('');
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
    const identityPreserved = updated.delivery!.corrections[report.observations[0].id].responsibleName === actor.name;
    const staleBlocked = await reject(() => saveCorrection(report, report.observations[0].id, actor.id, correction, false));
    const selfReviewBlocked = await reject(() => reviewCorrection(updated, report.observations[0].id, actor.id, true, ''));
    const outsiderStateBlocked = await reject(() => saveCorrectionState(updated, report.observations[0].id, 'outsider', 'Ejecutado'));
    const invalidStateBlocked = await reject(() => saveCorrectionState(updated, report.observations[0].id, actor.id, 'Otro' as any));
    const ownerStateBlocked = await reject(() => saveCorrectionState(updated, report.observations[0].id, report.ownerId, 'Ejecutado'));
    const stateChangeBlocked = await reject(() => saveCorrectionState(updated, report.observations[0].id, actor.id, 'Ejecutado'));const changed=updated;
    const staleStateBlocked = await reject(() => saveCorrectionState(updated, report.observations[0].id, actor.id, 'Pendiente'));
    const overwriteBlocked = await reject(() => persistInspection({ ...report, delivery: undefined }));
    const deletionBlocked = await reject(() => removeInspection(report.id));
    return { stateChangeBlocked, ownerStateBlocked, identityPreserved, outsiderBlocked, staleBlocked, selfReviewBlocked, outsiderStateBlocked, invalidStateBlocked, staleStateBlocked, overwriteBlocked, deletionBlocked, closed: inspectionClosed(changed) };
  });
  expect(result).toEqual({ stateChangeBlocked:true, ownerStateBlocked: true, identityPreserved: true, outsiderBlocked: true, staleBlocked: true, selfReviewBlocked: true, outsiderStateBlocked: true, invalidStateBlocked: true, staleStateBlocked: true, overwriteBlocked: true, deletionBlocked: true, closed: false });
});

test('levantamiento conserva cambios hasta Guardar Avance y Enviar guarda la última versión automáticamente',async({page})=>{
 await createReport(page);await switchTo(page,'demo-inspector');await openReceived(page);
 const card=page.locator('.followup-card').first();await card.getByLabel('Acción realizada').fill('Avance manual pendiente');
 await page.waitForTimeout(1200);
 const read=()=>page.evaluate(async()=>{const {loadInspections}=await import('/src/model.ts');const d=(await loadInspections()).find(d=>d.delivery)!;return d.delivery!.corrections[d.observations[0].id]?.action;});
 expect(await read()).not.toBe('Avance manual pendiente');await page.getByRole('button',{name:'Volver',exact:true}).click();await expect(page.getByRole('alert')).toContainText('Hay cambios sin guardar');
 await card.getByRole('button',{name:'Guardar Avance',exact:true}).click();await expect(card.getByText('Avance guardado.',{exact:true})).toBeVisible();
 await expect(card.getByRole('button',{name:'Guardar Avance',exact:true})).toHaveAttribute('data-save-phase','success');
 expect(await read()).toBe('Avance manual pendiente');
 await card.getByLabel('Acción realizada').fill('Cambio posterior sin guardar');await page.waitForTimeout(1200);expect(await read()).toBe('Avance manual pendiente');
 for(const width of [1280,390]) {
  await page.setViewportSize({width,height:900});
  const save=await card.getByRole('button',{name:'Guardar Avance',exact:true}).boundingBox(),send=await card.getByRole('button',{name:'Enviar levantamiento',exact:true}).boundingBox();
  expect(save).toBeTruthy();expect(send).toBeTruthy();expect(Math.abs(save!.y-send!.y)).toBeLessThan(2);expect(save!.x+save!.width).toBeLessThan(send!.x);
 }
 await card.getByRole('button',{name:'Enviar levantamiento'}).click();
 await expect(card.getByText('Avance guardado y levantamiento enviado a revisión.',{exact:true})).toBeVisible();
 await expect(card.getByRole('alert')).toHaveCount(0);expect(await read()).toBe('Cambio posterior sin guardar');
 await expect(card.getByLabel('Acción realizada')).toHaveAttribute('readonly','');
 await page.setViewportSize({width:1280,height:900});await page.reload();await openReceived(page);await expect(page.locator('.followup-card').first().getByLabel('Acción realizada')).toHaveValue('Cambio posterior sin guardar');
});

test('el seguimiento distingue conversación y estados con contraste accesible',async({page})=>{await createReport(page);await expectAccessible(page);await page.screenshot({path:test.info().outputPath('seguimiento-renovado.png'),fullPage:true});});
