import { test, expect } from '@playwright/test';

test('cliente público preparado reconoce la estructura sin activar sincronización ni iniciar sesión', async ({ page }) => {
  await page.route('**/api/people?*', route => route.fulfill({ json: { people: [] } }));
  await page.route('**/api/inspections/send', route => route.fulfill({ json: { ok: true, defaults: null } }));
  let calls = 0;
  await page.route('https://rwacygoxhkxxxkvushmb.supabase.co/**', async route => {
    calls++;
    expect(new URL(route.request().url()).pathname).toBe('/rest/v1/rpc/berry_schema_status');
    expect(route.request().headers().apikey).toMatch(/^sb_publishable_/);
    await route.fulfill({ json: { schema_version: '202611070001', stage: 'foundation', sync_ready: false } });
  });
  await page.goto('./');
  await expect(page.getByRole('button', { name: 'Continuar', exact: true })).toBeEnabled();
  expect(calls).toBe(0);
  const status = await page.evaluate(async () => {
    const { supabaseFoundationStatus } = await import('/src/supabase.ts');
    return supabaseFoundationStatus();
  });
  expect(status.sync_ready).toBe(false); expect(calls).toBe(1);
  await expect(page.getByLabel('Área inspeccionada')).toBeVisible();
});
