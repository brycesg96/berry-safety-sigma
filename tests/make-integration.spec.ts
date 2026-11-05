import { test, expect } from '@playwright/test';
import { fixtureSession, mockMailSession, enableMailSession } from './mail-session-fixture';

test('prueba desde Administración: JSON mínimo, clave en memoria y acuse HTTP sin afirmar envío de correo', async ({ page }) => {
  await mockMailSession(page);
  const calls: { headers: Record<string, string>; body: unknown }[] = [];
  await page.route('**/api/integrations/make/test', async route => {
    const headers = route.request().headers(); calls.push({ headers, body: route.request().postDataJSON() });
    await route.fulfill({ json: { ok: true, receipt: 'http_accepted', request_id: headers['idempotency-key'], upstream_status: 200, email_requested: false, submitted_at: '2026-11-04T17:00:00Z' } });
  });
  await page.goto('./'); await page.getByRole('button', { name: 'Administración', exact: true }).click();
  await page.getByRole('button', { name: 'Integraciones', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Probar conexión con Make', exact: true })).toBeDisabled();
  const key = 'browser-test-key-not-a-production-secret';
  await page.getByLabel('Clave de configuración').fill(key);
  await page.getByRole('button', { name: 'Activar envíos', exact: true }).click();
  await expect(page.getByText(/Envíos habilitados en esta pestaña hasta/)).toBeVisible();
  await page.getByRole('button', { name: 'Probar conexión con Make', exact: true }).click();
  await expect(page.getByText('Make aceptó la solicitud (HTTP 200).', { exact: true })).toBeVisible();
  await expect(page.getByText('Esto confirma la aceptación HTTP, no la ejecución completa del escenario ni el envío de correo.', { exact: true })).toBeVisible();
  expect(calls).toHaveLength(1); expect(calls[0].body).toEqual({ action: 'make.test' });
  expect(calls[0].headers.authorization).toBe(`Bearer ${fixtureSession}`);
  const local = await page.evaluate(() => ({ local: JSON.stringify(localStorage), session: JSON.stringify(sessionStorage) }));
  expect(JSON.stringify(local)).not.toContain(key);
  await page.reload(); await page.getByRole('button', { name: 'Administración', exact: true }).click(); await page.getByRole('button', { name: 'Integraciones', exact: true }).click();
  await expect(page.getByLabel('Clave de configuración')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Probar conexión con Make', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: 'Desactivar en esta pestaña', exact: true }).click();
  await expect(page.getByLabel('Clave de configuración')).toHaveValue('');
});

test('rechazo y reintento: conserva el ID y no muestra éxito ficticio', async ({ page }) => {
  await mockMailSession(page);
  const ids: string[] = [];
  await page.route('**/api/integrations/make/test', async route => { ids.push(route.request().headers()['idempotency-key']); await route.fulfill(ids.length < 3 ? { status: 504, json: { ok: false, receipt: 'unconfirmed', code: 'MAKE_TIMEOUT' } } : { status: 502, json: { ok: false, receipt: 'rejected', code: 'MAKE_REJECTED', upstream_status: 410 } }); });
  await page.goto('./'); await page.getByRole('button', { name: 'Administración', exact: true }).click(); await enableMailSession(page);
  await page.getByRole('button', { name: 'Probar conexión con Make', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Recepción no confirmada');
  await page.getByRole('button', { name: 'Probar conexión con Make', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Recepción no confirmada');
  expect(ids).toHaveLength(2); expect(ids[0]).toBe(ids[1]);
  await page.getByRole('button', { name: 'Preparar otra prueba', exact: true }).click();
  await page.getByRole('button', { name: 'Probar conexión con Make', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Make rechazó la solicitud (HTTP 410).');
  await expect(page.getByRole('alert')).toContainText('Revisa que el Custom webhook esté activo');
  expect(ids[2]).not.toBe(ids[1]);
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
