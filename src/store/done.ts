import type {
  ActivityEntry,
  AppData,
  Cadence,
  ColdLead,
  FollowUpType,
  Proposal,
  Prospect,
  Simulation,
  Task,
  Temperature,
  TradeIdea,
} from '../types';
import { findProspect, typeOfTask } from '../utils/brief';

export type DoneKind = 'prospect' | 'coldlead' | 'trade' | 'task' | 'proposal' | 'simulation';
export type Coll = 'prospects' | 'coldLeads' | 'tasks' | 'tradeIdeas' | 'proposals' | 'simulations' | 'meetings';

/** done = Sent/Called ✓ · no-answer = attempt logged, pushed back · close = explicit close. */
export type OutcomeKind = 'done' | 'no-answer' | 'close';
export type CloseAs = 'Done' | 'Parked' | 'Dead' | 'Won' | 'Lost' | 'Converted' | 'Ended';

/** Close options offered per kind (first = default). */
export const CLOSE_OPTIONS: Record<DoneKind, CloseAs[]> = {
  coldlead: ['Done', 'Parked'],
  trade: ['Done', 'Dead', 'Parked'],
  proposal: ['Won', 'Lost', 'Parked'],
  simulation: ['Converted', 'Ended'],
  task: ['Done'],
  prospect: ['Done'],
};

export interface DoneInput {
  kind: DoneKind;
  id: string;
  /** default 'done' */
  outcome?: OutcomeKind;
  /** next follow-up date (YYYY-MM-DD). Ignored for 'close'. */
  nextDate: string | null;
  /** type for the next follow-up (defaults to the current type) */
  nextType?: FollowUpType;
  /** clear "What to say" / "Call points" so the next brief starts fresh (done only) */
  clearBrief: boolean;
  /** prospects: also complete open, due, non-call tasks linked to it (done only) */
  completeLinkedTasks: boolean;
  /** close: cold lead Done/Parked · trade Done/Dead/Parked · task/prospect ignore */
  closeAs?: CloseAs;
  /** prospect (or a task's linked prospect): move to a cooler temperature */
  coolTo?: Temperature;
  /** after logging, set the unanswered-attempt counter back to 0 */
  resetAttempts?: boolean;
  /** undefined = unchanged · null = back to the Settings default · Cadence = save on this record */
  cadence?: Cadence | null;
  /** snapshot written to the activity log */
  entry: Omit<ActivityEntry, 'nextFollowUp'>;
  /** id for a follow-up task created when an unlinked task is done */
  newTaskId: string;
}

export interface UndoToken {
  label: string;
  /** index = original position (restores order when a removed record comes back, e.g. merge undo). */
  prior: { coll: Coll; record: { id: string }; index?: number }[];
  created: { coll: Coll; id: string }[];
}

const CALL_KINDS: Task['kind'][] = ['call', 'confirmation-call', 'follow-up-call'];

/** Open, due-or-overdue, non-call tasks linked to a prospect (by id or company). */
export function linkedDueTasks(data: AppData, p: Prospect, today: string): Task[] {
  const norm = p.company.trim().toLowerCase();
  return data.tasks.filter(
    (t) =>
      !t.completed &&
      !CALL_KINDS.includes(t.kind) &&
      !!t.dueDate &&
      t.dueDate <= today &&
      (t.relatedProspectId === p.id || (t.relatedCompany ?? '').trim().toLowerCase() === norm),
  );
}

function log<T extends { activityLog?: ActivityEntry[] }>(rec: T, entry: ActivityEntry): ActivityEntry[] {
  return [...(rec.activityLog ?? []), entry];
}

type Rec = { attempts?: number; cadence?: Cadence };

/**
 * Pure: returns the new data plus an undo token holding the previous version
 * of every record it touched. Nothing leaves Today without either a new date
 * or an explicit close.
 */
