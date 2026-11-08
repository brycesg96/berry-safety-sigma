import type { PhotoEdit } from './photo-editing';
import { EMPLOYER, OBJECTIVE_LIMIT } from './employer';
import { migrateInspectionTime, validInspectionTime } from './inspection-time';
import type { InspectionPeriod } from './inspection-time';
import { CLOSING_LIMIT, closingRemarksOf } from './registration';
import type { RegistrationDetails } from './registration';
import type { Delivery } from './follow-up';
import type { RegistrationReceipt } from './inspection-code';
import { lastInspectionTexts } from './inspection-texts';
import type { InspectionTexts } from './inspection-texts';
import { loadCloudInspections, persistCloudInspection, removeCloudInspection } from './cloud-store';
export type Responsible = { id: string; name: string; email: string; personId?: string; area?: string; jobTitle?: string };
export type Evidence = { id: string; name: string; data: string; originalData?: string; editState?: PhotoEdit };
export type Observation = {
  id: string;
  description: string;
  correctiveAction: string;
  severity: 'alta' | 'media' | 'baja';
  dueDate: string;
  photos: Evidence[];
};
export type Profile = { name: string; email: string; area?: string; accountId?: string; storage?: 'cloud' };
export type Inspection = {
  storage?: 'cloud';
  cloudRevision?: number;
  id: string;
  ownerId: string;
  company: string;
  ruc: string;
  facility: string;
  area: string;
  type: '' | 'Planeada' | 'No planeada' | 'Otro';
  otherType: string;
  registrationNumber: string;
  serverRegistration?: RegistrationReceipt;
  delivery?: Delivery;
  emailCc?: string[];
  emailDelivery?: { state: 'pending' | 'accepted' | 'rejected' | 'unconfirmed'; requestId: string; updatedAt: string; upstreamStatus?: number; message?: string };
  legacyRegistrationNumber?: string;
  inspectionTime: string;
  inspectionPeriod: InspectionPeriod;
  legacyType?: string;
  date: string;
  initialInspectionDate?: string;
  objective: string;
  initialReportTexts?: InspectionTexts;
  responsibles: Responsible[];
  observations: Observation[];
  defaultClosingDate: string;
  unfavorableCause: string;
  closingRemarks: string;
  registrationDetails: Record<string, RegistrationDetails>;
  conclusions: string;
  recommendations: string;
  inspector: string;
  inspectorEmail: string;
  additionalInspectors: Responsible[];
  step: number;
  updatedAt: string;
  status: 'draft' | 'ready';
};

export const id = () => crypto.randomUUID();
export const newResponsible = (): Responsible => ({ id: id(), name: '', email: '' });
export const newObservation = (closingDate = ''): Observation => ({ id: id(), description: '', correctiveAction: '', severity: 'media', dueDate: closingDate, photos: [] });
export const newInspection = (profile: Profile): Inspection => {
  const date = new Date().toLocaleDateString('en-CA');
  const texts = profile.storage === 'cloud' ? { objective: '', unfavorableCause: '', closingRemarks: '' } : lastInspectionTexts();
  return ({
  id: id(), ownerId: profile.accountId || 'demo-admin', ...(profile.storage ? { storage: profile.storage } : {}), company: EMPLOYER.name, ruc: EMPLOYER.ruc, facility: '', area: '', type: '', otherType: '', registrationNumber: '', inspectionTime: '', inspectionPeriod: '',
  date, initialInspectionDate: date, ...texts, initialReportTexts: { ...texts }, responsibles: [newResponsible()],
  observations: [], defaultClosingDate: '', registrationDetails: {}, conclusions: '', recommendations: '', inspector: profile.name,
  inspectorEmail: profile.email, additionalInspectors: [], step: 0, updatedAt: new Date().toISOString(), status: 'draft',
});
};

