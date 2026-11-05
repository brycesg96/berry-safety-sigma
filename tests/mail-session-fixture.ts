import { expect } from '@playwright/test';
import type { Page } from '@playwright/test';
export const fixtureSession='berry.browser-fixture.signature';
export async function mockMailSession(page:Page) {
 await page.route('**/api/mail/session',route=>route.fulfill({json:{ok:true,access_token:fixtureSession,expires_at:new Date(Date.now()+8*60*60*1000).toISOString()}}));
}
export async function enableMailSession(page:Page,key='raw-key-that-must-not-be-stored') {
 await page.getByRole('button',{name:'Integraciones',exact:true}).click();
 await page.getByLabel('Clave de configuración').fill(key);
 await page.getByRole('button',{name:'Activar envíos',exact:true}).click();
 await expect(page.getByText(/Envíos habilitados en esta pestaña hasta/)).toBeVisible();
}
