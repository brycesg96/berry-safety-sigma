import { test, expect } from './test-fixture';
import { mockSafety, enterSafety, safetyRow } from './safety-fixture';
import { selectValue } from './select-fixture';
import { expectAccessible } from './accessibility-fixture';
import type { SafetyKind } from '../src/safety-documents';

const batchId = (value: number) => `ee000000-0000-4000-8000-${String(value).padStart(12, '0')}`;
const fileId = (value: number) => `ef000000-0000-4000-8000-${String(value).padStart(12, '0')}`;
const file = (batch: number, index: number, kind: SafetyKind, title = 'Mantenimiento de Cortinas') => safetyRow({
  id: fileId(batch * 100 + index), batch_id: batchId(batch), owner_name: 'Juan Calaña', title, kind,
  file_name: `${kind.toLowerCase()}-${batch}-${index}.pdf`, created_at: new Date(Date.UTC(2026, 10, 23, 12, batch)).toISOString(),
});

for (const width of [1440, 375]) test(`una tarjeta reúne la persona, actividad y todos los tipos de un envío (${width}px)`, async ({ page, context }) => {
  const state = await mockSafety(context); await page.setViewportSize({ width, height: 950 }); await page.emulateMedia({ reducedMotion: 'reduce' });
  state.rows.push(file(1, 0, 'ATS'), file(1, 1, 'PETAR'), file(1, 2, 'CHECKLIST'), file(1, 3, 'ATS'));
  await enterSafety(page);
  const card = page.locator('.safety-submission'); await expect(card).toHaveCount(1);
  await expect(card.getByRole('heading', { name: 'Juan Calaña', exact: true })).toHaveCount(1);
  await expect(card).toContainText('Mantenimiento de Cortinas'); await expect(card).toContainText('4 archivos adjuntos');
  await expect(card.locator('.safety-submission-types')).toContainText('ATS2');
  await expect(card.locator('.safety-submission-types')).toContainText('PETAR'); await expect(card.locator('.safety-submission-types')).toContainText('Checklist');
  await expect(card.locator('.safety-document-row')).toHaveCount(4);
  const download = page.waitForEvent('download'); await card.getByRole('button', { name: 'Descargar petar-1-1.pdf', exact: true }).click(); expect((await download).suggestedFilename()).toBe('petar-1-1.pdf');
  await card.getByRole('button', { name: 'Ver archivo checklist-1-2.pdf', exact: true }).click(); await expect(page.getByRole('dialog')).toBeVisible(); await page.getByRole('button', { name: 'Cerrar', exact: true }).click();
  await expectAccessible(page); expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await card.screenshot({ path: test.info().outputPath(`envio-agrupado-${width}.png`), animations: 'disabled' });
});

test('la búsqueda por tipo muestra el envío completo y las páginas no cortan ni repiten sus cincuenta archivos', async ({ page, context }) => {
  const state = await mockSafety(context);
  for (let batch = 1; batch <= 21; batch++) {
    state.rows.push(file(batch, 0, 'ATS'));
    if (batch === 21) for (let index = 1; index < 50; index++) state.rows.push(file(batch, index, 'CHECKLIST'));
  }
  await enterSafety(page); await expect(page.locator('.safety-submission')).toHaveCount(20);
  const large = page.locator(`[data-submission-id="${batchId(21)}"]`); await expect(large.locator('.safety-document-row')).toHaveCount(50);
  await selectValue(page.getByRole('combobox', { name: 'Tipo', exact: true }), 'ATS');
  await expect(page.locator('.safety-submission')).toHaveCount(20); await expect(large.locator('.safety-document-row')).toHaveCount(50);
  await expect(large.locator('.safety-submission-types')).toContainText('Checklist49');
  await page.getByRole('button', { name: 'Siguiente', exact: true }).click(); await expect(page.locator('.safety-submission')).toHaveCount(1);
  await expect(page.locator('.safety-pagination')).toContainText('Página 2'); await expect(page.locator(`[data-submission-id="${batchId(1)}"]`)).toBeVisible();
  await expect(large).toHaveCount(0); await expect(page.getByRole('button', { name: 'Siguiente', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Anterior', exact: true }).click(); await expect(large.locator('.safety-document-row')).toHaveCount(50);
  expect(state.listQueries.some(query => new URLSearchParams(query).has('batch_id'))).toBe(true);
});

test('los trabajos distintos y los archivos antiguos sin identificador de envío no se fusionan por compartir nombre', async ({ page, context }) => {
  const state = await mockSafety(context);
  state.rows.push(file(1, 0, 'ATS', 'Cortinas'), file(1, 1, 'PETAR', 'Cortinas'), file(2, 0, 'ATS', 'Riego'), safetyRow({ id: fileId(80), owner_name: 'Juan Calaña' }), safetyRow({ id: fileId(81), owner_name: 'Juan Calaña' }));
  await enterSafety(page); await expect(page.locator('.safety-submission')).toHaveCount(4);
  await expect(page.locator(`[data-submission-id="${batchId(1)}"] .safety-document-row`)).toHaveCount(2);
  await expect(page.locator(`[data-submission-id="${batchId(2)}"]`)).toContainText('Riego');
});

test('si no se pueden leer todos los adjuntos no se presenta el envío como una tarjeta incompleta', async ({ page, context }) => {
  const state = await mockSafety(context); state.rows.push(file(1, 0, 'ATS'), file(1, 1, 'PETAR'));
  await enterSafety(page); state.failExpansion = true; await selectValue(page.getByRole('combobox', { name: 'Tipo', exact: true }), 'ATS');
  await expect(page.getByRole('alert')).toContainText('todos los archivos'); await expect(page.locator('.safety-submission')).toHaveCount(0);
  state.failExpansion = false; await page.getByRole('button', { name: 'Actualizar lista', exact: true }).click();
  await expect(page.locator('.safety-submission')).toHaveCount(1); await expect(page.locator('.safety-document-row')).toHaveCount(2);
});
