import { expect, type Page } from '@playwright/test';

export async function saveAndOpenList(page: Page) {
  const save = page.getByRole('button', { name: 'Guardar', exact: true }).first();
  await save.click();
  await expect(save).toBeEnabled();
  const menu = page.getByRole('button', { name: 'Abrir menú', exact: true });
  if (await menu.isVisible()) await menu.click();
  await page.locator('.sidebar-nav').getByRole('button', { name: 'Mis inspecciones', exact: true }).click();
}
