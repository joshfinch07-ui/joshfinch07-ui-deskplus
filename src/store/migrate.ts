import { format } from 'date-fns';
import type { AppData, Prospect, Simulation, SimulationStatus, TradeIdea } from '../types';
import { normCompany } from '../utils/company';

export const STORAGE_KEY = 'deskplus-v2';
/** Rolling local backups taken before any overwrite (cloud pull, import, wipe, restore). */
export const BACKUP_KEY = 'deskplus-v2-backups';
const MAX_BACKUPS = 5;
export const CURRENT_SCHEMA_REV = 4;

const arr = <T,>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);

/**
 * Old saves have no top-level updatedAt. Derive a stable one from the newest
 * record timestamp (or the epoch) so sync comparisons are deterministic.
 */
function deriveUpdatedAt(p: Partial<AppData>): string {
  let max = '1970-01-01T00:00:00.000Z';
  const all = [
    ...arr<Record<string, unknown>>(p.prospects),
    ...arr<Record<string, unknown>>(p.coldCalls),
    ...arr<Record<string, unknown>>(p.coldLeads),
    ...arr<Record<string, unknown>>(p.meetings),
    ...arr<Record<string, unknown>>(p.tasks),
    ...arr<Record<string, unknown>>(p.tradeIdeas),
    ...arr<Record<string, unknown>>((p as Partial<AppData>).proposals),
    ...arr<Record<string, unknown>>((p as Partial<AppData>).simulations),
  ];
  for (const r of all) {
    for (const k of ['updatedAt', 'createdAt', 'bookedAt', 'completedAt']) {
      const v = r?.[k];
      if (typeof v === 'string' && v > max && v.length >= 20) max = v;
    }
  }
  return max;
}

const TRADE_TO_SIM: Record<string, SimulationStatus> = { Open: 'Running', Done: 'Reviewed', Dead: 'Ended', Parked: 'Ended' };

function localMonth(iso: string | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : format(d, 'yyyy-MM');
}

/**
 * rev4: every Trade idea becomes a Live simulation. All brief/follow-up fields
 * carry over, the original record is kept verbatim under `migratedFrom`, and
 * the trade is linked to a prospect with the same (normalised) name if it had none.
 */
export function tradeToSimulation(t: TradeIdea, prospects: Prospect[], at: string): Simulation {
  const {
    client, prospectId, pair, structure, idea, chaseDate, status, id, createdAt, isExample,
    ...brief
  } = t as TradeIdea & Record<string, unknown>;
  const byId = prospectId ? prospects.find((p) => p.id === prospectId) : undefined;
  const byName = !byId ? prospects.find((p) => normCompany(p.company) === normCompany(client)) : undefined;
  const linked = byId ?? byName;
  const parked = status === 'Parked';
  const notes = [parked ? '[Parked trade idea]' : '', (idea ?? '').trim()].filter(Boolean).join(' ');
  return {
    ...(brief as Partial<Simulation>),
    id,
    company: linked?.company ?? client ?? '',
    prospectId: linked?.id ?? null,
    month: localMonth(createdAt) ?? (chaseDate ? chaseDate.slice(0, 7) : format(new Date(), 'yyyy-MM')),
    pair: pair ?? '',
    volume: '',
    structure: structure ?? '',
    sentDate: null,
    outcome: notes,
    status: TRADE_TO_SIM[status] ?? 'Running',
    followUpDate: chaseDate ?? null,
    isExample,
    createdAt,
    migratedFrom: {
      kind: 'tradeIdea',
      at,
      record: { ...t },
      ...(byName ? { linkNote: `auto-linked to prospect “${byName.company}” by name` } : {}),
    },
  } as Simulation;
}

/**
 * Forward-only, lossless migration. Every existing record (and any unknown
 * top-level key) is preserved as-is; missing collections default to [];
 * new fields (email brief, settings) are optional and default at read time.
 */
export function normalizeData(parsed: Partial<AppData> | null | undefined): AppData {
  const p = (parsed ?? {}) as Partial<AppData> & Record<string, unknown>;
  // rev4: Trade ideas → Live simulations (idempotent: ids already present are skipped).
  const sims = arr<Simulation>(p.simulations);
  const trades = arr<TradeIdea>(p.tradeIdeas);
  let simulations = sims;
  if (trades.length) {
    const have = new Set(sims.map((s) => s.id));
    const at = new Date().toISOString();
    const prospects = arr<Prospect>(p.prospects);
    simulations = [...sims, ...trades.filter((t) => t && !have.has(t.id)).map((t) => tradeToSimulation(t, prospects, at))];
  }
  return {
    ...p,
    version: 1,
    schemaRev: CURRENT_SCHEMA_REV,
    updatedAt: typeof p.updatedAt === 'string' && p.updatedAt ? p.updatedAt : deriveUpdatedAt(p),
    settings: {
      defaultEmailStyle: '',
      followUpGapDays: 3,
      defaultCadence: { steps: [2, 3, 5], maxAttempts: 5 },
      ...(p.settings ?? {}),
    },
    prospects: arr(p.prospects),
    coldCalls: arr(p.coldCalls),
    coldLeads: arr(p.coldLeads),
    meetings: arr(p.meetings),
    tasks: arr(p.tasks),
    tradeIdeas: [],
    proposals: arr(p.proposals),
    simulations,
  } as AppData;
}

export function recordCount(d: Partial<AppData> | null | undefined): number {
  if (!d) return 0;
  return (
    arr(d.prospects).length +
    arr(d.coldCalls).length +
    arr(d.coldLeads).length +
    arr(d.meetings).length +
    arr(d.tasks).length +
    arr(d.tradeIdeas).length +
    arr(d.proposals).length +
    arr(d.simulations).length
  );
}

export function isEmptyData(d: Partial<AppData> | null | undefined): boolean {
  return recordCount(d) === 0;
}

export interface BackupEntry {
  at: string;
  reason: string;
  records: number;
  data: AppData;
}

export function listBackups(): BackupEntry[] {
  try {
    const raw = localStorage.getItem(BACKUP_KEY);
    return raw ? (JSON.parse(raw) as BackupEntry[]) : [];
  } catch {
    return [];
  }
}

/** Keep a copy of `data` under a separate key. Empty data is not worth a slot. */
export function saveBackup(data: AppData, reason: string): void {
  if (isEmptyData(data)) return;
  const entry: BackupEntry = {
    at: new Date().toISOString(),
    reason,
    records: recordCount(data),
    data,
  };
  let list = [entry, ...listBackups()].slice(0, MAX_BACKUPS);
  // If storage is tight, drop the oldest until it fits (always keep the newest).
  while (list.length) {
    try {
      localStorage.setItem(BACKUP_KEY, JSON.stringify(list));
      return;
    } catch {
      if (list.length === 1) return;
      list = list.slice(0, -1);
    }
  }
}
