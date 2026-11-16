import { openWorkspaceProfile } from './workspace-profile-fixture';
import { organizationLabel } from '../src/organization-label';
import { test, expect } from '@playwright/test';
import ExcelJS from 'exceljs';
import { organizationCatalog, mockOrganizationCatalog } from './organization-fixture';
import { selectValue } from './select-fixture';
import { selectLocation } from './location-fixture';
import { organizationErrors, organizationOptions, organizationCatalogReady, profileOrganizationErrors } from '../src/organization';
import { locationText, locationErrors } from '../src/inspection-location';

test('gerencias filtran áreas, conservan valores anteriores y la ubicación respeta el orden del formato', () => {
  expect(organizationOptions('Gerencia de prueba A', '', organizationCatalog).areas.map(item => item.value)).toEqual(['Área de prueba A1', 'Área de prueba A2']);
  expect(organizationOptions('Gerencia anterior', 'Área anterior', organizationCatalog).areas).toEqual([{ value: 'Área anterior', label: organizationLabel('Área anterior'), description: undefined }]);
  expect(organizationErrors('Gerencia de prueba A', 'Área de prueba B1', organizationCatalog)).toHaveProperty('department');
  expect(organizationErrors('Gerencia de prueba B', 'Área de prueba B1', organizationCatalog)).toEqual({});
  expect(organizationErrors('', 'Área anterior', [])).toEqual({});
  expect(organizationCatalogReady([])).toBe(false);
  expect(organizationCatalogReady(organizationCatalog)).toBe(true);
  expect(organizationOptions('Gerencia de prueba A', 'Área de prueba A1', organizationCatalog).positions.map(item => item.value)).toEqual(['Puesto de prueba A1', 'Segundo puesto de prueba A1']);
  expect(profileOrganizationErrors('Gerencia de prueba A', 'Área de prueba A1', 'Puesto de prueba B1', true, organizationCatalog)).toHaveProperty('job_title');
  expect(profileOrganizationErrors('', '', '', true, [])).toHaveProperty('organization');
  expect(profileOrganizationErrors('Gerencia de prueba A', 'Área de prueba A1', 'Puesto de prueba A1', true, organizationCatalog)).toEqual({});
  expect(locationText({ site: 'Fundo', department: ' Producción ', zone: 'Armonía II', detail: ' Taller ' })).toBe('Fundo – Producción – Armonía II – Taller');
  expect(locationText({ site: 'Fundo', department: ' Producción ', zone: 'Armonía II', detail: ' Taller ', textOrder: 'site-zone-area' })).toBe('Fundo – Armonía II – Producción – Taller');
  expect(locationText({ site: 'Fundo', zone: 'Armonía II', detail: 'Taller anterior' })).toBe('Fundo – Armonía II – Taller anterior');
  expect(locationErrors({ site: 'Fundo', department: 'a'.repeat(250), zone: 'Armonía II', detail: 'x'.repeat(250) })).toHaveProperty('area');
});

for (const width of [1366, 390]) test(`gerencia y área dependientes, perfiles independientes y Excel con la ubicación completa (${width}px)`, async ({ page }) => {
  await page.setViewportSize({ width, height: 900 }); await mockOrganizationCatalog(page); await page.route('**/api/people?*', route => route.fulfill({ json: { people: [] } })); await page.goto('./');
  await selectLocation(page, 'Sede', 'Fundo', false); await selectLocation(page, 'Zona de inspección', 'Armonía II', false);
  const management = page.getByRole('combobox', { name: 'Gerencia', exact: true }), area = page.getByRole('combobox', { name: 'Área', exact: true });
  await expect(area).toBeDisabled(); await selectValue(management, 'Gerencia de prueba A'); await selectValue(area, 'Área de prueba A2');
  await selectValue(management, 'Gerencia de prueba B'); await expect(area).toHaveText('Selecciona un área');
  await area.click(); await expect(page.getByRole('option', { name: organizationLabel('Área de prueba A1'), exact: true })).toHaveCount(0); await page.getByRole('option', { name: organizationLabel('Área de prueba B1'), exact: true }).click();
  await expect(page.locator('.inspection-area-prefix')).toContainText(`Fundo – Armonía II – ${organizationLabel('Área de prueba B1')}`);
  await page.getByRole('button', { name: 'Guardar', exact: true }).click(); await expect(page.getByText('Guardado en este navegador', { exact: true })).toBeAttached(); await page.reload();
  await expect(management).toHaveText(organizationLabel('Gerencia de prueba B')); await expect(area).toHaveText(organizationLabel('Área de prueba B1'));
  await openWorkspaceProfile(page); const dialog = page.getByRole('dialog', { name: 'Mi perfil', exact: true });
  await selectValue(dialog.getByRole('combobox', { name: 'Gerencia', exact: true }), 'Gerencia de prueba A'); await selectValue(dialog.getByRole('combobox', { name: 'Área', exact: true }), 'Área de prueba A1');
  await selectValue(dialog.getByRole('combobox', { name: 'Puesto', exact: true }), 'Puesto de prueba A1');
  await dialog.getByRole('button', { name: 'Guardar perfil', exact: true }).click();
  await expect(page.getByText(organizationLabel('Gerencia de prueba A — Área de prueba A1'), { exact: false }).first()).toBeVisible(); await expect(area).toHaveText(organizationLabel('Área de prueba B1'));
  await page.getByRole('button', { name: 'Cerrar aviso', exact: true }).click();
  const file = await page.evaluate(async () => {
    const { loadInspections } = await import('/src/model.ts'); const { readAccounts } = await import('/src/accounts.ts'); const { buildExcel } = await import('/src/export.ts');
    const account = readAccounts().find(item => item.id === 'demo-admin')!; if (account.management !== 'Gerencia de prueba A' || account.area !== 'Área de prueba A1') throw new Error('Perfil no conservado.');
    const draft = (await loadInspections()).find(item => item.ownerId === 'demo-admin')!;
    if (draft.area !== 'Fundo – Armonía II – Área de Prueba B1 – Lavadero de Camiones') throw new Error('Ubicación no conservada.');
    const report = { ...draft, area: 'Texto anterior sin componer', type: 'Planeada' as const, inspectionTime: '09:30', inspectionPeriod: 'AM' as const, objective: 'Verificar condiciones.', responsibles: [{ id: 'head', personId: 'head', name: 'Jefa de prueba', email: 'jefa@example.invalid' }, { id: 'worker', personId: 'worker', name: 'Responsable de prueba', email: 'persona@example.invalid' }] };
    const built = await buildExcel(report); let binary = ''; for (let i = 0; i < built.bytes.length; i += 32768) binary += String.fromCharCode(...built.bytes.subarray(i, i + 32768)); return { base64: btoa(binary), name: built.name };
  });
  const book = new ExcelJS.Workbook(); await book.xlsx.load(Buffer.from(file.base64, 'base64') as any);
  expect(book.getWorksheet('V.01')!.getCell('A10').text).toBe('ÁREA E INSTALACIÓN INSPECCIONADA');
  expect(book.getWorksheet('V.01')!.getCell('A11').text).toBe('Fundo – Armonía II – Área de Prueba B1 – Lavadero de Camiones');
  expect(file.name).toContain('ÁREA DE PRUEBA B1');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.locator('.organization-fields').screenshot({ path: test.info().outputPath(`gerencia-area-${width}.png`), animations: 'disabled' });
});
