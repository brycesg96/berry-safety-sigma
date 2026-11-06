import { test, expect } from '@playwright/test';
import ExcelJS from 'exceljs';
import JSZip from 'jszip';
import { readFile, writeFile } from 'node:fs/promises';
import type { Page } from '@playwright/test';

async function build(page: Page, count: number, type = 'Planeada') {
  await page.goto('./');
  return page.evaluate(async ({ count, type }) => {
    const { newInspection, newObservation } = await import('/src/model.ts');
    const { buildExcel } = await import('/src/export.ts');
    const { prepareSignature } = await import('/src/registration.ts');
    const draft = newInspection({ name: 'Inspectora de ejemplo', email: 'inspector@example.com', accountId: 'test-inspector' });
    Object.assign(draft, { area: 'Taller de maquinaria', date: '2026-11-06', inspectionTime: '07:30', inspectionPeriod: 'AM', type, otherType: 'Verificación especial', objective: 'Verificar las condiciones de seguridad del taller.', unfavorableCause: 'Falta de mantenimiento preventivo.', closingRemarks: 'Corregir los hallazgos y verificar las evidencias.' });
    draft.responsibles = [{ id: 'area-owner', personId: 'test-responsible', name: 'Responsable de ejemplo', email: 'area@example.com' }];
    draft.additionalInspectors = [{ id: 'second', personId: 'second', name: 'Segunda inspectora', email: 'second@example.com' }, { id: 'third', personId: 'third', name: 'Tercer inspector', email: 'third@example.com' }];
    const photo = (index: number) => {
      const canvas = document.createElement('canvas');
      canvas.width = index % 2 ? 420 : 280; canvas.height = index % 2 ? 280 : 420;
      const ctx = canvas.getContext('2d')!;
      ctx.fillStyle = ['#3d7056', '#cb8938', '#40769a', '#976b94'][index % 4]; ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = '#fff'; ctx.font = '28px Arial'; ctx.fillText(`Evidencia ${index + 1}`, 24, 65);
      return { id: `photo-${index}`, name: `ejemplo-${index + 1}.png`, data: canvas.toDataURL('image/png') };
    };
    draft.observations = Array.from({ length: count }, (_, index) => ({ ...newObservation('2026-11-20'), id: `observation-${index}`, description: `Hallazgo de ejemplo ${index + 1}: revisar la condición señalada.`, correctiveAction: `Acción a tomar ${index + 1}: corregir y verificar.`, severity: index % 2 ? 'baja' : 'alta', photos: index === 0 ? Array.from({ length: 8 }, (_, i) => photo(i)) : [] }));
    const signature = document.createElement('canvas'); signature.width = 480; signature.height = 120;
    const ctx = signature.getContext('2d')!; ctx.strokeStyle = '#173c33'; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.moveTo(20, 90); ctx.bezierCurveTo(40, 0, 100, 120, 220, 35); ctx.stroke();
    const blob = await (await fetch(signature.toDataURL('image/png'))).blob();
    const prepared = await prepareSignature(new File([blob], 'firma.png', { type: 'image/png' }));
    draft.registrationDetails = { 'test-inspector': { jobTitle: 'Supervisora SST', date: '2026-11-06', signature: prepared }, second: { jobTitle: 'Inspectora', date: '2026-11-06' }, third: { jobTitle: 'Inspector', date: '2026-11-06' } };
    draft.delivery = { sentAt: '2026-11-06T15:00:00Z', revision: 1, recipientIds: ['test-responsible'], corrections: { [`observation-${count - 1}`]: { actorId: 'test-responsible', responsibleName: 'Responsable que levantó el hallazgo', action: 'Corrección realizada.', date: '2026-11-18', photos: Array.from({ length: 8 }, (_, i) => photo(i + 8)), state: 'Ejecutado', proposedState: 'Ejecutado', decision: 'approved', note: '' } } };
    const file = await buildExcel(draft);
    let binary = ''; for (let i = 0; i < file.bytes.length; i += 32768) binary += String.fromCharCode(...file.bytes.subarray(i, i + 32768));
    return { name: file.name, base64: btoa(binary) };
  }, { count, type });
}

