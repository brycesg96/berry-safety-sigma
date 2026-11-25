import { test, expect } from './test-fixture';
import { mockSafety, safetySite, safetyZone, safetyFacility } from './safety-fixture';

test.describe('teléfono y tablet', () => {
test.use({ hasTouch: true, isMobile: true });
for (const width of [390, 820]) test(`un toque abre la lista sin enfocar Buscar y permite elegir con scroll (${width}px)`, async ({ page, context }) => {
  const state = await mockSafety(context);
  state.catalog[0].areas.push(...Array.from({ length: 35 }, (_, index) => ({ id: `f0000000-0000-4000-8000-${String(index).padStart(12, '0')}`, name: `Área de trabajo ${index + 1}` })));
  await page.setViewportSize({ width, height: 1000 }); await page.goto('./?acceso=sin-cuenta');
  const trigger = page.getByRole('combobox', { name: 'Área', exact: true }); await page.getByRole('textbox', { name: 'Nombres y apellidos', exact: true }).tap(); await trigger.tap();
  const search = page.getByRole('searchbox', { name: 'Buscar opciones', exact: true }); await expect(search).toBeVisible(); await expect(search).not.toBeFocused();
  expect(await page.evaluate(() => document.activeElement?.tagName === 'INPUT')).toBe(false);
  await page.locator('.platform-select-options').evaluate(element => { element.scrollTop = element.scrollHeight; });
  await page.getByRole('option').filter({ hasText: 'Área de Trabajo 35' }).tap(); await expect(trigger).toHaveAttribute('data-value', 'f0000000-0000-4000-8000-000000000034');
  await trigger.tap(); await expect(search).not.toBeFocused(); await search.tap(); await expect(search).toBeFocused(); await search.fill('mantenimiento');
  await page.getByRole('option').filter({ hasText: 'Mantenimiento' }).tap(); await expect(trigger).toContainText('Mantenimiento');
  for (const [name, value] of [['Sede', safetySite], ['Zona', safetyZone], ['Instalación', safetyFacility]]) {
    const field = page.getByRole('combobox', { name, exact: true }); await field.tap();
    await expect(search).toBeVisible(); await expect(search).not.toBeFocused();
    await page.getByRole('listbox').locator(`[role="option"][data-value="${value}"]`).tap();
    await expect(field).toHaveAttribute('data-value', value);
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
});

test('abrir con mouse o teclado conserva el foco fuera de Buscar hasta entrar expresamente', async ({ page, context }) => {
  await mockSafety(context); await page.goto('./?acceso=sin-cuenta');
  const trigger = page.getByRole('combobox', { name: 'Área', exact: true });
  const search = page.getByRole('searchbox', { name: 'Buscar opciones', exact: true });
  await trigger.click(); await expect(search).toBeVisible(); await expect(search).not.toBeFocused();
  await trigger.press('Escape'); await trigger.press('Enter'); await expect(trigger).toBeFocused(); await expect(search).not.toBeFocused();
  await trigger.press('Tab'); await expect(search).toBeFocused(); await search.fill('mantenimiento');
  await search.press('ArrowDown'); await search.press('Enter'); await expect(trigger).toContainText('Mantenimiento');
  await trigger.click(); await expect(search).not.toBeFocused(); await search.click(); await expect(search).toBeFocused();
});
