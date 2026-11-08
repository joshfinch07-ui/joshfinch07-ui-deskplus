import type { ActivityEntry, AppData, ColdLead, MergedRecord, Prospect } from '../types';
import type { DupMember } from '../utils/company';
import type { UndoToken } from './done';

const s = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
const stamp = (r: { updatedAt?: string; createdAt?: string }) => r.updatedAt || r.createdAt || '';

/** Which record to keep by default: a prospect if any, else the open cold lead edited most recently. */
export function defaultPrimary(data: AppData, members: DupMember[]): DupMember {
  const ps = members.filter((m) => m.coll === 'prospects');
  const pick = (list: DupMember[], get: (m: DupMember) => { updatedAt?: string; createdAt?: string } | undefined) =>
    [...list].sort((a, b) => stamp(get(b) ?? {}).localeCompare(stamp(get(a) ?? {})))[0];
  if (ps.length) return pick(ps, (m) => data.prospects.find((p) => p.id === m.id));
  const cl = (m: DupMember) => data.coldLeads.find((c) => c.id === m.id);
  const open = members.filter((m) => cl(m)?.status === 'Open');
  return pick(open.length ? open : members, cl);
}

function joinNotes(...parts: string[]): string {
  const out: string[] = [];
  for (const p of parts.map(s).filter(Boolean)) if (!out.some((o) => o.toLowerCase().includes(p.toLowerCase()))) out.push(p);
  return out.join(' · ');
}

function earliest(...d: (string | null | undefined)[]): string | null {
  const v = d.filter((x): x is string => !!x).sort();
  return v[0] ?? null;
}

function mergeLogs(...logs: (ActivityEntry[] | undefined)[]): ActivityEntry[] | undefined {
  const all = logs.flatMap((l) => l ?? []);
  if (!all.length) return undefined;
  const seen = new Set<string>();
  return all.filter((a) => (seen.has(a.id) ? false : (seen.add(a.id), true))).sort((a, b) => (a.at || '').localeCompare(b.at || ''));
}

/**
 * Pure. Folds `others` into `primary`: empty contact/brief fields are filled, notes
 * and activity combined, the soonest open follow-up kept, links to removed
 * prospects re-pointed, and every removed record kept verbatim in `mergedFrom`.
 * The undo token restores everything exactly.
 */
