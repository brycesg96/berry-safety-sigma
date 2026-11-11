import { selectValue } from './select-fixture';
import { saveAndOpenList } from './save-fixture';
import { selectLocation } from './location-fixture';
import { test, expect, type Page } from '@playwright/test';
import { mockDirectory } from './directory-fixture';

const objective = (page: Page) => page.getByRole('textbox', { name: 'Objetivo de la inspección interna', exact: true });
const cause = (page: Page) => page.getByRole('textbox', { name: 'DESCRIPCIÓN DE LA CAUSA ANTE RESULTADOS DESFAVORABLES DE LA INSPECCIÓN', exact: true });
const remarks = (page: Page) => page.getByRole('textbox', { name: 'CONCLUSIONES Y RECOMENDACIONES', exact: true });
async function closing(page: Page) {
  await page.getByLabel('Área inspeccionada').fill('Área de prueba');
  await selectLocation(page, 'Sede', 'Fundo'); await selectLocation(page, 'Zona de inspección', 'Armonía II');
  await page.getByLabel('Hora de inspección').fill('07:30'); await selectValue(page.getByLabel('AM o PM'), 'AM');
  await page.getByRole('radio', { name: 'Planeada', exact: true }).check();
  await page.getByRole('combobox', { name: /Nombre completo/ }).fill('Ana'); await page.getByRole('option', { name: /Ana Torres/ }).click();
  await page.getByRole('button', { name: 'Continuar', exact: true }).click(); await page.getByRole('button', { name: 'Añadir observación', exact: true }).click();
  await page.getByRole('textbox', { name: 'Descripción', exact: true }).fill('Hallazgo.'); await page.getByLabel('Acción a tomar').fill('Corregir.'); await page.getByLabel('Fecha de Cierre').fill('2026-12-01');
  await page.getByRole('button', { name: 'Continuar', exact: true }).click(); await page.getByRole('button', { name: 'Continuar', exact: true }).click();
}
async function startNew(page: Page) {
  await saveAndOpenList(page);
  await page.locator('.sidebar-nav').getByRole('button', { name: 'Nueva inspección', exact: true }).click();
}
async function switchTo(page: Page, account: string) {
  await page.getByRole('button', { name: 'Mi perfil', exact: true }).click(); await selectValue(page.getByLabel('Cuenta de prueba'), account);
  await page.getByRole('button', { name: 'Cerrar ventana', exact: true }).click();
}

test('cuentas nuevas empiezan en blanco; borradores guardados recuerdan solo sus propios textos, sin fuentes compartidas', async ({ page }) => {
  let sharedReads = 0;
  await mockDirectory(page);
  await page.addInitScript(() => localStorage.setItem('berry-last-submitted-texts', JSON.stringify({ acceptedAt: '2099-11-06T15:00:00Z', texts: { objective: 'Texto global antiguo', unfavorableCause: 'Causa global', closingRemarks: 'Cierre global' } })));
  await page.route('**/api/inspections/send', route => { sharedReads++; return route.fulfill({ json: { ok: true, defaults: { texts: { objective: 'Texto global', unfavorableCause: 'Causa global', closingRemarks: 'Cierre global' }, acceptedAt: '2099-11-06T15:00:00Z' } } }); });
  await page.goto('./'); await expect(objective(page)).toHaveValue('');
  await objective(page).fill('Objetivo privado de la primera cuenta.'); await closing(page); await expect(cause(page)).toHaveValue(''); await expect(remarks(page)).toHaveValue('');
  await cause(page).fill('Causa privada A.'); await remarks(page).fill('Recomendación privada A.');
  await startNew(page); await expect(objective(page)).toHaveValue('Objetivo privado de la primera cuenta.');
  // Defaults by themselves must not create a new draft or block changing account.
  await switchTo(page, 'demo-inspector'); await expect(objective(page)).toHaveValue('');
  await objective(page).fill('Objetivo privado B.'); await closing(page); await expect(cause(page)).toHaveValue(''); await expect(remarks(page)).toHaveValue('');
  await cause(page).fill('Causa privada B.'); await remarks(page).fill('Recomendación privada B.');
  await startNew(page); await expect(objective(page)).toHaveValue('Objetivo privado B.');
  await switchTo(page, 'demo-admin'); await expect(cause(page)).toHaveValue('Causa privada A.'); await expect(remarks(page)).toHaveValue('Recomendación privada A.');
  await page.getByRole('button', { name: 'Datos generales', exact: true }).click(); await expect(objective(page)).toHaveValue('Objetivo privado de la primera cuenta.');
  expect(sharedReads).toBe(0);
});

test('el historial recibido y las revisiones de informes antiguos no sustituyen el último borrador propio; se conserva también un texto vaciado', async ({ page }) => {
  await mockDirectory(page); await page.goto('./');
  await page.evaluate(async () => {
    const { newInspection, persistInspection } = await import('/src/model.ts');
    const { readAccounts } = await import('/src/accounts.ts');
    const account = readAccounts().find(item => item.id === 'demo-admin')!;
    const own = newInspection({ name: account.name, email: account.email, accountId: account.id });
    await persistInspection({ ...own, objective: 'Texto antiguo enviado.', updatedAt: '2099-11-11T15:00:00Z', delivery: { sentAt: '2026-11-01T15:00:00Z', recipientIds: ['demo-inspector'], revision: 3, corrections: {} } });
    await persistInspection({ ...newInspection({ name: 'Otra cuenta', email: 'otra@example.invalid', accountId: 'demo-inspector' }), objective: 'Texto ajeno recibido.', updatedAt: '2099-11-12T15:00:00Z', delivery: { sentAt: '2099-11-12T15:00:00Z', recipientIds: [account.id], revision: 1, corrections: {} } });
    await persistInspection({ ...newInspection({ name: account.name, email: account.email, accountId: account.id }), objective: 'Último texto propio guardado.', updatedAt: '2026-11-10T15:00:00Z' });
  });
  await page.reload(); await startNew(page); await expect(objective(page)).toHaveValue('Último texto propio guardado.');
  await objective(page).fill(''); await startNew(page); await expect(objective(page)).toHaveValue('');
});
