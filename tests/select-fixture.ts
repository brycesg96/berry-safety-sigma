import type { Locator } from '@playwright/test';

export async function selectValue(control: Locator, value: string) {
  const trigger = control.and(control.page().getByRole('combobox'));
  await trigger.click();
  await control.page().getByRole('listbox').locator(`[role="option"][data-value=${JSON.stringify(value)}]`).click();
  // A multiple selector stays open so more options can be chosen.
  if (await trigger.getAttribute('aria-expanded') === 'true') await control.page().getByRole('button', { name: 'Listo', exact: true }).click();
}
