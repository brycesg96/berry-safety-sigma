import { openWorkspaceProfile } from './workspace-profile-fixture';
import { selectValue } from './select-fixture';
import { saveAndOpenList } from './save-fixture';
import { test, expect } from './test-fixture';
import { mockOrganizationCatalog } from './organization-fixture';

const adminEmail = 'bryx.96@gmail.com', inspectorEmail = 'bcespedes@hortifrut.com';
test.beforeEach(async ({ page }) => {
  await mockOrganizationCatalog(page);
  // Isolate demo-account behavior from the optional remote directory connector.
  await page.route('**/api/people?*', route => route.fulfill({ json: { people: [] } }));
});

test('dos cuentas Bryan en el directorio y correo automático al seleccionar', async ({ page }) => {
  await page.goto('./');
  await expect(page.getByRole('button', { name: 'Administración', exact: true })).toBeVisible();
  await page.getByRole('combobox', { name: /Nombre completo/ }).first().fill('bryan');
  await expect(page.getByRole('listbox').getByRole('option')).toHaveCount(2);
  await expect(page.getByRole('listbox').getByRole('option', { name: new RegExp(adminEmail.replace('.', '\\.')) })).toBeVisible();
  await page.getByRole('listbox').getByRole('option', { name: new RegExp(inspectorEmail.replace('.', '\\.')) }).click();
  await expect(page.locator('.responsibles .field-hint').first()).toContainText(inspectorEmail);
  await expect(page.locator('.responsibles').getByRole('textbox',{name:'Correo electrónico',exact:true})).toHaveCount(0);
});

test('administración conserva los datos existentes y ofrece una sola gestión de usuarios con Supabase', async ({ page }) => {
  const historical = JSON.stringify([{ id: 'historical-user', name: 'Laura Existente', email: 'laura@example.invalid', area: 'Mantenimiento', jobTitle: 'Supervisora', role: 'inspector', enabled: true }]);
  await page.addInitScript(value => localStorage.setItem('berry-demo-accounts-v1', value), historical);
  await page.goto('./');
  await page.getByRole('textbox', { name: 'Objetivo de la inspección interna', exact: true }).fill('Borrador anterior a la gestión de usuarios');
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
  await expect(page.getByRole('textbox', { name: 'Objetivo de la inspección interna', exact: true })).toHaveValue('Borrador anterior a la gestión de usuarios');
  await openWorkspaceProfile(page);
  await page.getByLabel('Cuenta de prueba').click();
  await expect(page.getByRole('option', { name: /Laura Existente/ })).toHaveCount(1);
  await page.getByLabel('Cuenta de prueba').press('Escape');
  expect(await page.evaluate(() => localStorage.getItem('berry-demo-accounts-v1'))).toBe(historical);
});

