import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.route('**/api/people?*', route => route.fulfill({ json: { people: [] } }));
  await page.route('**/api/inspections/send', route => route.fulfill({ json: { ok: true, defaults: null } }));
  await page.route('**/previous-page', route => route.fulfill({ contentType: 'text/html; charset=utf-8', body: '<meta charset="utf-8"><h1>Página anterior</h1>' }));
});
async function openFromPrevious(page: Page) {
  await page.goto('/previous-page'); await page.goto('./');
  await expect(page.getByRole('button', { name: 'Continuar', exact: true })).toBeEnabled();
}
async function requestExit(page: Page) {
  await page.evaluate(() => history.back());
  const dialog = page.getByRole('dialog', { name: '¿Estás seguro de salir?', exact: true });
  await expect(dialog).toBeVisible(); return dialog;
}

test('Atrás permite cancelar sin perder el texto y salir sin acumular entradas ni pedir dos confirmaciones', async ({ page }) => {
  await openFromPrevious(page);
  await page.getByLabel('Área inspeccionada').fill('Texto que debo conservar');
  await page.evaluate(() => scrollTo(0, 500));
  const scroll = await page.evaluate(() => scrollY);
  const length = await page.evaluate(() => history.length);
  for (let attempt = 0; attempt < 3; attempt++) {
    const dialog = await requestExit(page);
    await dialog.getByRole('button', { name: 'Seguir en la aplicación', exact: true }).click();
    await expect(page.getByLabel('Área inspeccionada')).toHaveValue('Texto que debo conservar');
    expect(Math.abs(await page.evaluate(() => scrollY) - scroll)).toBeLessThan(2);
    expect(await page.evaluate(() => history.length)).toBe(length);
  }
  let nativeDialogs = 0;
  page.on('dialog', async dialog => { nativeDialogs++; await dialog.accept(); });
  await (await requestExit(page)).getByRole('button', { name: 'Salir', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Página anterior', exact: true })).toBeVisible();
  expect(nativeDialogs).toBe(0);
  await page.goForward();
  await expect(page.getByLabel('Área inspeccionada')).toBeVisible();
  await (await requestExit(page)).getByRole('button', { name: 'Seguir en la aplicación', exact: true }).click();
  expect(await page.evaluate(() => history.length)).toBe(length);
});

test('móvil conserva un perfil en edición al cancelar Atrás y reutiliza la protección después de recargar', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openFromPrevious(page);
  await page.getByRole('button', { name: 'Mi perfil', exact: true }).click();
  const profile = page.getByRole('dialog', { name: 'Tu perfil', exact: true });
  await profile.getByLabel('Nombres y apellidos').fill('Nombre todavía sin guardar');
  await requestExit(page);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog', { name: '¿Estás seguro de salir?', exact: true })).toHaveCount(0);
  await expect(profile).toBeVisible();
  await expect(profile.getByLabel('Nombres y apellidos')).toHaveValue('Nombre todavía sin guardar');
  await profile.getByRole('button', { name: 'Cerrar ventana', exact: true }).click();
  const length = await page.evaluate(() => history.length);
  page.once('dialog', async dialog => { expect(dialog.type()).toBe('beforeunload'); await dialog.accept(); });
  await page.reload();
  await expect(page.getByRole('button', { name: 'Continuar', exact: true })).toBeEnabled();
  expect(await page.evaluate(() => history.length)).toBe(length);
  await page.getByRole('button', { name: 'Mi perfil', exact: true }).click();
  await page.getByRole('dialog', { name: 'Tu perfil', exact: true }).getByRole('button', { name: 'Cerrar ventana', exact: true }).click();
  const dialog = await requestExit(page);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await dialog.getByRole('button', { name: 'Seguir en la aplicación', exact: true }).click();
});

test('recargar permite cancelar con el aviso nativo y salir funciona también en una pestaña abierta directamente', async ({ page }) => {
  await page.goto('./');
  await expect(page.getByRole('button', { name: 'Continuar', exact: true })).toBeEnabled();
  await page.getByLabel('Área inspeccionada').fill('No salir todavía');
  let reloadWarning = 0;
  page.once('dialog', async dialog => { reloadWarning++; expect(dialog.type()).toBe('beforeunload'); await dialog.dismiss(); });
  await page.evaluate(() => location.reload());
  await expect.poll(() => reloadWarning).toBe(1);
  await expect(page.getByLabel('Área inspeccionada')).toHaveValue('No salir todavía');
  await (await requestExit(page)).getByRole('button', { name: 'Salir', exact: true }).click();
  await expect(page).toHaveURL('about:blank');
});
