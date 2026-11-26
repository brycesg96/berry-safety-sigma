import { AccountDirectory } from './AccountDirectory';
import { readAccounts } from './accounts';
import { correctionAuthorName } from './correction-author';
import { inboxWorkflowLabel } from './inspection-priority';
import { SaveButton } from './SaveButton';
import type { SavePhase } from './SaveButton';
import { LiquidGlassSurface } from './components/ui/liquid-glass';
import { supabaseClient } from './supabase';
import { hydrateCloudInspection } from './cloud-store';
import type { CloudInspectionRow } from './cloud-store';
import { FollowUpConversation } from './FollowUpConversation';
import { FollowUpSummary } from './FollowUpSummary';
import { FollowUpObservationNavigation } from './FollowUpObservationNavigation';
import { hasPendingChanges, unsavedMessage, usePendingChanges } from './manual-save';
import { useContext, useEffect, useId, useRef, useState } from 'react';
import { ArrowLeft, BadgeCheck, Camera, Check, Clock3, Download, ImagePlus, LoaderCircle, Pencil, RefreshCw, RotateCcw, Send, X } from 'lucide-react';
import { Badge, Field, Modal } from './components';
import type { Inspection } from './model';
import { formatDate, preparePhoto } from './model';
import type { DemoAccount } from './accounts';
import type { Correction } from './follow-up';
import { blankCorrection, inspectionClosed, isRecipient, reviewCorrection, saveCorrection, workflowLabel } from './follow-up';
import { exportExcel } from './export';
import { exportPdf } from './pdf';
import { confirmedInspectionCode } from './inspection-code';
import { CloudReportSendForm } from './CloudReportSendForm';
import { storeFinalExcel } from './cloud-final';

