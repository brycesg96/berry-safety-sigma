import type { Inspection, Evidence } from './model';
export const CLOSING_LIMIT = 1200;
export type RegistrationDetails = { jobTitle: string; initialJobTitle?: string; date: string; signature?: Evidence };
export function closingRemarksOf(d: Inspection): string {
  return d.closingRemarks ?? [d.conclusions?.trim() ? `Conclusiones:\n${d.conclusions}` : '', d.recommendations?.trim() ? `Recomendaciones:\n${d.recommendations}` : ''].filter(Boolean).join('\n\n');
}
export function registrationPeople(d: Inspection) {
  return [{ id: d.ownerId, name: d.inspector, email: d.inspectorEmail, personId: d.ownerId }, ...(d.additionalInspectors || []).map(p => ({ ...p, id: p.personId || p.id }))];
}

/** Signatures keep transparency; GIFs are captured as a static first frame. */
export async function prepareSignature(file: File): Promise<Evidence> {
  if (!['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(file.type)) throw new Error('Selecciona una firma PNG, GIF, JPG o WebP.');
  if (file.size > 15 * 1024 * 1024) throw new Error('La firma debe pesar menos de 15 MB.');
  const bitmap = await createImageBitmap(file);
  try {
    const ratio = Math.min(1, 1200 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bitmap.width * ratio));
    canvas.height = Math.max(1, Math.round(bitmap.height * ratio));
    const context = canvas.getContext('2d');
    if (!context) throw new Error('No se pudo procesar la firma.');
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    return { id: crypto.randomUUID(), name: file.name, data: canvas.toDataURL('image/png') };
  } finally { bitmap.close(); }
}
