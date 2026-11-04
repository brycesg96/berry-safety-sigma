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

test('administración añade, edita, desactiva y conserva una cuenta tras recargar', async ({ page }) => {
  await page.goto('./');
  await page.getByRole('button', { name: 'Administración', exact: true }).click();
  const seeded = page.locator('.account-row');
  await expect(seeded).toHaveCount(2);
  await expect(seeded.filter({ hasText: adminEmail })).toContainText('Administrador');
  await expect(seeded.filter({ hasText: inspectorEmail })).toContainText('Inspecciones');
  await page.getByLabel('Nombre de la cuenta').fill('Laura Prueba');
  await page.getByLabel('Correo de la cuenta').fill('LAURA@example.com');
  await page.getByRole('button', { name: 'Añadir cuenta', exact: true }).click();
  await expect(seeded).toHaveCount(3);
  await expect(page.getByRole('status')).toContainText('No se ha enviado ninguna invitación.');
  await page.getByLabel('Nombre de la cuenta').fill('Otra Laura');
  await page.getByLabel('Correo de la cuenta').fill('laura@example.com');
  await page.getByRole('button', { name: 'Añadir cuenta', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Este correo ya tiene una cuenta.');
  await page.getByRole('button', { name: 'Editar cuenta laura@example.com' }).click();
  await page.getByLabel('Nombre de la cuenta').fill('Laura Editada');
  await expect(page.getByLabel('Correo de la cuenta')).toHaveAttribute('readonly', '');
  await page.getByRole('button', { name: 'Guardar cuenta', exact: true }).click();
  await page.reload();
  await page.getByRole('button', { name: 'Administración', exact: true }).click();
  await expect(page.locator('.account-row').filter({ hasText: 'Laura Editada' })).toBeVisible();
  await page.locator('.account-row').filter({ hasText: 'laura@example.com' }).getByRole('button', { name: 'Desactivar', exact: true }).click();
  await expect(page.locator('.account-row').filter({ hasText: 'laura@example.com' })).toContainText('Desactivada');
  await page.getByRole('button', { name: 'Nueva inspección', exact: true }).click();
  await page.getByRole('combobox', { name: /Nombre completo/ }).fill('Laura');
  await expect(page.getByText('No hay personas disponibles con ese nombre.')).toBeVisible();
  await page.getByRole('button', { name: 'Administración', exact: true }).click();
  await page.locator('.account-row').filter({ hasText: 'laura@example.com' }).getByRole('button', { name: 'Activar', exact: true }).click();
  await page.getByRole('button', { name: 'Nueva inspección', exact: true }).click();
  await page.getByRole('combobox', { name: /Nombre completo/ }).fill('Laura');
  await page.getByRole('listbox').getByRole('option', { name: /Laura Editada/ }).click();
  await expect(page.getByLabel('Correo electrónico')).toHaveValue('laura@example.com');
});

test('cambio de rol de prueba sin login, perfil separado y borradores de cada cuenta', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('./');
  await page.getByLabel('Área inspeccionada').fill('Borrador personal administrador');
  await page.getByRole('button', { name: 'Mi perfil', exact: true }).click();
  await expect(page.getByLabel('Correo de tu cuenta')).toHaveValue(adminEmail);
  await expect(page.getByRole('button', { name: /Continuar con Microsoft/ })).toBeDisabled();
  await page.getByLabel('Cuenta de prueba').selectOption('demo-inspector');
  await expect(page.getByLabel('Correo de tu cuenta')).toHaveValue(inspectorEmail);
  await page.getByLabel('Nombres y apellidos').fill('Bryan de Inspecciones');
  await page.getByRole('dialog', { name: 'Tu perfil' }).getByLabel('Área').fill('Prevención');
  await page.getByRole('button', { name: 'Guardar perfil', exact: true }).click();
  await expect(page.getByLabel('Área inspeccionada')).toHaveValue('');
  await page.getByRole('button', { name: 'Abrir menú' }).click();
  await expect(page.getByRole('button', { name: 'Administración', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Cerrar menú', exact: true }).click();
  await page.getByLabel('Área inspeccionada').fill('Borrador del inspector');
  await page.getByRole('button', { name: 'Guardar y salir' }).click();
  await page.reload();
  await expect(page.getByLabel('Área inspeccionada')).toHaveValue('Borrador del inspector');
  await page.getByRole('button', { name: 'Mi perfil', exact: true }).click();
  await expect(page.getByLabel('Nombres y apellidos')).toHaveValue('Bryan de Inspecciones');
  await expect(page.getByRole('dialog', { name: 'Tu perfil' }).getByLabel('Área')).toHaveValue('Prevención');
  await page.getByLabel('Cuenta de prueba').selectOption('demo-admin');
  await expect(page.getByLabel('Correo de tu cuenta')).toHaveValue(adminEmail);
  await expect(page.getByRole('dialog', { name: 'Tu perfil' }).getByLabel('Área')).toHaveValue('');
  await page.getByRole('button', { name: 'Cerrar ventana', exact: true }).click();
  await expect(page.getByLabel('Área inspeccionada')).toHaveValue('Borrador personal administrador');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('Microsoft permanece desactivado y el espacio de permisos queda visible al administrador', async ({ page }) => {
  const externalRequests: string[] = [];
  page.on('request', r => { if (/login\.microsoftonline|login\.live|graph\.microsoft/.test(r.url())) externalRequests.push(r.url()); });
  await page.goto('./'); await page.getByRole('button', { name: 'Administración', exact: true }).click();
  await page.getByRole('button', { name: 'Inicio de sesión', exact: true }).click();
  await expect(page.getByRole('button', { name: /Continuar con Microsoft/ })).toBeDisabled();
  await page.getByRole('button', { name: 'Funciones y permisos', exact: true }).click();
  await expect(page.getByText('Los permisos adicionales se definirán en próximos avances.')).toBeVisible();
  expect(externalRequests).toEqual([]);
});

test('área y cargo del perfil reemplazan la leyenda del directorio y se conservan al recargar', async ({ page }) => {
  await page.goto('./');
  await page.getByRole('combobox', { name: /Nombre completo/ }).fill('Bryan');
  await page.getByRole('listbox').getByRole('option', { name: /bryx.96@gmail.com/ }).click();
  await expect(page.getByText('Área y cargo por completar.', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Mi perfil', exact: true }).click();
  const profile = page.getByRole('dialog', { name: 'Tu perfil' });
  await profile.getByLabel('Área').fill('Seguridad y Salud');
  await profile.getByLabel('Cargo', { exact: true }).fill('Supervisor SST');
  await page.getByRole('button', { name: 'Guardar perfil', exact: true }).click();
  await expect(page.getByText('Seguridad y Salud — Supervisor SST', { exact: true })).toBeVisible();
  await expect(page.getByText('Persona seleccionada del directorio.', { exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Guardar y salir' }).click(); await page.reload();
  await expect(page.getByText('Seguridad y Salud — Supervisor SST', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Mi perfil', exact: true }).click();
  await expect(profile.getByLabel('Cargo', { exact: true })).toHaveValue('Supervisor SST');
  await profile.getByLabel('Cargo', { exact: true }).fill('');
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
