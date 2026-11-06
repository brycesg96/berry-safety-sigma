import type { Inspection } from './model';
import { validateStep } from './model';
import { fillInspectionTemplate } from './excel-template';
import { reportFilename } from '../shared/report-filename.mjs';

export async function buildExcel(d: Inspection) {
  if (Object.keys(validateStep(d, 0)).length) throw new Error('Completa el primer apartado antes de exportar.');
  return { bytes: await fillInspectionTemplate(d), name: reportFilename(d.area, d.date) };
}

export async function exportExcel(d: Inspection) {
  const file = await buildExcel(d);
  const blob = new Blob([file.bytes as BlobPart], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = file.name;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
