import type { FollowUpEvent } from './FollowUpConversation';
import { readAccounts, accountEmail, inspectionCopies } from './accounts';
import type { Evidence, Inspection } from './model';
import { database, validateStep } from './model';
import { changeCloudCorrection } from './cloud-store';

export type Correction = {
  actorId: string;
  responsibleName: string;
  action: string;
  date: string;
  photos: Evidence[];
  proposedState: 'Pendiente' | 'Ejecutado'; // Legacy field, kept in sync with state when saving.
  state: 'Pendiente' | 'Ejecutado';
  decision: 'draft' | 'review' | 'approved' | 'changes';
  note: string;
};
export type Delivery = { sentAt: string; recipientIds: string[]; revision: number; corrections: Record<string, Correction>; timeline?: FollowUpEvent[] };
export const inspectionClosed = (d: Inspection) => Boolean(d.delivery && d.observations.length && d.observations.every(o => {
  const correction = d.delivery?.corrections[o.id];
  return correction?.decision === 'approved' && correction.state === 'Ejecutado';
}));
export const needsReview = (d: Inspection) => Boolean(d.delivery && !inspectionClosed(d) && Object.values(d.delivery.corrections).some(c => c.decision === 'review'));
export const workflowLabel = (d: Inspection) => inspectionClosed(d) ? 'Cerrada' : needsReview(d) ? 'Por validar / aprobar' : d.delivery ? 'En espera de respuesta' : d.status === 'ready' ? 'Sin enviar' : 'Borrador';
export const isRecipient = (d: Inspection, actorId: string) => Boolean(d.delivery?.recipientIds.includes(actorId));
// A new correction belongs to the authenticated person who records it.
export function blankCorrection(d: Inspection, observationId: string, actor?: { id: string; name: string }): Correction {
  return { actorId: actor?.id || '', responsibleName: actor?.name || '', action: '', date: d.observations.find(o => o.id === observationId)?.dueDate || '', photos: [], proposedState: 'Pendiente', state: 'Pendiente', decision: 'draft', note: '' };
}

// Browser-only demo. The server must enforce these rules with authenticated identities later.
async function changeStored(id: string, mutate: (current: Inspection) => Inspection, actorId?: string): Promise<Inspection> {
  const db = await database();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('inspections', 'readwrite'); const store = tx.objectStore('inspections');
    let next: Inspection; let failure: unknown;
    const read = store.get(id);
    read.onsuccess = () => {
      try {
        if (!read.result) throw new Error('No se encontró la inspección.');
        next = mutate(read.result);
        if (actorId && next.delivery) {
          const events = [...(next.delivery.timeline || [])];
          for (const [observationId, correction] of Object.entries(next.delivery.corrections)) {
            const previous = read.result.delivery?.corrections[observationId];
            if (JSON.stringify(previous) === JSON.stringify(correction)) continue;
            const action = previous?.decision === correction.decision && previous?.state !== correction.state ? 'state' : ({approved:'approve',changes:'changes',review:'submit',draft:'save'} as const)[correction.decision];
            events.push({ id: crypto.randomUUID(), inspection_id: id, observation_id: observationId, actor_id: actorId, actor_name: readAccounts().find(a=>a.id===actorId)?.name || '', action, state: correction.state, decision: correction.decision, body: ['approve','changes'].includes(action) ? correction.note : '', created_at: new Date().toISOString() });
          }
          next = { ...next, delivery: { ...next.delivery, timeline: events } };
        }
        store.put(next);
      } catch (e) { failure = e; tx.abort(); }
    };
    tx.oncomplete = () => {
      db.close();
      window.dispatchEvent(new Event('berry-inspections-changed'));
      try { localStorage.setItem('berry-inspections-updated', crypto.randomUUID()); } catch { /* Same-tab refresh still works. */ }
      resolve(next!);
    };
    tx.onabort = tx.onerror = () => { db.close(); reject(failure || tx.error || new Error('No se pudo guardar.')); };
  });
}
export async function deliverInspection(draft: Inspection, actorId: string): Promise<Inspection> {
  for (const step of [0, 1, 3]) if (Object.keys(validateStep(draft, step)).length) throw new Error('Completa la inspección antes de enviarla.');
  // Save latest editor changes first; the transaction then freezes the report for recipients.
  return changeStored(draft.id, current => {
    if (current.ownerId !== actorId) throw new Error('Solo el autor puede enviar esta inspección.');
    if (current.delivery) return current;
    const accounts = readAccounts();
    const recipients = draft.responsibles.map(r => accounts.find(a => a.enabled && accountEmail(a.email) === accountEmail(r.email)));
    if (!recipients.length || recipients.some(a => !a)) throw new Error('Todos los destinatarios deben tener una cuenta habilitada en Administración.');
    return { ...draft, emailCc: inspectionCopies(draft.responsibles, accounts), status: 'ready', updatedAt: new Date().toISOString(), delivery: { sentAt: new Date().toISOString(), recipientIds: [...new Set(recipients.map(a => a!.id))], revision: 1, corrections: {} } };
  });
}
export function saveCorrection(d: Inspection, observationId: string, actorId: string, correction: Correction, submit: boolean) {
  correction={...correction,state:'Pendiente',proposedState:'Pendiente'};
  if (submit && (!correction.action.trim() || !correction.date)) throw new Error('Completa la acción realizada y la Fecha de Cierre.');
  if (d.storage === 'cloud') return changeCloudCorrection(d, observationId, actorId, submit ? 'submit' : 'save', correction);
  return changeStored(d.id, current => {
    const delivery = current.delivery;
    if (!delivery || !isRecipient(current, actorId)) throw new Error('Esta inspección no está asignada a tu cuenta.');
    if (!current.observations.some(o => o.id === observationId)) throw new Error('No se encontró la observación.');
    if (delivery.revision !== d.delivery?.revision) throw new Error('La inspección cambió en otra sesión. Vuelve a abrirla antes de guardar.');
    const previous = delivery.corrections[observationId];
    if (previous?.decision === 'approved' || previous?.decision === 'review' || inspectionClosed(current)) throw new Error('Este levantamiento ya fue enviado a revisión.');
    if (!['Pendiente', 'Ejecutado'].includes(correction.state)) throw new Error('Selecciona un estado válido.');
    if (correction.photos.length > 8) throw new Error('Puedes adjuntar hasta 8 evidencias.');
    const responsibleName = readAccounts().find(person => person.id === actorId)?.name || current.responsibles.find(person => (person.personId || person.id) === actorId)?.name || '';
    if (!responsibleName.trim()) throw new Error('No se encontró el responsable asignado a esta inspección.');
    if (submit && (!correction.action.trim() || !correction.date)) throw new Error('Completa la acción realizada y la Fecha de Cierre.');
      const saved: Correction = { ...correction, actorId, responsibleName, proposedState: correction.state, decision: submit ? 'review' : 'draft', note: previous?.note || '' };
    return { ...current, updatedAt: new Date().toISOString(), delivery: { ...delivery, revision: delivery.revision + 1, corrections: { ...delivery.corrections, [observationId]: saved } } };
  }, actorId);
}
export function saveCorrectionState(_d: Inspection, _observationId: string, _actorId: string, _state: Correction['state']): Promise<Inspection> {
  return Promise.reject(new Error('El estado se actualiza automáticamente cuando el inspector aprueba el levantamiento.'));
}