export function FollowUp({ inspection, actor, onChange, onBack, readOnly = false, onBusyChange, onEdit, onArchiveRetry, externalBusy = false, showCorrectionAuthor = true }: { inspection: Inspection; actor: DemoAccount; onChange: (d: Inspection) => void; onBack: () => void; readOnly?: boolean; onBusyChange?: (busy: boolean) => void; onEdit?: () => void; onArchiveRetry?: () => void; externalBusy?: boolean; showCorrectionAuthor?: boolean }) {
  const [selectedObservation, setSelectedObservation] = useState('');
  const navigationId = useId();
  const activeObservation = inspection.observations.find(observation => observation.id === selectedObservation)?.id || inspection.observations[0]?.id || '';
  const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<{ data: string; name: string } | null>(null);
  const [mailOpen, setMailOpen] = useState(false);
  const [finalizing, setFinalizing] = useState(false);
  const currentChange = useRef(onChange); currentChange.current = onChange;
  const owner = inspection.ownerId === actor.id;
  const recipient = isRecipient(inspection, actor.id) && actor.canReceiveInspections !== false;
  const reviewer = owner && actor.canCreateInspections !== false && !readOnly;
  const closed = inspectionClosed(inspection);
  useEffect(() => {
    if (inspection.storage !== 'cloud') return;
    let active = true, running = false;
    const refresh = async () => {
      if (running || !navigator.onLine || document.visibilityState === 'hidden' || hasPendingChanges()) return;
      running = true;
      try { const { data, error } = await supabaseClient().from('berry_inspections').select('*').eq('id', inspection.id).single(); if (!error && data && Number(data.revision) > Number(inspection.cloudRevision || 0)) { const next = await hydrateCloudInspection(data as CloudInspectionRow, actor.id); if (active && !hasPendingChanges()) currentChange.current(next); } }
      catch { /* Preserve the displayed record if background refresh fails. */ }
      finally { running = false; }
    };
    const timer = setInterval(() => void refresh().catch(() => {}), 20000);
    window.addEventListener('focus', refresh);
    return () => { active = false; clearInterval(timer); window.removeEventListener('focus', refresh); };
  }, [inspection.id, inspection.cloudRevision, actor.id]);

  const finalize = async () => {
    setFinalizing(true); setError('');
    try { currentChange.current(await storeFinalExcel(inspection)); }
    catch (problem) { setError(problem instanceof Error ? problem.message : 'No se pudo guardar el Excel final. Vuelve a intentarlo.'); }
    finally { setFinalizing(false); }
  };
  useEffect(() => { onBusyChange?.(busy || finalizing); }, [busy, finalizing, onBusyChange]);
  async function download(format: 'excel' | 'pdf') {
    if (hasPendingChanges()) { setError(unsavedMessage); return; }
    setBusy(true); setError('');
    try { await (format === 'pdf' ? exportPdf(inspection) : exportExcel(inspection, { readOnly })); }
    catch { setError(`No se pudo descargar el ${format === 'pdf' ? 'PDF' : 'Excel'}. Vuelve a intentarlo.`); }
    finally { setBusy(false); }
  }
  if (!owner && !recipient && !(readOnly && actor.role === 'admin')) return <p role="alert">No tienes esta inspección asignada.</p>;
  return <>
    <button className="button button-back" disabled={busy || finalizing || externalBusy} onClick={() => { if (hasPendingChanges()) setError(unsavedMessage); else onBack(); }}><ArrowLeft size={17}/>Volver</button>
    <div className="page-heading followup-heading"><div><div className="eyebrow">SEGUIMIENTO DE HALLAZGOS</div><h1>{inspection.area}</h1><p>{owner ? workflowLabel(inspection) : inboxWorkflowLabel(inspection)} · {confirmedInspectionCode(inspection) || 'Número de registro definitivo pendiente'} · {formatDate(inspection.date)}</p></div><div className="followup-downloads">{onArchiveRetry && <button type="button" className="button button-primary" disabled={busy || externalBusy} onClick={onArchiveRetry}><RefreshCw size={16}/>Completar actualización del Excel</button>}{onEdit && !closed && !inspection.archiveEditOperation && <button type="button" className="button button-primary" disabled={busy || externalBusy} onClick={() => { if (hasPendingChanges()) setError(unsavedMessage); else onEdit?.(); }}><Pencil size={16}/>Editar inspección</button>}<button className="button button-outline" disabled={busy || externalBusy} onClick={() => void download('excel')}><Download size={16}/>Descargar Excel</button>{closed && <button className="button button-outline" disabled={busy || externalBusy} onClick={() => void download('pdf')}><Download size={16}/>Descargar PDF</button>}</div></div>

    {reviewer && inspection.storage === 'cloud' && inspection.emailDelivery?.state !== 'accepted' && <button type="button" className="button button-outline" onClick={() => setMailOpen(true)}>Comprobar envío por correo</button>}
    <FollowUpSummary inspection={inspection} actorId={actor.id}/>
    {finalizing && <p className="inline-note" role="status"><LoaderCircle size={16} className="spin"/>Guardando Excel final…</p>}
    {error && <p className="notice notice-error" role="alert">{error}</p>}
    {!readOnly && closed && inspection.storage === 'cloud' && inspection.finalExcelStored === false && !finalizing && <button type="button" className="button button-outline" disabled={busy} onClick={() => void finalize()}>Reintentar guardar Excel final</button>}
    <FollowUpObservationNavigation inspection={inspection} activeId={activeObservation} onSelect={setSelectedObservation} idPrefix={navigationId}/>
    {/* Preserve drafts, photos and conversations while inactive panels are hidden. */}
    {inspection.observations.map((o, i) => <section className="followup-card liquid-glass-card" key={o.id} role="tabpanel" id={`${navigationId}-panel-${o.id}`} aria-labelledby={`${navigationId}-tab-${o.id}`} tabIndex={0} hidden={o.id !== activeObservation}><LiquidGlassSurface/>
      <div className="observation-heading"><span className="observation-index">{i + 1}</span><h2>Observación {i + 1}</h2><Badge severity={o.severity}/><span className={`list-status${inspection.delivery?.corrections[o.id]?.decision==='approved'?' status-ready':''}`}>{inspection.delivery?.corrections[o.id]?.decision==='approved'?'Ejecutado':'Pendiente'}</span></div>
      <div className="followup-original-layout"><div className="followup-original"><p><strong>Descripción</strong>{o.description}</p><p><strong>Acción a tomar</strong>{o.correctiveAction}</p></div><div className="followup-original-side"><p className="followup-planned-date"><strong>Fecha de Cierre prevista</strong>{formatDate(o.dueDate)}</p>
      {o.photos.length > 0 && <div className="followup-evidence" aria-label="Registro fotográfico original">{o.photos.map(p => <button key={p.id} onClick={() => setPreview(p)} aria-label={`Ver evidencia original ${p.name}`}><img src={p.data} alt={p.name} loading="lazy"/></button>)}</div>}
      </div></div>
      <CorrectionForm key={o.id} inspection={inspection} observationId={o.id} actor={actor} owner={reviewer} recipient={recipient && !readOnly} showCorrectionAuthor={showCorrectionAuthor} onChange={onChange} onPreview={setPreview}/>
    </section>)}
    {preview && <Modal title="Evidencia del informe" wide onClose={() => setPreview(null)}><img className="photo-full" src={preview.data} alt={preview.name}/></Modal>}
    {mailOpen && <Modal title="Envío por correo" onClose={() => !busy && setMailOpen(false)}><CloudReportSendForm inspection={inspection} actorId={actor.id} onBusyChange={setBusy} onChange={updated => { onChange(updated); setMailOpen(false); }}/></Modal>}
  </>;
}
function CorrectionForm({ inspection, observationId, actor, owner, recipient, showCorrectionAuthor, onChange, onPreview }: { inspection: Inspection; observationId: string; actor: DemoAccount; owner: boolean; recipient: boolean; showCorrectionAuthor: boolean; onChange: (d: Inspection) => void; onPreview: (p: { data: string; name: string }) => void }) {
  const saved = inspection.delivery?.corrections[observationId];
  const directory=useContext(AccountDirectory);
  const [value, setValue] = useState<Correction>(() => saved || blankCorrection(inspection, observationId, recipient ? actor : undefined));
  const savedSnapshot = JSON.stringify(saved);
  const baseline = useRef(JSON.stringify(value));
  const observed = useRef(savedSnapshot);
  const valueDirty = JSON.stringify(value) !== baseline.current;
  const dirtyRef = useRef(valueDirty); dirtyRef.current = valueDirty;
  useEffect(() => {
    if (observed.current === savedSnapshot) return;
    if (!dirtyRef.current && saved) { baseline.current = JSON.stringify(saved); setValue(saved); observed.current = savedSnapshot; }
  }, [savedSnapshot]);
  const [note, setNote] = useState(''); const [message, setMessage] = useState(''); const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  usePendingChanges(valueDirty || note.length > 0 || busy);
  const actionPending = useRef(false);
  const [advancePhase, setAdvancePhase] = useState<SavePhase>('idle');
  const closed = inspectionClosed(inspection);
  const locked = !recipient || saved?.decision === 'review' || saved?.decision === 'approved' || closed;
  const update = <K extends keyof Correction>(key: K, v: Correction[K]) => { setMessage(''); setAdvancePhase('idle'); setValue(c => ({ ...c, [key]: v })); };
  async function act(action: () => Promise<Inspection>, success: string, advance = false) {
    if (actionPending.current) return;
    actionPending.current = true; setAdvancePhase(advance ? 'pending' : 'idle');
    setBusy(true); setError(''); setMessage('');
    try {
      if (valueDirty && observed.current !== savedSnapshot) throw new Error('Este levantamiento cambió en otra sesión. Conserva tus cambios y vuelve a abrir la versión guardada.');
      let next = await action();
      const stored = next.delivery?.corrections[observationId];
      if (stored) { baseline.current = JSON.stringify(stored); setValue(stored); observed.current = JSON.stringify(stored); }
      setAdvancePhase(advance && !next.pendingSync ? 'success' : 'idle');
      setNote(''); onChange(next); setMessage(next.pendingSync ? 'Avance guardado en este dispositivo. Se sincronizará al recuperar la conexión.' : success);
      if (next.storage === 'cloud' && inspectionClosed(next) && next.finalExcelStored === false) { next = await storeFinalExcel(next); onChange(next); }
    } catch (e) { if (advance) setAdvancePhase('error'); setError(e instanceof Error ? e.message : 'No se pudo guardar.'); } finally { actionPending.current = false; setBusy(false); }
  }
  return <div className="correction-form">
    {saved && saved.decision !== 'draft' && <section className="correction-state-summary" aria-label="Estado del levantamiento">
      <span className="correction-section-label">Estado del levantamiento</span>
      <p className={`correction-state-badge correction-state-${saved.decision}`}>
        {saved.decision === 'approved' ? <BadgeCheck size={18} aria-hidden="true"/> : saved.decision === 'changes' ? <RotateCcw size={17} aria-hidden="true"/> : <Clock3 size={17} aria-hidden="true"/>}
        <span>{saved.decision === 'approved' ? 'Levantamiento aprobado.' : saved.decision === 'changes' ? 'Correcciones solicitadas.' : inspection.pendingSync ? 'Levantamiento guardado sin conexión. Se enviará al recuperar la conexión.' : 'Levantamiento enviado a revisión.'}</span>
      </p>
    </section>}
    <div className="correction-layout correction-workspace">
    {showCorrectionAuthor && <div className="correction-author"><Field label="Responsable del Levantamiento" required>{props => <input {...props} value={saved && (locked || !valueDirty) ? correctionAuthorName(inspection,saved,directory||readAccounts()) : recipient ? actor.name : ''} readOnly aria-readonly="true" placeholder="Aún no se ha registrado un levantamiento" title="Persona que registró el levantamiento con su cuenta."/>}</Field></div>}
    <div className="correction-action"><Field label="Acción realizada" required>{props => <textarea {...props} rows={3} maxLength={5000} value={value.action} readOnly={locked || busy} onChange={e => update('action', e.target.value)} placeholder="Detalla cómo se corrigió el hallazgo."/>}</Field></div>
    <div className="correction-date-panel"><div className="correction-metadata"><Field label="Fecha de Cierre" required>{props => <input {...props} type="date" value={value.date} readOnly={locked || busy} onChange={e => update('date', e.target.value)}/>}</Field></div></div>
    <section className="correction-attachments" aria-label="Evidencias del levantamiento">
    <div className="evidence-label"><span>Registro fotográfico del levantamiento</span><span>{value.photos.length} / 8</span></div>
    <div className="followup-evidence">{value.photos.map(p => <div key={p.id}><button aria-label={`Ver levantamiento ${p.name}`} onClick={() => onPreview(p)}><img src={p.data} alt={p.name} loading="lazy"/></button>{!locked && <button className="photo-remove" aria-label={`Quitar evidencia ${p.name}`} disabled={busy} onClick={() => update('photos', value.photos.filter(x => x.id !== p.id))}><X size={13}/></button>}</div>)}
    {!locked && <label className="button button-outline evidence-upload" aria-disabled={busy}><ImagePlus size={19} aria-hidden="true"/><span>Añadir evidencias</span><input aria-label="Añadir evidencias del levantamiento" type="file" accept="image/jpeg,image/png,image/webp" multiple disabled={busy} onChange={async e => { const files = Array.from(e.target.files || []); e.target.value = ''; if (files.length + value.photos.length > 8) { setError('Máximo 8 evidencias por hallazgo.'); return; } setBusy(true); setError(''); try { const photos = await Promise.all(files.map(preparePhoto)); setValue(c => ({ ...c, photos: [...c.photos, ...photos] })); } catch (err) { setError(err instanceof Error ? err.message : 'No se pudo cargar la imagen.'); } finally { setBusy(false); } }}/></label>}</div>
    </section></div>
    {valueDirty && <p role="status" className="inline-note">Cambios sin guardar. {locked ? 'Pulsa Guardar Avance.' : 'Guarda tu avance o envía el levantamiento.'}</p>}
    {!locked && <div className="followup-actions correction-submit-actions"><SaveButton label="Guardar Avance" phase={advancePhase === 'success' && valueDirty ? 'idle' : advancePhase} disabled={busy} onClick={() => void act(() => saveCorrection(inspection, observationId, actor.id, value, false), 'Avance guardado.', true)}/><button className="button button-primary" disabled={busy} onClick={() => void act(() => saveCorrection(inspection, observationId, actor.id, value, true), 'Avance guardado y levantamiento enviado a revisión.')}><Send size={16}/>Enviar levantamiento</button></div>}

    {owner && saved?.decision === 'review' && !closed && <div className="review-actions"><Field label="Comentario de revisión">{props => <textarea {...props} value={note} maxLength={5000} rows={2} readOnly={busy} onChange={e => setNote(e.target.value)} placeholder="Indica las correcciones necesarias, si corresponde."/>}</Field><div className="followup-actions"><button className="button button-outline" disabled={busy} onClick={() => void act(() => reviewCorrection(inspection, observationId, actor.id, false, note), 'Correcciones solicitadas. La observación volvió a Pendiente.')}>Solicitar Correcciones</button><button className="button button-primary" disabled={busy} onClick={() => void act(() => reviewCorrection(inspection, observationId, actor.id, true, note), 'Levantamiento aprobado.')}><Check size={16}/>Aprobar levantamiento</button></div></div>}
    {inspection.delivery && <FollowUpConversation inspection={inspection} observationId={observationId} actor={actor} readOnly={!owner && !recipient} onChange={onChange}/>}
    {busy && <p className="inline-note"><LoaderCircle className="spin" size={16}/>Guardando…</p>}{error && <p className="error-message" role="alert">{error}</p>}{message && <p role="status" className="save-confirmation"><Check size={16} aria-hidden="true"/>{message}</p>}
    {!saved && !recipient && <p className="inline-note"><Camera size={16}/>El destinatario aún no ha registrado su levantamiento.</p>}
  </div>;
}
