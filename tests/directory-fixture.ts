import type { Page } from '@playwright/test';

/** Fictitious identities used only by browser tests, never shipped in the app. */
export const people = [
  { id: 'test-ana', name: 'Ana Torres', email: 'ana@example.com' },
  { id: 'test-jose', name: 'José Rojas', email: 'jose@example.com' },
];
export async function mockDirectory(page: Page) {
  await page.route('**/api/people?*', async route => {
    const query = new URL(route.request().url()).searchParams.get('search') || '';
    const normalize = (s: string) => s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();
    await route.fulfill({ json: { people: people.filter(p => normalize(p.name).includes(normalize(query))) } });
  });
}
