import { supabaseClient } from './supabase';
import type { EmergencyEquipment, EmergencyLegacyRecord, EmergencyState } from './emergency-equipment';

export type ExportEquipment = EmergencyEquipment & { created_at: string; updated_at: string };
export type ExportReview = {
 id: string; equipment_id: string; inspection_date: string; state: EmergencyState; created_at: string;
 worker_name?: string; employee_code?: string; notes?: string; submission_source?: string;
 code?: string; location?: string; serial_number?: string; brand?: string; agent?: string; capacity?: string;
};
export type ExportOrganization = { id: string; name: string };
export type EmergencyExportData = {
 year: number; generatedAt: string; inspectionCutoff: string | null;
 equipment: ExportEquipment[]; legacy: EmergencyLegacyRecord[]; latest: ExportReview[];
 months: { equipment_id: string; inspection_date: string; source: 'berry' | 'legacy' }[];
 reviews: ExportReview[]; organizations: ExportOrganization[];
};
type Options = { year: number; signal: AbortSignal; isCurrent: () => boolean; progress: (message: string) => void };
const PAGE = 250;
const equipmentColumns = 'id,kind,code,area_id,management_id,location,serial_number,brand,agent,capacity,manufacture_year,expiry_month,last_hydro_date,next_hydro_date,last_hydro_year,next_hydro_year,enabled,revision,owner_management_id,owner_name,classification,placement_kind,created_at,updated_at';
const reviewColumns = 'id,equipment_id,inspection_date,state,created_at';
const detailColumns = reviewColumns + ',worker_name,employee_code,notes,submission_source,code:equipment_snapshot->>code,location:equipment_snapshot->>location,serial_number:equipment_snapshot->>serial_number,brand:equipment_snapshot->>brand,agent:equipment_snapshot->>agent,capacity:equipment_snapshot->>capacity';
const failure = () => new Error('No pudimos completar la base de extintores. Revisa la conexión y vuelve a generar el archivo.');
function current(options: Pick<Options, 'signal' | 'isCurrent'>) {
 options.signal.throwIfAborted();
 if (!options.isCurrent()) throw new Error('La sesión cambió. Vuelve a entrar antes de generar la base.');
}
export async function verifyEmergencyExportAccess(options: Pick<Options, 'signal' | 'isCurrent'>) {
 current(options);
 const { data, error } = await supabaseClient().rpc('berry_yo_seguro_scope').abortSignal(AbortSignal.any([options.signal, AbortSignal.timeout(15000)]));
 current(options);
 if (error) throw failure();
 if (data?.admin !== true) throw new Error('Esta descarga está disponible para Administración.');
}
async function pages<T extends { id: string }>(table: string, columns: string, options: Options, apply: (query: any) => any, visit: (rows: T[]) => void, label: string) {
 let after = '', count = 0;
 while (true) {
  current(options);
  let query = apply(supabaseClient().from(table).select(columns)).order('id', { ascending: true }).limit(PAGE);
  if (after) query = query.gt('id', after);
  const { data, error } = await query.abortSignal(AbortSignal.any([options.signal, AbortSignal.timeout(30000)]));
  current(options);
  if (error || !Array.isArray(data)) throw failure();
  const rows = data as T[];
  if (rows.some((row, index) => !row.id || row.id <= (index ? rows[index - 1].id : after))) throw failure();
  visit(rows); count += rows.length;
  options.progress(label + ': ' + count.toLocaleString('es-PE'));
  if (rows.length < PAGE) break;
  after = rows[rows.length - 1].id;
 }
}
export async function collectEmergencyExport(options: Options): Promise<EmergencyExportData> {
 if (!Number.isInteger(options.year) || options.year < 1900 || options.year > 2100) throw new Error('Selecciona un año válido.');
 await verifyEmergencyExportAccess(options);
 const equipment: ExportEquipment[] = [], legacy: EmergencyLegacyRecord[] = [], reviews: ExportReview[] = [];
 options.progress('Consultando el inventario');
 await pages<ExportEquipment>('berry_emergency_equipment', equipmentColumns, options, q => q.eq('kind', 'extinguisher'), rows => equipment.push(...rows), 'Equipos consultados');
 if (!equipment.length) throw new Error('Todavía no hay extintores registrados. Termina la carga inicial o registra un equipo.');
 const ids = new Set(equipment.map(row => row.id));
 const { data: organizations, error: orgError } = await supabaseClient().rpc('berry_admin_organization').abortSignal(AbortSignal.any([options.signal, AbortSignal.timeout(15000)]));
 current(options);
 if (orgError || !Array.isArray(organizations)) throw failure();
 await pages<EmergencyLegacyRecord>('berry_emergency_legacy_records', 'id,equipment_id,source_row,official_date,previous_date,state_original,notes,inspector_code,months,original,imported_at', options, q => q, rows => legacy.push(...rows.filter(row => ids.has(row.equipment_id))), 'Antecedentes consultados');
 // Reviews are immutable. A server-stored upper bound excludes new arrivals between pages.
 const { data: newest, error: newestError } = await supabaseClient().from('berry_emergency_inspections').select('created_at').order('created_at', { ascending: false }).limit(1).abortSignal(AbortSignal.any([options.signal, AbortSignal.timeout(15000)]));
 current(options);
 if (newestError || !Array.isArray(newest)) throw failure();
 const inspectionCutoff = newest[0]?.created_at || null;
 const latest = new Map<string, ExportReview>(), months = new Map<string, EmergencyExportData['months'][number]>();
 const month = (equipment_id: string, inspection_date: string, source: 'berry' | 'legacy') => {
  if (!inspection_date.startsWith(String(options.year) + '-')) return;
  const key = equipment_id + ':' + inspection_date.slice(0, 7), old = months.get(key);
  if (!old || inspection_date > old.inspection_date || inspection_date === old.inspection_date && source === 'berry') months.set(key, { equipment_id, inspection_date, source });
 };
 for (const row of legacy) if (row.official_date) month(row.equipment_id, row.official_date, 'legacy');
 if (inspectionCutoff) {
  // Keep only one latest row and twelve month dates per equipment in memory.
  await pages<ExportReview>('berry_emergency_inspections', reviewColumns, options, q => q.lte('created_at', inspectionCutoff), rows => {
   for (const row of rows) {
    if (!ids.has(row.equipment_id)) continue;
    const old = latest.get(row.equipment_id);
    if (!old || row.inspection_date > old.inspection_date || row.inspection_date === old.inspection_date && (row.created_at > old.created_at || row.created_at === old.created_at && row.id > old.id)) latest.set(row.equipment_id, row);
    month(row.equipment_id, row.inspection_date, 'berry');
   }
  }, 'Fechas de inspección consultadas');
  await pages<ExportReview>('berry_emergency_inspections', detailColumns, options, q => {
   q = q.lte('created_at', inspectionCutoff);
   q = q.gte('inspection_date', String(options.year) + '-01-01').lt('inspection_date', String(options.year + 1) + '-01-01');
   return q;
  }, rows => {
   reviews.push(...rows.filter(row => ids.has(row.equipment_id)));
   if (reviews.length > 50000) throw new Error('El año supera 50.000 inspecciones. No generamos un archivo incompleto; solicita una extracción de ese período.');
  }, 'Detalle de inspecciones consultado');
  // Latest details may belong to a different year than the requested annual detail.
  const details = new Map(reviews.map(row => [row.id, row]));
  const missing = [...latest.values()].filter(row => !details.has(row.id));
  for (let offset = 0; offset < missing.length; offset += PAGE) {
   current(options);
   const { data, error } = await supabaseClient().from('berry_emergency_inspections').select(detailColumns).in('id', missing.slice(offset, offset + PAGE).map(row => row.id)).abortSignal(AbortSignal.any([options.signal, AbortSignal.timeout(30000)]));
   current(options);
   if (error || !Array.isArray(data) || data.length !== missing.slice(offset, offset + PAGE).length) throw failure();
   for (const value of data) { const row = value as unknown as ExportReview; if (typeof row.id !== 'string' || typeof row.equipment_id !== 'string') throw failure(); details.set(row.id, row); }
  }
  for (const row of latest.values()) {
   const detail = details.get(row.id);
   if (!detail) throw failure();
   latest.set(row.equipment_id, detail);
  }
 }
 // Abort rather than silently mixing inventory revisions if somebody edits a ficha during export.
 const versions: { id: string; revision: number }[] = [];
 await pages<{ id: string; revision: number }>('berry_emergency_equipment', 'id,revision', options, q => q.eq('kind', 'extinguisher'), rows => versions.push(...rows), 'Verificando el inventario');
 const revisions = new Map(equipment.map(row => [row.id, row.revision]));
 if (versions.length !== equipment.length || versions.some(row => revisions.get(row.id) !== row.revision)) throw new Error('El inventario cambió mientras se generaba la base. Vuelve a descargar para incluir los datos actualizados.');
 await verifyEmergencyExportAccess(options);
 return { year: options.year, generatedAt: new Date().toISOString(), inspectionCutoff, equipment, legacy, latest: [...latest.values()], months: [...months.values()], reviews, organizations };
}
