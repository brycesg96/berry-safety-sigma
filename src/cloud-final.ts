import type { Inspection } from './model';
import type { CloudInspectionRow } from './cloud-store';
import { hydrateCloudInspection } from './cloud-store';
import { buildExcel } from './export';
import { inspectionClosed } from './follow-up';
import { supabaseClient } from './supabase';
import { mailEndpoint } from './mail-api';

const pending = new Map<string, Promise<Inspection>>();
/** After all approvals, replace the stored workbook; this never sends mail. */
export async function storeFinalExcel(inspection: Inspection): Promise<Inspection> {
  if (inspection.storage !== 'cloud' || !inspectionClosed(inspection)) throw new Error('El Excel final se guarda cuando todas las observaciones estén aprobadas.');
  const { data: { session } } = await supabaseClient().auth.getSession();
  if (!session) throw new Error('Inicia sesión para guardar el Excel final.');
  const actor = session.user.id, key = `${actor}:${inspection.id}:${inspection.cloudRevision}`;
  const existing = pending.get(key); if (existing) return existing;
  const work = (async () => {
    const input: { inspectionId: string; expectedRevision?: number; contentBase64?: string } = { inspectionId: inspection.id, expectedRevision: inspection.cloudRevision };
    if (!inspection.finalExcelStored) {
      const file = await buildExcel(inspection);
      if (file.bytes.length > 15 * 1024 * 1024) throw new Error('El Excel final supera los 15 MB permitidos.');
      let binary = ''; for (let i = 0; i < file.bytes.length; i += 32768) binary += String.fromCharCode(...file.bytes.subarray(i, i + 32768));
      input.contentBase64 = btoa(binary);
    }
    const endpoint = mailEndpoint('/api/reports/finalize');
    if (!endpoint) throw new Error('Falta configurar el servicio del Excel final.');
    const response = await fetch(endpoint, { method: 'POST', headers: { Authorization: `Bearer ${session.access_token}`, 'Content-Type': 'application/json', 'Idempotency-Key': inspection.id }, body: JSON.stringify(input), cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(90000) });
    const result = await response.json().catch(() => null);
    if (response.status === 404) throw new Error('Falta actualizar el servicio de informes para guardar el Excel final.');
    if (!response.ok || !result?.ok) throw new Error(result?.message || 'La inspección está cerrada. No se confirmó el reemplazo del Excel; vuelve a intentarlo.');
    return hydrateCloudInspection(result.inspection as CloudInspectionRow, actor);
  })();
  pending.set(key, work);
  try { return await work; } finally { if (pending.get(key) === work) pending.delete(key); }
}
