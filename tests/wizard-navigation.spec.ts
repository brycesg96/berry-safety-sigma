import { test, expect } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';

async function atStart(locator: Locator) {
  await expect.poll(async () => Math.abs((await locator.boundingBox())!.y - 16)).toBeLessThan(3);
}
async function general(page: Page) {
  await page.route('**/api/people?*', route => route.fulfill({ json: { people: [] } }));
  await page.goto('./');
  await page.getByLabel('Área inspeccionada').fill('Taller - Armonía 2');
  await page.getByLabel('Hora de inspección').fill('07:30'); await page.getByLabel('AM o PM').selectOption('AM');
  await page.getByRole('radio', { name: 'Planeada', exact: true }).check();
  await page.getByRole('textbox', { name: 'Objetivo de la inspección interna', exact: true }).fill('Revisar condiciones de seguridad.');
  await page.getByRole('combobox', { name: /Nombre completo/ }).fill('Bryan');
  await page.getByRole('listbox').getByRole('option', { name: /bcespedes@hortifrut.com/ }).click();
}
for (const viewport of [{ width: 1366, height: 900 }, { width: 390, height: 844 }]) {
  test(`pasos mantienen el encabezado y Editar abre la observación exacta (${viewport.width}px)`, async ({ page }) => {
    await page.setViewportSize(viewport);
    if (viewport.width < 500) await page.emulateMedia({ reducedMotion: 'reduce' });
    await general(page);
    const start = page.getByText('SEGURIDAD Y SALUD EN EL TRABAJO', { exact: true });
    await page.getByRole('button', { name: 'Continuar', exact: true }).click();
    await atStart(start);
    for (let index = 0; index < 3; index++) {
      await page.getByRole('button', { name: 'Añadir observación', exact: true }).click();
      const card = page.locator('.observation-card').nth(index);
      await card.getByLabel('Descripción').fill(`Observación de prueba ${index + 1}`);
      await card.getByLabel('Acción a tomar').fill(`Corregir condición ${index + 1}`);
      await card.getByLabel('Fecha de Cierre').fill('2026-12-01');
    }
    await page.getByRole('button', { name: 'Continuar', exact: true }).click();
    await atStart(start);
    await page.getByRole('button', { name: 'Editar observación 2', exact: true }).click();
    const second = page.locator('.observation-card').nth(1);
    await atStart(second);
    await expect(second.getByLabel('Descripción')).toBeFocused();
    await second.getByLabel('Descripción').fill('Segunda observación corregida');
    await page.getByRole('button', { name: 'Continuar', exact: true }).click();
    await atStart(start);
    await expect(page.locator('.review-observation').nth(1)).toContainText('Segunda observación corregida');
    await page.getByRole('button', { name: 'Editar observación 1', exact: true }).click();
    const first = page.locator('.observation-card').first();
    await atStart(first);
    await expect(first.getByLabel('Descripción')).toBeFocused();
    await page.getByRole('button', { name: 'Continuar', exact: true }).click();
    await page.getByRole('button', { name: 'Editar observación 3', exact: true }).click();
    const last = page.locator('.observation-card').last();
    await expect(last.getByLabel('Descripción')).toBeFocused();
    // Near the end of a page, the browser clamps scrolling to the document height.
    await expect.poll(() => last.evaluate(element => {
      const box = element.getBoundingClientRect();
      const highestPosition = Math.max(16, box.top + scrollY - (document.documentElement.scrollHeight - innerHeight));
      return Math.abs(box.top - highestPosition);
    })).toBeLessThan(3);
    await expect(last.getByLabel('Descripción')).toBeInViewport();
    await page.getByRole('button', { name: 'Continuar', exact: true }).click();
    await page.getByRole('button', { name: 'Continuar', exact: true }).click();
    await atStart(start);
    await page.getByRole('textbox', { name: 'CONCLUSIONES Y RECOMENDACIONES', exact: true }).fill('Corregir los tres hallazgos.');
    await page.getByRole('button', { name: 'Continuar', exact: true }).click();
    await atStart(start);
    await page.getByRole('button', { name: 'Anterior', exact: true }).click();
    await atStart(start);
  });
}
