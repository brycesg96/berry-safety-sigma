import { test, expect } from './test-fixture';
import { mockDirectory } from './directory-fixture';

test.beforeEach(async ({ page }) => { await mockDirectory(page); });

test('la perspectiva responde al scroll nativo y conserva la escritura del formulario', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('./');
  const scene = page.locator('.container-scroll-illustration');
  await expect(scene).toHaveAttribute('data-scroll-animation', 'ready');
  const frame = scene.locator('.container-scroll-frame');
  const initial = await frame.evaluate(element => getComputedStyle(element).transform);
  await page.mouse.move(1050, 650); await page.mouse.wheel(0, 300);
  await expect.poll(() => frame.evaluate(element => getComputedStyle(element).transform)).not.toBe(initial);
  const objective = page.getByRole('textbox', { name: 'Objetivo de la inspección interna', exact: true });
  await objective.fill('Revisión de equipos y rutas de evacuación.');
  await expect(objective).toBeFocused();
  await expect(page.locator('.form-card')).toHaveCSS('transform', 'none');
  await page.getByRole('button', { name: 'Guardar', exact: true }).first().click();
  await expect(page.locator('.save-status')).toContainText('Guardado en este navegador');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(errors).toEqual([]);
});

test('móvil conserva los mensajes de la lista y la búsqueda fuera del marco decorativo', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('./');
  await page.getByRole('button', { name: 'Abrir menú', exact: true }).click();
  await page.locator('.sidebar-nav').getByRole('button', { name: 'Mis inspecciones', exact: true }).click();
  const scene = page.locator('.empty-list .container-scroll');
  await scene.scrollIntoViewIfNeeded();
  await expect(scene).toHaveAttribute('data-scroll-animation', 'ready');
  await expect(page.getByRole('heading', { name: 'No encontramos inspecciones', exact: true })).toBeVisible();
  const search = page.getByRole('textbox', { name: 'Buscar inspecciones', exact: true });
  await search.fill('Taller de maquinaria');
  await expect(search).toBeFocused();
  await expect(search).toHaveValue('Taller de maquinaria');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('el movimiento reducido deja la ilustración estática y permite reactivar el efecto', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('./');
  const scene = page.locator('.container-scroll-illustration');
  const frame = scene.locator('.container-scroll-frame');
  await expect(frame).toBeVisible(); await expect(frame).toHaveCSS('transform', 'none');
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await expect(scene).toHaveAttribute('data-scroll-animation', 'ready');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect(frame).toHaveCSS('transform', 'none');
  await expect(scene).not.toHaveAttribute('data-scroll-animation', 'ready');
});

test('un fallo de descarga de la animación mantiene visible el contenido y permite guardar', async ({ page }) => {
  await page.route('**/src/components/ui/container-scroll-motion.ts*', route => route.abort());
  await page.goto('./');
  await expect(page.locator('.context-card h3')).toBeVisible();
  const objective = page.getByRole('textbox', { name: 'Objetivo de la inspección interna', exact: true });
  await objective.fill('El borrador funciona con la ilustración estática.');
  await page.getByRole('button', { name: 'Guardar', exact: true }).first().click();
  await expect(page.locator('.save-status')).toContainText('Guardado en este navegador');
  await page.reload(); await expect(objective).toHaveValue('El borrador funciona con la ilustración estática.');
});