for (const count of [1, 5, 7]) test(`plantilla original con ${count} observaciones: contenido, fotos, firmas y cierre`, async ({ page }) => {
  const generated = await build(page, count);
  const bytes = Buffer.from(generated.base64, 'base64');
  const book = new ExcelJS.Workbook(); await book.xlsx.load(bytes as any);
  const form = book.getWorksheet('V.01')!;
  const extra = Math.max(0, count - 5);
  expect(book.worksheets.map(s => s.name)).toEqual(['V.01', 'Matriz de Valoracion']);
  expect(generated.name).toBe('REG_INS_TALLER DE MAQUINARIA_06.11.2026.xlsx');
  expect(form.getCell('A11').value).toBe('Taller de maquinaria');
  expect(form.getCell('D11').value).toBe('06/11/2026');
  expect(form.getCell('G11').value).toBe('Responsable de ejemplo');
  expect(form.getCell('J11').value).toBe('Inspectora de ejemplo\nSegunda inspectora\nTercer inspector');
  expect(form.getCell('D14').value).toBe('X'); expect(form.getCell('F14').value).toBeNull();
  for (let i = 0; i < count; i++) {
    expect(form.getCell(`A${20 + i}`).value).toContain(`Hallazgo de ejemplo ${i + 1}:`);
    expect(form.getCell(`F${20 + i}`).value).toContain(`Acción a tomar ${i + 1}:`);
  }
  expect(form.getCell(`I${19 + count}`).value).toBe('Ejecutado');
  expect(form.getCell(`G${19 + count}`).value).toBe('Responsable que levantó el hallazgo');
  expect(form.getCell(`J${19 + count}`).value).toBe('18/11/2026');
  expect(form.getCell(`A${25 + extra}`).value).toContain('DESCRIPCIÓN DE LA CAUSA');
  expect(form.getCell(`A${26 + extra}`).value).toBe('Falta de mantenimiento preventivo.');
  expect(form.getCell(`A${29 + extra}`).value).toBe('Corregir los hallazgos y verificar las evidencias.');
  expect(form.getCell(`A${34 + extra}`).value).toBe('Nombre: Inspectora de ejemplo');
  expect(form.getCell(`E${34 + extra}`).value).toBe('Cargo: Supervisora SST');
  expect(form.getCell(`A${36 + extra}`).value).toBe('Nombre: Tercer inspector');
  expect(form.getCell('A9').value).toBe('HORTIFRUT PERÚ S.A.C.');
  expect(form.getImages()).toHaveLength(18); // Logo, eight initial, eight correction, signature.
  const plain = JSON.stringify(form.getSheetValues());
  expect(plain).not.toContain('D7B-966'); expect(plain).not.toContain('Reponer pintura');
  if (count < 5) expect(form.getCell(`A${20 + count}`).value).toBeNull();
  const original = new ExcelJS.Workbook(); await original.xlsx.readFile('public/templates/inspection.xlsx');
  const base = original.getWorksheet('V.01')!;
  expect(form.columns.map(c => c.width)).toEqual(base.columns.map(c => c.width));
  for (let row = 1; row <= 24; row++) expect(form.getRow(row).height).toBe(base.getRow(row).height);
  expect(form.pageSetup).toEqual({ ...base.pageSetup, printArea: `A1:L${36 + extra}` });
  expect(form.model.merges).toContain(`A${26 + extra}:L${27 + extra}`);
  const zip = await JSZip.loadAsync(bytes), template = await JSZip.loadAsync(await readFile('public/templates/inspection.xlsx'));
  for (const name of ['xl/worksheets/sheet2.xml', 'xl/printerSettings/printerSettings1.bin', 'xl/printerSettings/printerSettings2.bin', 'xl/media/image23.png', 'xl/theme/theme1.xml']) {
    expect(await zip.file(name)!.async('nodebuffer')).toEqual(await template.file(name)!.async('nodebuffer'));
  }
  const images = form.getImages().filter(image => image.range.ext);
  const rectangles: { row: number; group: number; x: number; y: number; width: number; height: number }[] = [];
  for (const image of images) {
    const row = image.range.tl.nativeRow + 1;
    expect(image.range.tl.nativeRowOff / 9525 + image.range.ext!.height).toBeLessThanOrEqual(form.getRow(row).height! * 96 / 72 - 5);
    const col = image.range.tl.nativeCol;
    expect(row === 34 + extra || col === 3 || col >= 10).toBe(true);
    const group = row === 34 + extra ? 9 : col === 3 ? 3 : 10;
    const span = group === 9 ? 3 : group === 10 ? 2 : 1;
    const widths = Array.from({ length: 12 }, (_, i) => Math.floor(((256 * form.getColumn(i + 1).width! + Math.floor(128 / 7)) / 256) * 7));
    const x = image.range.tl.nativeColOff / 9525 + widths.slice(group, col).reduce((sum, width) => sum + width, 0);
    const rectangle = { row, group, x, y: image.range.tl.nativeRowOff / 9525, width: image.range.ext!.width, height: image.range.ext!.height };
    expect(x + rectangle.width).toBeLessThanOrEqual(widths.slice(group, group + span).reduce((sum, width) => sum + width, 0) - 5);
    for (const previous of rectangles.filter(p => p.row === row && p.group === group)) {
      const overlapX = Math.min(previous.x + previous.width, x + rectangle.width) - Math.max(previous.x, x);
      const overlapY = Math.min(previous.y + previous.height, rectangle.y + rectangle.height) - Math.max(previous.y, rectangle.y);
      expect(overlapX <= 0.01 || overlapY <= 0.01).toBe(true);
    }
    rectangles.push(rectangle);
  }
  if (count === 5) {
    const path = test.info().outputPath(generated.name);
    await writeFile(path, bytes);
    await test.info().attach(generated.name, { path, contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  }
});

test('tipos de inspección no dejan marcas del ejemplo y GIF conserva transparencia', async ({ page }) => {
  for (const type of ['No planeada', 'Otro']) {
    const generated = await build(page, 1, type);
    const book = new ExcelJS.Workbook(); await book.xlsx.load(Buffer.from(generated.base64, 'base64') as any);
    const form = book.getWorksheet('V.01')!;
    expect(form.getCell('D14').value).toBeNull();
    expect(form.getCell('F14').value).toBe(type === 'No planeada' ? 'X' : null);
    expect(form.getCell('I14').value).toBe(type === 'Otro' ? 'Verificación especial' : null);
  }
  const alpha = await page.evaluate(async () => {
    const { prepareSignature } = await import('/src/registration.ts');
    const gif = Uint8Array.from(atob('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7'), c => c.charCodeAt(0));
    const signature = await prepareSignature(new File([gif], 'firma.gif', { type: 'image/gif' }));
    const image = new Image(); image.src = signature.data; await image.decode();
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = 1;
    const context = canvas.getContext('2d')!; context.drawImage(image, 0, 0);
    return { type: signature.data.slice(0, 22), alpha: context.getImageData(0, 0, 1, 1).data[3] };
  });
  expect(alpha.type).toBe('data:image/png;base64,'); expect(alpha.alpha).toBe(0);
});
