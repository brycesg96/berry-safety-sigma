import { test, expect } from './test-fixture';
import { mockSafety, enterSafety, safetyRow, safetyManagement, safetyArea, safetyFacility, safetySite, safetyZone } from './safety-fixture';
import { selectValue } from './select-fixture';
import { expectAccessible } from './accessibility-fixture';

for (const width of [1440, 768, 390]) test(`consulta diaria plegable por gerencia, área y envío (${width}px)`, async ({ page, context }) => {
  await page.setViewportSize({ width, height: 1000 }); await page.emulateMedia({ reducedMotion: 'reduce' });
  const state = await mockSafety(context, true), other = state.catalog[1];
  state.rows.push(safetyRow(), safetyRow({ id: 'aa000000-0000-4000-8000-000000000001', management_id: other.id, management_name: other.name, area_id: other.areas[0].id, area_name: other.areas[0].name, owner_name: 'Ana Flores' }));
  await enterSafety(page, true);
  await expect(page.getByRole('combobox', { name: 'Fecha de envío', exact: true })).toContainText('Hoy');
  await expect(page.getByRole('button', { name: 'Actualizar lista', exact: true })).toHaveCount(0);
  const groups = page.locator('.yo-management-group'); await expect(groups).toHaveCount(2);
  for (const group of await groups.all()) await expect(group).not.toHaveAttribute('open', '');
  const own = page.locator(`[data-management-id="${safetyManagement}"]`), area = own.locator(`[data-area-id="${safetyArea}"]`);
  await own.locator('summary').first().focus(); await page.keyboard.press('Enter');
  await expect(own).toHaveAttribute('open', ''); await expect(area).not.toHaveAttribute('open', '');
  await area.locator('summary').first().click(); const card = area.locator('.safety-submission');
  await expect(card).toBeVisible(); await expect(card.locator('.safety-document-row')).toBeHidden();
  await card.locator('summary').click(); await expect(card.locator('.safety-document-row')).toBeVisible();
  await expect(page.locator(`[data-management-id="${other.id}"]`)).not.toHaveAttribute('open', '');
  const separation = await groups.evaluateAll(elements => elements[1].getBoundingClientRect().top - elements[0].getBoundingClientRect().bottom);
  expect(separation).toBeGreaterThanOrEqual(16);
  await expectAccessible(page); expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: test.info().outputPath(`yo-consulta-diaria-${width}.png`), fullPage: true });
  const filter = page.getByRole('combobox', { name: 'Área', exact: true }); await filter.click();
  await expect(page.getByRole('searchbox', { name: 'Buscar opciones', exact: true })).not.toBeFocused();
  await expect(page.locator('.platform-select-group-heading')).toHaveCount(2);
  await expectAccessible(page); await page.keyboard.press('Escape');
});

test('una cuenta normal solo filtra áreas de su propia gerencia', async ({ page, context }) => {
  const state = await mockSafety(context), other = state.catalog[1];
  state.rows.push(safetyRow(), safetyRow({ id:'aa000000-0000-4000-8000-000000000002', management_id:other.id,area_id:other.areas[0].id }));
  await enterSafety(page);
  await expect(page.getByRole('combobox', { name:'Gerencia',exact:true })).toHaveCount(0);
  await expect(page.locator('.safety-submission')).toHaveCount(1);
  expect(state.listQueries.every(query => new URLSearchParams(query).get('management_id') === `eq.${safetyManagement}`)).toBe(true);
  await page.getByRole('combobox', { name:'Área',exact:true }).click();
  await expect(page.getByRole('option')).toHaveCount(3);
  await expect(page.getByRole('option', { name:'Servicios',exact:true })).toHaveCount(0);
  await expect(page.getByRole('option', { name:'Mantenimiento',exact:true })).toBeVisible();
});

