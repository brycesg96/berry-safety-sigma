import { test, expect } from './test-fixture';
import { mockSafety } from './safety-fixture';

test.use({ hasTouch: true, isMobile: true });
for (const width of [390, 820]) test(`un toque abre la lista sin enfocar Buscar y permite elegir con scroll (${width}px)`, async ({ page, context }) => {
  const state = await mockSafety(context);
  state.catalog[0].areas.push(...Array.from({ length: 35 }, (_, index) => ({ id: `f0000000-0000-4000-8000-${String(index).padStart(12, '0')}`, name: `Área de trabajo ${index + 1}` })));
  await page.setViewportSize({ width, height: 1000 }); await page.goto('./?acceso=sin-cuenta');
  const trigger = page.getByRole('combobox', { name: 'Área', exact: true }); await trigger.tap();
  const search = page.getByRole('searchbox', { name: 'Buscar opciones', exact: true }); await expect(search).toBeVisible(); await expect(search).not.toBeFocused();
  expect(await page.evaluate(() => document.activeElement?.tagName === 'INPUT')).toBe(false);
  await page.locator('.platform-select-options').evaluate(element => { element.scrollTop = element.scrollHeight; });
  await page.getByRole('option').filter({ hasText: 'Área de Trabajo 35' }).tap(); await expect(trigger).toHaveAttribute('data-value', 'f0000000-0000-4000-8000-000000000034');
  await trigger.tap(); await expect(search).not.toBeFocused(); await search.tap(); await expect(search).toBeFocused(); await search.fill('mantenimiento');
  await page.getByRole('option').filter({ hasText: 'Mantenimiento' }).tap(); await expect(trigger).toContainText('Mantenimiento');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
