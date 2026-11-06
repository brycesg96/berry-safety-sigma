import { test, expect } from '@playwright/test';
import { mockDirectory } from './directory-fixture';

const texts = { objective: 'Objetivo de la última inspección enviada.', unfavorableCause: 'Causa de la última inspección enviada.', closingRemarks: 'Recomendaciones de la última inspección enviada.' };

test('otra cuenta sin historial recibe los textos compartidos, puede cambiarlos y conserva su borrador', async ({ page }) => {
  let shared = { ...texts };
  await mockDirectory(page);
  await page.route('**/api/inspections/send', route => route.fulfill({ json: { ok: true, defaults: { texts: shared, acceptedAt: '2099-11-06T15:00:00Z' } } }));
  await page.goto('./');
  await expect(page.getByRole('textbox', { name: 'Objetivo de la inspección interna', exact: true })).toHaveValue(texts.objective);
  await expect(page.getByText('Sin iniciar', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Mi perfil', exact: true }).click();
  await page.getByLabel('Cuenta de prueba').selectOption('demo-inspector');
  await page.getByRole('button', { name: 'Cerrar ventana', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Objetivo de la inspección interna', exact: true })).toHaveValue(texts.objective);
  await page.getByLabel('Área inspeccionada').fill('Área nueva');
  await page.getByLabel('Hora de inspección').fill('07:30'); await page.getByLabel('AM o PM').selectOption('AM');
  await page.getByRole('radio', { name: 'Planeada', exact: true }).check();
  await page.getByRole('combobox', { name: /Nombre completo/ }).fill('Ana');
  await page.getByRole('listbox').getByRole('option', { name: /Ana Torres/ }).click();
  await page.getByRole('button', { name: 'Continuar', exact: true }).click();
  await page.getByRole('button', { name: 'Añadir observación', exact: true }).click();
  await page.getByLabel('Descripción').fill('Hallazgo nuevo.'); await page.getByLabel('Acción a tomar').fill('Corregir el hallazgo.');
  await page.getByLabel('Fecha de Cierre').fill('2026-11-20');
  await page.getByRole('button', { name: 'Continuar', exact: true }).click(); await page.getByRole('button', { name: 'Continuar', exact: true }).click();
  const cause = page.getByRole('textbox', { name: 'DESCRIPCIÓN DE LA CAUSA ANTE RESULTADOS DESFAVORABLES DE LA INSPECCIÓN', exact: true });
  const remarks = page.getByRole('textbox', { name: 'CONCLUSIONES Y RECOMENDACIONES', exact: true });
  await expect(cause).toHaveValue(texts.unfavorableCause); await expect(remarks).toHaveValue(texts.closingRemarks);
  await cause.fill(''); await remarks.fill('Recomendación propia del borrador.');
  await expect(page.getByText('Guardado en este navegador', { exact: true })).toBeVisible();
  shared = { objective: 'Otro objetivo enviado', unfavorableCause: 'Otra causa enviada', closingRemarks: 'Otras recomendaciones enviadas' };
  await page.reload();
  await expect(cause).toHaveValue(''); await expect(remarks).toHaveValue('Recomendación propia del borrador.');
});

test('respuesta lenta no sobrescribe texto recién escrito y la precarga sola no crea un borrador', async ({ page }) => {
  let release!: () => void;
  const wait = new Promise<void>(resolve => { release = resolve; });
  await page.route('**/api/inspections/send', async route => { await wait; await route.fulfill({ json: { ok: true, defaults: { texts, acceptedAt: '2099-11-06T15:00:00Z' } } }); });
  await page.goto('./');
  const objective = page.getByRole('textbox', { name: 'Objetivo de la inspección interna', exact: true });
  await objective.fill('Texto que acabo de escribir.'); release();
  await expect(objective).toHaveValue('Texto que acabo de escribir.');
  await page.getByRole('button', { name: 'Guardar y salir', exact: true }).click();
  await page.getByRole('button', { name: 'Nueva inspección', exact: true }).click();
  await expect(objective).toHaveValue(texts.objective);
  await expect(page.getByText('Sin iniciar', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Guardar y salir', exact: true }).click();
  await expect(page.locator('.inspection-list-row')).toHaveCount(1);
});
