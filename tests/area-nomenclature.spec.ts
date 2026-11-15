import { test, expect } from '@playwright/test';
import ExcelJS from 'exceljs';
import { areaDisplayName, organizationOptions } from '../src/organization';
import { organizationLabel } from '../src/organization-label';
import { INITIAL_ORGANIZATION_NODES } from '../src/organization-catalog';
import { selectValue } from './select-fixture';
import { selectLocation } from './location-fixture';

const management = 'GERENCIA DE RECURSOS HUMANOS', area = 'SEGURIDAD INDUSTRIAL Y GESTION MEDIO AMBIENTAL';
test('la nomenclatura conserva los valores canónicos y el traslado mantiene el identificador del área y sus puestos', () => {
  const options = organizationOptions(management, area);
  expect(options.areas.find(option => option.value === area)).toMatchObject({ value: area, label: 'SIGMA', description: 'Seguridad Industrial y Gestión Medio Ambiental' });
  expect(areaDisplayName({ management, area })).toBe('SIGMA');
  expect(organizationLabel('SUPERVISOR SIGMA')).toBe('Supervisor SIGMA');
  expect(organizationLabel('GERENCIA TI CORPORATIVO')).toBe('Gerencia TI Corporativo');
  expect(organizationLabel('GERENCIA DE PRODUCCION')).toBe('Gerencia de Producción');
  expect(organizationLabel('PRODUCCION ARANDANOS')).toBe('Producción Arándanos');
  expect(organizationLabel('TECNOLOGIA DE LA INFORMACION')).toBe('Tecnología de la Información');
  expect(organizationLabel('TECNICO DE MICROPROPAGACION Y GESTION AGRICOLA')).toBe('Técnico de Micropropagación y Gestión Agrícola');
  const viveros = INITIAL_ORGANIZATION_NODES.find(node => node.id === '84270532-994a-5747-8145-f78ae1516b72')!;
  expect(viveros.parent_id).toBe('45d5faeb-c5bf-561b-a6b4-7ddddee55c6b');
  expect(INITIAL_ORGANIZATION_NODES.filter(node => node.parent_id === viveros.id)).toHaveLength(5);
});

for (const [width, height] of [[1366, 600], [1024, 768], [768, 1024], [390, 640]]) test(`el perfil permanece dentro de la barra verde y la nueva inspección exporta SIGMA (${width}px)`, async ({ page }) => {
  await page.setViewportSize({ width, height });
  await page.route('**/api/people?*', route => route.fulfill({ json: { people: [] } }));
  await page.goto('./');
  await page.evaluate(async ({ management, area }) => {
    const { updateOwnProfile } = await import('/src/accounts.ts');
    updateOwnProfile('demo-admin', 'Bryan Cespedes Guevara', area, 'SUPERVISOR SIGMA', management);
  }, { management, area });
  await page.reload();
  if (width < 900) await page.getByRole('button', { name: 'Abrir menú', exact: true }).click();
  const card = page.getByRole('button', { name: 'Editar mi perfil', exact: true });
  await expect(card).toContainText('Administrador · SIGMA');
  await expect(card.locator('.user-job-title')).toHaveText('Supervisor SIGMA');
  const responsibleOptions = await page.evaluate(async ({ management, area }) => {
    const { dashboardPeopleOptions } = await import('/src/dashboard.ts');
    return dashboardPeopleOptions([{ data: { responsibles: [{ id: 'person', name: 'Nombre Completo', email: 'persona@example.invalid', management, area, jobTitle: 'SUPERVISOR SIGMA' }] } } as any], 'responsible');
  }, { management, area });
  expect(responsibleOptions).toEqual([{ value: 'persona@example.invalid', label: 'Nombre Completo', description: 'persona@example.invalid · SIGMA' }]);
  const bounds = await card.evaluate(element => {
    const aside = element.closest('aside')!.getBoundingClientRect();
    const card = element.getBoundingClientRect();
    return card.top >= 0 && card.bottom <= innerHeight && [...element.querySelectorAll('strong, .user-details>span, svg')].every(child => { const rect = child.getBoundingClientRect(); return rect.right <= aside.right && rect.left >= aside.left && rect.top >= card.top && rect.bottom <= card.bottom; });
  });
  expect(bounds).toBe(true);
  await page.locator('.sidebar').screenshot({ path: test.info().outputPath(`perfil-sigma-${width}.png`) });
  if (width < 900) await page.getByRole('button', { name: 'Cerrar menú', exact: true }).click();
  await selectLocation(page, 'Sede', 'Fundo', false); await selectLocation(page, 'Zona de inspección', 'Armonía II', false);
  await selectValue(page.getByRole('combobox', { name: 'Gerencia', exact: true }), management);
  await selectValue(page.getByRole('combobox', { name: 'Área', exact: true }), area);
  await expect(page.getByRole('combobox', { name: 'Área', exact: true })).toHaveText('SIGMA');
  await expect(page.locator('.inspection-area-prefix')).toContainText('Fundo – Armonía II – SIGMA');
  await page.getByRole('button', { name: 'Guardar', exact: true }).click();
  await expect(page.getByText('Guardado en este navegador', { exact: true })).toBeAttached();
  const encoded = await page.evaluate(async () => {
    const { loadInspections } = await import('/src/model.ts'); const { buildExcel } = await import('/src/export.ts');
    const draft = (await loadInspections()).find(value => value.ownerId === 'demo-admin')!;
    if (draft.areaLocation?.department !== 'SEGURIDAD INDUSTRIAL Y GESTION MEDIO AMBIENTAL') throw new Error('El nombre completo no se conservó.');
    if (draft.areaLocation?.departmentNomenclature !== 'SIGMA') throw new Error('No se guardó la nomenclatura.');
    const file = await buildExcel({ ...draft, type: 'Planeada', objective: 'Verificar condiciones.', inspectionTime: '09:30', inspectionPeriod: 'AM', responsibles: [{ id: 'head', personId: 'head', name: 'Jefa de prueba', email: 'jefa@example.invalid' }, { id: 'worker', personId: 'worker', name: 'Responsable de prueba', email: 'persona@example.invalid' }] });
    let binary = ''; for (let i = 0; i < file.bytes.length; i += 32768) binary += String.fromCharCode(...file.bytes.subarray(i, i + 32768)); return btoa(binary);
  });
  const book = new ExcelJS.Workbook(); await book.xlsx.load(Buffer.from(encoded, 'base64') as any);
  expect(book.getWorksheet('V.01')!.getCell('A11').text).toBe('Fundo – Armonía II – SIGMA');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
