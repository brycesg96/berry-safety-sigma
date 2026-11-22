import { test, expect } from './test-fixture';

test('las solicitudes externas y API sin simular se bloquean antes de llegar al servicio', async ({ page }) => {
  await page.goto('./');
  for (const url of ['https://example.invalid/no-network', '/api/inspections/send']) {
    const failure = page.waitForEvent('requestfailed', request => request.url().includes(url));
    await page.evaluate(async target => { try { await fetch(target); } catch { /* Expected local block. */ } }, url);
    expect((await failure).failure()?.errorText).toContain('ERR_BLOCKED_BY_CLIENT');
  }
});

test('el aislamiento cubre dispositivos nuevos y permite respuestas simuladas explícitas', async ({ browser }) => {
  const context = await browser.newContext();
  try {
    await context.route('**/api/fixture-check', route => route.fulfill({ json: { simulated: true } }));
    const page = await context.newPage(); await page.goto('./');
    expect(await page.evaluate(async () => (await fetch('/api/fixture-check')).json())).toEqual({ simulated: true });
    const failure = page.waitForEvent('requestfailed', request => request.url().includes('example.invalid'));
    await page.evaluate(async () => { try { await fetch('https://example.invalid/no-network'); } catch { /* Expected local block. */ } });
    expect((await failure).failure()?.errorText).toContain('ERR_BLOCKED_BY_CLIENT');
  } finally { await context.close(); }
});
