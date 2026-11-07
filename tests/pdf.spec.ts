import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
const run = promisify(execFile);

test.beforeEach(async ({ page }) => {
  await page.route('**/api/people?*', route => route.fulfill({ json: { people: [] } }));
  await page.route('**/api/inspections/send', route => route.fulfill({ json: { ok: true, defaults: null } }));
});

for (const count of [1, 7]) test(`PDF descargable del registro cerrado con ${count} observaciones y evidencias`, async ({ page }) => {
  await page.goto('./');
  await expect(page.getByRole('button', { name: 'Continuar', exact: true })).toBeEnabled();
  await page.evaluate(async count => {
    const { newInspection, newObservation, persistInspection } = await import('/src/model.ts');
    const canvas = document.createElement('canvas'); canvas.width = 400; canvas.height = 300;
    const context = canvas.getContext('2d')!;
    const photo = (label: string, color: string) => {
      context.fillStyle = color; context.fillRect(0, 0, 400, 300);
      context.fillStyle = '#ffffff'; context.font = '32px sans-serif'; context.fillText(label, 24, 155);
      return { id: crypto.randomUUID(), name: `${label}.png`, data: canvas.toDataURL('image/png') };
    };
    const report = newInspection({ name: 'María Núñez', email: 'bryx.96@gmail.com', accountId: 'demo-admin' });
    report.area = 'Taller de inspección'; report.date = '2026-11-07'; report.inspectionTime = '09:30'; report.inspectionPeriod = 'AM'; report.type = 'Planeada';
    report.objective = 'Verificar condiciones de seguridad y prevención.';
    report.unfavorableCause = 'Falta de señalización y mantenimiento.';
    report.closingRemarks = 'Mantener la revisión periódica y verificar las medidas correctivas.';
    report.responsibles = [{ id: 'responsible', personId: 'demo-inspector', name: 'José Pérez', email: 'bcespedes@hortifrut.com' }];
    report.observations = Array.from({ length: count }, (_, index) => ({ ...newObservation(), description: `Hallazgo número ${index + 1}: señalización del área.`, correctiveAction: `Medida correctiva ${index + 1}: renovar señalización.`, severity: (['baja', 'media', 'alta'] as const)[index % 3], dueDate: '2026-11-10', photos: Array.from({ length: index === count - 1 ? 8 : 1 }, () => photo('Antes', '#4a6374')) }));
    report.registrationDetails = { 'demo-admin': { jobTitle: 'Supervisora de seguridad', date: report.date, signature: photo('Firma', '#577c62') } };
    report.delivery = { sentAt: '2026-11-07T15:00:00Z', recipientIds: ['demo-inspector'], revision: 3, corrections: Object.fromEntries(report.observations.map((observation, index) => [observation.id, { actorId: 'demo-inspector', responsibleName: 'José Pérez', action: `Corrección realizada ${index + 1}: se renovó la señalización.`, date: '2026-11-10', photos: Array.from({ length: index === count - 1 ? 8 : 1 }, () => photo('Después', '#4a7459')), proposedState: 'Ejecutado', state: 'Ejecutado', decision: 'approved', note: 'Evidencia verificada.' }])) };
    await persistInspection(report);
  }, count);
  await page.getByRole('button', { name: 'Mis inspecciones', exact: true }).click();
  await page.getByLabel('Filtrar por estado').selectOption('closed');
  await page.getByRole('button', { name: 'Revisar informe', exact: true }).click();
  await expect(page.getByRole('navigation', { name: 'Ruta de navegación' }).locator('li')).toHaveText(['Espacio de trabajo', 'Mis inspecciones', 'Inspecciones cerradas']);
  const downloadEvent = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Descargar PDF', exact: true }).click();
  const download = await downloadEvent;
  expect(download.suggestedFilename()).toBe('REG_INS_TALLER DE INSPECCIÓN_07.11.2026.pdf');
  const path = test.info().outputPath(`registro-cerrado-${count}.pdf`); await download.saveAs(path);
  const bytes = await readFile(path);
  expect(bytes.subarray(0, 5).toString()).toBe('%PDF-'); expect(bytes.subarray(-20).toString()).toContain('%%EOF');
  const text = (await run('pdftotext', [path, '-'])).stdout.replace(/\s+/g, ' ');
  for (const phrase of ['REGISTRO DE INSPECCIONES', 'María Núñez', 'José Pérez', 'Supervisora de seguridad', 'Verificar condiciones de seguridad', 'Falta de señalización', 'Mantener la revisión periódica', 'Ejecutado']) expect(text).toContain(phrase);
  for (let index = 1; index <= count; index++) {
    expect(text).toContain(`Hallazgo número ${index}`); expect(text).toContain(`Medida correctiva ${index}`);
  }
  const images = (await run('pdfimages', ['-list', path])).stdout.split('\n').filter(line => /\bimage\b/.test(line));
  expect(images.length).toBeGreaterThanOrEqual(18 + (count - 1) * 2);
  const info = (await run('pdfinfo', [path])).stdout;
  expect(info).toContain('595.28 x 841.89 pts (A4)');
  expect(Number(/Pages:\s+(\d+)/.exec(info)![1])).toBe(count === 1 ? 1 : 2);
  await expect(page.getByRole('button', { name: 'Descargar PDF', exact: true })).toBeEnabled();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole('button', { name: 'Descargar PDF', exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: test.info().outputPath('descargas-movil.png') });
});

test('no genera PDF antes de la aprobación completa', async ({ page }) => {
  await page.goto('./');
  const message = await page.evaluate(async () => {
    const { newInspection } = await import('/src/model.ts'); const { buildPdf } = await import('/src/pdf.ts');
    try { await buildPdf(newInspection({ name: 'Autora', email: 'bryx.96@gmail.com' })); return ''; }
    catch (error) { return (error as Error).message; }
  });
  expect(message).toContain('cuando la inspección está cerrada');
});