test('cambio de rol de prueba sin login, perfil separado y borradores de cada cuenta', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('./');
  await page.getByRole('textbox', { name: 'Objetivo de la inspección interna', exact: true }).fill('Borrador personal administrador');
  await page.getByRole('button', { name: 'Guardar', exact: true }).first().click();
  await expect(page.getByText('Guardado en este navegador', { exact: true })).toBeAttached();
  await openWorkspaceProfile(page);
  await expect(page.getByLabel('Correo de tu cuenta')).toHaveValue(adminEmail);
  await expect(page.getByRole('button', { name: /Microsoft/ })).toHaveCount(0);
  await selectValue(page.getByLabel('Cuenta de prueba'), 'demo-inspector');
  await expect(page.getByLabel('Correo de tu cuenta')).toHaveValue(inspectorEmail);
  await page.getByLabel('Nombres y apellidos').fill('Bryan de Inspecciones');
  const profile = page.getByRole('dialog', { name: 'Mi perfil' });
  await selectValue(profile.getByRole('combobox', { name: 'Gerencia', exact: true }), 'Gerencia de prueba A');
  await selectValue(profile.getByRole('combobox', { name: 'Área', exact: true }), 'Área de prueba A1');
  await selectValue(profile.getByRole('combobox', { name: 'Puesto', exact: true }), 'Puesto de prueba A1');
  await page.getByRole('button', { name: 'Guardar perfil', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Objetivo de la inspección interna', exact: true })).toHaveValue('');
  await page.getByRole('button', { name: 'Abrir menú' }).click();
  await expect(page.getByRole('button', { name: 'Administración', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Cerrar menú', exact: true }).click();
  await page.getByRole('textbox', { name: 'Objetivo de la inspección interna', exact: true }).fill('Borrador del inspector');
  await saveAndOpenList(page);
  await page.reload();
  await expect(page.getByRole('textbox', { name: 'Objetivo de la inspección interna', exact: true })).toHaveValue('Borrador del inspector');
  await openWorkspaceProfile(page);
  await expect(page.getByLabel('Nombres y apellidos')).toHaveValue('Bryan de Inspecciones');
  await expect(profile.getByRole('combobox', { name: 'Área', exact: true })).toHaveAttribute('data-value', 'Área de prueba A1');
  await selectValue(page.getByLabel('Cuenta de prueba'), 'demo-admin');
  await expect(page.getByLabel('Correo de tu cuenta')).toHaveValue(adminEmail);
  await expect(profile.getByRole('combobox', { name: 'Área', exact: true })).toHaveAttribute('data-value', '');
  await page.getByRole('button', { name: 'Cerrar ventana', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Objetivo de la inspección interna', exact: true })).toHaveValue('Borrador personal administrador');
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
  await page.getByRole('combobox', { name: /Nombre completo/ }).first().fill('Bryan');
  await page.getByRole('listbox').getByRole('option', { name: /bryx.96@gmail.com/ }).click();
  await expect(page.locator('.responsibles .field-hint').first()).toHaveText(adminEmail);
  await openWorkspaceProfile(page);
  const profile = page.getByRole('dialog', { name: 'Mi perfil' });
  await selectValue(profile.getByRole('combobox', { name: 'Gerencia', exact: true }), 'Gerencia de prueba A');
  await selectValue(profile.getByRole('combobox', { name: 'Área', exact: true }), 'Área de prueba A1');
  await selectValue(profile.getByRole('combobox', { name: 'Puesto', exact: true }), 'Puesto de prueba A1');
  await page.getByRole('button', { name: 'Guardar perfil', exact: true }).click();
  await expect(page.locator('.responsibles .field-hint').first()).toContainText('Área de Prueba A1');
  await expect(page.locator('.primary-inspector-field')).toContainText('Área de Prueba A1 — Puesto de Prueba A1');
  await expect(page.getByText('Persona seleccionada del directorio.', { exact: true })).toHaveCount(0);
  await saveAndOpenList(page); await page.reload();
  await expect(page.locator('.responsibles .field-hint').first()).toContainText('Área de Prueba A1');
  await openWorkspaceProfile(page);
  await expect(profile.getByRole('combobox', { name: 'Puesto', exact: true })).toHaveAttribute('data-value', 'Puesto de prueba A1');
  await selectValue(profile.getByRole('combobox', { name: 'Puesto', exact: true }), 'Segundo puesto de prueba A1');
  await page.getByRole('button', { name: 'Guardar perfil', exact: true }).click();
  const picker = page.locator('.responsible-row .picker-grid').first();
  await expect(picker).toContainText('Área de Prueba A1');
  await expect(page.locator('.primary-inspector-field')).toContainText('Segundo Puesto de Prueba A1');
  await expect(picker.locator('.field-hint')).toContainText('Segundo Puesto de Prueba A1');
  await expect(page.locator('.responsibles .field-hint').first()).toContainText(adminEmail);
  await expect(page.locator('.responsibles').getByRole('textbox',{name:'Correo electrónico',exact:true})).toHaveCount(0);
  await page.getByRole('combobox', { name: /Nombre completo/ }).first().fill('Otra persona');
  await expect(picker).not.toContainText('Área de Prueba A1');
});