export function applyMerge(
  data: AppData,
  primary: DupMember,
  members: DupMember[],
  at: string,
): { next: AppData; token: UndoToken } {
  const prior: UndoToken['prior'] = [];
  const others = members.filter((m) => !(m.coll === primary.coll && m.id === primary.id));
  const get = (m: DupMember) =>
    (m.coll === 'prospects' ? data.prospects.find((p) => p.id === m.id) : data.coldLeads.find((c) => c.id === m.id)) as
      | (Prospect | ColdLead)
      | undefined;
  const base = get(primary);
  if (!base) return { next: data, token: { label: '', prior, created: [] } };
  const rest = others.map(get).filter(Boolean) as (Prospect | ColdLead)[];
  prior.push({ coll: primary.coll, record: base });
  rest.forEach((r, i) => {
    const list = (others[i].coll === 'prospects' ? data.prospects : data.coldLeads) as { id: string }[];
    prior.push({ coll: others[i].coll, record: r, index: list.findIndex((x) => x.id === r.id) });
  });
  const mergedFrom: MergedRecord[] = [
    ...(base.mergedFrom ?? []),
    ...rest.map((r, i) => ({ at, coll: others[i].coll, record: { ...r } as Record<string, unknown> })),
  ];
  const nameOf = (r: Prospect | ColdLead) => ('contact' in r ? s(r.contact) : s((r as ColdLead).contactName));
  const fill = (key: 'contactEmail' | 'contactPhone' | 'briefWhat' | 'briefHow') =>
    s(base[key]) || rest.map((r) => s(r[key])).find(Boolean) || base[key];
  const common = {
    contactEmail: fill('contactEmail'),
    contactPhone: fill('contactPhone'),
    briefWhat: fill('briefWhat'),
    briefHow: fill('briefHow'),
    followUpType: base.followUpType ?? rest.map((r) => r.followUpType).find(Boolean),
    activityLog: mergeLogs(base.activityLog, ...rest.map((r) => r.activityLog)),
    attempts: Math.max(base.attempts ?? 0, ...rest.map((r) => r.attempts ?? 0)) || base.attempts,
    mergedFrom,
    updatedAt: at,
  };
  const next: AppData = { ...data };
  const removeIds = new Set(others.map((m) => m.id));
  const openColdDates = rest
    .filter((r): r is ColdLead => 'status' in r && (r as ColdLead).status === 'Open')
    .map((r) => r.followUpDate);
  const restNotes = rest.map((r) => ('notes' in r ? s((r as ColdLead).notes) : s((r as Prospect).nextSteps)));

  if (primary.coll === 'prospects') {
    const p = base as Prospect;
    const merged: Prospect = {
      ...p,
      ...common,
      contact: s(p.contact) || rest.map(nameOf).find(Boolean) || p.contact,
      nextSteps: joinNotes(p.nextSteps, ...restNotes),
      currencyPairs: s(p.currencyPairs) || rest.map((r) => ('currencyPairs' in r ? s(r.currencyPairs) : s((r as ColdLead).volumeCurrency))).find(Boolean) || p.currencyPairs,
      nextFollowUp: earliest(p.nextFollowUp, ...openColdDates, ...rest.filter((r): r is Prospect => 'nextFollowUp' in r).map((r) => r.nextFollowUp)),
    };
    next.prospects = data.prospects.filter((x) => !removeIds.has(x.id) || x.id === p.id).map((x) => (x.id === p.id ? merged : x));
  } else {
    const c = base as ColdLead;
    const anyOpen = c.status === 'Open' || openColdDates.length > 0;
    const merged: ColdLead = {
      ...c,
      ...common,
      contactName: s(c.contactName) || rest.map(nameOf).find(Boolean) || c.contactName,
      notes: joinNotes(c.notes, ...restNotes),
      volumeCurrency: s(c.volumeCurrency) || rest.map((r) => s((r as ColdLead).volumeCurrency)).find(Boolean) || c.volumeCurrency,
      status: anyOpen ? 'Open' : c.status,
      closedAt: anyOpen ? undefined : c.closedAt,
      followUpDate: c.status === 'Open' ? earliest(c.followUpDate, ...openColdDates) ?? c.followUpDate : earliest(...openColdDates) ?? c.followUpDate,
    };
    next.prospects = data.prospects;
    next.coldLeads = data.coldLeads.map((x) => (x.id === c.id ? merged : x));
  }
  next.coldLeads = (next.coldLeads ?? data.coldLeads).filter((x) => !(removeIds.has(x.id) && !(primary.coll === 'coldLeads' && x.id === primary.id)));

  // Re-point links from removed prospects to the kept one.
  const goneProspects = new Set(others.filter((m) => m.coll === 'prospects').map((m) => m.id));
  if (goneProspects.size && primary.coll === 'prospects') {
    const to = primary.id;
    const repoint = <T extends { id: string }>(coll: 'meetings' | 'tasks' | 'proposals' | 'simulations' | 'tradeIdeas', key: string) => {
      const list = (data[coll] ?? []) as unknown as (T & Record<string, unknown>)[];
      next[coll] = list.map((r) => {
        if (!goneProspects.has(r[key] as string)) return r;
        prior.push({ coll: coll as never, record: r });
        return { ...r, [key]: to };
      }) as never;
    };
    repoint('meetings', 'prospectId');
    repoint('tasks', 'relatedProspectId');
    repoint('proposals', 'prospectId');
    repoint('simulations', 'prospectId');
    repoint('tradeIdeas', 'prospectId');
  }
  return { next, token: { label: `Merged ${members.length} × ${base.company}`, prior, created: [] } };
}
