import type { Inspection } from './model';
import type { DemoAccount } from './accounts';
import type { CloudInspectionRow } from './cloud-store';
import { cloudRpc, encodeCloudImagesForActor, hydrateCloudInspection } from './cloud-store';
import { supabaseClient } from './supabase';
import { buildExcel } from './export';
import { mailEndpoint } from './mail-api';

export type PreparedAdminEdit = { inspectionId: string; operationId: string; contentBase64?: string };
export async function adminEditPeople(): Promise<DemoAccount[]> {
  const { data, error } = await supabaseClient().from('berry_profiles').select('*').eq('enabled', true).is('deleted_at', null);
  if (error || !Array.isArray(data)) throw new Error('No pudimos consultar las personas. Revisa tu conexión.');
  return data.map(p => ({ id: p.id, name: p.full_name, email: p.email, area: p.area, jobTitle: p.job_title, role: p.role, enabled: p.enabled, canCreateInspections: p.can_create_inspections, canReceiveInspections: p.can_receive_inspections }));
}
export async function prepareAdminEdit(draft: Inspection, actor: string): Promise<PreparedAdminEdit> {
  const encoded = await encodeCloudImagesForActor(draft, actor), operationId = crypto.randomUUID();
  const prepared = await cloudRpc<{ inspection: CloudInspectionRow; state: string }>('berry_prepare_admin_edit', { p_id: draft.id, p_expected: draft.cloudRevision, p_data: encoded, p_operation: operationId });
  const result: PreparedAdminEdit = { inspectionId: draft.id, operationId };
  if (prepared.state === 'prepared') {
    const candidate = await hydrateCloudInspection(prepared.inspection, actor), file = await buildExcel(candidate);
    if (file.bytes.length > 15 * 1024 * 1024) throw new Error('El Excel actualizado supera los 15 MB permitidos. Reduce las fotografías.');
    let binary = ''; for (let index = 0; index < file.bytes.length; index += 32768) binary += String.fromCharCode(...file.bytes.subarray(index, index + 32768));
    result.contentBase64 = btoa(binary);
  }
  return result;
}
export class AdminEditError extends Error { constructor(message: string, readonly code?: string) { super(message); } }
export async function finishAdminEdit(edit: PreparedAdminEdit, actor: string): Promise<Inspection> {
  const { data: { session } } = await supabaseClient().auth.getSession();
  if (!session || session.user.id !== actor) throw new Error('Vuelve a iniciar sesión para guardar la edición.');
  const endpoint = mailEndpoint('/api/reports/revise');
  if (!endpoint) throw new Error('Falta configurar el servicio de informes.');
  const response = await fetch(endpoint, { method: 'POST', headers: { Authorization: `Bearer ${session.access_token}`, 'Content-Type': 'application/json', 'Idempotency-Key': edit.operationId }, body: JSON.stringify(edit), cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(90000) });
  const result = await response.json().catch(() => null);
  if (response.status === 404) throw new Error('Falta actualizar el servicio de informes para editar inspecciones.');
  if (!response.ok || !result?.ok) throw new AdminEditError(result?.message || 'No se confirmó el guardado. Conserva esta pestaña y vuelve a intentarlo.', result?.code);
  const inspection = await hydrateCloudInspection(result.inspection, actor);
  window.dispatchEvent(new Event('berry-cloud-inspections-changed'));
  return inspection;
}
