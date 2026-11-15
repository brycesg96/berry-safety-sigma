import type { Page } from '@playwright/test';
/** Fictional catalog for isolated browser tests, never included in the app catalog. */
export const organizationCatalog = [
  { management: 'Gerencia de prueba A', areas: ['Área de prueba A1', 'Área de prueba A2'] },
  { management: 'Gerencia de prueba B', areas: ['Área de prueba B1'] },
];
export async function mockOrganizationCatalog(page: Page) {
  await page.route('**/src/organization-catalog.ts*', route => route.fulfill({ contentType: 'application/javascript', body: `export const ORGANIZATION_CATALOG = ${JSON.stringify(organizationCatalog)};` }));
}
