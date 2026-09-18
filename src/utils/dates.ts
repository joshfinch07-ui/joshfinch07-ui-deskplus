import { addDays, format, isBefore, isToday, parseISO, startOfDay } from 'date-fns';

export function todayISO(): string {
  return format(new Date(), 'yyyy-MM-dd');
}

export function formatDisplay(iso: string | null | undefined): string {
  if (!iso) return '—';
  try {
    return format(parseISO(iso), 'd MMM');
  } catch {
    return iso;
  }
}

export function formatLong(iso: string | null | undefined): string {
  if (!iso) return '—';
  try {
    return format(parseISO(iso), 'EEEE d MMMM');
  } catch {
    return iso;
  }
}

export function addDaysISO(iso: string, days: number): string {
  return format(addDays(parseISO(iso), days), 'yyyy-MM-dd');
}

export function isDueToday(iso: string | null | undefined): boolean {
  if (!iso) return false;
  try {
    return isToday(parseISO(iso));
  } catch {
    return false;
  }
}

export function isOverdue(iso: string | null | undefined): boolean {
  if (!iso) return false;
  try {
    const d = startOfDay(parseISO(iso));
    return isBefore(d, startOfDay(new Date()));
  } catch {
    return false;
  }
}

export function isDueOrOverdue(iso: string | null | undefined): boolean {
  return isDueToday(iso) || isOverdue(iso);
}

export function headerDate(): string {
  return format(new Date(), 'EEEE d MMMM');
}

export function uid(): string {
  return crypto.randomUUID();
}
