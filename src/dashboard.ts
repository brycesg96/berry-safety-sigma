import { productivityReady } from './productivity';
import { inspectionClosed } from './follow-up';
import type { Inspection } from './model';
import type { CloudInspectionRow } from './cloud-store';
import { cloudRpc, hydrateCloudInspection } from './cloud-store';
import { supabaseClient } from './supabase';
import { inspectionPeople } from './registration';
import type { SelectOption } from './Select';
import { areaDisplayName } from './organization';
import { organizationLabel } from './organization-label';

type IdentityLink = { personId: string; name: string; email: string; management?: string; area?: string; current: boolean; createdAt: string };
export type DashboardRow = CloudInspectionRow & { code: string; identityLinks?: Record<string, IdentityLink> };
export type DashboardCache = { actorId: string; rows: DashboardRow[]; updatedAt: string };
export const dashboardText = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLocaleLowerCase('es');
type DashboardPerson = { id: string; personId?: string; name: string; email: string; area?: string };
export const dashboardPersonKey = (row: DashboardRow, person: DashboardPerson) => row.identityLinks?.[person.personId || person.id]?.personId || person.email.trim().toLowerCase();
export function dashboardPeopleOptions(rows: DashboardRow[], role: 'inspector' | 'responsible'): SelectOption[] {
  const people = new Map<string, { value: string; name: string; email: string; area?: string; areaNomenclature?: string; management?: string; current: boolean }>();
  for (const row of rows) for (const person of role === 'inspector' ? inspectionPeople(row.data) : row.data.responsibles) {
    const link = row.identityLinks?.[person.personId || person.id], value = dashboardPersonKey(row, person);
    if (!people.has(value)) people.set(value, { value, name: link?.name || person.name, email: link?.email || person.email, area: link?.area || person.area, areaNomenclature: 'areaNomenclature' in person ? person.areaNomenclature : undefined, management: link?.management || ('management' in person ? person.management : undefined), current: link?.current ?? true });
  }
  const list = [...people.values()];
  const options = list.map(person => {
    const duplicate = list.some(other => other.value !== person.value && dashboardText(other.name) === dashboardText(person.name));
    return { value: person.value, label: duplicate ? `${person.name} — ${person.current ? 'cuenta actual' : 'registro anterior'} (${[person.email, areaDisplayName(person)].filter(Boolean).join(' · ')})` : person.name, description: [person.email, ...(role === 'inspector' ? [organizationLabel(person.management)] : []), areaDisplayName(person)].filter(Boolean).join(' · ') };
  });
  return options.map((option, i) => options.some((other, j) => i !== j && other.label === option.label) ? { ...option, label: `${option.label} · persona ${options.filter((other, j) => j <= i && other.label === option.label).length}` } : option).sort((a, b) => a.label.localeCompare(b.label, 'es'));
}
export const dashboardState = (row: DashboardRow) => row.workflow === 'closed' ? 'closed' : Object.values(row.data.delivery?.corrections || {}).some(item => item.decision === 'review') ? 'review' : 'open';
export const dashboardStateLabel = (row: DashboardRow) => ({ closed: 'Cerrada', review: 'Por validar / aprobar', open: 'En espera de respuesta' })[dashboardState(row)];
export type DashboardFilters = { code: string; from: string; to: string; inspector: string[]; management: string; area: string; responsible: string[]; state: string };
export const emptyDashboardFilters = (): DashboardFilters => ({ code: '', from: '', to: '', inspector: [], management: '', area: '', responsible: [], state: '' });
export const responsibleArea = (person: { area?: string }) => person.area?.trim() || 'Sin área registrada';
const responsibleManagement = (person: { management?: string }) => person.management?.trim() || 'Sin gerencia registrada';
export function dashboardAreas(row: DashboardRow) {
  const names = row.data.responsibles.length ? row.data.responsibles.map(responsibleArea) : ['Sin área registrada'];
  return [...new Map(names.map(name => [dashboardText(name), name])).entries()].map(([key, name]) => ({ key, name: name === 'Sin área registrada' ? name : areaDisplayName(row.data.responsibles.find(person => responsibleArea(person) === name) || { area: name }) }));
}
export function dashboardManagements(row: DashboardRow) {
  const inspectedManagement = row.data.areaLocation?.management?.trim();
  const names = inspectedManagement ? [inspectedManagement] : row.data.responsibles.length ? row.data.responsibles.map(responsibleManagement) : ['Sin gerencia registrada'];
  return [...new Map(names.map(name => [dashboardText(name), name])).entries()].map(([key, name]) => ({ key, name: name === 'Sin gerencia registrada' ? name : organizationLabel(name) }));
}
export function filterDashboard(rows: DashboardRow[], filters: DashboardFilters) {
  return rows.filter(row => dashboardText(row.code).includes(dashboardText(filters.code)) && (!filters.from || row.data.date >= filters.from) && (!filters.to || row.data.date <= filters.to)
    && (!filters.inspector.length || inspectionPeople(row.data).some(person => filters.inspector.includes(dashboardPersonKey(row, person))))
    && (!filters.management || dashboardManagements(row).some(item => item.key === filters.management))
    && ((!filters.area && !filters.responsible.length) || (row.data.responsibles.length ? row.data.responsibles : [{ email: '', area: '', management: '' }]).some(person =>
      (!filters.management || !!row.data.areaLocation?.management?.trim() || dashboardText(responsibleManagement(person)) === filters.management)
      && (!filters.area || dashboardText(responsibleArea(person)) === filters.area) && (!filters.responsible.length || 'id' in person && filters.responsible.includes(dashboardPersonKey(row, person as DashboardPerson)))))
    && (!filters.state || dashboardState(row) === filters.state));
}
export function dashboardMetrics(rows: DashboardRow[], today: string) {
  let observations = 0, executed = 0, overdue = 0;
  const months = new Map<string, number>(), areas = new Map<string, { name: string; count: number }>(), managements = new Map<string, { name: string; count: number }>(), risk = { baja: 0, media: 0, alta: 0 };
  for (const row of rows) {
    const month = row.data.date.slice(0, 7); months.set(month, (months.get(month) || 0) + 1);
    for (const { key, name } of dashboardAreas(row)) { const area = areas.get(key) || { name, count: 0 }; area.count++; areas.set(key, area); }
    for (const { key, name } of dashboardManagements(row)) { const management = managements.get(key) || { name, count: 0 }; management.count++; managements.set(key, management); }
    for (const observation of row.data.observations) {
      observations++; if (observation.severity in risk) risk[observation.severity]++;
      const done = row.data.delivery?.corrections[observation.id]?.state === 'Ejecutado' || row.workflow === 'closed';
      if (done) executed++; else if (observation.dueDate && observation.dueDate < today) overdue++;
    }
  }
  return { total: rows.length, closed: rows.filter(row => row.workflow === 'closed').length, observations, executed, pending: observations - executed, overdue, risk,
    months: [...months].sort(([a], [b]) => a.localeCompare(b)), areas: [...areas].map(([key, value]) => ({ key, ...value })).sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, 'es')),
    managements: [...managements].map(([key, value]) => ({ key, ...value })).sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, 'es')) };
}
export async function loadDashboard(): Promise<DashboardRow[]> {
  if (productivityReady()) {
    const rows: DashboardRow[] = []; let before: string | null = null, beforeId: string | null = null;
    for (;;) {
      const page: DashboardRow[] = await cloudRpc('berry_admin_dashboard_page', { p_before: before, p_before_id: beforeId, p_limit: 100 });
      rows.push(...page); if (page.length < 100) return rows;
      const last = page[page.length - 1]; before = last.data.date || ''; beforeId = last.id;
    }
  }
  const { data, error } = await supabaseClient().rpc('berry_admin_dashboard');
  if (error?.code === 'PGRST202') throw new Error('La Gestión de Inspecciones está pendiente de activación.');
  if (error || !Array.isArray(data)) throw new Error('No pudimos consultar el panel. Comprueba tu conexión y tus permisos.');
  return data;
}
export async function loadDashboardInspection(id: string, actorId: string): Promise<Inspection> {
  const row = await cloudRpc<CloudInspectionRow>('berry_admin_inspection', { p_id: id });
  return hydrateCloudInspection(row, actorId);
}
export async function buildConsolidated(rows: DashboardRow[], context?: import('./consolidated').ConsolidatedContext) {
  return (await import('./consolidated')).buildConsolidated(rows, context);
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
