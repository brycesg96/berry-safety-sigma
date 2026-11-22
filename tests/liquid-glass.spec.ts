import { test, expect } from './test-fixture';
import { mockDirectory } from './directory-fixture';
import { saveAndOpenList } from './save-fixture';

test.beforeEach(async ({ page }) => { await mockDirectory(page); });

for (const width of [1366, 390]) test(`el cristal conserva escritura, guardado y filtros por teclado (${width}px)`, async ({ page }) => {
  await page.setViewportSize({ width, height: 900 });
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('./');
  await expect(page.locator('.form-card>.liquid-glass-surface')).toHaveCSS('pointer-events', 'none');
  const objective = page.getByRole('textbox', { name: 'Objetivo de la inspección interna', exact: true });
  await objective.fill('Verificar las rutas de evacuación y los equipos.');
  await expect(objective).toBeFocused();
  await saveAndOpenList(page);
  const all = page.getByRole('button', { name: 'Todas tus inspecciones: 1', exact: true });
  const drafts = page.getByRole('button', { name: 'Borradores: 1', exact: true });
  await expect(all).toHaveAttribute('aria-pressed', 'true');
  await drafts.focus(); await drafts.press('Space');
  await expect(drafts).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.inspection-list-row')).toHaveCount(1);
  const before = await drafts.boundingBox();
  await drafts.hover();
  await expect.poll(async () => Math.abs((await drafts.boundingBox())!.y - before!.y)).toBeLessThan(1);
  await page.locator('.inspection-list-stats').screenshot({ path: test.info().outputPath(`cristal-${width}.png`) });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(errors).toEqual([]);
});

test('sin WebGL y con movimiento reducido, el fondo mantiene el formulario operativo', async ({ page }) => {
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (kind: string, ...args: unknown[]) {
      if (kind === 'webgl') return null;
      return Reflect.apply(original, this, [kind, ...args]);
    } as typeof original;
  });
  await page.goto('./');
  const background = page.locator('.context-card>.liquid-glass-surface');
  await expect(background).toBeVisible();
  await expect(background).toHaveAttribute('data-water', 'off');
  await expect(background.locator('canvas')).toBeHidden();
  await expect(background).not.toHaveCSS('background-image', 'none');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const objective = page.getByRole('textbox', { name: 'Objetivo de la inspección interna', exact: true });
  await objective.fill('Inspección accesible con el fondo estático.');
  await expect(objective).toBeFocused();
  await page.getByRole('button', { name: 'Guardar', exact: true }).first().click();
  await expect(page.locator('.save-status')).toContainText('Guardado en este navegador');
});
