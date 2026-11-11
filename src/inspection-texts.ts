import type { Inspection } from './model';
import { closingRemarksOf } from './registration';

export type InspectionTexts = { objective: string; unfavorableCause: string; closingRemarks: string };
type SavedTexts = { texts: InspectionTexts; acceptedAt: string };
const KEY = 'berry-account-inspection-texts:';
const EMPTY: InspectionTexts = { objective: '', unfavorableCause: '', closingRemarks: '' };
const keyFor = (ownerId: string) => KEY + encodeURIComponent(ownerId);
function valid(value: unknown): value is SavedTexts {
  const data = value as SavedTexts | null;
  return Boolean(data && typeof data.acceptedAt === 'string' && Number.isFinite(Date.parse(data.acceptedAt)) &&
    data.texts && (['objective', 'unfavorableCause', 'closingRemarks'] as const).every(key =>
      typeof data.texts[key] === 'string' && data.texts[key].length <= (key === 'objective' ? 560 : 1200)));
}
function saved(ownerId: string): SavedTexts | null {
  // The former shared key is deliberately ignored; its text has no verified owner.
  try { const value: unknown = JSON.parse(localStorage.getItem(keyFor(ownerId)) || 'null'); return valid(value) ? value : null; } catch { return null; }
}
export function lastInspectionTexts(ownerId: string): InspectionTexts { return { ...(saved(ownerId)?.texts || EMPTY) }; }
function snapshot(draft: Inspection, at: string): SavedTexts {
  return { texts: { objective: draft.objective, unfavorableCause: draft.unfavorableCause || '', closingRemarks: closingRemarksOf(draft) }, acceptedAt: at };
}
function store(ownerId: string, value: SavedTexts) {
  try { localStorage.setItem(keyFor(ownerId), JSON.stringify(value)); } catch { /* Confirmed inspections remain the source on the next load. */ }
}
/** Remember only after an explicit successful save or send, never while typing. */
export function rememberInspectionTexts(draft: Inspection, at = draft.updatedAt) {
  const value = snapshot(draft, at), previous = saved(draft.ownerId);
  if (!valid(value) || previous && Date.parse(previous.acceptedAt) > Date.parse(value.acceptedAt)) return;
  store(draft.ownerId, value);
}
/** Restore this account's drafts and sent reports; received reports and unconfirmed writes cannot supply defaults. */
export function inspectionTextsFor(ownerId: string, inspections: readonly Inspection[]): InspectionTexts {
  let latest = saved(ownerId);
  for (const draft of inspections) {
    if (draft.ownerId !== ownerId || draft.pendingManualSave) continue;
    // Reviews of an old report must not replace the author's newer writing.
    const value = snapshot(draft, draft.delivery?.sentAt || draft.updatedAt);
    if (valid(value) && (!latest || Date.parse(value.acceptedAt) > Date.parse(latest.acceptedAt))) latest = value;
  }
  if (latest) store(ownerId, latest);
  return { ...(latest?.texts || EMPTY) };
}
