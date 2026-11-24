import { openWorkspaceProfile } from './workspace-profile-fixture';
import { selectSecondResponsible } from './responsible-fixture';
import { selectValue } from './select-fixture';
import { saveAndOpenList } from './save-fixture';
import { selectLocation } from './location-fixture';
import { test, expect, type Page } from './test-fixture';
import { mockDirectory } from './directory-fixture';
import { completeInspectionCause, NO_UNFAVORABLE_RESULTS } from '../src/registration';
import { hasInspectionContent, newInspection, validateStep } from '../src/model';

const objective = (page: Page) => page.getByRole('textbox', { name: 'Objetivo de la inspección interna', exact: true });
const cause = (page: Page) => page.getByRole('textbox', { name: 'Descripción de la Causa ante Resultados Desfavorables de la Inspección', exact: true });
const remarks = (page: Page) => page.getByRole('textbox', { name: 'Conclusiones y Recomendaciones', exact: true });
async function closing(page: Page) {
  await selectLocation(page, 'Sede', 'Fundo'); await selectLocation(page, 'Zona de inspección', 'Armonía II');
  await page.getByLabel('Hora de inspección').fill('07:30'); await selectValue(page.getByLabel('AM o PM'), 'AM');
  await page.getByRole('radio', { name: 'Planeada', exact: true }).check();
  await page.getByRole('combobox', { name: /Nombre completo/ }).first().fill('Ana'); await page.getByRole('option', { name: /Ana Torres/ }).click();
  await selectSecondResponsible(page);
  await page.getByRole('button', { name: 'Continuar', exact: true }).click(); await page.getByRole('button', { name: 'Añadir observación', exact: true }).click();
  await page.getByRole('textbox', { name: 'Descripción', exact: true }).fill('Hallazgo.'); await page.getByLabel('Acción a tomar').fill('Corregir.'); await page.getByLabel('Fecha de Cierre').fill('2026-12-01');
  await page.getByRole('button', { name: 'Continuar', exact: true }).click(); await page.getByRole('button', { name: 'Continuar', exact: true }).click();
}
async function startNew(page: Page) {
  await saveAndOpenList(page);
  const menu = page.getByRole('button', { name: 'Abrir menú', exact: true });
  if (await menu.isVisible()) await menu.click();
  await page.locator('.sidebar-nav').getByRole('button', { name: 'Nueva inspección', exact: true }).click();
}
async function switchTo(page: Page, account: string) {
  await openWorkspaceProfile(page); await selectValue(page.getByLabel('Cuenta de prueba'), account);
  await page.getByRole('button', { name: 'Cerrar ventana', exact: true }).click();
}

test('la causa vacía usa No aplica sin crear una inspección solo por ese texto y conserva las causas escritas', () => {
  const draft = newInspection({ name: 'Inspectora', email: 'prueba@example.invalid' });
  expect(hasInspectionContent(completeInspectionCause(draft))).toBe(false);
  const previousDefault = newInspection({ name: 'Inspectora', email: 'prueba@example.invalid' }, { objective: '', closingRemarks: '', unfavorableCause: NO_UNFAVORABLE_RESULTS });
  expect(previousDefault.unfavorableCause).toBe('');
  expect(previousDefault.initialReportTexts?.unfavorableCause).toBe('');
  expect(hasInspectionContent(completeInspectionCause({ ...previousDefault, unfavorableCause: '' }))).toBe(false);
  expect(completeInspectionCause({ ...draft, unfavorableCause: '  \n ' }).unfavorableCause).toBe(NO_UNFAVORABLE_RESULTS);
  expect(completeInspectionCause({ ...draft, unfavorableCause: 'Falta de mantenimiento.' }).unfavorableCause).toBe('Falta de mantenimiento.');
  expect(validateStep({ ...draft, unfavorableCause: '  ' }, 3)).toHaveProperty('unfavorableCause');
  expect(validateStep(completeInspectionCause(draft), 3)).not.toHaveProperty('unfavorableCause');
});

for (const width of [1366, 390]) test(`cada inspección empieza sin causa, Guardar al inicio no la rellena y salir del cuadro vacío usa No aplica (${width}px)`, async ({ page }) => {
  await page.setViewportSize({ width, height: 900 }); await mockDirectory(page); await page.goto('./');
  await objective(page).fill('Verificar las condiciones.');
  await page.getByRole('button', { name: 'Guardar', exact: true }).click();
  await expect(page.getByText('Guardado en este navegador', { exact: true })).toBeAttached();
  await page.reload(); await closing(page);
  await expect(cause(page)).toHaveAttribute('aria-required', 'true');
  await expect(cause(page)).toHaveValue('');
  await expect(cause(page)).toHaveAttribute('placeholder', /Debes consignar el origen o motivo raíz[\s\S]*\n\nSi no hubo hallazgos desfavorables, indica únicamente: No aplica \(sin resultados desfavorables\)\./);
  await expect(remarks(page)).toHaveAttribute('placeholder', 'Lo que describas en las causas debe tener una solución directa y clara.\nPor ejemplo, si la causa fue falta de capacitación, la recomendación debe ser programar capacitación.');
  for (const [index, field] of [cause(page), remarks(page)].entries()) {
    await field.scrollIntoViewIfNeeded();
    expect(await field.evaluate(el => el.scrollHeight <= el.clientHeight)).toBe(true);
    await field.screenshot({ path: test.info().outputPath(`indicaciones-${index === 0 ? 'causa' : 'conclusiones'}-${width}.png`) });
    await field.focus();
    expect(await field.evaluate(el => getComputedStyle(el, '::placeholder').opacity)).toBe('0');
  }
  await cause(page).fill('Causa propia guardada.'); await remarks(page).fill('Revisar las medidas.');
  await page.getByRole('button', { name: 'Guardar', exact: true }).click();
  await expect(page.getByText('Guardado en este navegador', { exact: true })).toBeAttached();
  await page.reload(); await expect(cause(page)).toHaveValue('Causa propia guardada.');
  const readCause = () => page.evaluate(async () => { const { loadInspections } = await import('/src/model.ts'); return (await loadInspections()).find(item => item.ownerId === 'demo-admin')?.unfavorableCause; });
  await cause(page).fill(''); await expect(cause(page)).toHaveValue(''); await remarks(page).focus();
  await expect(cause(page)).toHaveValue(NO_UNFAVORABLE_RESULTS); expect(await readCause()).toBe('Causa propia guardada.');
  // Replacement remains possible without the default interrupting typing.
  await cause(page).fill('Motivo reemplazado.'); await remarks(page).focus(); await expect(cause(page)).toHaveValue('Motivo reemplazado.');
  await cause(page).fill('  \n '); await remarks(page).focus(); await expect(cause(page)).toHaveValue(NO_UNFAVORABLE_RESULTS);
  await page.getByRole('button', { name: 'Guardar', exact: true }).click(); await expect(page.getByText('Guardado en este navegador', { exact: true })).toBeAttached(); expect(await readCause()).toBe(NO_UNFAVORABLE_RESULTS);
  await page.locator('.closing-entry').first().screenshot({ path: test.info().outputPath(`sin-resultados-${width}.png`) });
  await page.locator('.closing-entry').nth(1).screenshot({ path: test.info().outputPath(`guia-recomendaciones-${width}.png`) });
  await cause(page).fill('Causa recordada de la cuenta.'); await startNew(page); await closing(page);
  await expect(cause(page)).toHaveValue(''); await cause(page).focus(); await remarks(page).focus(); await expect(cause(page)).toHaveValue(NO_UNFAVORABLE_RESULTS);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

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
