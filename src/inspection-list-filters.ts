export type InspectionDateFilter = 'all' | 'today' | 'week' | 'month' | 'last30' | 'custom';
export type InspectionDateRange = { from: string; to: string };

export function inspectionListToday(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Lima', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}

export function inspectionDateRange(filter: InspectionDateFilter, today: string, from = '', to = ''): InspectionDateRange {
  const day = new Date(`${today}T12:00:00Z`);
  const shift = (offset: number) => {
    const date = new Date(day); date.setUTCDate(date.getUTCDate() + offset);
    return date.toISOString().slice(0, 10);
  };
  switch (filter) {
    case 'today': return { from: today, to: today };
    case 'week': {
      const weekday = (day.getUTCDay() + 6) % 7;
      return { from: shift(-weekday), to: shift(6 - weekday) };
    }
    case 'month': return { from: `${today.slice(0, 7)}-01`, to: new Date(Date.UTC(day.getUTCFullYear(), day.getUTCMonth() + 1, 0, 12)).toISOString().slice(0, 10) };
    case 'last30': return { from: shift(-29), to: today };
    case 'custom': return { from, to };
    default: return { from: '', to: '' };
  }
}

export function matchesInspectionDate(date: string, range: InspectionDateRange) {
  if (!range.from && !range.to) return true;
  return /^\d{4}-\d{2}-\d{2}$/.test(date) && (!range.from || date >= range.from) && (!range.to || date <= range.to);
}
