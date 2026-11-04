import { test, expect } from '@playwright/test';
import { mockDirectory, people } from './directory-fixture';

test('empleador fijo, tres tipos, Otro con detalle y máximo 560', async ({ page }) => {
  await mockDirectory(page); await page.goto('./');
  const employer = page.getByRole('region', { name: 'Datos del empleador' });
  await expect(employer.locator('input,textarea,select,[contenteditable=true]')).toHaveCount(0);
  for (const text of ['HORTIFRUT PERÚ S.A.C.', '20602822533', '> 500', 'CIIU: 0125']) await expect(employer).toContainText(text);
  await expect(page.getByLabel('Código de inspección')).toHaveAttribute('readonly', '');
  await expect(employer.getByText('Solo lectura')).toHaveCount(0);
  await expect(employer.locator('svg')).toHaveCount(0);
  await page.getByLabel('Área inspeccionada').fill('Taller');
  await page.getByLabel('Hora de inspección').fill('08:40');
  await page.getByLabel('Responsable de la inspección').fill('Brian Torres');
  const objective = page.getByLabel('Objetivo de la inspección');
  await expect(objective).toHaveAttribute('maxlength', '560');
  expect((await objective.boundingBox())!.height).toBeLessThanOrEqual(60);
  await expect(page.getByText('Se completa automáticamente al seleccionar a la persona.', { exact: true })).toHaveCount(0);
  await objective.fill('a'.repeat(560)); await objective.press('End'); await objective.press('b');
  await expect(objective).toHaveValue('a'.repeat(560));
  await expect(page.locator('.character-count')).toHaveText('560 / 560');
  await page.getByRole('combobox').fill('Ana'); await page.getByRole('option', { name: /Ana Torres/ }).click();
  await page.getByRole('radio', { name: 'Otro', exact: true }).check();
  await page.getByRole('button', { name: 'Continuar', exact: true }).click();
  await expect(page.getByText('Detalla el otro tipo de inspección.')).toBeVisible();
  await page.getByLabel('Detalle de otro tipo de inspección').fill('Verificación extraordinaria');
  await page.getByRole('radio', { name: 'Planeada', exact: true }).check();
  await expect(page.getByLabel('Detalle de otro tipo de inspección')).toHaveCount(0);
  await page.getByRole('radio', { name: 'No planeada', exact: true }).check();
  await expect(page.getByRole('radio', { name: 'Planeada', exact: true })).not.toBeChecked();
  await page.getByRole('radio', { name: 'Otro', exact: true }).check();
  await expect(page.getByLabel('Detalle de otro tipo de inspección')).toHaveValue('Verificación extraordinaria');
  await expect(page.getByText('Guardado en este navegador', { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('radio', { name: 'Otro', exact: true })).toBeChecked();
  await expect(page.getByRole('combobox')).toHaveValue('Ana Torres');
  await expect(page.getByLabel('Correo electrónico')).toHaveValue('ana@example.com');
  await page.getByRole('button', { name: 'Continuar', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Registro de observaciones' })).toBeVisible();
});

test('selección por teclado, homónimos, correo automático y limpieza al cambiar el nombre', async ({ page }) => {
  await page.route('**/api/people?*', route => route.fulfill({ json: { people: [people[0], { id: 'ana-2', name: 'Ana Torres', email: 'otra.ana@example.com' }] } }));
  await page.goto('./');
  const input = page.getByRole('combobox'), email = page.getByLabel('Correo electrónico');
  await expect(email).toHaveAttribute('readonly', '');
  await input.fill('Ana'); await expect(page.getByRole('option')).toHaveCount(2);
  await input.press('ArrowDown'); await input.press('ArrowDown'); await input.press('Enter');
  await expect(email).toHaveValue('otra.ana@example.com');
  await expect(input).toHaveValue('Ana Torres');
  await input.fill('José'); await expect(email).toHaveValue('');
  await expect(input).toHaveAttribute('aria-expanded', 'true');
});

test('directorio vacío o caído no permite inventar un destinatario', async ({ page }) => {
  await page.route('**/api/people?*', route => route.fulfill({ json: { people: [] } }));
  await page.goto('./'); await page.getByRole('combobox').fill('Persona');
  await expect(page.getByText('No hay personas disponibles con ese nombre.')).toBeVisible();
  await page.unroute('**/api/people?*');
  await page.route('**/api/people?*', route => route.fulfill({ status: 503, body: 'Unavailable' }));
  await page.getByRole('combobox').fill('Ana');
  await expect(page.getByText('No se pudo consultar el directorio.')).toBeVisible();
  await page.unroute('**/api/people?*'); await mockDirectory(page);
  await page.getByRole('button', { name: 'Reintentar' }).click();
  await page.getByRole('option', { name: /Ana Torres/ }).click();
  await expect(page.getByLabel('Correo electrónico')).toHaveValue('ana@example.com');
});

test('borrador anterior conserva el objetivo largo y solicita corregirlo', async ({ page }) => {
  await page.goto('./');
  await expect(page.getByText('Guardado en este navegador', { exact: true })).toBeVisible();
  await page.evaluate(async () => {
    const request = indexedDB.open('berry-safety', 1);
    const db = await new Promise<IDBDatabase>((resolve, reject) => { request.onsuccess = () => resolve(request.result); request.onerror = reject; });
    const tx = db.transaction('inspections', 'readwrite'); const store = tx.objectStore('inspections');
    store.put({ id: 'legacy-objective', company: 'Empresa anterior', ruc: '', facility: 'Sede anterior', area: 'Taller', type: 'Instalaciones', date: '2026-11-03', objective: 'a'.repeat(800), responsibles: [], observations: [], noFindings: false, conclusions: '', recommendations: '', inspector: 'Brian', inspectorEmail: '', step: 0, updatedAt: '2099-01-01T00:00:00Z', status: 'draft' });
    await new Promise<void>((resolve, reject) => { tx.oncomplete = () => resolve(); tx.onerror = reject; tx.onabort = reject; }); db.close();
  });
  await page.reload();
  await expect(page.getByLabel('Objetivo de la inspección')).toHaveValue('a'.repeat(800));
  await page.getByRole('button', { name: 'Continuar', exact: true }).click();
  await expect(page.getByText('El objetivo debe tener como máximo 560 caracteres.')).toBeVisible();
  await expect(page.getByRole('radio', { checked: true })).toHaveCount(0);
});
