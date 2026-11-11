import { selectValue } from './select-fixture';
import { saveAndOpenList } from './save-fixture';
import { test, expect } from '@playwright/test';

const adminEmail = 'bryx.96@gmail.com', inspectorEmail = 'bcespedes@hortifrut.com';
test.beforeEach(async ({ page }) => {
  // Isolate demo-account behavior from the optional remote directory connector.
  await page.route('**/api/people?*', route => route.fulfill({ json: { people: [] } }));
});

test('dos cuentas Bryan en el directorio y correo automático al seleccionar', async ({ page }) => {
  await page.goto('./');
  await expect(page.getByRole('button', { name: 'Administración', exact: true })).toBeVisible();
  await page.getByRole('combobox', { name: /Nombre completo/ }).fill('bryan');
  await expect(page.getByRole('listbox').getByRole('option')).toHaveCount(2);
  await expect(page.getByRole('listbox').getByRole('option', { name: new RegExp(adminEmail.replace('.', '\\.')) })).toBeVisible();
  await page.getByRole('listbox').getByRole('option', { name: new RegExp(inspectorEmail.replace('.', '\\.')) }).click();
  await expect(page.getByLabel('Correo electrónico')).toHaveValue(inspectorEmail);
  await expect(page.getByLabel('Correo electrónico')).toHaveAttribute('readonly', '');
});

