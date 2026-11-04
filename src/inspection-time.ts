export type InspectionPeriod = '' | 'AM' | 'PM';
export const validInspectionTime = (time: string) => /^(0?[1-9]|1[0-2]):[0-5]\d$/.test(time);
export function formatInspectionTime(time: string, period: InspectionPeriod): string {
  return time ? `${time}${period ? ` ${period}` : ''}` : '';
}
/** Only migrate old 24-hour drafts; never guess AM/PM for a new unfinished input. */
export function migrateInspectionTime(time: string, period?: InspectionPeriod) {
  if (period !== undefined) return { inspectionTime: time, inspectionPeriod: period === 'AM' || period === 'PM' ? period : '' as InspectionPeriod };
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) return { inspectionTime: time, inspectionPeriod: '' as InspectionPeriod };
  const [hour, minute] = time.split(':');
  const h = Number(hour);
  return { inspectionTime: `${String(h % 12 || 12).padStart(2, '0')}:${minute}`, inspectionPeriod: (h < 12 ? 'AM' : 'PM') as InspectionPeriod };
}
