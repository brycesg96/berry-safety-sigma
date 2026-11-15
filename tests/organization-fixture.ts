import type { Page } from '@playwright/test';
/** Fictional catalog for isolated browser tests, never included in the app catalog. */
export const organizationCatalog = [
  { management: 'Gerencia de prueba A', areas: ['Área de prueba A1', 'Área de prueba A2'], positions: { 'Área de prueba A1': ['Puesto de prueba A1', 'Segundo puesto de prueba A1'], 'Área de prueba A2': ['Puesto de prueba A2'] } },
  { management: 'Gerencia de prueba B', areas: ['Área de prueba B1'], positions: { 'Área de prueba B1': ['Puesto de prueba B1'] } },
];
export async function mockOrganizationCatalog(page: Page) {
  const nodes = organizationCatalog.flatMap((entry, m) => {
    const management = `m-${m}`;
    return [{ id: management, parent_id: null, kind: 'management', name: entry.management, enabled: true, revision: 1 }, ...entry.areas.flatMap((name, a) => {
      const area = `${management}-a-${a}`;
      return [{ id: area, parent_id: management, kind: 'area', name, enabled: true, revision: 1 }, ...(entry.positions[name as keyof typeof entry.positions] || []).map((job: string, p: number) => ({ id: `${area}-p-${p}`, parent_id: area, kind: 'position', name: job, enabled: true, revision: 1 }))];
    })];
  });
  await page.route('**/src/organization-seed.json*', route => route.fulfill({ contentType: 'application/javascript', body: `export default ${JSON.stringify(nodes)};` }));
  await page.route('**/rest/v1/rpc/berry_schema_status', route => route.fulfill({ json: { schema_version: '202611070001', sync_ready: true, stage: 'reports', organization_catalog_version: '202611150014' } }));
  await page.route('**/rest/v1/rpc/berry_organization_catalog', route => route.fulfill({ json: organizationCatalog }));
}
