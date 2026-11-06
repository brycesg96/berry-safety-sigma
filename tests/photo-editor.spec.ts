import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import ExcelJS from 'exceljs';
import { mockDirectory } from './directory-fixture';

async function prepareEditor(page: Page) {
  await mockDirectory(page); await page.goto('./');
  await page.getByLabel('Área inspeccionada').fill('Taller - Armonía 2');
  await page.getByLabel('Hora de inspección').fill('07:30'); await page.getByLabel('AM o PM').selectOption('AM');
  await page.getByRole('radio', { name: 'Planeada', exact: true }).check();
  await page.getByRole('textbox', { name: 'Objetivo de la inspección interna', exact: true }).fill('Verificar seguridad.');
  await page.getByRole('combobox', { name: /Nombre completo/ }).fill('Ana');
  await page.getByRole('listbox').getByRole('option', { name: /Ana Torres/ }).click();
  await page.getByRole('button', { name: 'Continuar', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'RESULTADO DE LA INSPECCIÓN', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Añadir observación', exact: true }).click();
  await page.getByRole('textbox', { name: 'Descripción', exact: true }).fill('Zona que requiere señalización.');
  await page.getByRole('textbox', { name: 'Acción a tomar', exact: true }).fill('Instalar la señalización.');
  await expect(page.getByRole('group', { name: /Nivel de riesgo/ })).toBeVisible();
  await page.getByLabel('Fecha de Cierre').fill('2026-11-15');
  const data = await page.evaluate(() => {
    const canvas = document.createElement('canvas'); canvas.width = 600; canvas.height = 400;
    const ctx = canvas.getContext('2d')!; ctx.fillStyle = '#dfe8ef'; ctx.fillRect(0, 0, 600, 400);
    ctx.fillStyle = '#7b9c78'; ctx.fillRect(100, 100, 150, 150); ctx.fillStyle = '#6888a4'; ctx.fillRect(350, 80, 150, 200);
    return canvas.toDataURL('image/png').split(',')[1];
  });
  await page.getByLabel('Añadir fotos a observación 1').setInputFiles({ name: 'evidencia.png', mimeType: 'image/png', buffer: Buffer.from(data, 'base64') });
  await expect(page.locator('.photo-thumb')).toHaveCount(1);
  await page.getByRole('button', { name: 'Ver foto 1 de observación 1', exact: true }).click();
  const editButton = (await page.getByRole('button', { name: 'Editar imagen', exact: true }).boundingBox())!;
  const stage = (await page.locator('.photo-viewer-stage').boundingBox())!;
  expect(editButton.y).toBeGreaterThanOrEqual(stage.y);
  expect(editButton.y + editButton.height).toBeLessThanOrEqual(stage.y + stage.height);
  expect(editButton.x + editButton.width).toBeLessThanOrEqual(stage.x + stage.width);
  await page.getByRole('dialog').screenshot({ path: 'test-results/photo-viewer-compact.png' });
  await page.getByRole('button', { name: 'Editar imagen', exact: true }).click();
  await expect(page.getByRole('img', { name: 'Lienzo de edición', exact: true })).toBeVisible();
}
async function draw(page: Page, x1: number, y1: number, x2: number, y2: number) {
  const b = (await page.getByRole('img', { name: 'Lienzo de edición', exact: true }).boundingBox())!;
  await page.mouse.move(b.x + b.width * x1, b.y + b.height * y1); await page.mouse.down();
  await page.mouse.move(b.x + b.width * x2, b.y + b.height * y2, { steps: 8 }); await page.mouse.up();
}
async function storedPhoto(page: Page) {
  return page.evaluate(async () => {
    const req = indexedDB.open('berry-safety', 1); const db = await new Promise<IDBDatabase>(resolve => { req.onsuccess = () => resolve(req.result); });
    const result = await new Promise<any>(resolve => { const reqAll = db.transaction('inspections', 'readonly').objectStore('inspections').getAll(); reqAll.onsuccess = () => resolve(reqAll.result.find(d => d.area === 'Taller - Armonía 2').observations[0].photos[0]); }); db.close(); return result;
  });
}
test('edición con color, grosor, tamaño, recorte, persistencia y exportación de la imagen final', async ({ page }) => {
  test.setTimeout(60000); const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  await prepareEditor(page);
  await page.getByRole('button', { name: 'Círculo', exact: true }).click(); await draw(page, .2, .2, .5, .55);
  const circle = page.locator('[data-shape-type=circle]'); await expect(circle).toHaveCount(1);
  await page.getByLabel('Color de la marca').fill('#16a34a');
  await page.getByLabel('Grosor de la marca').press('End');
  await expect(circle).toHaveAttribute('stroke', '#16a34a'); await expect(circle).toHaveAttribute('stroke-width', '16');
  const previousRadius = Number(await circle.getAttribute('rx'));
  await page.getByRole('button', { name: 'Ampliar figura', exact: true }).click();
  expect(Number(await circle.getAttribute('rx'))).toBeGreaterThan(previousRadius);
  await page.getByRole('button', { name: 'Reducir figura', exact: true }).click();
  const handle = (await page.locator('[data-handle=end]').boundingBox())!, canvas = (await page.getByRole('img', { name: 'Lienzo de edición' }).boundingBox())!;
  await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2); await page.mouse.down(); await page.mouse.move(canvas.x + canvas.width * .6, canvas.y + canvas.height * .65); await page.mouse.up();
  const afterHandle = Number(await circle.getAttribute('rx')); expect(afterHandle).toBeGreaterThan(previousRadius);
  await page.getByRole('button', { name: 'Flecha', exact: true }).click(); await draw(page, .65, .25, .8, .5);
  await expect(page.locator('[data-shape-type=arrow]')).toHaveCount(1);
  await page.getByLabel('Color de la marca').fill('#dc2626');
  await page.getByRole('button', { name: 'Recortar', exact: true }).click(); await draw(page, .1, .1, .9, .9);
  await page.getByRole('button', { name: 'Aplicar recorte', exact: true }).click();
  await page.getByRole('dialog').screenshot({ path: 'test-results/photo-editor-desktop.png' });
  await page.getByRole('button', { name: 'Guardar cambios', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Editar imagen', exact: true })).toBeVisible();
  const saved = await storedPhoto(page);
  expect(saved.originalData).toBeTruthy(); expect(saved.editState.shapes).toHaveLength(2);
  expect(Math.round(saved.editState.crop.width)).toBeCloseTo(480, 0); expect(Math.round(saved.editState.crop.height)).toBeCloseTo(320, 0);
  expect(saved.data).not.toBe(saved.originalData);
  const dimensions = await page.locator('.photo-full').evaluate((img: HTMLImageElement) => ({ width: img.naturalWidth, height: img.naturalHeight })); expect(dimensions).toEqual({ width: 480, height: 320 });
  await page.getByRole('button', { name: 'Cerrar ventana', exact: true }).click(); await page.reload();
  await page.getByRole('button', { name: 'Ver foto 1 de observación 1', exact: true }).click(); await page.getByRole('button', { name: 'Editar imagen', exact: true }).click();
  await expect(page.locator('[data-shape-type]')).toHaveCount(2);
  await page.getByRole('button', { name: 'Restaurar original', exact: true }).click(); await expect(page.locator('[data-shape-type]')).toHaveCount(0);
  await page.getByRole('button', { name: 'Cancelar edición', exact: true }).click(); expect((await storedPhoto(page)).data).toBe(saved.data);
  await page.getByRole('button', { name: 'Cerrar ventana', exact: true }).click();
  await page.getByRole('button', { name: 'Continuar', exact: true }).click(); await page.getByRole('button', { name: 'Continuar', exact: true }).click();
  await page.getByRole('textbox', { name: 'CONCLUSIONES Y RECOMENDACIONES', exact: true }).fill('Reforzar la señalización.');
  await page.getByRole('button', { name: 'Continuar', exact: true }).click();
  const event = page.waitForEvent('download'); await page.getByRole('button', { name: 'Descargar Excel', exact: true }).click();
  const book = new ExcelJS.Workbook(); await book.xlsx.readFile((await (await event).path())!);
  const media = book.model.media!; expect(media).toHaveLength(2);
  const exported = Buffer.from(media.find(image => image.extension === 'jpeg')!.buffer!).toString('base64');
  const difference = await page.evaluate(async ({ exported, edited, original }) => {
    async function pixels(source: string) {
      const image = new Image(); image.src = source; await image.decode();
      const canvas = document.createElement('canvas'); canvas.width = canvas.height = 64;
      const ctx = canvas.getContext('2d')!; ctx.drawImage(image, 0, 0, 64, 64);
      return ctx.getImageData(0, 0, 64, 64).data;
    }
    const [actual, final, raw] = await Promise.all([pixels(`data:image/jpeg;base64,${exported}`), pixels(edited), pixels(original)]);
    const distance = (other: Uint8ClampedArray) => actual.reduce((sum, value, i) => sum + Math.abs(value - other[i]), 0) / actual.length;
    return { edited: distance(final), original: distance(raw) };
  }, { exported, edited: saved.data, original: saved.originalData });
  expect(difference.edited).toBeLessThan(8);
  expect(difference.original).toBeGreaterThan(difference.edited + 2);
  expect(errors).toEqual([]);
});

test.describe('uso táctil', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });
  test('dibujar, deshacer y guardar con el dedo sin desbordamiento', async ({ page }) => {
    await prepareEditor(page);
    await page.getByRole('button', { name: 'Círculo', exact: true }).tap();
    const b = (await page.getByRole('img', { name: 'Lienzo de edición' }).boundingBox())!, cdp = await page.context().newCDPSession(page);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: b.x + b.width * .2, y: b.y + b.height * .2 }] });
    for (let i = 1; i <= 5; i++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: b.x + b.width * (.2 + i * .06), y: b.y + b.height * (.2 + i * .06) }] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await expect(page.locator('[data-shape-type=circle]')).toHaveCount(1);
    await page.getByRole('button', { name: 'Deshacer', exact: true }).tap(); await expect(page.locator('[data-shape-type]')).toHaveCount(0);
    await page.getByRole('button', { name: 'Flecha', exact: true }).tap(); await draw(page, .2, .2, .75, .65);
    await expect(page.locator('[data-shape-type=arrow]')).toHaveCount(1);
    await page.getByRole('button', { name: 'Ampliar figura', exact: true }).tap();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.getByRole('dialog').screenshot({ path: 'test-results/photo-editor-mobile.png' });
    await page.getByRole('button', { name: 'Guardar cambios', exact: true }).tap();
    expect((await storedPhoto(page)).editState.shapes).toHaveLength(1);
  });
});
