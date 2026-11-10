import { inspectionClosed } from './follow-up';
import type { Inspection } from './model';
import type { CloudInspectionRow } from './cloud-store';
import { cloudRpc, hydrateCloudInspection } from './cloud-store';
import { supabaseClient } from './supabase';
import { closingRemarksOf, inspectionPeople } from './registration';
import { formatInspectionTime } from './inspection-time';

export type DashboardRow = CloudInspectionRow & { code: string };
export type DashboardCache = { actorId: string; rows: DashboardRow[]; updatedAt: string };
export const dashboardText = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLocaleLowerCase('es');
export const dashboardState = (row: DashboardRow) => row.workflow === 'closed' ? 'closed' : Object.values(row.data.delivery?.corrections || {}).some(item => item.decision === 'review') ? 'review' : 'open';
export const dashboardStateLabel = (row: DashboardRow) => ({ closed: 'Cerrada', review: 'En revisión', open: 'En levantamiento' })[dashboardState(row)];
export type DashboardFilters = { code: string; from: string; to: string; inspector: string[]; area: string; responsible: string[]; state: string };
export const emptyDashboardFilters = (): DashboardFilters => ({ code: '', from: '', to: '', inspector: [], area: '', responsible: [], state: '' });
export const responsibleArea = (person: { area?: string }) => person.area?.trim() || 'Sin área registrada';
export function dashboardAreas(row: DashboardRow) {
  const names = row.data.responsibles.length ? row.data.responsibles.map(responsibleArea) : ['Sin área registrada'];
  return [...new Map(names.map(name => [dashboardText(name), name])).entries()].map(([key, name]) => ({ key, name }));
}
export function filterDashboard(rows: DashboardRow[], filters: DashboardFilters) {
  return rows.filter(row => dashboardText(row.code).includes(dashboardText(filters.code)) && (!filters.from || row.data.date >= filters.from) && (!filters.to || row.data.date <= filters.to)
    && (!filters.inspector.length || inspectionPeople(row.data).some(person => filters.inspector.includes(person.email.trim().toLowerCase())))
    && ((!filters.area && !filters.responsible.length) || (row.data.responsibles.length ? row.data.responsibles : [{ email: '', area: '' }]).some(person =>
      (!filters.area || dashboardText(responsibleArea(person)) === filters.area) && (!filters.responsible.length || filters.responsible.includes(person.email.trim().toLowerCase()))))
    && (!filters.state || dashboardState(row) === filters.state));
}
export function dashboardMetrics(rows: DashboardRow[], today: string) {
  let observations = 0, executed = 0, overdue = 0;
  const months = new Map<string, number>(), areas = new Map<string, { name: string; count: number }>(), risk = { baja: 0, media: 0, alta: 0 };
  for (const row of rows) {
    const month = row.data.date.slice(0, 7); months.set(month, (months.get(month) || 0) + 1);
    for (const { key, name } of dashboardAreas(row)) { const area = areas.get(key) || { name, count: 0 }; area.count++; areas.set(key, area); }
    for (const observation of row.data.observations) {
      observations++; if (observation.severity in risk) risk[observation.severity]++;
      const done = row.data.delivery?.corrections[observation.id]?.state === 'Ejecutado' || row.workflow === 'closed';
      if (done) executed++; else if (observation.dueDate && observation.dueDate < today) overdue++;
    }
  }
  return { total: rows.length, closed: rows.filter(row => row.workflow === 'closed').length, observations, executed, pending: observations - executed, overdue, risk,
    months: [...months].sort(([a], [b]) => a.localeCompare(b)), areas: [...areas].map(([key, value]) => ({ key, ...value })).sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, 'es')) };
}
export async function loadDashboard(): Promise<DashboardRow[]> {
  const { data, error } = await supabaseClient().rpc('berry_admin_dashboard');
  if (error?.code === 'PGRST202') throw new Error('El Panel de inspecciones está pendiente de activación.');
  if (error || !Array.isArray(data)) throw new Error('No pudimos consultar el panel. Comprueba tu conexión y tus permisos.');
  return data;
}
export async function loadDashboardInspection(id: string, actorId: string): Promise<Inspection> {
  const row = await cloudRpc<CloudInspectionRow>('berry_admin_inspection', { p_id: id });
  return hydrateCloudInspection(row, actorId);
}
export async function buildConsolidated(rows: DashboardRow[]) {
  const { default: ExcelJS } = await import('exceljs');
  const book = new ExcelJS.Workbook(); book.creator = 'Berry Safety';
  const summary = book.addWorksheet('Inspecciones'), observations = book.addWorksheet('Observaciones');
  const summaryHeaders = ['Código', 'Fecha de inspección', 'Hora', 'Instalación', 'Área inspeccionada', 'Inspectores', 'Correos de inspectores', 'Responsables del área', 'Correos de responsables', 'Estado de inspección', 'Observaciones', 'Ejecutadas', 'Objetivo', 'Resultados desfavorables', 'Conclusiones y recomendaciones'];
  const observationHeaders = ['Código', 'Fecha de inspección', 'Área inspeccionada', 'Observación', 'Descripción', 'Nivel de riesgo', 'Medida correctiva', 'Cierre previsto', 'Estado', 'Responsable del levantamiento', 'Acción realizada', 'Fecha de cierre', 'Decisión del revisor', 'Comentario del revisor'];
  summary.addRow(summaryHeaders); observations.addRow(observationHeaders);
  for (const row of rows) {
    const data = row.data, people = inspectionPeople(data), metrics = dashboardMetrics([row], '');
    summary.addRow([row.code, data.date, formatInspectionTime(data.inspectionTime, data.inspectionPeriod), data.facility, data.area, people.map(p => p.name).join('; '), people.map(p => p.email).join('; '), data.responsibles.map(p => p.name).join('; '), data.responsibles.map(p => p.email).join('; '), dashboardStateLabel(row), data.observations.length, metrics.executed, data.objective, data.unfavorableCause, closingRemarksOf(data)]);
    data.observations.forEach((observation, index) => {
      const correction = data.delivery?.corrections[observation.id];
      observations.addRow([row.code, data.date, data.area, index + 1, observation.description, { baja: 'Bajo', media: 'Medio', alta: 'Alto' }[observation.severity], observation.correctiveAction, observation.dueDate, row.workflow === 'closed' ? 'Ejecutado' : correction?.state || 'Pendiente', correction?.responsibleName || '', correction?.action || '', correction?.date || '', correction ? ({ approved: 'Aprobado', changes: 'Ajustes solicitados', review: 'En revisión', draft: 'Borrador' }[correction.decision]) : '', correction?.note || '']);
    });
  }
  for (const sheet of [summary, observations]) {
    sheet.views = [{ state: 'frozen', ySplit: 1 }]; sheet.autoFilter = { from: 'A1', to: { row: sheet.rowCount, column: sheet.columnCount } };
    sheet.getRow(1).height = 32;
    sheet.columns.forEach((column, i) => { column.width = i === 0 ? 19 : i === 1 ? 20 : 27; });
    sheet.eachRow((row, index) => row.eachCell(cell => {
      cell.alignment = { vertical: 'top', wrapText: true };
      cell.font = { name: 'Calibri', size: 11, ...(index === 1 ? { bold: true, color: { argb: 'FFFFFFFF' } } : {}) };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: index === 1 ? 'FF27674F' : index % 2 ? 'FFF1F6ED' : 'FFFFFFFF' } };
    }));
  }
  return { name: 'CONSOLIDADO_INSPECCIONES.xlsx', bytes: new Uint8Array(await book.xlsx.writeBuffer()) };
}
export function saveDashboardFile(file: { name: string; bytes: Uint8Array }) {
  const url = URL.createObjectURL(new Blob([file.bytes as BlobPart], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
  const link = document.createElement('a'); link.href = url; link.download = file.name; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Dashboard cache stores text only; detailed images remain in the scoped file cache. */
export function dashboardSnapshot(data: Inspection): DashboardRow {
  const text = { ...data, observations: data.observations.map(item => ({ ...item, photos: [] })), registrationDetails: Object.fromEntries(Object.entries(data.registrationDetails || {}).map(([id, value]) => [id, { ...value, signature: undefined }])), ...(data.delivery ? { delivery: { ...data.delivery, corrections: Object.fromEntries(Object.entries(data.delivery.corrections).map(([id, value]) => [id, { ...value, photos: [] }])) } } : {}) };
  return { id: data.id, author_id: data.ownerId, code: data.serverRegistration!.code, revision: data.cloudRevision!, updated_at: data.updatedAt, workflow: inspectionClosed(data) ? 'closed' : 'sent', final_excel_stored: data.finalExcelStored, active_edit_operation: data.archiveEditOperation, data: text };
}
