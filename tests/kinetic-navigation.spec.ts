import { test, expect } from './test-fixture';
import { mockDirectory } from './directory-fixture';

test.beforeEach(async ({ page }) => { await mockDirectory(page); });

for (const width of [390, 768]) test(`menú por capas conserva el foco, Escape y los cambios pendientes (${width}px)`, async ({ page }) => {
  await page.setViewportSize({ width, height: 844 });
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('./');
  const sidebar = page.locator('.kinetic-sidebar');
  await expect(sidebar).toHaveAttribute('data-kinetic', 'ready');
  const objective = page.getByRole('textbox', { name: 'Objetivo de la inspección interna', exact: true });
  await objective.fill('Texto que se conserva al navegar.');
  const opener = page.getByRole('button', { name: 'Abrir menú', exact: true });
  await opener.click();
  await expect(page.getByRole('dialog', { name: 'Menú principal', exact: true })).toBeVisible();
  const close = page.getByRole('button', { name: 'Cerrar menú', exact: true });
  await expect(close).toBeFocused();
  await expect(page.locator('body')).toHaveCSS('overflow', 'hidden');
  await close.press('Shift+Tab');
  await expect(page.getByRole('button', { name: /Necesitas una mano/ })).toBeFocused();
  await page.keyboard.press('Tab'); await expect(close).toBeFocused();
  await page.keyboard.press('Escape'); await expect(opener).toBeFocused();
  await expect(sidebar).toHaveAttribute('data-phase', 'closed');
  await expect(page.locator('body')).not.toHaveCSS('overflow', 'hidden');
  await opener.click();
  await page.locator('.sidebar-nav').getByRole('button', { name: 'Mis inspecciones', exact: true }).click();
  const guard = page.getByRole('dialog', { name: '¿Qué quieres hacer con los cambios?', exact: true });
  await expect(guard).toBeVisible();
  await guard.getByRole('button', { name: 'Seguir editando', exact: true }).click();
  await expect(objective).toHaveValue('Texto que se conserva al navegar.');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(errors).toEqual([]);
});

test('cerrar y reabrir rápido, reducir movimiento y cambiar a escritorio no bloquea la navegación', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('./');
  const sidebar = page.locator('.kinetic-sidebar');
  await expect(sidebar).toHaveAttribute('data-kinetic', 'ready');
  const opener = page.getByRole('button', { name: 'Abrir menú', exact: true });
  await opener.click(); await page.keyboard.press('Escape'); await opener.click();
  await expect(sidebar).toHaveAttribute('data-phase', 'open');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.getByRole('button', { name: 'Cerrar menú', exact: true }).click();
  await expect(sidebar).toHaveAttribute('data-phase', 'closed');
  await opener.click(); await expect(sidebar).toHaveAttribute('data-phase', 'open');
  await page.setViewportSize({ width: 1366, height: 900 });
  await expect(sidebar).toHaveAttribute('data-phase', 'desktop');
  await expect(sidebar).not.toHaveAttribute('inert');
  await expect(page.locator('body')).not.toHaveCSS('overflow', 'hidden');
  const list = page.locator('.sidebar-nav').getByRole('button', { name: 'Mis inspecciones', exact: true });
  await list.focus(); await list.press('Enter');
  await expect(page.getByRole('heading', { name: 'Mis inspecciones', exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('el menú mantiene sus acciones cuando no se descarga el módulo de animación', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.route('**/src/components/ui/kinetic-navigation-motion.ts*', route => route.abort());
  await page.goto('./');
  await page.getByRole('button', { name: 'Abrir menú', exact: true }).click();
  await page.locator('.sidebar-nav').getByRole('button', { name: 'Mis inspecciones', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Mis inspecciones', exact: true })).toBeVisible();
  await expect(page.locator('.kinetic-sidebar')).toHaveAttribute('data-phase', 'closed');
});
