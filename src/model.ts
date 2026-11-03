export type Responsible = { id: string; name: string; email: string };
export type Evidence = { id: string; name: string; data: string };
export type Observation = {
  id: string;
  description: string;
  correctiveAction: string;
  severity: 'alta' | 'media' | 'baja';
  dueDate: string;
  photos: Evidence[];
};
export type Profile = { name: string; email: string };
export type Inspection = {
  id: string;
  company: string;
  ruc: string;
  facility: string;
  area: string;
  type: 'Instalaciones' | 'Actividades y tareas';
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
  id: id(), company: '', ruc: '', facility: '', area: '', type: 'Instalaciones',
  date: new Date().toLocaleDateString('en-CA'), objective: '', responsibles: [newResponsible()],
  observations: [], noFindings: false, conclusions: '', recommendations: '', inspector: profile.name,
  inspectorEmail: profile.email, step: 0, updatedAt: new Date().toISOString(), status: 'draft',
});

export const stepNames = ['Datos generales', 'Observaciones', 'Resumen', 'Cierre', 'Revisión y envío'];
export const emailValid = (email: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
export function validateStep(d: Inspection, step: number): Record<string, string> {
  const errors: Record<string, string> = {};
  if (step === 0) {
    for (const [key, label] of [['company', 'la razón social'], ['facility', 'la instalación'], ['area', 'el área'], ['date', 'la fecha'], ['objective', 'el objetivo']] as const) {
      if (!d[key].trim()) errors[key] = `Completa ${label}.`;
    }
    if (d.ruc && !/^\d{11}$/.test(d.ruc)) errors.ruc = 'El RUC debe tener 11 dígitos.';
    if (!d.responsibles.length) errors.responsibles = 'Añade al menos un responsable.';
    d.responsibles.forEach(r => {
      if (!r.name.trim()) errors[`name-${r.id}`] = 'Escribe el nombre del responsable.';
      if (!emailValid(r.email)) errors[`email-${r.id}`] = 'Escribe un correo válido.';
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
    request.onsuccess = () => resolve((request.result as Inspection[]).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)));
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
