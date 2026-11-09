import { selectLocation } from './location-fixture';
import { test, expect } from '@playwright/test';
import { mockDirectory, people } from './directory-fixture';

test('empleador fijo, tres tipos, Otro con detalle y máximo 560', async ({ page }) => {
  await mockDirectory(page); await page.goto('./');
  const disclosure = page.locator('.employer-disclosure');
  await expect(disclosure).not.toHaveAttribute('open', '');
  await disclosure.locator('summary').click();
  const employer = page.getByRole('region', { name: 'Datos del empleador' });
  await expect(employer.locator('input,textarea,select,[contenteditable=true]')).toHaveCount(0);
  for (const text of ['HORTIFRUT PERÚ S.A.C.', '20602822533', '> 500', 'CIIU: 0125']) await expect(employer).toContainText(text);
  await expect(page.getByRole('textbox', { name: 'Código de inspección', exact: true })).toHaveAttribute('readonly', '');
  await expect(employer.getByText('Solo lectura')).toHaveCount(0);
  await expect(employer.locator('svg')).toHaveCount(0);
  await page.getByLabel('Área inspeccionada').fill('Taller');
  await selectLocation(page, 'Sede', 'Fundo'); await selectLocation(page, 'Zona de inspección', 'Armonía II');
  await page.getByLabel('Hora de inspección').fill('08:40');
  await page.getByLabel('AM o PM').selectOption('AM');
  await expect(page.getByLabel('Responsable de la inspección')).toHaveAttribute('readonly', '');
  const objective = page.getByRole('textbox', { name: 'Objetivo de la inspección interna', exact: true });
  await expect(objective).toHaveAttribute('maxlength', '560');
  expect((await objective.boundingBox())!.height).toBeLessThanOrEqual(60);
  await expect(page.getByText('Se completa automáticamente al seleccionar a la persona.', { exact: true })).toHaveCount(0);
  await objective.fill('a'.repeat(560)); await objective.press('End'); await objective.press('b');
  await expect(objective).toHaveValue('a'.repeat(560));
  await expect(page.locator('.character-count')).toHaveText('560 / 560');
  await page.getByRole('combobox', { name: /Nombre completo/ }).fill('Ana'); await page.getByRole('listbox').getByRole('option', { name: /Ana Torres/ }).click();
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
  await expect(page.getByRole('combobox', { name: /Nombre completo/ })).toHaveValue('Ana Torres');
  await expect(page.getByLabel('Correo electrónico')).toHaveValue('ana@example.com');
  await page.getByRole('button', { name: 'Continuar', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'RESULTADO DE LA INSPECCIÓN' })).toBeVisible();
});

test('selección por teclado, homónimos, correo automático y limpieza al cambiar el nombre', async ({ page }) => {
  await page.route('**/api/people?*', route => route.fulfill({ json: { people: [people[0], { id: 'ana-2', name: 'Ana Torres', email: 'otra.ana@example.com' }] } }));
  await page.goto('./');
  const input = page.getByRole('combobox', { name: /Nombre completo/ }), email = page.getByLabel('Correo electrónico');
  await expect(email).toHaveAttribute('readonly', '');
  await input.fill('Ana'); await expect(page.getByRole('listbox').getByRole('option')).toHaveCount(2);
  await input.press('ArrowDown'); await input.press('ArrowDown'); await input.press('Enter');
  await expect(email).toHaveValue('otra.ana@example.com');
  await expect(input).toHaveValue('Ana Torres');
  await input.fill('José'); await expect(email).toHaveValue('');
  await expect(input).toHaveAttribute('aria-expanded', 'true');
});

test('directorio vacío o caído no permite inventar un destinatario', async ({ page }) => {
  await page.route('**/api/people?*', route => route.fulfill({ json: { people: [] } }));
  await page.goto('./');
  await expect(page.getByRole('button', { name: 'Continuar', exact: true })).toBeEnabled();
  await page.getByRole('combobox', { name: /Nombre completo/ }).fill('Persona');
  await expect(page.getByText('No hay personas disponibles con ese nombre.')).toBeVisible();
  await page.unroute('**/api/people?*');
  await page.route('**/api/people?*', route => route.fulfill({ status: 503, body: 'Unavailable' }));
  await page.getByRole('combobox', { name: /Nombre completo/ }).fill('Ana');
  await expect(page.getByText('No se pudo consultar el directorio.')).toBeVisible();
  await page.unroute('**/api/people?*'); await mockDirectory(page);
  await page.getByRole('button', { name: 'Reintentar' }).click();
  await page.getByRole('listbox').getByRole('option', { name: /Ana Torres/ }).click();
  await expect(page.getByLabel('Correo electrónico')).toHaveValue('ana@example.com');
});

