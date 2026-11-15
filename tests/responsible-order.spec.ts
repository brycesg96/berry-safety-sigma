import { test, expect } from '@playwright/test';
import ExcelJS from 'exceljs';
import { writeFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mockDirectory } from './directory-fixture';
import { selectLocation } from './location-fixture';
import { selectValue } from './select-fixture';
const run = promisify(execFile);
const team = [
  { id: 'head', name: 'Ana Torres', email: 'ana@example.invalid', area: 'Producción', jobTitle: 'Jefa de Producción' },
  { id: 'worker', name: 'José Rojas', email: 'jose@example.invalid', area: 'Producción', jobTitle: 'Supervisor de Mantenimiento' },
  { id: 'assistant', name: 'Marta Díaz', email: 'marta@example.invalid', area: 'Producción', jobTitle: 'Asistente de Producción' },
];

for (const width of [1366, 390]) test(`dos responsables obligatorios, orden conservado y destinatarios claros (${width}px)`, async ({ page }) => {
  await page.setViewportSize({ width, height: 900 }); await mockDirectory(page, team); await page.goto('./');
  const rows = page.locator('.responsibles .responsible-row');
  await expect(rows).toHaveCount(2); await expect(rows.getByRole('button', { name: /Eliminar responsable/ })).toHaveCount(0);
  const select = async (index: number) => { await rows.nth(index).getByRole('combobox').fill(team[index].name); await page.getByRole('option').filter({ hasText: team[index].email }).click(); };
  await page.getByLabel('Área e instalación inspeccionada').fill('Taller'); await selectLocation(page, 'Sede', 'Fundo'); await selectLocation(page, 'Zona de inspección', 'Armonía II');
  await page.getByLabel('Hora de inspección').fill('09:30'); await selectValue(page.getByLabel('AM o PM'), 'AM'); await page.getByRole('radio', { name: 'Planeada', exact: true }).check();
  await page.getByRole('textbox', { name: 'Objetivo de la inspección interna', exact: true }).fill('Verificar condiciones.'); await select(0);
  await page.getByRole('button', { name: 'Continuar', exact: true }).click(); await expect(page.locator('.form-card-heading h2')).toHaveText('INFORMACIÓN GENERAL');
  await rows.nth(1).getByRole('combobox').fill('Ana'); await expect(page.getByRole('option').filter({ hasText: team[0].email })).toHaveCount(0);
  await select(1); await page.getByRole('button', { name: 'Añadir', exact: true }).click(); await select(2);
  await rows.nth(2).getByRole('button', { name: 'Eliminar responsable 3' }).click(); await expect(rows).toHaveCount(2);
  await page.getByRole('button', { name: 'Guardar', exact: true }).click(); await expect(page.getByText('Guardado en este navegador', { exact: true })).toBeAttached(); await page.reload();
  await expect(rows.nth(0).getByRole('combobox')).toHaveValue(team[0].name); await expect(rows.nth(1).getByRole('combobox')).toHaveValue(team[1].name);
  await rows.first().locator('..').screenshot({ path: test.info().outputPath(`responsables-${width}.png`) });
  await page.getByRole('button', { name: 'Continuar', exact: true }).click(); await page.getByRole('button', { name: 'Añadir observación', exact: true }).click();
  await page.getByLabel('Descripción', { exact: false }).fill('Falta mantenimiento.'); await page.getByLabel('Acción a tomar').fill('Realizar mantenimiento.'); await page.getByLabel('Fecha de Cierre').fill('2026-12-01');
  await page.getByRole('button', { name: 'Continuar', exact: true }).click(); await page.getByRole('button', { name: 'Continuar', exact: true }).click();
  await page.getByRole('textbox', { name: 'CONCLUSIONES Y RECOMENDACIONES', exact: true }).fill('Corregir y verificar.'); await page.getByRole('button', { name: 'Continuar', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Responsables del área inspeccionada', exact: true })).toBeVisible();
  await expect(page.getByText('Las siguientes personas recibirán el informe de esta inspección en sus correos electrónicos y en sus cuentas de Berry Safety. Asimismo, serán responsables de levantar las observaciones identificadas.', { exact: true })).toBeVisible();
  await expect(page.locator('.recipient-list')).toContainText(team[0].email); await expect(page.locator('.recipient-list')).toContainText(team[1].email);
  await page.locator('.recipient-list').locator('..').screenshot({ path: test.info().outputPath(`destinatarios-${width}.png`) });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

for (const count of [1, 7]) test(`Excel y PDF separan jefe y ejecutores con nombre y cargo (${count} hallazgos)`, async ({ page }) => {
  await page.goto('./');
  const files = await page.evaluate(async ({ team, count }) => {
    const { newInspection, newObservation } = await import('/src/model.ts'); const { buildExcel } = await import('/src/export.ts'); const { buildPdf } = await import('/src/pdf.ts');
    const draft = { ...newInspection({ name: 'Inspectora de prueba', email: 'inspector@example.invalid' }), area: 'Taller de prueba', date: '2026-11-15', inspectionTime: '09:30', inspectionPeriod: 'AM' as const, type: 'Planeada' as const, objective: 'Verificar las condiciones.', closingRemarks: 'Corregir y verificar.', unfavorableCause: 'Falta mantenimiento.', responsibles: team, observations: Array.from({ length: count }, () => ({ ...newObservation('2026-12-01'), description: 'Falta mantenimiento preventivo.', correctiveAction: 'Programar mantenimiento.' })) };
    draft.delivery = { sentAt: '2026-11-15T15:00:00Z', recipientIds: team.map(p => p.personId), revision: 1, corrections: Object.fromEntries(draft.observations.map(o => [o.id, { actorId: team[0].personId, responsibleName: team[0].name, action: 'Trabajo realizado.', date: '2026-11-16', photos: [], state: 'Ejecutado', proposedState: 'Ejecutado', decision: 'approved', note: 'Comentario interno.' }])) } as any;
    const encode = (bytes: Uint8Array) => { let binary = ''; for (let i = 0; i < bytes.length; i += 32768) binary += String.fromCharCode(...bytes.subarray(i, i + 32768)); return btoa(binary); };
    return { excel: encode((await buildExcel(draft)).bytes), pdf: encode((await buildPdf(draft)).bytes) };
  }, { team: team.map(p => ({ ...p, personId: p.id })), count });
  const book = new ExcelJS.Workbook(); await book.xlsx.load(Buffer.from(files.excel, 'base64') as any); const sheet = book.getWorksheet('V.01')!;
  const area = sheet.getCell('G11').value as ExcelJS.CellRichTextValue;
  expect(area.richText.map(r => r.text).join('')).toBe(`${team[0].name}\n${team[0].jobTitle}`);
  for (let i = 0; i < count; i++) {
    const correction = sheet.getCell(`G${20 + i}`).value as ExcelJS.CellRichTextValue;
    expect(correction.richText.map(r => r.text).join('')).toBe(`${team[1].name}\n${team[1].jobTitle}\n${team[2].name}\n${team[2].jobTitle}`);
    expect(correction.richText[0].font!.size).toBeGreaterThan(correction.richText[1].font!.size!); expect(correction.richText[1].font!.color!.argb).toBe('FF757575');
    expect(sheet.getCell(`F${20 + i}`).text).toBe('Programar mantenimiento.');
  }
  expect(area.richText[0].font!.size).toBeGreaterThan(area.richText[1].font!.size!); expect(area.richText[1].font!.color!.argb).toBe('FF757575');
  const pdf = test.info().outputPath(`responsables-${count}.pdf`); await writeFile(pdf, Buffer.from(files.pdf, 'base64')); await writeFile(test.info().outputPath(`responsables-${count}.xlsx`), Buffer.from(files.excel, 'base64'));
  const text = (await run('pdftotext', [pdf, '-'])).stdout.replace(/\s+/g, ' '); for (const person of team) { expect(text).toContain(person.name); expect(text).toContain(person.jobTitle); }
  expect(text).not.toContain('Trabajo realizado.'); expect(text).not.toContain('Comentario interno.');
  if (count === 1) await run('pdftoppm', ['-png', '-singlefile', '-scale-to', '1800', pdf, test.info().outputPath('responsables-pdf')]);
});