test('Hoy usa el día de Lima, excluye ambos límites externos y avanza al cambiar de día', async ({ page, context }) => {
  await page.clock.install({time:new Date('2026-11-25T04:58:00Z')});await page.clock.pauseAt(new Date('2026-11-25T04:59:59Z'));
  const state = await mockSafety(context);
  const rows=[['2026-11-24T04:59:59Z','Antes'],['2026-11-24T05:00:00Z','Inicio del día'],['2026-11-25T04:59:59Z','Final del día'],['2026-11-25T05:00:00Z','Día siguiente']];
  rows.forEach(([created_at,title],index)=>state.rows.push(safetyRow({id:`ab000000-0000-4000-8000-${String(index).padStart(12,'0')}`,created_at,title})));
  await enterSafety(page); await expect(page.locator('.safety-submission')).toHaveCount(2);
  await expect(page.locator('.safety-document-list')).toContainText('Inicio del día');
  await expect(page.locator('.safety-document-list')).not.toContainText('Antes');
  const bounds=()=>new URLSearchParams(state.listQueries.at(-1)).getAll('created_at');
  expect(bounds()).toEqual(['gte.2026-11-24T00:00:00-05:00','lt.2026-11-25T05:00:00.000Z']);
  await page.clock.fastForward(16000);await page.clock.runFor(500);
  await expect(page.locator('.safety-submission')).toHaveCount(1);
  await expect(page.locator('.safety-submission')).toContainText('Día siguiente');
  expect(bounds()).toEqual(['gte.2026-11-25T00:00:00-05:00','lt.2026-11-26T05:00:00.000Z']);
  await selectValue(page.getByRole('combobox',{name:'Fecha de envío',exact:true}),'all');
  await expect(page.locator('.safety-submission')).toHaveCount(4);expect(bounds()).toEqual([]);
  await selectValue(page.getByRole('combobox',{name:'Fecha de envío',exact:true}),'custom');
  await page.getByLabel('Desde',{exact:true}).fill('2026-11-24');await page.getByLabel('Hasta',{exact:true}).fill('2026-11-24');
  await expect(page.locator('.safety-submission')).toHaveCount(2);
  const before=state.listQueries.length;await page.getByLabel('Desde',{exact:true}).fill('2026-11-26');
  await expect(page.getByRole('alert')).toContainText('rango válido');await expect(page.locator('.safety-submission')).toHaveCount(0);expect(state.listQueries.length).toBe(before);
});

test('la recepción ubica Sede, Zona e Instalación después del área y limpia los hijos al cambiar de lugar',async({page,context})=>{
  await mockSafety(context);await page.goto('./?acceso=sin-cuenta');
  const site=page.getByRole('combobox',{name:'Sede',exact:true}),zone=page.getByRole('combobox',{name:'Zona',exact:true}),facility=page.getByRole('combobox',{name:'Instalación',exact:true});
  await expect(zone).toBeDisabled();await expect(facility).toBeDisabled();
  const labels=await page.locator('.yo-upload-panel .field>label').allTextContents();
  expect(labels.findIndex(text=>text.startsWith('Área'))).toBeLessThan(labels.findIndex(text=>text.startsWith('Sede')));
  expect(labels.findIndex(text=>text.startsWith('Instalación'))).toBeLessThan(labels.findIndex(text=>text.startsWith('Actividad')));
  await selectValue(site,safetySite);await selectValue(zone,safetyZone);await selectValue(facility,safetyFacility);
  await selectValue(zone,'dd000000-0000-4000-8000-000000000032');await expect(facility).toHaveAttribute('data-value','');
  await selectValue(facility,'dd000000-0000-4000-8000-000000000036');await selectValue(site,'dd000000-0000-4000-8000-000000000033');
  await expect(zone).toHaveAttribute('data-value','');await expect(facility).toHaveAttribute('data-value','');await expect(facility).toBeDisabled();
  await expect(page.getByLabel('Fecha y hora de envío')).toHaveCount(0);
  await expect(page.getByText('La gerencia se mostrará automáticamente al elegir tu área.',{exact:true})).toHaveCount(0);
  await expect(page.getByText('Solo las cuentas autorizadas podrán consultar tus documentos.',{exact:true})).toHaveCount(0);
  await expect(page.getByText('¿Qué documentos vas a subir?',{exact:true})).toBeVisible();
  await expect(page.getByText('PDF, JPG, PNG o WebP. Máximo 10 MB por archivo',{exact:true})).toBeVisible();
});
