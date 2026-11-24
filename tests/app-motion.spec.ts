import { test, expect } from './test-fixture';
import { mockDirectory } from './directory-fixture';

test.beforeEach(async ({ page }) => { await mockDirectory(page); });

for (const width of [1366, 390, 375, 667]) test(`movimiento conserva escritura, scroll nativo y guardado (${width}px)`, async ({ page }) => {
  await page.setViewportSize({ width, height: width === 667 ? 375 : 844 });
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('./');
  await expect(page.locator('#root')).toHaveAttribute('data-motion', 'ready');
  const objective = page.getByRole('textbox', { name: 'Objetivo de la inspección interna', exact: true });
  await objective.fill('Comprobar equipos y rutas de evacuación.');
  await objective.press('End'); await objective.pressSequentially(' Verificar señalización.');
  await expect(objective).toBeFocused();
  await expect(objective).toHaveValue('Comprobar equipos y rutas de evacuación. Verificar señalización.');
  await expect(page.locator('.form-card')).toHaveCSS('transform', 'none');

  await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
  await page.mouse.move(width - 35, 450); await page.mouse.wheel(0, 600);
  await expect.poll(() => page.evaluate(() => scrollY)).toBeGreaterThan(100);
  await expect.poll(() => page.locator('.app-scroll-progress>span').evaluate(element => new DOMMatrix(getComputedStyle(element).transform).a)).toBeGreaterThan(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);

  const saveFeedback = page.locator('.save-exit');
  const idleBackground = await saveFeedback.evaluate(element => getComputedStyle(element).backgroundColor);
  await page.getByRole('button', { name: 'Guardar', exact: true }).first().click();
  await expect(page.locator('.save-status')).toContainText('Guardado en este navegador');
  await expect(saveFeedback).toHaveAttribute('data-save-phase', 'success');
  await expect.poll(() => saveFeedback.evaluate(element => getComputedStyle(element).backgroundColor)).not.toBe(idleBackground);
  await objective.fill('Edición posterior al guardado.');
  await expect(saveFeedback).toHaveAttribute('data-save-phase', 'idle');
  await expect.poll(() => saveFeedback.evaluate(element => getComputedStyle(element).backgroundColor)).toBe(idleBackground);
  await expect(page.locator('.save-status')).toContainText('Cambios sin guardar');
  await page.getByRole('button', { name: 'Guardar', exact: true }).first().click();
  await expect(page.locator('.save-exit')).toHaveAttribute('data-save-phase', 'success');
  await page.screenshot({ path: test.info().outputPath(`guardado-${width}.png`), animations: 'disabled' });
  await page.reload();
  await expect(objective).toHaveValue('Edición posterior al guardado.');
  expect(errors).toEqual([]);
});

test('activar movimiento reducido elimina animaciones pendientes y mantiene los campos accesibles', async ({ page }) => {
  await page.goto('./');
  await expect(page.locator('#root')).toHaveAttribute('data-motion', 'ready');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect(page.locator('#root')).not.toHaveAttribute('data-motion', 'ready');
  await expect(page.locator('.app-scroll-progress')).toBeHidden();
  await expect.poll(() => page.locator('.stepper-progress>span').evaluate(element => parseFloat(getComputedStyle(element).transitionDuration))).toBeLessThan(.001);
  await expect(page.locator('.form-card')).toHaveCSS('transform', 'none');
  await expect(page.locator('.form-card')).toHaveCSS('opacity', '1');
  const objective = page.getByRole('textbox', { name: 'Objetivo de la inspección interna', exact: true });
  await objective.fill('Formulario accesible con movimiento reducido.');
  await expect(objective).toBeFocused();
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await expect(page.locator('#root')).toHaveAttribute('data-motion', 'ready');
  await expect(objective).toHaveValue('Formulario accesible con movimiento reducido.');
  await expect(page.locator('.form-card')).toHaveCSS('transform', 'none');
});

test('un fallo al cargar las animaciones deja la aplicación visible y operativa', async ({ page }) => {
  await page.route('**/src/app-motion.ts*', route => route.abort());
  await page.goto('./');
  await expect(page.getByRole('heading', { name: 'Nueva inspección', exact: true })).toBeVisible();
  const objective = page.getByRole('textbox', { name: 'Objetivo de la inspección interna', exact: true });
  await objective.fill('El contenido funciona sin animaciones.');
  await expect(objective).toHaveValue('El contenido funciona sin animaciones.');
  await page.getByRole('button', { name: 'Guardar', exact: true }).first().click();
  await expect(page.locator('.save-status')).toContainText('Guardado en este navegador');
});
