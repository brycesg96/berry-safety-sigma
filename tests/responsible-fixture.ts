import type { Page } from '@playwright/test';

/** Complete the second distinct recipient required by the inspection form. */
export async function selectSecondResponsible(page: Page, email = 'bryx.96@gmail.com', search = email) {
  const second = page.locator('.responsibles .responsible-row').nth(1).getByRole('combobox');
  await second.fill(search);
  await page.getByRole('option').filter({ hasText: email }).click();
}
