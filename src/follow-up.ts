import type { DemoAccount } from './accounts';
import { readAccounts, accountEmail, inspectionCopies } from './accounts';
import type { Evidence, Inspection } from './model';
import { database, validateStep } from './model';

export type Correction = {
  actorId: string;
  responsibleName: string;
  action: string;
  date: string;
  photos: Evidence[];
  proposedState: 'Pendiente' | 'Ejecutado';
  state: 'Pendiente' | 'Ejecutado';
  decision: 'draft' | 'review' | 'approved' | 'changes';
  note: string;
};
export type Delivery = { sentAt: string; recipientIds: string[]; revision: number; corrections: Record<string, Correction> };
export const inspectionClosed = (d: Inspection) => Boolean(d.delivery && d.observations.length && d.observations.every(o => d.delivery?.corrections[o.id]?.state === 'Ejecutado'));
export const needsReview = (d: Inspection) => Boolean(d.delivery && !inspectionClosed(d) && Object.values(d.delivery.corrections).some(c => c.decision === 'review'));
export const workflowLabel = (d: Inspection) => inspectionClosed(d) ? 'Cerrada' : needsReview(d) ? 'A revisar' : d.delivery ? 'En levantamiento' : d.status === 'ready' ? 'Sin enviar' : 'Borrador';
export const isRecipient = (d: Inspection, actorId: string) => Boolean(d.delivery?.recipientIds.includes(actorId));
export const blankCorrection = (d: Inspection, observationId: string, actor: DemoAccount): Correction => ({ actorId: actor.id, responsibleName: actor.name, action: '', date: d.observations.find(o => o.id === observationId)?.dueDate || '', photos: [], proposedState: 'Ejecutado', state: 'Pendiente', decision: 'draft', note: '' });

// Browser-only demo. The server must enforce these rules with authenticated identities later.
async function changeStored(id: string, mutate: (current: Inspection) => Inspection): Promise<Inspection> {
  const db = await database();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('inspections', 'readwrite'); const store = tx.objectStore('inspections');
    let next: Inspection; let failure: unknown;
    const read = store.get(id);
    read.onsuccess = () => {
      try {
        if (!read.result) throw new Error('No se encontró la inspección.');
        next = mutate(read.result);
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
  return changeStored(d.id, current => {
    const delivery = current.delivery;
    if (!delivery || !isRecipient(current, actorId)) throw new Error('Esta inspección no está asignada a tu cuenta.');
    if (!current.observations.some(o => o.id === observationId)) throw new Error('No se encontró la observación.');
    if (delivery.revision !== d.delivery?.revision) throw new Error('La inspección cambió en otra sesión. Vuelve a abrirla antes de guardar.');
    const previous = delivery.corrections[observationId];
    if (previous?.decision === 'approved' || previous?.decision === 'review' || inspectionClosed(current)) throw new Error('Este levantamiento ya fue enviado a revisión.');
    if (!['Pendiente', 'Ejecutado'].includes(correction.proposedState)) throw new Error('Selecciona un estado válido.');
    if (correction.photos.length > 8) throw new Error('Puedes adjuntar hasta 8 evidencias.');
    if (submit && (!correction.action.trim() || !correction.responsibleName.trim() || !correction.date)) throw new Error('Completa la acción, los nombres del responsable y la Fecha de Cierre.');
    if (submit && correction.proposedState === 'Ejecutado' && !correction.photos.length) throw new Error('Adjunta al menos una evidencia del levantamiento para proponer Ejecutado.');
    const saved: Correction = { ...correction, actorId, state: 'Pendiente', decision: submit ? 'review' : 'draft', note: previous?.note || '' };
    return { ...current, updatedAt: new Date().toISOString(), delivery: { ...delivery, revision: delivery.revision + 1, corrections: { ...delivery.corrections, [observationId]: saved } } };
  });
}
export function reviewCorrection(d: Inspection, observationId: string, actorId: string, approve: boolean, note: string) {
  return changeStored(d.id, current => {
    const delivery = current.delivery;
    if (!delivery || current.ownerId !== actorId) throw new Error('Solo el autor puede revisar los levantamientos.');
    if (delivery.revision !== d.delivery?.revision) throw new Error('La inspección cambió en otra sesión. Vuelve a abrirla antes de revisar.');
    const correction = delivery.corrections[observationId];
    if (!correction || correction.decision !== 'review') throw new Error('El levantamiento no está pendiente de revisión.');
    if (approve && correction.proposedState !== 'Ejecutado') throw new Error('El responsable debe proponer Ejecutado y adjuntar evidencias antes de aprobar.');
    if (!approve && !note.trim()) throw new Error('Indica qué debe corregir el responsable.');
    const reviewed: Correction = { ...correction, state: approve ? 'Ejecutado' : 'Pendiente', decision: approve ? 'approved' : 'changes', note: note.trim() };
    return { ...current, updatedAt: new Date().toISOString(), delivery: { ...delivery, revision: delivery.revision + 1, corrections: { ...delivery.corrections, [observationId]: reviewed } } };
  });
}

export function saveEmailReceipt(d: Inspection, actorId: string, receipt: NonNullable<Inspection['emailDelivery']>) {
  return changeStored(d.id, current => {
    if (!current.delivery || current.ownerId !== actorId || receipt.requestId !== current.id) throw new Error('Solo el autor puede registrar el envío del informe.');
    if (current.emailDelivery?.state === 'accepted' && receipt.state !== 'accepted') return current;
    return { ...current, emailCc: current.emailDelivery ? current.emailCc ?? [] : inspectionCopies(current.responsibles), emailDelivery: receipt, updatedAt: new Date().toISOString() };
  });
}
