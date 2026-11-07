import { useEffect, useState } from 'react';
import { ArrowLeft, Camera, Check, Download, ImagePlus, LoaderCircle, Send, X } from 'lucide-react';
import { Badge, Field, Modal } from './components';
import type { Inspection } from './model';
import { formatDate, preparePhoto } from './model';
import type { DemoAccount } from './accounts';
import type { Correction } from './follow-up';
import { blankCorrection, inspectionClosed, isRecipient, reviewCorrection, saveCorrection, workflowLabel } from './follow-up';
import { closingRemarksOf } from './registration';
import { exportExcel } from './export';
import { confirmedInspectionCode } from './inspection-code';

export function FollowUp({ inspection, actor, onChange, onBack }: { inspection: Inspection; actor: DemoAccount; onChange: (d: Inspection) => void; onBack: () => void }) {
  const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<{ data: string; name: string } | null>(null);
  const owner = inspection.ownerId === actor.id;
  const recipient = isRecipient(inspection, actor.id);
  if (!owner && !recipient) return <p role="alert">No tienes esta inspección asignada.</p>;
  return <>
    <button className="button button-back" onClick={onBack}><ArrowLeft size={17}/>Volver</button>
    <div className="page-heading"><div><div className="eyebrow">SEGUIMIENTO DE HALLAZGOS</div><h1>{inspection.area}</h1><p>{workflowLabel(inspection)} · {confirmedInspectionCode(inspection) || 'Código definitivo pendiente'} · {formatDate(inspection.date)}</p></div><button className="button button-outline" disabled={busy} onClick={async () => { setBusy(true); setError(''); try { await exportExcel(inspection); } catch { setError('No se pudo descargar el informe.'); } finally { setBusy(false); } }}><Download size={16}/>Descargar Excel</button></div>
    <div className="notice"><p><strong>{inspectionClosed(inspection) ? 'Inspección cerrada: todos los estados están en Ejecutado.' : 'Levantamiento de resultados de la inspección'}</strong><br/>{owner ? 'Revisa las evidencias y aprueba cada levantamiento o solicita ajustes.' : 'Registra la acción realizada y sus evidencias. El autor revisará el levantamiento.'}</p></div>
    <div className="followup-context"><p><strong>Objetivo</strong> {inspection.objective}</p><div><strong>RESPONSABLE DEL REGISTRO</strong>{[{ id: inspection.ownerId, name: inspection.inspector, email: inspection.inspectorEmail }, ...(inspection.additionalInspectors || [])].map(p => <p key={p.id}>{p.name} · {p.email}</p>)}</div><p><strong>Descripción de la causa</strong> {inspection.unfavorableCause || 'Sin indicar'}</p><p><strong>Conclusiones y recomendaciones</strong> {closingRemarksOf(inspection)}</p></div>
    {error && <p className="notice notice-error" role="alert">{error}</p>}
    {inspection.observations.map((o, i) => <section className="followup-card" key={o.id}>
      <div className="observation-heading"><span className="observation-index">{i + 1}</span><h2>Observación {i + 1}</h2><Badge severity={o.severity}/><span className="list-status">{inspection.delivery?.corrections[o.id]?.state || 'Pendiente'}</span></div>
      <div className="followup-original-layout"><div className="followup-original"><p><strong>Descripción</strong>{o.description}</p><p><strong>Acción a tomar</strong>{o.correctiveAction}</p></div><div className="followup-original-side"><p className="followup-planned-date"><strong>Fecha de Cierre prevista</strong>{formatDate(o.dueDate)}</p>
      {o.photos.length > 0 && <div className="followup-evidence" aria-label="Registro fotográfico original">{o.photos.map(p => <button key={p.id} onClick={() => setPreview(p)} aria-label={`Ver evidencia original ${p.name}`}><img src={p.data} alt={p.name}/></button>)}</div>}
      </div></div>
      <CorrectionForm key={o.id} inspection={inspection} observationId={o.id} actor={actor} owner={owner} recipient={recipient} onChange={onChange} onPreview={setPreview}/>
    </section>)}
    {preview && <Modal title="Evidencia del informe" wide onClose={() => setPreview(null)}><img className="photo-full" src={preview.data} alt={preview.name}/></Modal>}
  </>;
}
function CorrectionForm({ inspection, observationId, actor, owner, recipient, onChange, onPreview }: { inspection: Inspection; observationId: string; actor: DemoAccount; owner: boolean; recipient: boolean; onChange: (d: Inspection) => void; onPreview: (p: { data: string; name: string }) => void }) {
  const saved = inspection.delivery?.corrections[observationId];
  const [value, setValue] = useState<Correction>(() => saved || blankCorrection(inspection, observationId));
  const savedSnapshot = JSON.stringify(saved);
  useEffect(() => { if (saved) setValue(saved); }, [savedSnapshot]);
  const [note, setNote] = useState(''); const [message, setMessage] = useState(''); const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  const locked = !recipient || saved?.decision === 'review' || saved?.decision === 'approved' || inspectionClosed(inspection);
  const update = <K extends keyof Correction>(key: K, v: Correction[K]) => { setMessage(''); setValue(c => ({ ...c, [key]: v })); };
  async function act(action: () => Promise<Inspection>, success: string) {
    setBusy(true); setError(''); setMessage('');
    try { onChange(await action()); setMessage(success); } catch (e) { setError(e instanceof Error ? e.message : 'No se pudo guardar.'); } finally { setBusy(false); }
  }
  return <div className="correction-form"><h3>Levantamiento de resultados de la inspección</h3>
    {saved?.decision === 'review' && <p className="notice">Levantamiento enviado. Pendiente de revisión del autor.</p>}
    {saved?.decision === 'approved' && <p className="notice">Levantamiento aprobado · Ejecutado.</p>}
    {saved?.note && <p className="notice"><strong>Observación del revisor:</strong> {saved.note}</p>}
    <div className="correction-layout"><div className="correction-texts"><Field label="Apellidos y nombres del responsable del levantamiento" required>{props => <input {...props} value={value.responsibleName} maxLength={250} readOnly={locked || busy} onChange={e => update('responsibleName', e.target.value)}/>}</Field>
    <Field label="Acción realizada" required>{props => <textarea {...props} rows={3} maxLength={5000} value={value.action} readOnly={locked || busy} onChange={e => update('action', e.target.value)} placeholder="Detalla cómo se corrigió el hallazgo."/>}</Field>
    </div><div className="correction-details"><div className="correction-metadata"><Field label="Fecha de Cierre" required>{props => <input {...props} type="date" value={value.date} readOnly={locked || busy} onChange={e => update('date', e.target.value)}/>}</Field><Field label="Estado propuesto" hint="El estado pasa a Ejecutado cuando el autor aprueba el levantamiento.">{props => <select {...props} value={value.proposedState} disabled={locked || busy} onChange={e => update('proposedState', e.target.value as Correction['proposedState'])}><option>Pendiente</option><option>Ejecutado</option></select>}</Field></div>
    <div className="evidence-label"><span>Registro fotográfico del levantamiento</span><span>{value.photos.length} / 8</span></div>
    <div className="followup-evidence">{value.photos.map(p => <div key={p.id}><button aria-label={`Ver levantamiento ${p.name}`} onClick={() => onPreview(p)}><img src={p.data} alt={p.name}/></button>{!locked && <button className="photo-remove" aria-label={`Quitar evidencia ${p.name}`} disabled={busy} onClick={() => update('photos', value.photos.filter(x => x.id !== p.id))}><X size={13}/></button>}</div>)}</div>
    {!locked && <label className="button button-outline evidence-upload"><ImagePlus size={16}/>Añadir evidencias<input aria-label="Añadir evidencias del levantamiento" type="file" accept="image/jpeg,image/png,image/webp" multiple disabled={busy} onChange={async e => { const files = Array.from(e.target.files || []); e.target.value = ''; if (files.length + value.photos.length > 8) { setError('Máximo 8 evidencias por hallazgo.'); return; } setBusy(true); setError(''); try { const photos = await Promise.all(files.map(preparePhoto)); setValue(c => ({ ...c, photos: [...c.photos, ...photos] })); } catch (err) { setError(err instanceof Error ? err.message : 'No se pudo cargar la imagen.'); } finally { setBusy(false); } }}/></label>}</div></div>
    {!locked && <><p className="inline-note">Guarda el avance de este hallazgo antes de salir o cambiar de cuenta.</p><div className="followup-actions"><button className="button button-outline" disabled={busy} onClick={() => void act(() => saveCorrection(inspection, observationId, actor.id, value, false), 'Avance guardado.')}>Guardar avance</button><button className="button button-primary" disabled={busy} onClick={() => void act(() => saveCorrection(inspection, observationId, actor.id, value, true), 'Levantamiento enviado a revisión.')}><Send size={16}/>Enviar a revisión</button></div></>}
    {owner && saved?.decision === 'review' && <div className="review-actions"><Field label="Comentario de revisión">{props => <textarea {...props} value={note} maxLength={5000} rows={2} onChange={e => setNote(e.target.value)} placeholder="Indica los ajustes necesarios, si corresponde."/>}</Field><div className="followup-actions"><button className="button button-outline" disabled={busy} onClick={() => void act(() => reviewCorrection(inspection, observationId, actor.id, false, note), 'Ajustes solicitados.')}>Solicitar ajustes</button><button className="button button-primary" disabled={busy || saved.proposedState !== 'Ejecutado'} onClick={() => void act(() => reviewCorrection(inspection, observationId, actor.id, true, note), 'Levantamiento aprobado.')}><Check size={16}/>Aprobar levantamiento</button></div></div>}
    {busy && <p className="inline-note"><LoaderCircle className="spin" size={16}/>Guardando…</p>}{error && <p className="error-message" role="alert">{error}</p>}{message && <p role="status">{message}</p>}
    {!saved && !recipient && <p className="inline-note"><Camera size={16}/>El destinatario aún no ha registrado su levantamiento.</p>}
  </div>;
}
