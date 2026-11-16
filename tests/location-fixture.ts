import type { Locator, Page } from '@playwright/test';
export async function selectLocation(scope: Page | Locator, label: 'Sede' | 'Zona de inspección', value: string, organization = true) {
  const control = scope.getByRole('combobox', { name: label, exact: true });
  if (await control.getAttribute('aria-expanded') !== 'true') await control.click();
  await scope.getByRole('listbox').getByRole('option', { name: value, exact: true }).click();
  if (label === 'Zona de inspección') {
    const management = scope.getByRole('combobox', { name: 'Gerencia', exact: true });
    if (organization && await management.count() && await management.isEnabled() && (await management.textContent())?.includes('Selecciona una gerencia')) {
      await management.click(); await scope.getByRole('listbox').getByRole('option').first().click();
      await scope.getByRole('combobox', { name: 'Área', exact: true }).click(); await scope.getByRole('listbox').getByRole('option').first().click();
    }
    const installation = scope.getByRole('combobox', { name: 'Instalación', exact: true });
    if (await installation.count() && await installation.isEnabled() && !await installation.getAttribute('data-value')) {
      await installation.click(); await scope.getByRole('listbox').getByRole('option').first().click();
    }
  }
}
