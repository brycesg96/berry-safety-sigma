export const INSPECTION_PREFIX = 'IH';
export const INSPECTION_TIME_ZONE = 'America/Lima';
export function submissionYear(now = new Date()): number {
  return Number(new Intl.DateTimeFormat('en', { year: 'numeric', timeZone: INSPECTION_TIME_ZONE }).format(now));
}
export function formatInspectionCode(year: number, sequence: number): string {
  if (!Number.isInteger(year) || year < 1000 || year > 9999 || !Number.isSafeInteger(sequence) || sequence < 1) throw new Error('Código de inspección inválido.');
  return `${INSPECTION_PREFIX}-${year}-${String(sequence).padStart(3, '0')}`;
}
/** An example of the format, never a locally reserved or assigned number. */
export function pendingCodeExample(now = new Date()): string {
  return formatInspectionCode(submissionYear(now), 1);
}
export function pendingCodeLabel(now = new Date()): string {
  return pendingCodeExample(now);
}
export type RegistrationReceipt = { inspectionId: string; code: string; acceptedAt: string };
/** Shape check for a future server receipt; this is not authentication. */
export function confirmedInspectionCode(inspection: { id: string; serverRegistration?: RegistrationReceipt }): string | null {
  const receipt = inspection.serverRegistration;
  if (!receipt || receipt.inspectionId !== inspection.id || typeof receipt.code !== 'string' || typeof receipt.acceptedAt !== 'string') return null;
  if (!/(Z|[+-]\d{2}:\d{2})$/i.test(receipt.acceptedAt)) return null;
  const match = receipt.code.match(/^IH-(\d{4})-(\d{3,})$/);
  const accepted = new Date(receipt.acceptedAt);
  if (!match || !Number.isFinite(accepted.getTime())) return null;
  const sequence = Number(match[2]), year = Number(match[1]);
  if (!Number.isSafeInteger(sequence) || sequence < 1 || year < 1000 || year !== submissionYear(accepted)) return null;
  return formatInspectionCode(year, sequence) === receipt.code ? receipt.code : null;
}