test('borrador anterior conserva el objetivo largo y solicita corregirlo', async ({ page }) => {
  await page.goto('./');
  await expect(page.getByText('Sin iniciar', { exact: true })).toBeVisible();
  await page.evaluate(async () => {
    const request = indexedDB.open('berry-safety', 1);
    const db = await new Promise<IDBDatabase>((resolve, reject) => { request.onsuccess = () => resolve(request.result); request.onerror = reject; });
    const tx = db.transaction('inspections', 'readwrite'); const store = tx.objectStore('inspections');
    store.put({ id: 'legacy-objective', company: 'Empresa anterior', ruc: '', facility: 'Sede anterior', area: 'Taller', type: 'Instalaciones', date: '2026-11-03', objective: 'a'.repeat(800), responsibles: [], observations: [], noFindings: false, conclusions: '', recommendations: '', inspector: 'Brian', inspectorEmail: '', step: 0, updatedAt: '2099-01-01T00:00:00Z', status: 'draft' });
    await new Promise<void>((resolve, reject) => { tx.oncomplete = () => resolve(); tx.onerror = reject; tx.onabort = reject; }); db.close();
  });
  await page.reload();
  await expect(page.getByRole('textbox', { name: 'Objetivo de la inspección interna', exact: true })).toHaveValue('a'.repeat(800));
  await page.getByRole('button', { name: 'Continuar', exact: true }).click();
  await expect(page.getByText('El objetivo debe tener como máximo 560 caracteres.')).toBeVisible();
  await expect(page.getByRole('radio', { checked: true })).toHaveCount(0);
});

test('sede y zona dependientes conservan la etiqueta y el texto editable al guardar y recargar', async ({ page }) => {
 await page.goto('./');
 const site=page.getByRole('combobox',{name:'Sede',exact:true}),zone=page.getByRole('combobox',{name:'Zona de inspección',exact:true}),area=page.getByRole('textbox',{name:'Área inspeccionada',exact:true});
 await expect(zone).toBeDisabled();await site.click();expect(await page.getByRole('listbox').getByRole('option').allTextContents()).not.toContain('Puerto Morín');
 await selectLocation(page,'Sede','Fundo');await selectLocation(page,'Zona de inspección','Armonía II');await area.fill('Taller de Maquinaria');await selectLocation(page,'Sede','Fundo');await expect(zone).toHaveText('Armonía II');
 await expect(page.locator('.inspection-area-prefix')).toHaveText('Fundo – Armonía II –');
 await area.fill('Actividad corregida');await expect(page.locator('.inspection-area-prefix')).toHaveText('Fundo – Armonía II –');
 await selectLocation(page,'Sede','Exteriores');await expect(zone).toHaveText('Selecciona una zona');await zone.click();expect(await page.getByRole('listbox').getByRole('option').allTextContents()).toEqual(['Selecciona una zona','Chao','Otros','Semillero']);await selectLocation(page,'Zona de inspección','Chao');
 await expect(area).toHaveValue('Actividad corregida');await expect(page.getByText('Guardado en este navegador',{exact:true})).toBeVisible();await page.reload();await expect(site).toHaveText('Exteriores');await expect(zone).toHaveText('Chao');await expect(area).toHaveValue('Actividad corregida');
});

test('menús de ubicación con teclado y Escape, sin desbordamiento y con opción seleccionada visible',async({page})=>{
 await page.goto('./');const site=page.getByRole('combobox',{name:'Sede',exact:true}),zone=page.getByRole('combobox',{name:'Zona de inspección',exact:true});
 await site.focus();await site.press('f');await site.press('Enter');await expect(site).toHaveText('Fundo');
 await zone.focus();await zone.press('a');await zone.press('ArrowDown');await zone.press('Enter');await expect(zone).toHaveText('Armonía II');
 await site.press('ArrowDown');await site.press('ArrowDown');await site.press('Escape');await expect(site).toHaveText('Fundo');await expect(page.getByRole('listbox')).toHaveCount(0);
 await page.getByRole('textbox',{name:'Área inspeccionada',exact:true}).fill('Taller de maquinaria');await site.click();await expect(page.getByRole('option',{name:'Fundo',exact:true})).toHaveAttribute('aria-selected','true');await page.screenshot({path:test.info().outputPath('ubicacion-escritorio.png'),fullPage:true});await site.press('Escape');
 await page.setViewportSize({width:390,height:844});await zone.scrollIntoViewIfNeeded();await zone.click();const menu=page.getByRole('listbox'),bounds=await menu.boundingBox();expect(bounds!.y).toBeGreaterThanOrEqual(0);expect(bounds!.y+bounds!.height).toBeLessThanOrEqual(845);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await page.screenshot({path:test.info().outputPath('ubicacion-telefono.png'),fullPage:true});
 await page.getByRole('option',{name:'Tumi',exact:true}).click();await expect(zone).toHaveText('Tumi');await expect(page.locator('.inspection-area-prefix')).toHaveText('Fundo – Tumi –');
 await site.click();await page.mouse.click(385,100);await expect(page.getByRole('listbox')).toHaveCount(0);
});

test.describe('ubicación en pantalla táctil',()=>{
 test.use({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
 test('permite elegir y desplazarse entre zonas con el dedo',async({page})=>{
  await page.goto('./');await page.getByRole('combobox',{name:'Sede',exact:true}).tap();await page.getByRole('option',{name:'Fundo',exact:true}).tap();await page.getByRole('combobox',{name:'Zona de inspección',exact:true}).tap();
  await page.getByRole('option',{name:'Tumi',exact:true}).tap();await expect(page.getByRole('combobox',{name:'Zona de inspección',exact:true})).toHaveText('Tumi');await page.getByRole('textbox',{name:'Área inspeccionada',exact:true}).fill('Taller de maquinaria');
  await expect(page.locator('.inspection-area-prefix')).toHaveText('Fundo – Tumi –');expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await page.screenshot({path:test.info().outputPath('ubicacion-tactil.png'),fullPage:true});
 });
});