test('administración conserva los datos existentes y ofrece una sola gestión de usuarios con Supabase', async ({ page }) => {
  const historical = JSON.stringify([{ id: 'historical-user', name: 'Laura Existente', email: 'laura@example.invalid', area: 'Mantenimiento', jobTitle: 'Supervisora', role: 'inspector', enabled: true }]);
  await page.addInitScript(value => localStorage.setItem('berry-demo-accounts-v1', value), historical);
  await page.goto('./');
  await page.getByLabel('Área inspeccionada').fill('Borrador anterior a la gestión de usuarios');
  await page.getByRole('button', { name: 'Guardar', exact: true }).first().click();
  await expect(page.getByText('Guardado en este navegador', { exact: true })).toBeAttached();
  await page.getByRole('button', { name: 'Administración', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Administrar usuarios', exact: true })).toHaveCount(1);
  await expect(page.getByRole('button', { name: 'Añadir cuenta', exact: true })).toHaveCount(0);
  await expect(page.getByLabel('Nombre de la cuenta')).toHaveCount(0);
  await expect(page.locator('.account-table')).toHaveCount(0);
  expect(await page.evaluate(() => localStorage.getItem('berry-demo-accounts-v1'))).toBe(historical);
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: '/tmp/berry-administration-unified.png', fullPage: true, animations: 'disabled' });
  await page.getByRole('button', { name: 'Administrar usuarios', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Inicia sesión', exact: true })).toBeVisible();
  await expect(page).toHaveURL(/acceso=cuenta&seccion=usuarios/);
  await page.getByRole('button', { name: 'Espacio de pruebas', exact: true }).click();
  await expect(page.getByLabel('Área inspeccionada')).toHaveValue('Borrador anterior a la gestión de usuarios');
  await page.getByRole('button', { name: 'Mi perfil', exact: true }).click();
  await page.getByLabel('Cuenta de prueba').click();
  await expect(page.getByRole('option', { name: /Laura Existente/ })).toHaveCount(1);
  await page.getByLabel('Cuenta de prueba').press('Escape');
  expect(await page.evaluate(() => localStorage.getItem('berry-demo-accounts-v1'))).toBe(historical);
});

test('cambio de rol de prueba sin login, perfil separado y borradores de cada cuenta', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('./');
  await page.getByLabel('Área inspeccionada').fill('Borrador personal administrador');
  await page.getByRole('button', { name: 'Guardar', exact: true }).first().click();
  await expect(page.getByText('Guardado en este navegador', { exact: true })).toBeAttached();
  await page.getByRole('button', { name: 'Mi perfil', exact: true }).click();
  await expect(page.getByLabel('Correo de tu cuenta')).toHaveValue(adminEmail);
  await expect(page.getByRole('button', { name: /Microsoft/ })).toHaveCount(0);
  await selectValue(page.getByLabel('Cuenta de prueba'), 'demo-inspector');
  await expect(page.getByLabel('Correo de tu cuenta')).toHaveValue(inspectorEmail);
  await page.getByLabel('Nombres y apellidos').fill('Bryan de Inspecciones');
  await page.getByRole('dialog', { name: 'Mi perfil' }).getByLabel('Área').fill('Prevención');
  await page.getByRole('button', { name: 'Guardar perfil', exact: true }).click();
  await expect(page.getByLabel('Área inspeccionada')).toHaveValue('');
  await page.getByRole('button', { name: 'Abrir menú' }).click();
  await expect(page.getByRole('button', { name: 'Administración', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Cerrar menú', exact: true }).click();
  await page.getByLabel('Área inspeccionada').fill('Borrador del inspector');
  await saveAndOpenList(page);
  await page.reload();
  await expect(page.getByLabel('Área inspeccionada')).toHaveValue('Borrador del inspector');
  await page.getByRole('button', { name: 'Mi perfil', exact: true }).click();
  await expect(page.getByLabel('Nombres y apellidos')).toHaveValue('Bryan de Inspecciones');
  await expect(page.getByRole('dialog', { name: 'Mi perfil' }).getByLabel('Área')).toHaveValue('Prevención');
  await selectValue(page.getByLabel('Cuenta de prueba'), 'demo-admin');
  await expect(page.getByLabel('Correo de tu cuenta')).toHaveValue(adminEmail);
  await expect(page.getByRole('dialog', { name: 'Mi perfil' }).getByLabel('Área')).toHaveValue('');
  await page.getByRole('button', { name: 'Cerrar ventana', exact: true }).click();
  await expect(page.getByLabel('Área inspeccionada')).toHaveValue('Borrador personal administrador');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('el acceso ofrece Supabase sin opciones Microsoft y conserva el espacio de permisos', async ({ page }) => {
  const externalRequests: string[] = [];
  page.on('request', r => { if (/login\.microsoftonline|login\.live|graph\.microsoft/.test(r.url())) externalRequests.push(r.url()); });
  await page.goto('./'); await page.getByRole('button', { name: 'Administración', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Administrar usuarios', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Inicio de sesión', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: /Microsoft/ })).toHaveCount(0);
  await page.getByRole('button', { name: 'Funciones y permisos', exact: true }).click();
  await expect(page.getByText('Los permisos adicionales se definirán en próximos avances.')).toBeVisible();
  expect(externalRequests).toEqual([]);
});

test('área y cargo del perfil reemplazan la leyenda del directorio y se conservan al recargar', async ({ page }) => {
  await page.goto('./');
  await expect(page.getByRole('button', { name: 'Continuar', exact: true })).toBeEnabled();
  await page.getByRole('combobox', { name: /Nombre completo/ }).fill('Bryan');
  await page.getByRole('listbox').getByRole('option', { name: /bryx.96@gmail.com/ }).click();
  await expect(page.getByText('Área y puesto por completar.', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Mi perfil', exact: true }).click();
  const profile = page.getByRole('dialog', { name: 'Mi perfil' });
  await profile.getByLabel('Área').fill('Seguridad y Salud');
  await profile.getByLabel('Puesto', { exact: true }).fill('Supervisor SST');
  await page.getByRole('button', { name: 'Guardar perfil', exact: true }).click();
  await expect(page.locator('.responsibles').getByText('Seguridad y Salud — Supervisor SST', { exact: true })).toBeVisible();
  await expect(page.getByText('Persona seleccionada del directorio.', { exact: true })).toHaveCount(0);
  await saveAndOpenList(page); await page.reload();
  await expect(page.locator('.responsibles').getByText('Seguridad y Salud — Supervisor SST', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Mi perfil', exact: true }).click();
  await expect(profile.getByLabel('Puesto', { exact: true })).toHaveValue('Supervisor SST');
  await profile.getByLabel('Puesto', { exact: true }).fill('');
  await page.getByRole('button', { name: 'Guardar perfil', exact: true }).click();
  const picker = page.locator('.responsible-row .picker-grid');
  await expect(picker).toContainText('Seguridad y Salud');
  await expect(picker).not.toContainText('Supervisor SST');
  await expect(picker).not.toContainText('—');
  await expect(page.getByLabel('Correo electrónico')).toHaveValue(adminEmail);
  await expect(page.getByLabel('Correo electrónico')).toHaveAttribute('readonly', '');
  await page.getByRole('combobox', { name: /Nombre completo/ }).fill('Otra persona');
  await expect(picker).not.toContainText('Seguridad y Salud');
});
