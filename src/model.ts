import { EMPLOYER, OBJECTIVE_LIMIT } from './employer';
export type Responsible = { id: string; name: string; email: string; personId?: string };
export type Evidence = { id: string; name: string; data: string };
export type Observation = {
  id: string;
  description: string;
  correctiveAction: string;
  severity: 'alta' | 'media' | 'baja';
  dueDate: string;
  photos: Evidence[];
};
export type Profile = { name: string; email: string; area?: string; accountId?: string };
export type Inspection = {
  id: string;
  ownerId: string;
  company: string;
  ruc: string;
  facility: string;
  area: string;
  type: '' | 'Planeada' | 'No planeada' | 'Otro';
  otherType: string;
  registrationNumber: string;
  legacyRegistrationNumber?: string;
  inspectionTime: string;
  legacyType?: string;
  date: string;
  objective: string;
  responsibles: Responsible[];
  observations: Observation[];
  noFindings: boolean;
  conclusions: string;
  recommendations: string;
  inspector: string;
  inspectorEmail: string;
  step: number;
  updatedAt: string;
  status: 'draft' | 'ready';
};

export const id = () => crypto.randomUUID();
export const newResponsible = (): Responsible => ({ id: id(), name: '', email: '' });
export const newObservation = (): Observation => ({ id: id(), description: '', correctiveAction: '', severity: 'media', dueDate: '', photos: [] });
export const newInspection = (profile: Profile): Inspection => ({
  id: id(), ownerId: profile.accountId || 'demo-admin', company: EMPLOYER.name, ruc: EMPLOYER.ruc, facility: '', area: '', type: '', otherType: '', registrationNumber: '', inspectionTime: '',
  date: new Date().toLocaleDateString('en-CA'), objective: '', responsibles: [newResponsible()],
  observations: [], noFindings: false, conclusions: '', recommendations: '', inspector: profile.name,
  inspectorEmail: profile.email, step: 0, updatedAt: new Date().toISOString(), status: 'draft',
});

export const stepNames = ['Datos generales', 'Observaciones', 'Resumen', 'Cierre', 'Revisión y envío'];
export const emailValid = (email: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
export function validateStep(d: Inspection, step: number): Record<string, string> {
  const errors: Record<string, string> = {};
  if (step === 0) {
    for (const [key, label] of [['area', 'el área inspeccionada'], ['date', 'la fecha'], ['inspectionTime', 'la hora de inspección'], ['inspector', 'el responsable de la inspección'], ['objective', 'el objetivo']] as const) {
      if (!d[key].trim()) errors[key] = `Completa ${label}.`;
    }
    if (!['Planeada', 'No planeada', 'Otro'].includes(d.type)) errors.type = 'Selecciona un tipo de inspección.';
    if (d.type === 'Otro' && !d.otherType.trim()) errors.otherType = 'Detalla el otro tipo de inspección.';
    if (d.objective.length > OBJECTIVE_LIMIT) errors.objective = `El objetivo debe tener como máximo ${OBJECTIVE_LIMIT} caracteres.`;
    if (!d.responsibles.length) errors.responsibles = 'Añade al menos un responsable.';
    d.responsibles.forEach(r => {
      if (!r.personId || !r.name.trim() || !emailValid(r.email)) errors[`person-${r.id}`] = 'Selecciona una persona del directorio.';
      if (r.personId && d.responsibles.some(other => other.id !== r.id && other.personId === r.personId)) errors[`person-${r.id}`] = 'Esta persona ya está añadida.';
    });
  }
  if (step === 1 && !d.observations.length && !d.noFindings) errors.observations = 'Añade una observación o confirma que no se identificaron hallazgos.';
  if (step === 1) d.observations.forEach(o => {
    if (!o.description.trim()) errors[`description-${o.id}`] = 'Describe la observación.';
    if (!o.correctiveAction.trim()) errors[`action-${o.id}`] = 'Indica una medida correctiva.';
    if (!o.dueDate) errors[`date-${o.id}`] = 'Selecciona una fecha de compromiso.';
  });
  if (step === 3) {
    if (!d.conclusions.trim()) errors.conclusions = 'Añade las conclusiones de la inspección.';
    if (!d.recommendations.trim()) errors.recommendations = 'Añade las recomendaciones.';
    if (!d.inspector.trim()) errors.inspector = 'Indica quién realizó la inspección.';
    if (d.inspectorEmail && !emailValid(d.inspectorEmail)) errors.inspectorEmail = 'Escribe un correo válido.';
  }
  return errors;
}

export function normalizeInspection(value: Inspection): Inspection {
  const type = ['Planeada', 'No planeada', 'Otro'].includes(value.type) ? value.type : '';
  return { ...value, ownerId: value.ownerId || 'demo-admin', type, otherType: value.otherType || '', registrationNumber: '', ...(value.registrationNumber ? { legacyRegistrationNumber: value.registrationNumber } : {}), inspectionTime: value.inspectionTime || '', ...(value.type && !type ? { legacyType: value.type } : {}) };
}

export const formatDate = (value: string) => value ? new Intl.DateTimeFormat('es-PE', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(`${value}T12:00:00`)) : 'Sin definir';
export const initials = (name: string) => name.trim().split(/\s+/).slice(0, 2).map(s => s[0]).join('').toUpperCase() || 'BR';

const DB_NAME = 'berry-safety';
function database(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore('inspections', { keyPath: 'id' });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
export async function loadInspections(): Promise<Inspection[]> {
  const db = await database();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('inspections', 'readonly');
    const request = tx.objectStore('inspections').getAll();
    request.onsuccess = () => resolve((request.result as Inspection[]).map(normalizeInspection).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)));
    request.onerror = () => reject(request.error);
    tx.oncomplete = () => db.close();
  });
}
export async function persistInspection(inspection: Inspection): Promise<void> {
  const db = await database();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('inspections', 'readwrite');
    tx.objectStore('inspections').put(inspection);
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => { db.close(); reject(tx.error); };
    tx.onabort = () => { db.close(); reject(tx.error); };
  });
}
export async function removeInspection(inspectionId: string): Promise<void> {
  const db = await database();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('inspections', 'readwrite');
    tx.objectStore('inspections').delete(inspectionId);
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => { db.close(); reject(tx.error); };
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
