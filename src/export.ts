import type { Inspection } from './model';
import { formatDate, validateStep } from './model';
import { formatInspectionTime } from './inspection-time';
import { closingRemarksOf, registrationPeople } from './registration';
import { workflowLabel } from './follow-up';
import { EMPLOYER } from './employer';

export async function buildExcel(d: Inspection) {
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
  const addPhoto = async (photo: Inspection['observations'][number]['photos'][number]) => {
      const imageId = book.addImage({ base64: photo.data, extension: 'jpeg' });
      const image = new Image(); image.src = photo.data; await image.decode();
      const scale = Math.min(460 / image.naturalWidth, 260 / image.naturalHeight);
      const width = Math.round(image.naturalWidth * scale), height = Math.round(image.naturalHeight * scale);
      const startRow = sheet.rowCount;
      const rowCount = Math.ceil(height / 20) + 1;
      for (let i = 0; i < rowCount; i++) sheet.addRow([]).height = 15;
      sheet.addImage(imageId, { tl: { col: 1, row: startRow }, ext: { width, height } });
      line('Evidencia', photo.name);
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
  section(`02 · RESULTADO DE LA INSPECCIÓN (${d.observations.length})`);
  if (!d.observations.length) line('Resultado', 'Sin observaciones registradas.');
  for (const [index, o] of d.observations.entries()) {
    line(`Observación ${index + 1}`, o.description);
    line('Acción a tomar', o.correctiveAction);
    line('Nivel de riesgo', o.severity.toUpperCase()); line('Fecha de Cierre', formatDate(o.dueDate));
    for (const photo of o.photos) {
      await addPhoto(photo);
    }
    if (d.delivery) {
      const correction = d.delivery.corrections[o.id];
      line('LEVANTAMIENTO DE RESULTADOS DE LA INSPECCIÓN', correction ? correction.action : 'Pendiente de registro');
      line('Apellidos y nombres del responsable del levantamiento', correction?.responsibleName || 'Sin asignar');
      line('Estado', correction?.state || 'Pendiente');
      line('Fecha de Cierre', correction?.date ? formatDate(correction.date) : 'Sin definir');
      if (correction) {
        line('Revisión', correction.decision === 'approved' ? 'Aprobado' : correction.decision === 'review' ? 'En revisión' : correction.decision === 'changes' ? 'Ajustes solicitados' : 'Borrador del levantamiento');
        if (correction.note) line('Comentario del revisor', correction.note);
        for (const photo of correction.photos) await addPhoto(photo);
      }
    }
    sheet.addRow([]);
  }
  if (d.delivery) line('Estado de la inspección', workflowLabel(d));
  section('03 · CIERRE DE LA INSPECCIÓN');
  line('DESCRIPCIÓN DE LA CAUSA ANTE RESULTADOS DESFAVORABLES DE LA INSPECCIÓN', d.unfavorableCause || 'Sin indicar');
  line('CONCLUSIONES Y RECOMENDACIONES', closingRemarksOf(d));
  section('RESPONSABLE DEL REGISTRO');
  for (const person of registrationPeople(d)) {
    line('Nombre', person.name); line('Correo del inspector', person.email || 'No indicado');
    const details = d.registrationDetails?.[person.id];
    line('Cargo', details?.jobTitle || person.jobTitle || 'Sin indicar'); line('Fecha', formatDate(details?.date ?? d.date));
    if (details?.signature) { line('Firma', 'Firma adjunta'); await addPhoto(details.signature); } else line('Firma', 'Sin adjuntar');
  }
  sheet.addRow([]);
  line('Código', 'Sin código definitivo. Este archivo es una copia de borrador, no un envío registrado.');
  line('Formato', 'Informe provisional. Pendiente de adaptar a la plantilla oficial de la empresa.');
  sheet.views = [{ state: 'frozen', ySplit: 3 }];
  sheet.pageSetup = { paperSize: 9, orientation: 'portrait', fitToPage: true, fitToWidth: 1, fitToHeight: 0 };
  const buffer = await book.xlsx.writeBuffer();
  return { bytes: new Uint8Array(buffer), name: `Inspeccion-${d.area.replace(/[^\p{L}\p{N}]+/gu, '-').slice(0, 60)}-${d.date}.xlsx` };
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
