import { test, expect } from '@playwright/test';
import ExcelJS from 'exceljs';
import { mockDirectory } from './directory-fixture';
import { migrateInspectionTime, validInspectionTime } from '../src/inspection-time';
import { confirmedInspectionCode } from '../src/inspection-code';

test('hora de 12 horas y migración de borradores sin adivinar AM/PM nuevos', () => {
  expect(migrateInspectionTime('00:05')).toEqual({ inspectionTime: '12:05', inspectionPeriod: 'AM' });
  expect(migrateInspectionTime('12:00')).toEqual({ inspectionTime: '12:00', inspectionPeriod: 'PM' });
  expect(migrateInspectionTime('23:59')).toEqual({ inspectionTime: '11:59', inspectionPeriod: 'PM' });
  expect(migrateInspectionTime('07:30', '')).toEqual({ inspectionTime: '07:30', inspectionPeriod: '' });
  for (const time of ['00:30', '13:00', '12:60', '24:00', '7:3']) expect(validInspectionTime(time)).toBe(false);
  for (const time of ['12:00', '01:00', '7:30', '11:59']) expect(validInspectionTime(time)).toBe(true);
  expect(confirmedInspectionCode({ id: 'one', serverRegistration: { inspectionId: 'other', code: 'IH-2026-001', acceptedAt: '2026-11-04T13:00:00Z' } })).toBeNull();
  expect(confirmedInspectionCode({ id: 'one', serverRegistration: { inspectionId: 'one', code: 'IH-2026-008', acceptedAt: '2026-11-04T13:00:00Z' } })).toBe('IH-2026-008');
});

test('ubicación en el ejemplo, AM/PM requerido y conservación en revisión, recarga y Excel', async ({ page }) => {
  await mockDirectory(page); await page.goto('./');
  await expect(page.getByLabel('Área inspeccionada')).toHaveAttribute('placeholder', 'Ej. Taller de Maquinaria - Armonía 2');
  await expect(page.getByLabel('Hora de inspección')).toHaveValue('');
  await expect(page.getByLabel('AM o PM')).toHaveValue('');
  await expect(page.getByRole('textbox', { name: 'Código de inspección', exact: true })).toHaveValue(/^IH-\d{4}-001$/);
  await expect(page.getByRole('tooltip')).toBeHidden();
  await page.getByRole('button', { name: 'Información del código de inspección', exact: true }).hover();
  await expect(page.getByRole('tooltip')).toContainText('El código definitivo aparecerá en Mis inspecciones');
  await page.getByLabel('Área inspeccionada').click();
  await page.getByLabel('Área inspeccionada').fill('Taller de Maquinaria - Armonía 2');
  await page.getByRole('textbox', { name: 'Objetivo de la inspección interna', exact: true }).fill('Verificar las condiciones de maquinaria.');
  await page.getByRole('combobox', { name: /Nombre completo/ }).fill('Ana');
  await page.getByRole('listbox').getByRole('option', { name: /Ana Torres/ }).click();
  await page.getByRole('button', { name: 'Continuar', exact: true }).click();
  await expect(page.getByText('Completa la hora de inspección.')).toBeVisible();
  await page.getByLabel('Hora de inspección').fill('07:30');
  await page.getByRole('button', { name: 'Continuar', exact: true }).click();
  await expect(page.getByText('Selecciona AM o PM.')).toBeVisible();
  await page.getByLabel('AM o PM').selectOption('PM');
  await page.getByLabel('Hora de inspección').fill('13:00');
  await page.getByRole('button', { name: 'Continuar', exact: true }).click();
  await expect(page.getByText('Escribe una hora entre 01:00 y 12:59 (hh:mm).')).toBeVisible();
  await page.getByLabel('Hora de inspección').fill('07:30');
  await page.getByRole('radio', { name: 'Planeada', exact: true }).check();
  await page.getByRole('button', { name: 'Guardar y salir' }).click();
  await page.reload();
  await expect(page.getByLabel('AM o PM')).toHaveValue('PM');
  await page.getByRole('button', { name: 'Continuar', exact: true }).click();
  await page.getByRole('button', { name: 'Añadir observación', exact: true }).click();
  await page.getByLabel('Descripción de la observación').fill('Falta señalización.');
  await page.getByLabel('Medida correctiva').fill('Instalar señalización.');
  await page.getByLabel('Fecha de Cierre').fill('2026-11-06');
  await page.getByRole('button', { name: 'Continuar', exact: true }).click();
  await page.getByRole('button', { name: 'Continuar', exact: true }).click();
  await page.getByRole('textbox', { name: 'CONCLUSIONES Y RECOMENDACIONES', exact: true }).fill('Sin observaciones.');
  await page.getByRole('textbox', { name: 'DESCRIPCIÓN DE LA CAUSA ANTE RESULTADOS DESFAVORABLES DE LA INSPECCIÓN', exact: true }).fill('Mantener los controles.');
  await page.getByRole('button', { name: 'Continuar', exact: true }).click();
  await expect(page.getByText(/07:30 PM/)).toBeVisible();
  const event = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Descargar Excel', exact: true }).click();
  const book = new ExcelJS.Workbook(); await book.xlsx.readFile((await (await event).path())!);
  expect(JSON.stringify(book.getWorksheet('Inspección SST')!.getSheetValues())).toContain('07:30 PM');
});

test('Mis inspecciones distingue un código tentativo de un recibo definitivo', async ({ page }) => {
  await page.goto('./');
  await page.getByLabel('Área inspeccionada').fill('Registro confirmado de prueba');
  await page.getByRole('button', { name: 'Guardar y salir' }).click();
  await expect(page.getByText('Código definitivo: pendiente de envío')).toBeVisible();
  await page.evaluate(async () => {
    const request = indexedDB.open('berry-safety', 1);
    const db = await new Promise<IDBDatabase>((resolve, reject) => { request.onsuccess = () => resolve(request.result); request.onerror = reject; });
    const tx = db.transaction('inspections', 'readwrite'); const store = tx.objectStore('inspections');
    const requestAll = store.getAll(); requestAll.onsuccess = () => {
      const draft = requestAll.result.find(d => d.area === 'Registro confirmado de prueba');
      store.put({ ...draft, serverRegistration: { inspectionId: draft.id, code: 'IH-2026-008', acceptedAt: '2026-11-04T13:00:00Z' } });
    };
    await new Promise<void>((resolve, reject) => { tx.oncomplete = () => resolve(); tx.onerror = reject; tx.onabort = reject; }); db.close();
  });
  await page.reload(); await page.getByRole('button', { name: 'Guardar y salir' }).click();
  await expect(page.getByText('Código definitivo: IH-2026-008')).toBeVisible();
});
