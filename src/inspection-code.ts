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
  return `${INSPECTION_PREFIX}-${submissionYear(now)}-…`;
}