export function reviewCorrection(d: Inspection, observationId: string, actorId: string, approve: boolean, note: string) {
  if (d.storage === 'cloud') return changeCloudCorrection(d, observationId, actorId, approve ? 'approve' : 'changes', { note });
  return changeStored(d.id, current => {
    const delivery = current.delivery;
    if (!delivery || current.ownerId !== actorId) throw new Error('Solo el autor puede revisar los levantamientos.');
    if (delivery.revision !== d.delivery?.revision) throw new Error('La inspección cambió en otra sesión. Vuelve a abrirla antes de revisar.');
    if (inspectionClosed(current)) throw new Error('La inspección está cerrada.');
    const correction = delivery.corrections[observationId];
    if (!correction || correction.decision !== 'review') throw new Error('El levantamiento no está pendiente de revisión.');
    if (!approve && !note.trim()) throw new Error('Indica qué debe corregir el responsable.');
    const state = approve ? 'Ejecutado' : 'Pendiente';
    const reviewed: Correction = { ...correction, state, proposedState: state, decision: approve ? 'approved' : 'changes', note: note.trim() };
    return { ...current, updatedAt: new Date().toISOString(), delivery: { ...delivery, revision: delivery.revision + 1, corrections: { ...delivery.corrections, [observationId]: reviewed } } };
  }, actorId);
}

export function saveEmailReceipt(d: Inspection, actorId: string, receipt: NonNullable<Inspection['emailDelivery']>) {
  return changeStored(d.id, current => {
    if (!current.delivery || current.ownerId !== actorId || receipt.requestId !== current.id) throw new Error('Solo el autor puede registrar el envío del informe.');
    if (current.emailDelivery?.state === 'accepted' && receipt.state !== 'accepted') return current;
    return { ...current, emailCc: current.emailDelivery ? current.emailCc ?? [] : inspectionCopies(current.responsibles), emailDelivery: receipt, updatedAt: new Date().toISOString() };
  });
}

export function addLocalComment(inspection: Inspection, observationId: string, actorId: string, body: string, id: string) {
  return changeStored(inspection.id, current => {
    if (!current.delivery || !current.observations.some(o=>o.id===observationId) || current.ownerId !== actorId && !isRecipient(current,actorId)) throw new Error('No tienes acceso a esta conversación.');
    if (!body.trim() || body.length > 5000) throw new Error('Escribe un comentario de hasta 5.000 caracteres.');
    if (current.delivery.timeline?.some(e=>e.id===id)) return current;
    const event: FollowUpEvent = { id, inspection_id: current.id, observation_id: observationId, actor_id: actorId, actor_name: readAccounts().find(a=>a.id===actorId)?.name || '', action:'comment', body:body.trim(), created_at:new Date().toISOString() };
    return { ...current, delivery:{...current.delivery,timeline:[...(current.delivery.timeline||[]),event]}, updatedAt:new Date().toISOString() };
  });
}
