import { test, expect } from './test-fixture';
import { mockSafety } from './safety-fixture';
import { expectAccessible } from './accessibility-fixture';

for (const [width, height] of [[1440, 1000], [375, 900], [667, 375]]) test(`la nueva bienvenida conserva los dos accesos y la lectura con zoom (${width}px)`, async ({ page, context }) => {
  await mockSafety(context); await page.setViewportSize({ width, height }); await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('./?acceso=cuenta'); await expect(page.getByRole('heading', { name: 'Inicia sesión', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Ingresar sin cuenta', exact: true })).toBeEnabled();
  await expectAccessible(page); await page.evaluate(() => document.documentElement.style.zoom = '150%');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.evaluate(() => { document.documentElement.style.zoom = '100%'; window.scrollTo({ top: 0, behavior: 'instant' }); });
  await page.screenshot({ path: test.info().outputPath(`bienvenida-${width}.png`), fullPage: true, animations: 'disabled' });
  const guest = page.getByRole('button', { name: 'Ir a Yo Seguro', exact: true }); await guest.focus(); await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/acceso=sin-cuenta/); await page.getByRole('button', { name: 'Comenzar ahora', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Nombres y apellidos', exact: true })).toBeFocused();
  const question = page.locator('summary').filter({ hasText: '¿Puedo adjuntar varios documentos?' }); await question.focus(); await page.keyboard.press('Enter');
  await expect(question.locator('..')).toHaveAttribute('open', ''); await expect(question.locator('..')).toContainText('50 archivos por envío');
});

test('cambiar movimiento reducido limpia la perspectiva y una animación indisponible conserva el acceso', async ({ page, context }) => {
  await mockSafety(context); await page.setViewportSize({ width: 1440, height: 1000 }); await page.goto('./?acceso=cuenta');
  const scene = page.locator('.safety-scene'); await expect(scene).toHaveAttribute('data-scene-motion', 'ready');
  await page.emulateMedia({ reducedMotion: 'reduce' }); await expect(scene).not.toHaveAttribute('data-scene-motion', 'ready'); await expect(scene.locator('.safety-scene-frame')).toHaveCSS('transform', 'none');
  await page.route('**/src/safety-scene-motion.ts*', route => route.abort()); await page.reload();
  await expect(page.getByRole('heading', { name: 'Inicia sesión', exact: true })).toBeVisible(); await expect(page.getByRole('button', { name: 'Ir a Yo Seguro', exact: true })).toBeEnabled();
  await page.getByRole('textbox', { name: 'Correo electrónico', exact: true }).fill('persona@example.invalid'); await expect(page.getByRole('textbox', { name: 'Correo electrónico', exact: true })).toHaveValue('persona@example.invalid');
});
