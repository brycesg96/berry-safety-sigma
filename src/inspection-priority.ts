import type { Inspection } from './model';
import { inspectionClosed, needsReview } from './follow-up';

export type InboxPriority = 'pending' | 'overdue' | 'soon' | 'waiting' | 'review' | 'closed';
export const inboxPriorities: { value: InboxPriority; label: string }[] = [
  { value: 'pending', label: 'Pendientes' }, { value: 'overdue', label: 'Vencidas' },
  { value: 'soon', label: 'Por vencer' }, { value: 'waiting', label: 'En espera de respuesta' },
  { value: 'review', label: 'Por validar / aprobar' }, { value: 'closed', label: 'Cerradas' },
];
export const limaToday = (now = new Date()) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Lima', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
export function daysBetween(from: string, to: string) {
  const a = Date.parse(`${from.slice(0, 10)}T12:00:00Z`), b = Date.parse(`${to.slice(0, 10)}T12:00:00Z`);
  return Number.isFinite(a) && Number.isFinite(b) ? Math.round((b - a) / 86400000) : null;
}
export function findingClosed(inspection: Inspection, observationId: string) {
  const correction = inspection.delivery?.corrections[observationId];
  return correction?.decision === 'approved' && correction.state === 'Ejecutado';
}
export function matchesPriority(inspection: Inspection, priority: InboxPriority, today = limaToday(), leadDays = 3) {
  const closed = inspectionClosed(inspection);
  if (priority === 'closed') return closed;
  if (closed || !inspection.delivery) return false;
  if (priority === 'pending') return true;
  if (priority === 'review') return needsReview(inspection);
  if (priority === 'waiting') return inspection.observations.some(o => !findingClosed(inspection, o.id) && inspection.delivery?.corrections[o.id]?.decision !== 'review');
  return inspection.observations.some(o => {
    if (findingClosed(inspection, o.id)) return false;
    const days = daysBetween(today, o.dueDate);
    return days !== null && (priority === 'overdue' ? days < 0 : days >= 0 && days <= leadDays);
  });
}
export function complianceMetrics(rows: { data: Inspection; closed_at?: string | null; sent_at?: string | null }[], today = limaToday()) {
  let findings = 0, approved = 0, overdue = 0, closed = 0;
  const durations: number[] = [];
  for (const row of rows) {
    const done = inspectionClosed(row.data); if (done) closed++;
    for (const o of row.data.observations) {
      findings++;
      if (findingClosed(row.data, o.id)) approved++;
      else if (daysBetween(today, o.dueDate) !== null && o.dueDate < today) overdue++;
    }
    if (done && row.closed_at && row.sent_at) {
      const milliseconds = Date.parse(row.closed_at) - Date.parse(row.sent_at);
      if (Number.isFinite(milliseconds) && milliseconds >= 0) durations.push(milliseconds / 86400000);
    }
  }
  return { inspections: rows.length, closed, findings, approved, overdue, compliance: findings ? Math.round(approved / findings * 100) : 0, averageDays: durations.length ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length * 10) / 10 : null, timedClosures: durations.length };
}
