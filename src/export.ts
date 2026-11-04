import type { Inspection } from './model';
import { formatDate, validateStep } from './model';
import { formatInspectionTime } from './inspection-time';
import { EMPLOYER } from './employer';

export async function exportExcel(d: Inspection) {
  if (Object.keys(validateStep(d, 0)).length) throw new Error('Completa el primer apartado antes de exportar.');
  const { default: ExcelJS } = await import('exceljs');
  const book = new ExcelJS.Workbook();
  book.creator = d.inspector;
  book.created = new Date();
  const sheet = book.addWorksheet('Inspección SST');
  sheet.columns = [{ width: 26 }, { width: 38 }, { width: 28 }, { width: 38 }];
  sheet.mergeCells('A1:D2');
  sheet.getCell('A1').value = 'BERRY · INFORME DE INSPECCIÓN SST';
  sheet.getCell('A1').font = { size: 18, bold: true, color: { argb: 'FFFFFFFF' } };
  sheet.getCell('A1').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF173C33' } };
  sheet.getCell('A1').alignment = { vertical: 'middle' };
  sheet.addRow([]);
  const section = (title: string) => {
    const row = sheet.addRow([title]);
    sheet.mergeCells(row.number, 1, row.number, 4);
    row.height = 28;
    row.getCell(1).font = { bold: true, color: { argb: 'FF173C33' }, size: 12 };
    row.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE9F4ED' } };
  };
  const line = (label: string, value: string) => {
    const row = sheet.addRow([label, value]);
    sheet.mergeCells(row.number, 2, row.number, 4);
    row.getCell(1).font = { bold: true };
    row.getCell(2).alignment = { wrapText: true, vertical: 'top' };
    row.height = Math.max(24, Math.ceil(value.length / 95) * 18);
  };
  section('01 · DATOS GENERALES');
  line('Razón social', EMPLOYER.name); line('RUC', EMPLOYER.ruc);
  line('Domicilio', EMPLOYER.address); line('Actividad económica', EMPLOYER.activity); line('Trabajadores', EMPLOYER.workers);
  line('Código de inspección', 'BORRADOR — pendiente de registro'); line('Responsable de la inspección', d.inspector);
  line('Área inspeccionada', d.area);
  line('Tipo de inspección', d.type === 'Otro' ? `Otro: ${d.otherType}` : d.type); line('Fecha de inspección', formatDate(d.date)); line('Hora de inspección', formatInspectionTime(d.inspectionTime, d.inspectionPeriod));
  line('Objetivo', d.objective);
  section('RESPONSABLES Y DESTINATARIOS');
  d.responsibles.forEach(r => line(r.name, r.email));
  section(`02 · OBSERVACIONES (${d.observations.length})`);
  if (!d.observations.length) line('Resultado', 'Sin observaciones registradas.');
  for (const [index, o] of d.observations.entries()) {
    line(`Observación ${index + 1}`, o.description);
    line('Medida correctiva', o.correctiveAction);
    line('Criticidad', o.severity.toUpperCase()); line('Fecha de compromiso', formatDate(o.dueDate));
    for (const photo of o.photos) {
      const imageId = book.addImage({ base64: photo.data, extension: 'jpeg' });
      const image = new Image(); image.src = photo.data; await image.decode();
      const scale = Math.min(460 / image.naturalWidth, 260 / image.naturalHeight);
      const width = Math.round(image.naturalWidth * scale), height = Math.round(image.naturalHeight * scale);
      const startRow = sheet.rowCount;
      const rowCount = Math.ceil(height / 20) + 1;
      for (let i = 0; i < rowCount; i++) sheet.addRow([]).height = 15;
      sheet.addImage(imageId, { tl: { col: 1, row: startRow }, ext: { width, height } });
      line('Evidencia', photo.name);
    }
    sheet.addRow([]);
  }
  section('03 · CIERRE DE LA INSPECCIÓN');
  line('Conclusiones', d.conclusions); line('Recomendaciones', d.recommendations);
  line('Realizado por', d.inspector); line('Correo del inspector', d.inspectorEmail || 'No indicado');
  sheet.addRow([]);
  line('Código', 'Sin código definitivo. Este archivo es una copia de borrador, no un envío registrado.');
  line('Formato', 'Informe provisional. Pendiente de adaptar a la plantilla oficial de la empresa.');
  sheet.views = [{ state: 'frozen', ySplit: 3 }];
  sheet.pageSetup = { paperSize: 9, orientation: 'portrait', fitToPage: true, fitToWidth: 1, fitToHeight: 0 };
  const buffer = await book.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `Inspeccion-${d.area.replace(/[^\p{L}\p{N}]+/gu, '-').slice(0, 60)}-${d.date}.xlsx`;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