/** Ignore generated defaults and empty rows when deciding whether a draft exists. */
export function hasInspectionContent(d: Inspection): boolean {
  if (d.delivery || d.serverRegistration || d.status === 'ready') return true;
  const text = [d.area, d.facility, d.inspectionTime, d.type, d.otherType, d.conclusions, d.recommendations, d.registrationNumber, d.legacyRegistrationNumber];
  if (text.some(value => value?.trim())) return true;
  if ((['objective', 'unfavorableCause', 'closingRemarks'] as const).some(key => (d[key] || '').trim() !== (d.initialReportTexts?.[key] || '').trim())) return true;
  if (d.inspectionPeriod || (d.date && d.initialInspectionDate && d.date !== d.initialInspectionDate)) return true;
  if ((d.company?.trim() && d.company !== EMPLOYER.name) || (d.ruc?.trim() && d.ruc !== EMPLOYER.ruc)) return true;
  if ([...(d.responsibles || []), ...(d.additionalInspectors || [])].some(p => p.personId || p.name?.trim() || p.email?.trim())) return true;
  if ((d.observations || []).some(o => o.description?.trim() || o.correctiveAction?.trim() || o.dueDate || o.photos?.length || o.severity !== 'media')) return true;
  if (Object.values(d.registrationDetails || {}).some(r => r.signature || (r.date && r.date !== d.date) || (r.jobTitle?.trim() && (r.initialJobTitle === undefined || r.jobTitle !== r.initialJobTitle)))) return true;
  return Boolean((d as Inspection & { noFindings?: boolean }).noFindings);
}

// The first closing date is shared once; later edits belong only to that observation.
export function setObservationClosingDate(draft: Inspection, observationId: string, date: string): Inspection {
  if (!draft.observations.some(o => o.id === observationId)) return draft;
  const firstDate = Boolean(date) && !draft.defaultClosingDate;
  return {
    ...draft,
    defaultClosingDate: firstDate ? date : draft.defaultClosingDate,
    observations: draft.observations.map(o => firstDate || o.id === observationId ? { ...o, dueDate: date } : o),
  };
}

