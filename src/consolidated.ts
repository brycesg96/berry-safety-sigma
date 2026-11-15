import type { CellValue, DataBarRuleType, PaperSize, Workbook, Worksheet } from 'exceljs';
import { dashboardAreas, dashboardManagements, dashboardMetrics, dashboardPeopleOptions, dashboardStateLabel, emptyDashboardFilters } from './dashboard';
import type { DashboardFilters, DashboardRow } from './dashboard';
import type { Responsible } from './model';
import { closingRemarksOf, inspectionPeople, registrationDate, registrationPeople } from './registration';
import { formatInspectionTime } from './inspection-time';
import { organizationLabel } from './organization-label';
import { EMPLOYER } from './employer';

export type ConsolidatedContext = { filters?: DashboardFilters; generatedAt?: Date; example?: boolean };
const palette = { ink: 'FF173E35', green: 'FF27674F', light: 'FFEDF4E9', alternate: 'FFF7F9F5', line: 'FFDCE6DA', muted: 'FF718478', white: 'FFFFFFFF', amber: 'FF9B651D', amberBg: 'FFFFF4DB', red: 'FFAA493E', redBg: 'FFFBECE8' };
const font = 'Aptos';
const approvedCount = (row: DashboardRow) => row.data.observations.filter(o => row.workflow === 'closed' || row.data.delivery?.corrections[o.id]?.decision === 'approved' && row.data.delivery.corrections[o.id].state === 'Ejecutado').length;
const dateValue = (value?: string): CellValue => value && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) ? new Date(`${value}T00:00:00Z`) : value || '';
const localDate = (date: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Lima', year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
const timestamp = (value?: string | null) => value && Number.isFinite(Date.parse(value)) ? new Intl.DateTimeFormat('es-PE', { timeZone: 'America/Lima', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(value)) : value || '';
const dateText = (value?: string) => { const date = dateValue(value); return date instanceof Date ? new Intl.DateTimeFormat('es-PE', { timeZone: 'UTC', day: '2-digit', month: '2-digit', year: 'numeric' }).format(date) : String(date); };
const emailList = (emails: (string | undefined)[]) => [...new Map(emails.filter(Boolean).map(email => [email!.trim().toLowerCase(), email!.trim()])).values()].join('\n');
const riskLabel = { baja: 'Bajo', media: 'Medio', alta: 'Alto' };
const decisionLabel = { approved: 'Aprobado', changes: 'Ajustes solicitados', review: 'Por validar / aprobar', draft: 'Borrador' };
const emailState = { pending: 'Pendiente', accepted: 'Aceptada por el servicio', rejected: 'Rechazada por el servicio', unconfirmed: 'Sin confirmación del servicio' };
type Column = { label: string; width: number; group: string; format?: string };
const col = (label: string, width: number, group: string, format?: string): Column => ({ label, width, group, format });
const fill = (argb: string) => ({ type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb } });

function mergeText(sheet: Worksheet, row: number, first: number, last: number, value: CellValue, options: { background?: string; color?: string; size?: number; bold?: boolean; height?: number } = {}) {
  if (first !== last) sheet.mergeCells(row, first, row, last);
  const cell = sheet.getCell(row, first); cell.value = value;
  cell.font = { name: font, size: options.size || 10, color: { argb: options.color || palette.ink }, bold: options.bold || false };
  cell.fill = fill(options.background || palette.white);
  cell.alignment = { vertical: 'middle', horizontal: 'left', wrapText: true, indent: 1 };
  if (options.height) sheet.getRow(row).height = options.height;
}

function pageSetup(sheet: Worksheet, landscape: boolean, lastColumn: number, lastRow: number) {
  // OOXML paper size 8 is A3; ExcelJS's older enum omits this supported value.
  sheet.pageSetup = { paperSize: (landscape ? 8 : 9) as PaperSize, orientation: landscape ? 'landscape' : 'portrait', fitToPage: true, fitToWidth: 1, fitToHeight: 0, horizontalCentered: true, margins: { left: .3, right: .3, top: .45, bottom: .45, header: .2, footer: .2 }, printArea: `A1:${sheet.getColumn(lastColumn).letter}${lastRow}` };
  sheet.headerFooter.oddFooter = '&LBerry Safety&C' + sheet.name + '&RPágina &P de &N';
}

function table(book: Workbook, name: string, description: string, columns: Column[], values: CellValue[][], generated: string) {
  const sheet = book.getWorksheet(name) || book.addWorksheet(name);
  sheet.properties.tabColor = { argb: palette.green }; sheet.properties.defaultRowHeight = 34;
  sheet.views = [{ state: 'frozen', ySplit: 6, xSplit: 2, showGridLines: false, activeCell: 'C7' }];
  columns.forEach((column, i) => { sheet.getColumn(i + 1).width = column.width; });
  mergeText(sheet, 1, 1, columns.length, 'BERRY SAFETY  /  SEGURIDAD INDUSTRIAL Y GESTIÓN MEDIO AMBIENTAL', { background: palette.ink, color: palette.white, bold: true, size: 10, height: 25 });
  mergeText(sheet, 2, 1, columns.length, name, { size: 21, bold: true, height: 36 });
  mergeText(sheet, 3, 1, columns.length, description, { color: palette.muted, height: 28 });
  mergeText(sheet, 4, 1, columns.length, `${values.length} ${values.length === 1 ? 'registro' : 'registros'} · Generado el ${generated} · Hora de Lima`, { color: palette.muted, size: 9, height: 23 });
  let start = 1;
  columns.forEach((column, i) => {
    if (i === columns.length - 1 || columns[i + 1].group !== column.group) {
      mergeText(sheet, 5, start, i + 1, column.group, { background: palette.light, color: palette.green, bold: true, size: 9, height: 25 }); start = i + 2;
    }
    const cell = sheet.getCell(6, i + 1); cell.value = column.label;
    cell.fill = fill(palette.green); cell.font = { name: font, size: 10, bold: true, color: { argb: palette.white } };
    cell.alignment = { vertical: 'middle', horizontal: 'left', wrapText: true, indent: 1 };
  });
  sheet.getRow(6).height = 44;
  values.forEach((values, index) => {
    const row = sheet.getRow(index + 7); let lines = 2;
    columns.forEach((column, i) => {
      const cell = row.getCell(i + 1); cell.value = values[i] ?? '';
      cell.font = { name: font, size: 10, color: { argb: palette.ink } };
      cell.fill = fill(index % 2 ? palette.alternate : palette.white);
      cell.border = { bottom: { style: 'hair', color: { argb: palette.line } } };
      cell.alignment = { vertical: 'top', horizontal: typeof cell.value === 'number' ? 'center' : 'left', wrapText: true, indent: 1 };
      if (column.format) cell.numFmt = column.format;
      const content = cell.text;
      lines = Math.max(lines, ...content.split('\n').map(line => Math.ceil(line.length / Math.max(8, column.width - 3))));
      if (['Bajo', 'Ejecutado', 'Aprobado', 'Cerrada'].includes(content) || ['Medio', 'Por validar / aprobar', 'En revisión'].includes(content) || ['Alto', 'Vencida', 'Ajustes solicitados'].includes(content)) {
        const warning = ['Medio', 'Por validar / aprobar', 'En revisión'].includes(content), danger = ['Alto', 'Vencida', 'Ajustes solicitados'].includes(content);
        cell.fill = fill(danger ? palette.redBg : warning ? palette.amberBg : palette.light);
        cell.font = { name: font, size: 10, bold: true, color: { argb: danger ? palette.red : warning ? palette.amber : palette.green } };
      }
    });
    row.height = Math.min(390, Math.max(35, lines * 14 + 10));
  });
  sheet.autoFilter = { from: { row: 6, column: 1 }, to: { row: Math.max(6, values.length + 6), column: columns.length } };
  sheet.pageSetup.printTitlesRow = '5:6';
  pageSetup(sheet, true, columns.length, Math.max(6, values.length + 6));
  sheet.pageSetup.printTitlesRow = '5:6'; sheet.pageSetup.printTitlesColumn = 'A:B'; sheet.pageSetup.fitToWidth = 2;
  return sheet;
}

function filtersText(rows: DashboardRow[], filters: DashboardFilters) {
  const labelPeople = (kind: 'inspector' | 'responsible', selected: string[]) => selected.length ? selected.map(id => dashboardPeopleOptions(rows, kind).find(option => option.value === id)?.label || 'Persona seleccionada').join('; ') : 'Todos';
  const managements = rows.flatMap(dashboardManagements), areas = rows.flatMap(dashboardAreas);
  return [
    ['Número de registro', filters.code || 'Todos'], ['Fecha de inspección', `${dateText(filters.from) || 'Sin límite inicial'} — ${dateText(filters.to) || 'Sin límite final'}`],
    ['Inspectores', labelPeople('inspector', filters.inspector)], ['Gerencia', managements.find(item => item.key === filters.management)?.name || 'Todas'],
    ['Área', areas.find(item => item.key === filters.area)?.name || 'Todas'], ['Responsables del área', labelPeople('responsible', filters.responsible)],
    ['Estado', ({ open: 'En espera de respuesta', review: 'Por validar / aprobar', closed: 'Cerrada' } as Record<string, string>)[filters.state] || 'Todos'],
  ];
}

function cover(book: Workbook, rows: DashboardRow[], generated: Date, context: ConsolidatedContext) {
  const sheet = book.addWorksheet('Resumen', { properties: { tabColor: { argb: palette.ink } }, views: [{ showGridLines: false }] });
  for (let i = 1; i <= 12; i++) sheet.getColumn(i).width = 8.5;
  const date = localDate(generated), metrics = dashboardMetrics(rows, date);
  const approved = rows.reduce((count, row) => count + approvedCount(row), 0);
  mergeText(sheet, 1, 1, 12, 'berry.   |   SAFETY WORKSPACE', { background: palette.ink, color: palette.white, bold: true, size: 16, height: 34 });
  mergeText(sheet, 2, 1, 12, 'CONSOLIDADO DE INSPECCIONES', { background: palette.ink, color: palette.white, bold: true, size: 23, height: 43 });
  mergeText(sheet, 3, 1, 12, 'Seguridad y salud en el trabajo', { background: palette.ink, color: 'FFBDD7B7', size: 12, height: 28 });
  mergeText(sheet, 4, 1, 12, `${context.example ? 'EJEMPLO DE FORMATO · DATOS FICTICIOS · ' : ''}Generado el ${timestamp(generated.toISOString())} · Hora de Lima`, { color: palette.muted, size: 9, height: 24 });
  mergeText(sheet, 6, 1, 12, [...new Set(rows.map(row => row.data.company).filter(Boolean))].join(' · ') || 'Reporte de gestión', { bold: true, size: 13, height: 26 });
  const dates = rows.map(row => row.data.date).filter(Boolean).sort();
  mergeText(sheet, 7, 1, 12, `Periodo de las inspecciones incluidas: ${dateText(dates[0]) || 'Sin registros'}${dates.length ? ` al ${dateText(dates.at(-1))}` : ''}`, { color: palette.muted, height: 25 });
  const cards = [['Inspecciones', rows.length], ['Observaciones', metrics.observations], ['Ejecutadas', metrics.executed], ['Aprobadas', approved]] as const;
  cards.forEach(([label, value], index) => {
    const first = index * 3 + 1;
    mergeText(sheet, 9, first, first + 2, label, { background: palette.light, bold: true, color: palette.green, height: 26 });
    mergeText(sheet, 10, first, first + 2, value, { background: palette.light, bold: true, size: 27, height: 44 });
  });
  mergeText(sheet, 12, 1, 4, 'AVANCE APROBADO', { bold: true, size: 10, height: 27 });
  mergeText(sheet, 12, 5, 8, metrics.observations ? approved / metrics.observations : 0, { bold: true, size: 14 }); sheet.getCell('E12').numFmt = '0%';
  mergeText(sheet, 12, 9, 12, `${metrics.overdue} ${metrics.overdue === 1 ? 'vencida' : 'vencidas'} sin ejecutar`, { color: metrics.overdue ? palette.red : palette.muted, bold: true });
  mergeText(sheet, 14, 1, 6, 'ESTADO DE LAS INSPECCIONES', { background: palette.green, color: palette.white, bold: true, height: 25 });
  mergeText(sheet, 14, 7, 12, 'OBSERVACIONES POR RIESGO', { background: palette.green, color: palette.white, bold: true });
  const states = [['En espera de respuesta', rows.filter(row => dashboardStateLabel(row) === 'En espera de respuesta').length], ['Por validar / aprobar', rows.filter(row => dashboardStateLabel(row) === 'Por validar / aprobar').length], ['Cerradas', metrics.closed]];
  const risks = [['Bajo', metrics.risk.baja], ['Medio', metrics.risk.media], ['Alto', metrics.risk.alta]];
  states.forEach(([label, value], i) => {
    mergeText(sheet, 15 + i, 1, 4, label, { background: i % 2 ? palette.alternate : palette.white, height: 24 });
    mergeText(sheet, 15 + i, 5, 6, value, { bold: true });
    mergeText(sheet, 15 + i, 7, 10, risks[i][0], { background: i === 2 ? palette.redBg : i === 1 ? palette.amberBg : palette.light });
    mergeText(sheet, 15 + i, 11, 12, risks[i][1], { bold: true });
  });
  mergeText(sheet, 19, 1, 6, 'FILTROS APLICADOS', { background: palette.green, color: palette.white, bold: true, height: 25 });
  mergeText(sheet, 19, 7, 12, 'CONTENIDO DEL DOCUMENTO', { background: palette.green, color: palette.white, bold: true });
  const contents = [
    ['Inspecciones', 'Ubicación, responsables, estado y avance.'], ['Fichas', 'Empleador, tipo, objetivo, causas y conclusiones.'],
    ['Observaciones', 'Hallazgos, riesgos, medidas correctivas y plazos.'], ['Seguimiento', 'Acciones realizadas y comentarios de revisión.'],
    ['Participantes', 'Personas por rol y datos de su organización.'], ['Notificaciones', 'Destinatarios, Responde a (CC) y estado del envío.'],
  ];
  const filters = filtersText(rows, context.filters || emptyDashboardFilters());
  filters.forEach(([label, value], index) => {
    const row = 20 + index;
    mergeText(sheet, row, 1, 2, label, { background: palette.light, bold: true, size: 9 });
    mergeText(sheet, row, 3, 6, value, { size: 9, height: Math.max(32, Math.ceil(value.length / 40) * 12 + 10) });
    if (contents[index]) {
      const [name, description] = contents[index];
      mergeText(sheet, row, 7, 8, { text: name, hyperlink: `#'${name}'!A1` }, { color: palette.green, bold: true, size: 9 });
      mergeText(sheet, row, 9, 12, description, { color: palette.muted, size: 9 });
    }
  });
  mergeText(sheet, 28, 1, 12, 'CRITERIOS DE LECTURA', { background: palette.green, color: palette.white, bold: true, height: 25 });
  mergeText(sheet, 29, 1, 12, 'Una fila de Inspecciones corresponde a un registro. Las demás hojas se relacionan por su número de registro y, cuando corresponde, por el número de observación. Una persona puede figurar en varios roles.', { size: 9, color: palette.muted, height: 34 });
  mergeText(sheet, 30, 1, 12, 'Ejecutada indica el estado del levantamiento; aprobada indica la validación del revisor. Las celdas vacías corresponden a datos no registrados. Se conservan los valores históricos. Las fechas y horas de envío corresponden a Lima.', { size: 9, color: palette.muted, height: 34 });
  mergeText(sheet, 31, 1, 12, 'El archivo contiene información textual y numérica, sin fotografías ni firmas gráficas. La aceptación del servicio de correo no acredita la lectura del mensaje.', { size: 9, color: palette.muted, height: 30 });
  for (const row of [5, 8, 11, 13, 18, 27]) sheet.getRow(row).height = 9;
  pageSetup(sheet, false, 12, 31); sheet.pageSetup.fitToHeight = 1;
  return sheet;
}

export async function buildConsolidated(rows: DashboardRow[], context: ConsolidatedContext = {}) {
  const { default: ExcelJS } = await import('exceljs');
  const book = new ExcelJS.Workbook(), generated = context.generatedAt || new Date(), stamp = timestamp(generated.toISOString()), today = localDate(generated);
  book.creator = 'Berry Safety'; book.company = 'Hortifrut'; book.title = 'Consolidado de inspecciones de seguridad y salud en el trabajo'; book.subject = 'Gestión y seguimiento de inspecciones'; book.created = generated; book.modified = generated;
  cover(book, rows, generated, context);
  book.addWorksheet('Inspecciones');
  const inspectionValues: CellValue[][] = [], observationValues: CellValue[][] = [], followUpValues: CellValue[][] = [], participantValues: CellValue[][] = [], notificationValues: CellValue[][] = [];
  const fichas = book.addWorksheet('Fichas', { properties: { tabColor: { argb: palette.green } }, views: [{ showGridLines: false }] });
  for (let i = 1; i <= 12; i++) fichas.getColumn(i).width = 9;
  let detailRow = 1;
  rows.forEach(row => {
    const d = row.data, location = d.areaLocation, people = inspectionPeople(d), metrics = dashboardMetrics([row], today);
    const approved = approvedCount(row);
    inspectionValues.push([row.code, dateValue(d.date), formatInspectionTime(d.inspectionTime, d.inspectionPeriod), location?.site || '', location?.zone || '', organizationLabel(location?.management), organizationLabel(location?.department), location?.departmentNomenclature || '', location?.detail || '', d.area, d.inspector, dashboardStateLabel(row), d.observations.length, metrics.executed, approved, d.observations.length ? approved / d.observations.length : 0, metrics.overdue]);
    if (detailRow > 1) fichas.getRow(detailRow - 1).addPageBreak();
    mergeText(fichas, detailRow++, 1, 12, 'BERRY SAFETY  /  FICHA DE INSPECCIÓN', { background: palette.ink, color: palette.white, size: 11, bold: true, height: 29 });
    mergeText(fichas, detailRow++, 1, 12, row.code, { background: palette.ink, color: palette.white, size: 22, bold: true, height: 39 });
    const field = (label: string, value: CellValue, long = false) => {
      const text = value instanceof Date ? d.date : String(value ?? '');
      mergeText(fichas, detailRow, 1, 3, label, { background: palette.light, bold: true, size: 9 });
      mergeText(fichas, detailRow++, 4, 12, value, { size: 10, height: Math.min(390, Math.max(long ? 44 : 25, Math.ceil(text.length / 78) * 13 + text.split('\n').length * 12 + 5)) });
    };
    field('Empleador / RUC', [d.company, d.ruc].filter(Boolean).join(' · '));
    if (d.company === EMPLOYER.name) { field('Domicilio del empleador', EMPLOYER.address); field('Actividad / trabajadores', `${EMPLOYER.activity} · ${EMPLOYER.workers} trabajadores`); }
    field('Fecha y hora de inspección', `${dateText(d.date)} · ${formatInspectionTime(d.inspectionTime, d.inspectionPeriod)}`);
    field('Tipo de inspección', d.type || d.legacyType || ''); if (d.otherType) field('Detalle del tipo', d.otherType);
    field('Área e instalación', d.area);
    field('Instalación registrada', d.facility); field('Catálogo de instalación', location?.installationPending ? 'Pendiente de carga de la lista oficial' : location?.source === 'catalog' ? 'Instalación seleccionada del catálogo' : 'Registro anterior');
    field('Responsable de inspección', `${d.inspector}${d.inspectorEmail ? ` · ${d.inspectorEmail}` : ''}`);
    field('Objetivo', d.objective, true); field('Causa ante resultados desfavorables', d.unfavorableCause, true); field('Conclusiones y recomendaciones', closingRemarksOf(d), true);
    if (d.conclusions?.trim() && !closingRemarksOf(d).includes(d.conclusions.trim())) field('Conclusiones del registro anterior', d.conclusions, true);
    if (d.recommendations?.trim() && !closingRemarksOf(d).includes(d.recommendations.trim())) field('Recomendaciones del registro anterior', d.recommendations, true);
    field('Fecha de cierre general prevista', dateValue(d.defaultClosingDate)); fichas.getCell(detailRow - 1, 4).numFmt = 'dd/mm/yyyy';
    if (d.legacyRegistrationNumber || d.registrationNumber) field('Referencia anterior', d.legacyRegistrationNumber || d.registrationNumber);
    field('Registro confirmado', timestamp(row.registered_at || d.serverRegistration?.acceptedAt)); field('Envío de inspección', timestamp(row.sent_at || d.delivery?.sentAt));
    field('Cierre de inspección', timestamp(row.closed_at)); field('Última actualización', timestamp(row.updated_at || d.updatedAt));
    field('Estado de inspección', dashboardStateLabel(row)); detailRow += 2;

    const addPeople = (role: string, persons: ReturnType<typeof inspectionPeople> | Responsible[], registration = false) => persons.forEach((person, index) => {
      if (!person.name && !person.email) return;
      const p = person as Responsible, details = d.registrationDetails?.[p.personId || p.id];
      participantValues.push([row.code, dateValue(d.date), role === 'Equipo de inspección' ? index === 0 ? 'Responsable de inspección' : 'Compañero SIGMA' : role, index + 1, p.name, p.email, organizationLabel(p.management), organizationLabel(p.area), p.areaNomenclature || '', organizationLabel(details?.jobTitle || p.jobTitle), registration ? dateValue(registrationDate(d, p.personId || p.id)) : '']);
    });
    addPeople('Equipo de inspección', people); addPeople('Responsable del área', d.responsibles); addPeople('Responsable del registro', registrationPeople(d), true);
    d.observations.forEach((observation, index) => {
      const correction = d.delivery?.corrections[observation.id], state = row.workflow === 'closed' ? 'Ejecutado' : correction?.state || 'Pendiente';
      const due = observation.dueDate, overdue = state !== 'Ejecutado' && !!due && due < today;
      const end = state === 'Ejecutado' ? correction?.date : today;
      const delay = due && end && Number.isFinite(Date.parse(due)) && Number.isFinite(Date.parse(end)) ? Math.max(0, Math.floor((Date.parse(end) - Date.parse(due)) / 86400000)) : '';
      const decision = correction ? decisionLabel[correction.decision] || correction.decision : 'Sin levantamiento';
      observationValues.push([row.code, dateValue(d.date), index + 1, d.area, observation.description, riskLabel[observation.severity], observation.correctiveAction, dateValue(due), state, decision, state === 'Ejecutado' ? 'Ejecutada' : !due ? 'Sin fecha prevista' : overdue ? 'Vencida' : 'En plazo', delay]);
      const actor = correction && [...d.responsibles, ...people, ...registrationPeople(d)].find(p => p.personId === correction.actorId || p.id === correction.actorId);
      followUpValues.push([row.code, index + 1, correction?.responsibleName || d.responsibles[0]?.name || '', actor?.name || row.identityLinks?.[correction?.actorId || '']?.name || '', correction?.action || '', dateValue(correction?.date), state, correction?.proposedState || '', decision, correction?.note || '']);
    });
    notificationValues.push([row.code, dateValue(d.date), emailList([d.inspectorEmail, ...d.responsibles.map(p => p.email)]), emailList(d.emailCc || []), timestamp(row.sent_at || d.delivery?.sentAt), d.emailDelivery ? emailState[d.emailDelivery.state] || d.emailDelivery.state : 'Sin dato registrado', timestamp(d.emailDelivery?.updatedAt), d.emailDelivery?.message || '']);
  });
  pageSetup(fichas, false, 12, Math.max(1, detailRow - 1));
  const inspections = table(book, 'Inspecciones', 'Una fila por inspección. Usa los filtros para consultar ubicaciones, responsables y avance.', [
    col('Número de registro', 21, 'Registro'), col('Fecha de inspección', 17, 'Registro', 'dd/mm/yyyy'), col('Hora', 15, 'Registro'),
    col('Sede', 22, 'Ubicación'), col('Zona de inspección', 23, 'Ubicación'), col('Gerencia inspeccionada', 34, 'Ubicación'), col('Área inspeccionada', 38, 'Ubicación'), col('Abreviatura del área', 18, 'Ubicación'), col('Instalación inspeccionada', 28, 'Ubicación'), col('Área e instalación inspeccionada', 49, 'Ubicación'),
    col('Responsable de inspección', 30, 'Gestión'), col('Estado de inspección', 25, 'Gestión'), col('Observaciones', 15, 'Avance'), col('Ejecutadas', 14, 'Avance'), col('Aprobadas', 14, 'Avance'), col('Avance aprobado', 17, 'Avance', '0%'), col('Vencidas sin ejecutar', 20, 'Avance'),
  ], inspectionValues, stamp);
  if (rows.length) {
    const rule: DataBarRuleType & { color: { argb: string } } = { type: 'dataBar', priority: 1, cfvo: [{ type: 'num', value: 0 }, { type: 'num', value: 1 }], color: { argb: 'FF91B47A' }, showValue: true, gradient: true, minLength: 0, maxLength: 100 };
    inspections.addConditionalFormatting({ ref: `P7:P${rows.length + 6}`, rules: [rule] });
  }
  table(book, 'Observaciones', 'Una fila por hallazgo. El número de registro vincula esta hoja con Inspecciones y Seguimiento.', [
    col('Número de registro', 21, 'Identificación'), col('Fecha de inspección', 17, 'Identificación', 'dd/mm/yyyy'), col('Observación', 14, 'Identificación'), col('Área e instalación inspeccionada', 42, 'Identificación'),
    col('Descripción del hallazgo', 58, 'Hallazgo y medida'), col('Nivel de riesgo', 16, 'Hallazgo y medida'), col('Medida correctiva propuesta', 58, 'Hallazgo y medida'),
    col('Fecha de cierre prevista', 18, 'Atención y plazo', 'dd/mm/yyyy'), col('Estado del levantamiento', 22, 'Atención y plazo'), col('Decisión del revisor', 24, 'Atención y plazo'), col('Situación del plazo', 21, 'Atención y plazo'), col('Días de atraso', 15, 'Atención y plazo'),
  ], observationValues, stamp);
  table(book, 'Seguimiento', 'Una fila por observación, con el último avance y la última revisión registrados.', [
    col('Número de registro', 21, 'Identificación'), col('Observación', 14, 'Identificación'), col('Responsable del levantamiento', 31, 'Levantamiento'), col('Avance registrado por', 31, 'Levantamiento'), col('Acción realizada', 65, 'Levantamiento'), col('Fecha de cierre registrada', 19, 'Levantamiento', 'dd/mm/yyyy'), col('Estado del levantamiento', 22, 'Levantamiento'), col('Estado propuesto', 20, 'Levantamiento'), col('Decisión del revisor', 24, 'Revisión'), col('Comentario del revisor', 65, 'Revisión'),
  ], followUpValues, stamp);
  table(book, 'Participantes', 'Una fila por persona y rol. Los campos sin información registrada se mantienen vacíos.', [
    col('Número de registro', 21, 'Registro'), col('Fecha de inspección', 17, 'Registro', 'dd/mm/yyyy'), col('Rol en la inspección', 29, 'Participación'), col('Orden en el grupo', 17, 'Participación'), col('Nombre completo', 34, 'Participación'), col('Correo electrónico', 35, 'Participación'), col('Gerencia', 35, 'Organización'), col('Área', 40, 'Organización'), col('Abreviatura del área', 18, 'Organización'), col('Puesto', 35, 'Organización'), col('Fecha del registro', 18, 'Registro de firma', 'dd/mm/yyyy'),
  ], participantValues, stamp);
  table(book, 'Notificaciones', 'Una fila por inspección. Incluye al emisor en Para y conserva las copias registradas al enviar.', [
    col('Número de registro', 21, 'Registro'), col('Fecha de inspección', 17, 'Registro', 'dd/mm/yyyy'), col('Para', 55, 'Destinatarios'), col('Responde a (CC)', 55, 'Destinatarios'), col('Envío de inspección', 24, 'Notificación'), col('Estado de notificación', 34, 'Notificación'), col('Actualización de notificación', 26, 'Notificación'), col('Detalle de notificación', 60, 'Notificación'),
  ], notificationValues, stamp);
  book.views = [{ x: 0, y: 0, width: 16000, height: 10000, firstSheet: 0, activeTab: 0, visibility: 'visible' }];
  return { name: `CONSOLIDADO_INSPECCIONES_${localDate(generated)}.xlsx`, bytes: new Uint8Array(await book.xlsx.writeBuffer()) };
}
