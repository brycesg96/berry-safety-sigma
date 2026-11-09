import type { Locator, Page } from '@playwright/test';
export async function selectLocation(scope: Page | Locator, label: 'Sede' | 'Zona de inspección', value: string) {
  const control = scope.getByRole('combobox', { name: label, exact: true });
  if (await control.getAttribute('aria-expanded') !== 'true') await control.click();
  await scope.getByRole('listbox').getByRole('option', { name: value, exact: true }).click();
}
