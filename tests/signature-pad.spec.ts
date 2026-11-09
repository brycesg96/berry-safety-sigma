import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import ExcelJS from 'exceljs';
import JSZip from 'jszip';

async function openSignatureStep(page: Page) {
  await page.route('**/api/people?*', route => route.fulfill({ json: { people: [] } }));
  await page.route('**/api/inspections/send', route => route.fulfill({ json: { ok: true, defaults: null } }));
  await page.goto('./');
  await expect(page.getByRole('button', { name: 'Continuar', exact: true })).toBeEnabled();
  await page.evaluate(async () => {
    const { newInspection, newObservation, persistInspection } = await import('/src/model.ts');
    const draft = newInspection({ name: 'Inspectora de prueba', email: 'bryx.96@gmail.com', accountId: 'demo-admin' });
    await persistInspection({ ...draft, area: 'Firma de prueba', date: '2026-11-08', inspectionTime: '09:30', inspectionPeriod: 'AM', type: 'Planeada', objective: 'Verificar las condiciones.', responsibles: [{ id: 'recipient', personId: 'demo-inspector', name: 'Responsable', email: 'bcespedes@hortifrut.com' }], observations: [{ ...newObservation(), description: 'Hallazgo de prueba', correctiveAction: 'Aplicar la medida.', dueDate: '2026-11-10' }], closingRemarks: 'Verificar la corrección.', step: 3 });
  });
  await page.reload();
  await page.getByRole('button', { name: 'Firmar en pantalla', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Registrar firma', exact: true })).toBeVisible();
}
async function mouseStroke(page: Page) {
  const box = (await page.getByLabel('Área para registrar la firma').boundingBox())!;
  await page.mouse.move(box.x + 25, box.y + 80); await page.mouse.down();
  await page.mouse.move(box.x + 65, box.y + 25, { steps: 8 }); await page.mouse.move(box.x + 95, box.y + 100, { steps: 8 }); await page.mouse.move(box.x + 210, box.y + 40, { steps: 12 }); await page.mouse.up();
}
test('firma con mouse: deshacer, limpiar, guardar con transparencia y conservar en el borrador y Excel', async ({ page }) => {
  await openSignatureStep(page);
  const save = page.getByRole('button', { name: 'Guardar firma', exact: true });
  await expect(save).toBeDisabled();
  await mouseStroke(page); await expect(save).toBeEnabled();
  await page.getByRole('button', { name: 'Deshacer', exact: true }).click(); await expect(save).toBeDisabled();
  await mouseStroke(page); await page.getByRole('button', { name: 'Limpiar', exact: true }).click(); await expect(save).toBeDisabled();
  await mouseStroke(page); await save.click();
  await expect(page.getByRole('dialog', { name: 'Registrar firma' })).toHaveCount(0);
  await expect(page.locator('.signature-preview img')).toBeVisible();
  const preview = (await page.locator('.signature-preview').boundingBox())!, imagePreview = (await page.locator('.signature-preview img').boundingBox())!;
  expect(preview.width).toBeLessThanOrEqual(280);
  expect(Math.abs(imagePreview.x + imagePreview.width / 2 - preview.x - preview.width / 2)).toBeLessThan(2);
  await page.screenshot({ path: test.info().outputPath('firma-compacta.png') });
  expect(await page.evaluate(async () => {
    const { loadInspections } = await import('/src/model.ts');
    return !!(await loadInspections()).find(item => item.area === 'Firma de prueba')?.registrationDetails?.['demo-admin']?.signature;
  })).toBe(false);
  await page.getByRole('button', { name: 'Guardar', exact: true }).first().click();
  await expect.poll(() => page.evaluate(async () => {
    const { loadInspections } = await import('/src/model.ts');
    return !!(await loadInspections()).find(item => item.area === 'Firma de prueba')?.registrationDetails?.['demo-admin']?.signature;
  })).toBe(true);
  const generated = await page.evaluate(async () => {
    const { loadInspections } = await import('/src/model.ts'); const { buildExcel } = await import('/src/export.ts');
    const draft = (await loadInspections()).find(item => item.area === 'Firma de prueba')!;
    const image = new Image(); image.src = draft.registrationDetails['demo-admin'].signature!.data; await image.decode();
    const canvas = document.createElement('canvas'); canvas.width = image.width; canvas.height = image.height;
    const context = canvas.getContext('2d')!; context.drawImage(image, 0, 0);
    const bytes = (await buildExcel(draft)).bytes; let binary = '';
    for (let i = 0; i < bytes.length; i += 32768) binary += String.fromCharCode(...bytes.subarray(i, i + 32768));
    return { alpha: context.getImageData(0, 0, 1, 1).data[3], base64: btoa(binary) };
  });
  expect(generated.alpha).toBe(0);
  const bytes = Buffer.from(generated.base64, 'base64'), book = new ExcelJS.Workbook(); await book.xlsx.load(bytes as any);
  const sheet = book.getWorksheet('V.01')!;
  const signature = sheet.getImages().find(image => image.range.tl.nativeRow === 33)!;
  expect(signature).toBeTruthy(); expect(signature.range.ext!.height).toBeGreaterThan(45);
  expect(sheet.getRow(34).height).toBeCloseTo(105.3, 3);
  for (const row of [35,36]) expect(sheet.getRow(row).height).toBeCloseTo(35.1, 3);
  const zip = await JSZip.loadAsync(bytes); const drawing = await zip.file('xl/drawings/drawing1.xml')!.async('string');
  expect(drawing).toContain('oneCellAnchor'); expect(drawing).toContain('name="Firma"');
  page.once('dialog', dialog => dialog.accept()); await page.reload();
  await expect(page.locator('.signature-preview img')).toBeVisible();
});

test.describe('firma táctil', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  test('el dedo registra la firma sin desplazar la página y permite guardarla en el teléfono', async ({ page, context }) => {
    await openSignatureStep(page);
    const box = (await page.getByLabel('Área para registrar la firma').boundingBox())!;
    const scroll = await page.evaluate(() => scrollY), session = await context.newCDPSession(page);
    await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: box.x + 20, y: box.y + 55, id: 1 }] });
    for (const [x, y] of [[50,20],[85,75],[130,30],[box.width - 20,55]]) await session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: box.x + x, y: box.y + y, id: 1 }] });
    await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    expect(await page.evaluate(() => scrollY)).toBe(scroll);
    await page.getByRole('button', { name: 'Guardar firma', exact: true }).click();
    await expect(page.locator('.signature-preview img')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: test.info().outputPath('firma-telefono.png') });
  });
});
