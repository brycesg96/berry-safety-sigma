import { selectValue } from './select-fixture';
import { saveAndOpenList } from './save-fixture';
import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { hasInspectionContent, newInspection, newObservation, newResponsible } from '../src/model';

async function storedCount(page: Page) {
  return page.evaluate(async () => {
    const request = indexedDB.open('berry-safety', 1);
    const db = await new Promise<IDBDatabase>((resolve, reject) => { request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
    const count = await new Promise<number>((resolve, reject) => { const req = db.transaction('inspections', 'readonly').objectStore('inspections').count(); req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error); }); db.close(); return count;
  });
}

test('contenido real: los datos automáticos y las filas vacías no inician una inspección', () => {
  const empty = newInspection({ name: 'Bryan', email: 'bryx.96@gmail.com', accountId: 'demo-admin' });
  expect(hasInspectionContent(empty)).toBe(false);
  expect(hasInspectionContent({ ...empty, area: '   ', inspector: 'Nombre actualizado del perfil', additionalInspectors: [newResponsible()], observations: [newObservation()], registrationDetails: { 'demo-admin': { jobTitle: 'Supervisor', initialJobTitle: 'Supervisor', date: empty.date } } })).toBe(false);
  for (const change of [{ area: 'Taller' }, { type: 'Planeada' as const }, { inspectionPeriod: 'PM' as const }, { inspectionTime: '07:30' }, { date: empty.date === '2026-11-03' ? '2026-11-04' : '2026-11-03' }, { responsibles: [{ id: 'person', personId: 'demo-inspector', name: 'Bryan', email: 'bcespedes@hortifrut.com' }] }, { observations: [{ ...newObservation(), description: 'Hallazgo' }] }, { closingRemarks: 'Recomendaciones de seguimiento.' }, { registrationDetails: { 'demo-admin': { jobTitle: 'Cargo escrito a mano', initialJobTitle: 'Supervisor', date: empty.date } } }]) expect(hasInspectionContent({ ...empty, ...change })).toBe(true);
});

test('abrir, navegar y cambiar de cuenta no crea borradores; escribir no guarda; Guardar conserva y vaciar solo retira al guardar', async ({ page }) => {
  await page.clock.install(); await page.goto('./');
  await expect(page.getByRole('button', { name: 'Continuar', exact: true })).toBeEnabled();
  await expect(page.getByRole('button', { name: 'Guardar', exact: true })).toHaveCount(1);
  await expect(page.getByRole('button', { name: 'Guardar y salir', exact: true })).toHaveCount(0);
  await expect(page.getByText('SEGURIDAD INDUSTRIAL Y GESTIÓN MEDIO AMBIENTAL', { exact: true })).toBeVisible();
  const nav = page.locator('.sidebar-nav');
  await page.getByLabel('Área inspeccionada').fill('   ');
  await page.getByRole('button', { name: 'Guardar', exact: true }).first().click();
  await expect(page.getByText('Sin iniciar', { exact: true })).toBeVisible();
  await page.clock.runFor(1000); await expect(page.getByText('Sin iniciar', { exact: true })).toBeVisible();
  expect(await storedCount(page)).toBe(0);
  for (const destination of ['Mis inspecciones', 'Administración', 'Inspecciones recibidas']) {
    await nav.getByRole('button', { name: destination, exact: true }).click();
    await nav.getByRole('button', { name: 'Nueva inspección', exact: true }).click();
    await page.clock.runFor(1000); expect(await storedCount(page)).toBe(0);
  }
  await saveAndOpenList(page);
  await expect(page.locator('.inspection-list-row')).toHaveCount(0);
  await expect(nav.getByRole('button', { name: 'Mis inspecciones', exact: true }).locator('.nav-count')).toHaveCount(0);
  await page.getByRole('button', { name: 'Mi perfil', exact: true }).click();
  await selectValue(page.getByLabel('Cuenta de prueba'), 'demo-inspector');
  await expect(page.getByLabel('Correo de tu cuenta')).toHaveValue('bcespedes@hortifrut.com');
  await page.getByRole('button', { name: 'Cerrar ventana', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Continuar', exact: true })).toBeEnabled();
  await page.clock.runFor(1000); expect(await storedCount(page)).toBe(0);
  await page.getByLabel('Área inspeccionada').fill('Taller - Armonía 2');
  await page.clock.runFor(1000); await expect(page.getByText('Cambios sin guardar',{exact:true})).toBeVisible(); await page.getByRole('button',{name:'Guardar',exact:true}).first().click(); await expect(page.getByText('Guardado en este navegador', { exact: true })).toBeVisible();
  expect(await storedCount(page)).toBe(1);
  await nav.getByRole('button', { name: 'Mis inspecciones', exact: true }).click();
  await expect(page.locator('.inspection-list-row')).toHaveCount(1);
  await nav.getByRole('button', { name: 'Nueva inspección', exact: true }).click();
  await page.clock.runFor(1000); expect(await storedCount(page)).toBe(1);
  await nav.getByRole('button', { name: 'Mis inspecciones', exact: true }).click();
  await page.getByRole('button', { name: 'Continuar', exact: true }).click();
  await page.getByLabel('Área inspeccionada').fill('   ');
  await page.clock.runFor(1000); await page.getByRole('button',{name:'Guardar',exact:true}).first().click(); await expect(page.getByText('Sin iniciar', { exact: true })).toBeVisible();
  await nav.getByRole('button', { name: 'Mis inspecciones', exact: true }).click();
  await expect(page.locator('.inspection-list-row')).toHaveCount(0); expect(await storedCount(page)).toBe(0);
  await nav.getByRole('button', { name: 'Nueva inspección', exact: true }).click();
  const date = page.getByLabel('Fecha de inspección'); const initial = await date.inputValue();
  await date.fill(initial === '2026-11-03' ? '2026-11-04' : '2026-11-03');
  await page.clock.runFor(1000); await expect(page.getByText('Cambios sin guardar',{exact:true})).toBeVisible(); await page.getByRole('button',{name:'Guardar',exact:true}).first().click(); await expect(page.getByText('Guardado en este navegador', { exact: true })).toBeVisible();
  expect(await storedCount(page)).toBe(1);
  await date.fill(initial); await page.clock.runFor(1000); await page.getByRole('button',{name:'Guardar',exact:true}).first().click();
  await expect(page.getByText('Sin iniciar', { exact: true })).toBeVisible(); expect(await storedCount(page)).toBe(0);
});

for (const width of [1366, 390]) test(`salir de una inspección permite cancelar, descartar o guardar y continuar (${width}px)`, async ({ page }) => {
  await page.setViewportSize({ width, height: 900 }); await page.goto('./');
  const field = page.getByLabel('Área inspeccionada');
  const dialog = page.getByRole('dialog', { name: '¿Qué quieres hacer con los cambios?', exact: true });
  async function navigate(name: string) {
    const menu = page.getByRole('button', { name: 'Abrir menú', exact: true });
    if (await menu.isVisible()) await menu.click();
    await page.locator('.sidebar-nav').getByRole('button', { name, exact: true }).click();
  }
  await field.fill('Nueva sin guardar'); await navigate('Mis inspecciones');
  await expect(dialog).toBeVisible(); await expect(dialog).not.toContainText('Guardar avance'); expect(await storedCount(page)).toBe(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await dialog.screenshot({ path: test.info().outputPath(`cambios-pendientes-${width}.png`) });
  await dialog.getByRole('button', { name: 'Seguir editando', exact: true }).click(); await expect(field).toHaveValue('Nueva sin guardar');
  await navigate('Mis inspecciones'); await page.keyboard.press('Escape'); await expect(dialog).toHaveCount(0); await expect(field).toHaveValue('Nueva sin guardar');
  await navigate('Mis inspecciones'); await dialog.getByRole('button', { name: 'Descartar cambios', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Mis inspecciones', exact: true })).toBeVisible(); expect(await storedCount(page)).toBe(0);
  await navigate('Nueva inspección'); await expect(field).toHaveValue('');
  await field.fill('Borrador conservado'); await navigate('Inspecciones recibidas');
  await dialog.getByRole('button', { name: 'Guardar y continuar', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Inspecciones recibidas', exact: true })).toBeVisible(); expect(await storedCount(page)).toBe(1);
  await navigate('Mis inspecciones'); await page.locator('.inspection-list-row').getByRole('button', { name: 'Continuar', exact: true }).click();
  await expect(field).toHaveValue('Borrador conservado'); await field.fill('Cambio que descarto'); await navigate('Administración');
  await dialog.getByRole('button', { name: 'Descartar cambios', exact: true }).click(); await expect(page.locator('.sidebar-nav button.active')).toContainText('Administración');
  await navigate('Mis inspecciones'); await expect(page.locator('.inspection-list-row')).toHaveCount(1); await expect(page.locator('.inspection-list-row')).toContainText('Borrador conservado');
  await page.locator('.inspection-list-row').getByRole('button', { name: 'Continuar', exact: true }).click(); await expect(field).toHaveValue('Borrador conservado');
  page.once('dialog', native => native.accept()); await page.reload(); await expect(field).toHaveValue('Borrador conservado');
});
