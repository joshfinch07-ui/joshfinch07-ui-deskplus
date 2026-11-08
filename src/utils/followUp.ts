import type { AppData, ColdLead, Meeting, Prospect } from '../types';
import { normCompany } from './company';

const byWhen = (a: Meeting, b: Meeting) =>
  (a.meetingDate + (a.meetingTime || '')).localeCompare(b.meetingDate + (b.meetingTime || ''));

/**
 * "Follow-up meeting" status is derived from the meetings list (no new stored field):
 * Booked = there is a booked-but-not-yet-sat meeting linked to the record.
 * Linked = prospectId / coldLeadId, or (for unlinked meetings) the same normalised company name.
 */
export function upcomingMeetingsFor(
  data: AppData,
  rec: { kind: 'prospect'; item: Prospect } | { kind: 'coldlead'; item: ColdLead },
): Meeting[] {
  const n = normCompany(rec.item.company);
  return data.meetings
    .filter((m) => {
      if (m.outcome) return false;
      if (rec.kind === 'prospect') return m.prospectId === rec.item.id || (!m.prospectId && !m.coldLeadId && !!n && normCompany(m.company) === n);
      return m.coldLeadId === rec.item.id || (!m.prospectId && !m.coldLeadId && !!n && normCompany(m.company) === n);
    })
    .sort(byWhen);
}

export function followUpStatus(
  data: AppData,
  rec: { kind: 'prospect'; item: Prospect } | { kind: 'coldlead'; item: ColdLead },
): { status: 'Booked' | 'Need to book'; meeting?: Meeting; count: number } {
  const list = upcomingMeetingsFor(data, rec);
  return list.length ? { status: 'Booked', meeting: list[0], count: list.length } : { status: 'Need to book', count: 0 };
}