export const stepNames = ['Datos generales', 'Observaciones', 'Resumen', 'Cierre', 'Revisión y envío'];
export const emailValid = (email: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
export function validateStep(d: Inspection, step: number): Record<string, string> {
  const errors: Record<string, string> = {};
  if (step === 0) {
    for (const [key, label] of [['area', 'el área inspeccionada'], ['date', 'la fecha'], ['inspectionTime', 'la hora de inspección'], ['inspector', 'el responsable de la inspección'], ['objective', 'el objetivo']] as const) {
      if (!d[key].trim()) errors[key] = `Completa ${label}.`;
    }
    if (!['Planeada', 'No planeada', 'Otro'].includes(d.type)) errors.type = 'Selecciona un tipo de inspección.';
    if (d.inspectionTime && !validInspectionTime(d.inspectionTime)) errors.inspectionTime = 'Escribe una hora entre 01:00 y 12:59 (hh:mm).';
    if (!['AM', 'PM'].includes(d.inspectionPeriod)) errors.inspectionPeriod = 'Selecciona AM o PM.';
    if (d.type === 'Otro' && !d.otherType.trim()) errors.otherType = 'Detalla el otro tipo de inspección.';
    if (d.objective.length > OBJECTIVE_LIMIT) errors.objective = `El objetivo debe tener como máximo ${OBJECTIVE_LIMIT} caracteres.`;
    if (!d.responsibles.length) errors.responsibles = 'Añade al menos un responsable.';
    d.responsibles.forEach(r => {
      if (!r.personId || !r.name.trim() || !emailValid(r.email)) errors[`person-${r.id}`] = 'Selecciona una persona del directorio.';
      if (r.personId && d.responsibles.some(other => other.id !== r.id && other.personId === r.personId)) errors[`person-${r.id}`] = 'Esta persona ya está añadida.';
    });
  }
  if (step === 1 && !d.observations.length) errors.observations = 'Añade al menos una observación para continuar.';
  if (step === 1) d.observations.forEach(o => {
    if (!o.description.trim()) errors[`description-${o.id}`] = 'Completa la descripción.';
    if (!o.correctiveAction.trim()) errors[`action-${o.id}`] = 'Indica la acción a tomar.';
    if (!o.dueDate) errors[`date-${o.id}`] = 'Selecciona una Fecha de Cierre.';
  });
  if (step === 3) {
    if (!closingRemarksOf(d).trim()) errors.closingRemarks = 'Añade las conclusiones y recomendaciones.';
    if (closingRemarksOf(d).length > CLOSING_LIMIT) errors.closingRemarks = `Se permiten hasta ${CLOSING_LIMIT} caracteres.`;
    if ((d.unfavorableCause || '').length > CLOSING_LIMIT) errors.unfavorableCause = `Se permiten hasta ${CLOSING_LIMIT} caracteres.`;
    if (!d.inspector.trim()) errors.inspector = 'Indica quién realizó la inspección.';
    if (!emailValid(d.inspectorEmail)) errors.inspectorEmail = 'Completa el correo de tu cuenta en el perfil.';
  }
  if (step === 0 || step === 3) {
    const extra = d.additionalInspectors || [];
    if (extra.length > 2) errors.additionalInspectors = 'Se permiten hasta tres inspectores en total.';
    extra.forEach(p => {
      if (!p.personId || !p.name.trim() || !emailValid(p.email)) errors[`inspector-${p.id}`] = 'Selecciona una persona del directorio.';
      if (p.personId === d.ownerId || p.email.trim().toLowerCase() === d.inspectorEmail.trim().toLowerCase() || extra.some(other => other.id !== p.id && (other.personId && other.personId === p.personId || other.email && other.email.trim().toLowerCase() === p.email.trim().toLowerCase()))) errors[`inspector-${p.id}`] = 'Esta persona ya está añadida como inspector.';
    });
  }
  return errors;
}

export function normalizeInspection(value: Inspection): Inspection {
  const type = ['Planeada', 'No planeada', 'Otro'].includes(value.type) ? value.type : '';
  return { ...value, initialInspectionDate: value.initialInspectionDate ?? value.date, unfavorableCause: value.unfavorableCause || '', closingRemarks: closingRemarksOf(value), registrationDetails: value.registrationDetails || {}, additionalInspectors: value.additionalInspectors || [], defaultClosingDate: value.defaultClosingDate ?? value.observations.find(o => o.dueDate)?.dueDate ?? '', ownerId: value.ownerId || 'demo-admin', type, otherType: value.otherType || '', registrationNumber: '', ...(value.registrationNumber ? { legacyRegistrationNumber: value.registrationNumber } : {}), ...migrateInspectionTime(value.inspectionTime || '', value.inspectionPeriod), ...(value.type && !type ? { legacyType: value.type } : {}) };
}

export const formatDate = (value: string) => value ? new Intl.DateTimeFormat('es-PE', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(`${value}T12:00:00`)) : 'Sin definir';
export const initials = (name: string) => name.trim().split(/\s+/).slice(0, 2).map(s => s[0]).join('').toUpperCase() || 'BR';

const DB_NAME = 'berry-safety';
export function database(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore('inspections', { keyPath: 'id' });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
export async function loadInspections(cloudActor?: string): Promise<Inspection[]> {
  if (cloudActor) return loadCloudInspections(cloudActor);
  const db = await database();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('inspections', 'readonly');
    const request = tx.objectStore('inspections').getAll();
    request.onsuccess = () => resolve((request.result as Inspection[]).map(normalizeInspection).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)));
    request.onerror = () => reject(request.error);
    tx.oncomplete = () => db.close();
  });
}
export async function persistInspection(inspection: Inspection): Promise<Inspection | void> {
  if (inspection.storage === 'cloud') {
    if (hasInspectionContent(inspection)) return persistCloudInspection(inspection);
    await removeCloudInspection(inspection.id, inspection.ownerId, inspection.cloudRevision || 0); return;
  }
  const db = await database();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('inspections', 'readwrite');
    const store = tx.objectStore('inspections');
    const existing = store.get(inspection.id);
    existing.onsuccess = () => {
      if (existing.result?.delivery) { tx.abort(); return; }
      if (hasInspectionContent(inspection)) store.put(inspection);
      else if (existing.result) store.delete(inspection.id);
    };
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => { db.close(); reject(tx.error); };
    tx.onabort = () => { db.close(); reject(tx.error || new Error('No se puede sobrescribir un informe enviado.')); };
  });
}
export async function removeInspection(inspectionId: string, cloudActor?: string, cloudRevision = 0): Promise<void> {
  if (cloudActor) return removeCloudInspection(inspectionId, cloudActor, cloudRevision);
  const db = await database();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('inspections', 'readwrite');
    const store = tx.objectStore('inspections');
    const existing = store.get(inspectionId);
    existing.onsuccess = () => { if (existing.result?.delivery) tx.abort(); else store.delete(inspectionId); };
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => { db.close(); reject(tx.error); };
    tx.onabort = () => { db.close(); reject(tx.error || new Error('No se puede eliminar un informe enviado.')); };
  });
}

export async function preparePhoto(file: File): Promise<Evidence> {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) throw new Error('Selecciona una foto JPG, PNG o WebP.');
  if (file.size > 15 * 1024 * 1024) throw new Error('Cada foto debe pesar menos de 15 MB.');
  const bitmap = await createImageBitmap(file);
  const ratio = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * ratio);
  canvas.height = Math.round(bitmap.height * ratio);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('No se pudo procesar la fotografía.');
  ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height); bitmap.close();
  return { id: id(), name: file.name, data: canvas.toDataURL('image/jpeg', 0.82) };
}