export function applyOutcome(data: AppData, inp: DoneInput): { next: AppData; token: UndoToken } {
  const outcome: OutcomeKind = inp.outcome ?? 'done';
  const now = inp.entry.at;
  const nextDate = outcome === 'close' ? null : inp.nextDate;
  const prior: UndoToken['prior'] = [];
  const created: UndoToken['created'] = [];
  const next: AppData = { ...data };
  const empty = { next: data, token: { label: '', prior, created } };

  const attemptsAfter = (r: Rec) => {
    if (inp.resetAttempts) return 0;
    if (outcome === 'done') return 0;
    if (outcome === 'no-answer') return (r.attempts ?? 0) + 1;
    return r.attempts ?? 0;
  };
  const entryFor = (r: Rec): ActivityEntry => ({
    ...inp.entry,
    nextFollowUp: nextDate,
    outcome: outcome === 'close' ? 'closed' : outcome,
    ...(outcome === 'no-answer' ? { attempt: (r.attempts ?? 0) + 1 } : {}),
    ...(outcome === 'close' && inp.closeAs ? { note: inp.entry.note ?? `Closed as ${inp.closeAs}` } : {}),
  });
  const cadencePatch = (): Rec => (inp.cadence === undefined ? {} : { cadence: inp.cadence ?? undefined });
  const common = <T extends Rec & { activityLog?: ActivityEntry[]; briefWhat?: string; followUpType?: FollowUpType }>(
    r: T,
    clear: boolean,
  ): T => ({
    ...r,
    activityLog: log(r, entryFor(r)),
    attempts: attemptsAfter(r),
    ...cadencePatch(),
    followUpType: outcome === 'close' ? r.followUpType : inp.nextType ?? r.followUpType,
    briefWhat: outcome === 'done' && clear ? '' : r.briefWhat,
  });
  const lastActivity = (r: Rec) => {
    const e = entryFor(r);
    const tag = outcome === 'no-answer' ? `No answer (attempt ${e.attempt})` : outcome === 'close' ? e.note : undefined;
    const note = [tag, e.what?.slice(0, 200)].filter(Boolean).join(' — ') || undefined;
    return { date: e.date, kind: e.type, note };
  };
  const verb =
    outcome === 'no-answer'
      ? 'No answer'
      : outcome === 'close'
        ? `Closed${inp.closeAs ? ` (${inp.closeAs})` : ''}`
        : inp.entry.type === 'call'
          ? 'Called'
          : 'Sent';

  const patchProspect = (p: Prospect, clear: boolean, moveDate = true): Prospect => ({
    ...common(p, clear),
    lastActivity: lastActivity(p),
    ...(moveDate ? { nextFollowUp: nextDate } : {}),
    ...(moveDate && outcome === 'close' ? { closedAt: now } : {}),
    ...(moveDate && outcome !== 'close' ? { closedAt: undefined } : {}),
    ...(inp.coolTo ? { temperature: inp.coolTo } : {}),
    updatedAt: now,
  });

  const completeTasks = (ids: Set<string>) => {
    next.tasks = next.tasks.map((t) => {
      if (!ids.has(t.id)) return t;
      prior.push({ coll: 'tasks', record: t });
      return { ...t, completed: true, completedAt: now, activityLog: log(t, entryFor(t)) };
    });
  };

  let label = '';
  if (inp.kind === 'prospect') {
    const p = data.prospects.find((x) => x.id === inp.id);
    if (!p) return empty;
    prior.push({ coll: 'prospects', record: p });
    next.prospects = data.prospects.map((x) => (x.id === p.id ? patchProspect(x, inp.clearBrief) : x));
    if (outcome === 'done' && inp.completeLinkedTasks)
      completeTasks(new Set(linkedDueTasks(data, p, inp.entry.date).map((t) => t.id)));
    label = `${verb} — ${p.company}`;
  } else if (inp.kind === 'coldlead') {
    const c = (data.coldLeads ?? []).find((x) => x.id === inp.id);
    if (!c) return empty;
    prior.push({ coll: 'coldLeads', record: c });
    next.coldLeads = data.coldLeads.map(
      (x): ColdLead =>
        x.id === c.id
          ? {
              ...common(x, inp.clearBrief),
              lastActivity: lastActivity(x),
              ...(outcome === 'close'
                ? { status: inp.closeAs === 'Parked' ? 'Parked' : 'Done', closedAt: now }
                : { followUpDate: nextDate }),
              updatedAt: now,
            }
          : x,
    );
    label = `${verb} — ${c.company}`;
  } else if (inp.kind === 'proposal' || inp.kind === 'simulation') {
    const coll = inp.kind === 'proposal' ? 'proposals' : 'simulations';
    const list = (data[coll] ?? []) as (Proposal | Simulation)[];
    const r = list.find((x) => x.id === inp.id);
    if (!r) return empty;
    prior.push({ coll, record: r });
    const opts = CLOSE_OPTIONS[inp.kind];
    const closeStatus = inp.closeAs && opts.includes(inp.closeAs) ? inp.closeAs : opts[0];
    next[coll] = list.map((x) =>
      x.id === r.id
        ? {
            ...common(x, inp.clearBrief),
            ...(outcome === 'close' ? { status: closeStatus, closedAt: now } : { followUpDate: nextDate }),
            // A reply on a Sent proposal means it's now being discussed.
            ...(inp.kind === 'proposal' && outcome === 'done' && (x as Proposal).status === 'Sent'
              ? { status: 'Discussing' as const }
              : {}),
            updatedAt: now,
          }
        : x,
    ) as never;
    label = `${verb} — ${r.company}`;
  } else if (inp.kind === 'trade') {
    const t = data.tradeIdeas.find((x) => x.id === inp.id);
    if (!t) return empty;
    prior.push({ coll: 'tradeIdeas', record: t });
    next.tradeIdeas = data.tradeIdeas.map(
      (x): TradeIdea =>
        x.id === t.id
          ? {
              ...common(x, inp.clearBrief),
              ...(outcome === 'close'
                ? { status: (inp.closeAs && CLOSE_OPTIONS.trade.includes(inp.closeAs) ? inp.closeAs : 'Done') as TradeIdea['status'], closedAt: now }
                : { chaseDate: nextDate }),
            }
          : x,
    );
    label = `${verb} — ${t.client} · ${t.pair}`;
  } else {
    const t = data.tasks.find((x) => x.id === inp.id);
    if (!t) return empty;
    const p = findProspect(data, t.relatedProspectId, t.relatedCompany);
    if (outcome === 'no-answer') {
      // Stays open: move the due date, count the attempt, keep the brief.
      prior.push({ coll: 'tasks', record: t });
      next.tasks = data.tasks.map((x) => (x.id === t.id ? { ...common(x, false), dueDate: nextDate } : x));
    } else {
      prior.push({ coll: 'tasks', record: t });
      next.tasks = data.tasks.map((x) =>
        x.id === t.id ? { ...common(x, false), completed: true, completedAt: now } : x,
      );
    }
    if (p) {
      prior.push({ coll: 'prospects', record: p });
      if (outcome === 'done') {
        // The follow-up lives on the lead: log it there and move its next date.
        const usedLeadBrief = !(t.briefWhat ?? '').trim();
        next.prospects = data.prospects.map((x) =>
          x.id === p.id ? patchProspect(x, inp.clearBrief && usedLeadBrief) : x,
        );
      } else {
        // Log the attempt/close on the lead too, without moving its own date or counter.
        next.prospects = data.prospects.map((x) =>
          x.id === p.id
            ? {
                ...x,
                activityLog: log(x, entryFor(t)),
                lastActivity: lastActivity(t),
                ...(inp.coolTo ? { temperature: inp.coolTo } : {}),
                updatedAt: now,
              }
            : x,
        );
      }
    } else if (outcome === 'done' && nextDate) {
      const nt: Task = {
        ...t,
        id: inp.newTaskId,
        dueDate: nextDate,
        completed: false,
        completedAt: undefined,
        attempts: 0,
        followUpType: inp.nextType ?? typeOfTask(t),
        briefWhat: inp.clearBrief ? '' : t.briefWhat,
        activityLog: log(t, entryFor(t)),
        ...(inp.cadence !== undefined ? { cadence: inp.cadence ?? undefined } : {}),
        isExample: t.isExample,
        createdAt: now,
      };
      next.tasks = [...next.tasks, nt];
      created.push({ coll: 'tasks', id: nt.id });
    }
    label = `${verb} — ${t.relatedCompany || t.title}`;
  }
  return { next, token: { label, prior, created } };
}

