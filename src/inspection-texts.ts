import { mailEndpoint } from './mail-api';
import { supabaseClient } from './supabase';

export type InspectionTexts = { objective: string; unfavorableCause: string; closingRemarks: string };
type SavedTexts = { texts: InspectionTexts; acceptedAt: string };
const KEY = 'berry-last-submitted-texts';
const EMPTY: InspectionTexts = { objective: '', unfavorableCause: '', closingRemarks: '' };
function valid(value: unknown): value is SavedTexts {
  const data = value as SavedTexts | null;
  return Boolean(data && typeof data.acceptedAt === 'string' && Number.isFinite(Date.parse(data.acceptedAt)) &&
    data.texts && (['objective', 'unfavorableCause', 'closingRemarks'] as const).every(key =>
      typeof data.texts[key] === 'string' && data.texts[key].length <= (key === 'objective' ? 560 : 1200)));
}
function saved(): SavedTexts | null {
  try { const value: unknown = JSON.parse(localStorage.getItem(KEY) || 'null'); return valid(value) ? value : null; } catch { return null; }
}
export function lastInspectionTexts(): InspectionTexts { return { ...(saved()?.texts || EMPTY) }; }
/** Called only for a newly created form; edits made while loading win. */
export function applyInspectionTexts<T extends InspectionTexts & { initialReportTexts?: InspectionTexts }>(draft: T, texts: InspectionTexts): T {
  const next = { ...draft, initialReportTexts: { ...(draft.initialReportTexts || EMPTY) } };
  for (const key of ['objective', 'unfavorableCause', 'closingRemarks'] as const) {
    if (draft[key] === (draft.initialReportTexts?.[key] || '')) {
      next[key] = texts[key]; next.initialReportTexts[key] = texts[key];
    }
  }
  return next;
}
function remember(value: SavedTexts) {
  if (!valid(value)) return;
  const previous = saved();
  if (previous && Date.parse(previous.acceptedAt) > Date.parse(value.acceptedAt)) return;
  try { localStorage.setItem(KEY, JSON.stringify(value)); } catch { /* Shared server copy remains available. */ }
}
export function rememberInspectionTexts(d: InspectionTexts, acceptedAt = new Date().toISOString()) {
  remember({ texts: { objective: d.objective, unfavorableCause: d.unfavorableCause, closingRemarks: d.closingRemarks }, acceptedAt });
}
/** Read-only request. A failed lookup must not block writing a new inspection. */
export async function refreshInspectionTexts(cloud = false): Promise<InspectionTexts> {
  if (cloud) {
    const { data, error } = await supabaseClient().from('berry_shared_texts').select('*').eq('singleton', true).maybeSingle();
    if (!error && data) {
      const value = { texts: { objective: data.objective, unfavorableCause: data.unfavorable_cause, closingRemarks: data.closing_remarks }, acceptedAt: data.submitted_at };
      return value.texts;
    }
    return { ...EMPTY };
  }
  const endpoint = mailEndpoint('/api/inspections/send');
  if (endpoint) {
    try {
      const response = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'inspection.defaults' }), credentials: 'omit', cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(60000) });
      if (response.ok) { const data = await response.json(); if (data.ok && valid(data.defaults)) remember(data.defaults); }
    } catch { /* Offline or an older API: retain the last known submitted text. */ }
  }
  return lastInspectionTexts();
}
