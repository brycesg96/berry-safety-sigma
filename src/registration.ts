import type { Inspection, Evidence } from './model';
export const CLOSING_LIMIT = 1200;
export type RegistrationDetails = { jobTitle: string; initialJobTitle?: string; date: string; signature?: Evidence };
export function closingRemarksOf(d: Inspection): string {
  return d.closingRemarks ?? [d.conclusions?.trim() ? `Conclusiones:\n${d.conclusions}` : '', d.recommendations?.trim() ? `Recomendaciones:\n${d.recommendations}` : ''].filter(Boolean).join('\n\n');
}
export function registrationPeople(d: Inspection) {
  return [{ id: d.ownerId, name: d.inspector, email: d.inspectorEmail, personId: d.ownerId }, ...(d.additionalInspectors || []).map(p => ({ ...p, id: p.personId || p.id }))];
}