/** Back-compat name used by earlier code/tests. */
export const applyDone = applyOutcome;

/** Several outcomes as one step (Today company group) with a single undo token. */
export function applyOutcomes(data: AppData, inputs: DoneInput[]): { next: AppData; token: UndoToken } {
  let cur = data;
  const prior: UndoToken['prior'] = [];
  const created: UndoToken['created'] = [];
  const seen = new Set<string>();
  const labels: string[] = [];
  for (const inp of inputs) {
    const r = applyOutcome(cur, inp);
    cur = r.next;
    for (const p of r.token.prior) {
      const k = `${p.coll}:${p.record.id}`;
      if (!seen.has(k)) {
        seen.add(k);
        prior.push(p); // keep the ORIGINAL version for undo
      }
    }
    created.push(...r.token.created);
    if (r.token.label) labels.push(r.token.label);
  }
  return { next: cur, token: { label: labels.join(' · '), prior, created } };
}

export interface ReopenInput {
  kind: DoneKind;
  id: string;
  today: string;
  entry: Omit<ActivityEntry, 'nextFollowUp' | 'outcome'>;
}

/** Put a completed/closed item back on Today (date kept, or today if it had none). */
export function applyReopen(data: AppData, inp: ReopenInput): { next: AppData; token: UndoToken } {
  const prior: UndoToken['prior'] = [];
  const next: AppData = { ...data };
  const e = (d: string | null): ActivityEntry => ({ ...inp.entry, outcome: 'reopened', nextFollowUp: d });
  const now = inp.entry.at;
  let label = '';
  if (inp.kind === 'proposal' || inp.kind === 'simulation') {
    const coll = inp.kind === 'proposal' ? 'proposals' : 'simulations';
    const list = (data[coll] ?? []) as (Proposal | Simulation)[];
    const r = list.find((x) => x.id === inp.id);
    if (!r) return { next: data, token: { label, prior, created: [] } };
    prior.push({ coll, record: r });
    const d = r.followUpDate || inp.today;
    const status = inp.kind === 'proposal' ? ((r.activityLog ?? []).some((a) => a.outcome !== 'closed') ? 'Discussing' : 'Sent') : 'Running';
    next[coll] = list.map((x) =>
      x.id === r.id ? { ...x, status, followUpDate: d, closedAt: undefined, activityLog: log(x, e(d)), updatedAt: now } : x,
    ) as never;
    label = `Reopened — ${r.company}`;
  } else if (inp.kind === 'coldlead') {
    const c = (data.coldLeads ?? []).find((x) => x.id === inp.id);
    if (!c) return { next: data, token: { label, prior, created: [] } };
    prior.push({ coll: 'coldLeads', record: c });
    const d = c.followUpDate || inp.today;
    next.coldLeads = data.coldLeads.map((x) =>
      x.id === c.id ? { ...x, status: 'Open', followUpDate: d, closedAt: undefined, activityLog: log(x, e(d)), updatedAt: now } : x,
    );
    label = `Reopened — ${c.company}`;
  } else if (inp.kind === 'trade') {
    const t = data.tradeIdeas.find((x) => x.id === inp.id);
    if (!t) return { next: data, token: { label, prior, created: [] } };
    prior.push({ coll: 'tradeIdeas', record: t });
    const d = t.chaseDate || inp.today;
    next.tradeIdeas = data.tradeIdeas.map((x) =>
      x.id === t.id ? { ...x, status: 'Open', chaseDate: d, closedAt: undefined, activityLog: log(x, e(d)) } : x,
    );
    label = `Reopened — ${t.client} · ${t.pair}`;
  } else if (inp.kind === 'task') {
    const t = data.tasks.find((x) => x.id === inp.id);
    if (!t) return { next: data, token: { label, prior, created: [] } };
    prior.push({ coll: 'tasks', record: t });
    const d = t.dueDate || inp.today;
    next.tasks = data.tasks.map((x) =>
      x.id === t.id ? { ...x, completed: false, completedAt: undefined, dueDate: d, activityLog: log(x, e(d)) } : x,
    );
    label = `Reopened — ${t.relatedCompany || t.title}`;
  } else {
    const p = data.prospects.find((x) => x.id === inp.id);
    if (!p) return { next: data, token: { label, prior, created: [] } };
    prior.push({ coll: 'prospects', record: p });
    const d = inp.today;
    next.prospects = data.prospects.map((x) =>
      x.id === p.id ? { ...x, nextFollowUp: d, closedAt: undefined, activityLog: log(x, e(d)), updatedAt: now } : x,
    );
    label = `Reopened — ${p.company}`;
  }
  return { next, token: { label, prior, created: [] } };
}

