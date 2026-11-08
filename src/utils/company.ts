import type { AppData, Prospect } from '../types';

const SUFFIXES = new Set([
  'pty', 'ltd', 'limited', 'inc', 'llc', 'plc', 'co', 'corp', 'corporation', 'company', 'group', 'the', 'and', 'holdings', 'au', 'aust',
]);

/** "JB's Wear Pty Ltd" → "jbs wear". Used for duplicate detection and linking. */
export function normCompany(name: string | null | undefined): string {
  return (name ?? '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/['’`]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .split(' ')
    .filter((w) => w && !SUFFIXES.has(w))
    .join(' ')
    .trim();
}

function lev(a: string, b: string): number {
  if (a === b) return 0;
  const m = a.length, n = b.length;
  if (!m) return n;
  if (!n) return m;
  let prev = Array.from({ length: n + 1 }, (_, i) => i);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++)
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = cur;
  }
  return prev[n];
}

/** 0..1 similarity on normalised names (1 = same company name). */
export function companySimilarity(a: string, b: string): number {
  const x = normCompany(a), y = normCompany(b);
  if (!x || !y) return 0;
  if (x === y) return 1;
  const cx = x.replace(/ /g, ''), cy = y.replace(/ /g, '');
  if (cx === cy) return 0.98;
  const shorter = cx.length <= cy.length ? cx : cy, longer = shorter === cx ? cy : cx;
  if (shorter.length >= 4 && longer.includes(shorter)) return 0.86;
  return 1 - lev(cx, cy) / Math.max(cx.length, cy.length);
}

export const NEAR = 0.8;

/** Exact (normalised) prospect match. */
export function prospectByName(data: AppData, name: string): Prospect | undefined {
  const n = normCompany(name);
  if (!n) return undefined;
  return data.prospects.find((p) => normCompany(p.company) === n);
}

/** Similar-but-not-identical prospects (for "did you mean…?" warnings). */
export function nearProspects(data: AppData, name: string, excludeId?: string): Prospect[] {
  const n = normCompany(name);
  if (!n) return [];
  return data.prospects
    .filter((p) => p.id !== excludeId)
    .map((p) => ({ p, s: companySimilarity(p.company, name) }))
    .filter((x) => x.s >= NEAR)
    .sort((a, b) => b.s - a.s)
    .map((x) => x.p);
}

/** Type-ahead: prefix / word / substring matches first, then fuzzy. */
export function searchProspects(data: AppData, q: string, limit = 8): Prospect[] {
  const n = normCompany(q);
  const raw = q.trim().toLowerCase();
  if (!raw) return [...data.prospects].sort((a, b) => a.company.localeCompare(b.company)).slice(0, limit);
  const scored = data.prospects.map((p) => {
    const c = p.company.toLowerCase();
    const nc = normCompany(p.company);
    let s = 0;
    if (c.startsWith(raw) || (n && nc.startsWith(n))) s = 3;
    else if (c.split(/\s+/).some((w) => w.startsWith(raw)) || (n && nc.includes(n))) s = 2;
    else if (c.includes(raw)) s = 1.5;
    else s = companySimilarity(p.company, q) >= 0.7 ? 1 : 0;
    return { p, s };
  });
  return scored
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s || a.p.company.localeCompare(b.p.company))
    .slice(0, limit)
    .map((x) => x.p);
}

export type DupColl = 'prospects' | 'coldLeads';
export interface DupMember {
  coll: DupColl;
  id: string;
  company: string;
  status?: string;
}
export interface DupGroup {
  key: string;
  exact: boolean;
  members: DupMember[];
}

/**
 * Companies that appear more than once across the pipeline and cold leads
 * (same normalised name, or near-identical). Example rows are ignored.
 */
export function findDuplicates(data: AppData, dismissed: string[] = []): DupGroup[] {
  const all: DupMember[] = [
    ...data.prospects.filter((p) => !p.isExample).map((p) => ({ coll: 'prospects' as const, id: p.id, company: p.company })),
    ...(data.coldLeads ?? []).filter((c) => !c.isExample).map((c) => ({ coll: 'coldLeads' as const, id: c.id, company: c.company, status: c.status })),
  ].filter((m) => normCompany(m.company));
  const groups: DupGroup[] = [];
  const used = new Set<string>();
  for (let i = 0; i < all.length; i++) {
    if (used.has(all[i].id)) continue;
    const members = [all[i]];
    let exact = true;
    for (let j = i + 1; j < all.length; j++) {
      if (used.has(all[j].id)) continue;
      const s = companySimilarity(all[i].company, all[j].company);
      if (s >= 0.86) {
        members.push(all[j]);
        if (s < 0.98) exact = false;
      }
    }
    if (members.length > 1) {
      members.forEach((m) => used.add(m.id));
      const key = members.map((m) => m.id).sort().join('+');
      if (!dismissed.includes(key)) groups.push({ key, exact, members });
    }
  }
  return groups;
}
