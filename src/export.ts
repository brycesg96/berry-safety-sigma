import type { Inspection } from './model';
import { validateStep } from './model';
import { fillInspectionTemplate, publicStoredExcel } from './excel-template';
import { reportFilename } from '../shared/report-filename.mjs';
import { cloudStoredExcel } from './cloud-store';
import { storeFinalExcel } from './cloud-final';
import { inspectionClosed } from './follow-up';

export async function buildExcel(d: Inspection) {
  if (Object.keys(validateStep(d, 0)).length) throw new Error('Completa el primer apartado antes de exportar.');
  return { bytes: await fillInspectionTemplate(d), name: reportFilename(d.area, d.date) };
}

export async function exportExcel(d: Inspection, options: { readOnly?: boolean } = {}) {
  if (!options.readOnly && d.storage === 'cloud' && inspectionClosed(d) && d.finalExcelStored !== undefined) d = await storeFinalExcel(d);
  const file = d.storage === 'cloud' && d.delivery && (d.finalExcelStored === true || !Object.keys(d.delivery.corrections).length) ? await cloudStoredExcel(d) : await buildExcel(d);
  if (d.storage === 'cloud' && d.finalExcelStored === true) file.bytes = await publicStoredExcel(file.bytes, d);
  const blob = new Blob([file.bytes as BlobPart], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = file.name;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