export function applyUndo(data: AppData, token: UndoToken): AppData {
  const next: AppData = { ...data };
  const reinsert: { coll: Coll; record: { id: string }; index: number }[] = [];
  for (const { coll, record, index } of token.prior) {
    const list = (next[coll] ?? []) as { id: string }[];
    if (list.some((r) => r.id === record.id)) next[coll] = list.map((r) => (r.id === record.id ? record : r)) as never;
    else if (typeof index === 'number') reinsert.push({ coll, record, index });
    else next[coll] = [...list, record] as never;
  }
  reinsert.sort((a, b) => a.index - b.index);
  for (const { coll, record, index } of reinsert) {
    const list = [...((next[coll] ?? []) as { id: string }[])];
    list.splice(Math.min(index, list.length), 0, record);
    next[coll] = list as never;
  }
  for (const { coll, id } of token.created) {
    next[coll] = (next[coll] as { id: string }[]).filter((r) => r.id !== id) as never;
  }
  return next;
}

// ── Recently completed (last N days) ──────────────────────
export interface RecentItem {
  kind: DoneKind;
  id: string;
  title: string;
  what: string;
  at: string; // ISO
}

export function recentlyCompleted(data: AppData, nowMs: number, days = 7): RecentItem[] {
  const cutoff = nowMs - days * 86400000;
  const within = (iso?: string) => !!iso && Date.parse(iso) >= cutoff;
  const out: RecentItem[] = [];
  for (const t of data.tasks)
    if (t.completed && within(t.completedAt))
      out.push({ kind: 'task', id: t.id, title: t.relatedCompany ? `${t.title}` : t.title, what: 'Task completed', at: t.completedAt! });
  for (const c of data.coldLeads ?? []) {
    const at = c.closedAt || c.updatedAt;
    if (c.status !== 'Open' && within(at))
      out.push({ kind: 'coldlead', id: c.id, title: `Cold lead — ${c.company}`, what: c.status, at: at! });
  }
  for (const t of data.tradeIdeas)
    if (t.status !== 'Open' && within(t.closedAt))
      out.push({ kind: 'trade', id: t.id, title: `Trade idea — ${t.client} · ${t.pair}`, what: t.status, at: t.closedAt! });
  for (const x of data.proposals ?? [])
    if (['Won', 'Lost', 'Parked'].includes(x.status) && within(x.closedAt))
      out.push({ kind: 'proposal', id: x.id, title: `Proposal — ${x.company}`, what: x.status, at: x.closedAt! });
  for (const x of data.simulations ?? [])
    if (['Converted', 'Ended'].includes(x.status) && within(x.closedAt))
      out.push({ kind: 'simulation', id: x.id, title: `Sim ${x.month} — ${x.company}`, what: x.status, at: x.closedAt! });
  for (const p of data.prospects)
    if (!p.nextFollowUp && within(p.closedAt))
      out.push({ kind: 'prospect', id: p.id, title: `Prospect — ${p.company}`, what: 'Follow-ups closed', at: p.closedAt! });
  return out.sort((a, b) => b.at.localeCompare(a.at));
}
