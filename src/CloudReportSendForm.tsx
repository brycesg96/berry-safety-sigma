import { useContext, useRef, useState } from 'react';
import { LoaderCircle, Send } from 'lucide-react';
import { AccountDirectory } from './AccountDirectory';
import { inspectionCopies } from './accounts';
import { buildExcel } from './export';
import { hydrateCloudInspection, persistCloudInspection } from './cloud-store';
import type { CloudInspectionRow } from './cloud-store';
import { supabaseClient } from './supabase';
import { mailEndpoint } from './mail-api';
import type { Inspection } from './model';
import { validateStep } from './model';

export function CloudReportSendForm({ inspection, actorId, onChange, onBusyChange }: { inspection: Inspection; actorId: string; onChange: (inspection: Inspection) => void; onBusyChange?: (busy: boolean) => void }) {
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const lock = useRef(false), accounts = useContext(AccountDirectory);
  const cc = inspection.emailCc || inspectionCopies(inspection.responsibles, accounts || []);
  const send = async () => {
    if (lock.current) return;
    lock.current = true; setBusy(true); onBusyChange?.(true); setError('');
    try {
      let input: { inspectionId: string; expectedRevision?: number; contentBase64?: string } = { inspectionId: inspection.id };
      if (!inspection.delivery) {
        for (const step of [0,1,3]) if (Object.keys(validateStep(inspection, step)).length) throw new Error('Completa los datos de la inspección antes de enviarla.');
        const saved = await persistCloudInspection(inspection);
        const file = await buildExcel(saved);
        if (file.bytes.length > 3 * 1024 * 1024) throw new Error('El Excel supera 3 MB. Reduce las fotografías antes de enviar.');
        let binary = ''; for (let i = 0; i < file.bytes.length; i += 32768) binary += String.fromCharCode(...file.bytes.subarray(i, i + 32768));
        input = { inspectionId: saved.id, expectedRevision: saved.cloudRevision, contentBase64: btoa(binary) };
      }
      const api = mailEndpoint('/api/reports/send');
      const { data: { session } } = await supabaseClient().auth.getSession();
      if (!api || session?.user.id !== actorId) throw new Error('Revisa tu sesión y la conexión del servicio de informes.');
      const response = await fetch(api, { method: 'POST', headers: { Authorization: `Bearer ${session.access_token}`, 'Content-Type': 'application/json', 'Idempotency-Key': inspection.id }, body: JSON.stringify(input), signal: AbortSignal.timeout(90000), cache: 'no-store', redirect: 'error' });
      const data = await response.json();
      if (!response.ok || !data.ok) throw new Error(data.message || 'No pudimos confirmar el registro del informe.');
      onChange(await hydrateCloudInspection(data.inspection as CloudInspectionRow, actorId));
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : 'No pudimos confirmar el envío.');
      // A lost HTTP response must not turn a registered report back into a
      // new draft or allocate a second code. Recover its authoritative state.
      try {
        const { data } = await supabaseClient().from('berry_inspections').select('*').eq('id', inspection.id).single();
        if (data && data.workflow !== 'draft') onChange(await hydrateCloudInspection(data as CloudInspectionRow, actorId));
      } catch { /* The original draft remains available for a retry. */ }
    } finally { lock.current = false; setBusy(false); onBusyChange?.(false); }
  };
  return <div className="report-send-form"><p>{inspection.delivery ? inspection.emailDelivery?.message || 'El informe está guardado. Puedes comprobar el envío sin generar otro código ni repetir un correo ya solicitado.' : 'Las personas indicadas recibirán la inspección en su cuenta y el registro en formato Excel (.xlsx) adjunto al correo.'}</p><p><strong>Administradores (CC):</strong> {cc.length ? cc.join(', ') : 'Sin correos asociados'}</p><button type="button" className="button button-primary full-width" disabled={busy || cc.length > 50} onClick={() => void send()}>{busy ? <LoaderCircle className="spin" size={17}/> : <Send size={17}/>} {busy ? 'Comprobando…' : inspection.delivery ? 'Comprobar envío' : 'Enviar informe por correo'}</button>{cc.length > 50 && <p className="error-message" role="alert">Se permiten hasta 50 correos en copia.</p>}{error && <p className="notice notice-error" role="alert">{error}</p>}</div>;
}
