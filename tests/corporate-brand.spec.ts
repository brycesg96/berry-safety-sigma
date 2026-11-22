import { test, expect } from './test-fixture';
import { openWorkspaceProfile } from './workspace-profile-fixture';

for (const width of [1366, 768, 390]) test(`Hortifrut reemplaza el avatar superior y mantiene fondo blanco en la cabecera verde (${width}px)`, async ({ page }) => {
  await page.setViewportSize({ width, height: 900 }); await page.goto('./');
  const header = page.locator('.topbar'), logo = header.getByRole('img', { name: 'Hortifrut', exact: true });
  await expect(logo).toBeVisible(); expect(await logo.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0)).toBe(true);
  await expect(header.getByRole('button', { name: 'Mi perfil', exact: true })).toHaveCount(0);
  expect(await logo.evaluate(img => img.closest('button,a'))).toBeNull(); await logo.click(); await expect(page.getByRole('dialog')).toHaveCount(0);
  await header.screenshot({ path: test.info().outputPath(`barra-hortifrut-${width}.png`) });
  await openWorkspaceProfile(page); await expect(page.getByRole('dialog', { name: 'Mi perfil', exact: true })).toBeVisible();
  await page.goto('./?acceso=cuenta&seccion=perfil');
  const cloudHeader = page.locator('.cloud-account-header'); await expect(cloudHeader.getByRole('img', { name: 'Hortifrut', exact: true })).toBeVisible();
  expect(await cloudHeader.locator('.hortifrut-logo-on-dark').evaluate(el => getComputedStyle(el).backgroundColor)).toBe('rgb(255, 255, 255)');
  await cloudHeader.screenshot({ path: test.info().outputPath(`cabecera-hortifrut-${width}.png`) });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
