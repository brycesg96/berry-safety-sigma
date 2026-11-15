import type { Page } from '@playwright/test';

export async function openWorkspaceProfile(page: Page) {
  const menu = page.getByRole('button', { name: 'Abrir menú', exact: true });
  if (await menu.isVisible() && await menu.getAttribute('aria-expanded') !== 'true') await menu.click();
  await page.getByRole('button', { name: 'Editar mi perfil', exact: true }).click();
}
