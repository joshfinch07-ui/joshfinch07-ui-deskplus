import type { AppData, Cadence, ColdLead, FollowUpType, Proposal, Prospect, Simulation, Task, TradeIdea } from '../types';
import { normCompany } from './company';

export interface ResolvedBrief {
  type: FollowUpType;
  contactName: string;
  contactEmail: string;
  contactPhone: string;
  /** Email: what to say. Call: call points. */
  what: string;
  /** Email: how to write it (falls back to default style). Call: approach (no fallback). */
  how: string;
  /** true when `how` came from Settings → Default email style */
  howIsDefault: boolean;
  /** Where inherited fields came from (e.g. linked prospect) */
  inheritedFrom?: string;
}

export type BriefState = 'ready' | 'no-contact' | 'no-brief';

const s = (v: string | null | undefined) => (v ?? '').trim();

const CALL_KINDS: Task['kind'][] = ['call', 'confirmation-call', 'follow-up-call'];

export function typeOfTask(t: Task): FollowUpType {
  return t.followUpType ?? (CALL_KINDS.includes(t.kind) ? 'call' : 'email');
}

export function typeOf(rec: { followUpType?: FollowUpType }): FollowUpType {
  return rec.followUpType ?? 'email';
}

export const TYPE_ICON: Record<FollowUpType, string> = { email: '✉', call: '📞' };

export function briefLabels(type: FollowUpType) {
  return type === 'call'
    ? { box: '📞 Call brief', what: 'Call points', how: 'Approach (optional)', done: 'Called ✓' }
    : { box: '✉ Email brief', what: 'What to say', how: 'How to write it', done: 'Sent ✓' };
}

export function findProspect(
  data: AppData,
  id: string | null | undefined,
  company?: string | null,
): Prospect | undefined {
  if (id) {
    const p = data.prospects.find((x) => x.id === id);
    if (p) return p;
  }
  const norm = normCompany(company);
  if (!norm) return undefined;
  // Exact name first, then the normalised name ("JB's Wear" = "JBs Wear Pty Ltd").
  const exact = s(company).toLowerCase();
  return (
    data.prospects.find((p) => p.company.trim().toLowerCase() === exact) ??
    data.prospects.find((p) => normCompany(p.company) === norm)
  );
}

function finish(
  data: AppData,
  type: FollowUpType,
  name: string,
  email: string,
  phone: string,
  what: string,
  how: string,
  inheritedFrom?: string,
): ResolvedBrief {
  const def = type === 'email' ? s(data.settings?.defaultEmailStyle) : '';
  return {
    type,
    contactName: name,
    contactEmail: email,
    contactPhone: phone,
    what,
    how: how || def,
    howIsDefault: !how && !!def,
    inheritedFrom,
  };
}

export function resolveProspect(data: AppData, p: Prospect): ResolvedBrief {
  return finish(data, typeOf(p), s(p.contact), s(p.contactEmail), s(p.contactPhone), s(p.briefWhat), s(p.briefHow));
}

export function resolveColdLead(data: AppData, c: ColdLead): ResolvedBrief {
  return finish(data, typeOf(c), s(c.contactName), s(c.contactEmail), s(c.contactPhone), s(c.briefWhat), s(c.briefHow));
}

/** Tasks / trade ideas: own fields first, field-by-field fallback to the linked prospect. */
function resolveLinked(
  data: AppData,
  type: FollowUpType,
  own: { contactName?: string; contactEmail?: string; contactPhone?: string; briefWhat?: string; briefHow?: string },
  linked: Prospect | undefined,
): ResolvedBrief {
  const name = s(own.contactName) || s(linked?.contact);
  const email = s(own.contactEmail) || s(linked?.contactEmail);
  const phone = s(own.contactPhone) || s(linked?.contactPhone);
  const what = s(own.briefWhat) || s(linked?.briefWhat);
  const how = s(own.briefHow) || s(linked?.briefHow);
  const inherited =
    linked &&
    ((!s(own.contactEmail) && s(linked.contactEmail)) ||
      (!s(own.contactPhone) && s(linked.contactPhone)) ||
      (!s(own.briefWhat) && s(linked.briefWhat)) ||
      (!s(own.contactName) && s(linked.contact)))
      ? linked.company
      : undefined;
  return finish(data, type, name, email, phone, what, how, inherited);
}

export function resolveTask(data: AppData, t: Task): ResolvedBrief {
  return resolveLinked(data, typeOfTask(t), t, findProspect(data, t.relatedProspectId, t.relatedCompany));
}

export function resolveTrade(data: AppData, t: TradeIdea): ResolvedBrief {
  return resolveLinked(data, typeOf(t), t, findProspect(data, t.prospectId, t.client));
}

/** Proposals / sims: the prospect is the hub — own fields are optional overrides. */
export function resolveProposal(data: AppData, x: Proposal): ResolvedBrief {
  const linked = findProspect(data, x.prospectId, x.company);
  return resolveLinked(data, x.followUpType ?? linked?.followUpType ?? 'email', x, linked);
}

export function resolveSimulation(data: AppData, x: Simulation): ResolvedBrief {
  const linked = findProspect(data, x.prospectId, x.company);
  return resolveLinked(data, x.followUpType ?? linked?.followUpType ?? 'email', x, linked);
}

/** Email ready = email + what-to-say. Call ready = phone + call points. */
export function briefState(r: ResolvedBrief): BriefState {
  if (!r.what) return 'no-brief';
  if (r.type === 'call' ? !r.contactPhone : !r.contactEmail) return 'no-contact';
  return 'ready';
}

// ── Cadence / attempts ─────────────────────────────────────
export const FALLBACK_CADENCE: Cadence = { steps: [2, 3, 5], maxAttempts: 5 };

export function cleanCadence(c: Partial<Cadence> | undefined | null): Cadence | undefined {
  if (!c) return undefined;
  const steps = (c.steps ?? []).map((n) => Math.round(Number(n))).filter((n) => n >= 1 && n <= 60);
  const max = Math.round(Number(c.maxAttempts));
  if (!steps.length) return undefined;
  return { steps, maxAttempts: max >= 1 && max <= 50 ? max : FALLBACK_CADENCE.maxAttempts };
}

export function parseSteps(text: string): number[] {
  return text
    .split(/[\s,;/]+/)
    .map((x) => Math.round(Number(x)))
    .filter((n) => n >= 1 && n <= 60);
}

/** Record cadence → linked prospect's → Settings default → 2,3,5 · max 5. */
export function resolveCadence(
  data: AppData,
  rec: { cadence?: Cadence },
  linked?: { cadence?: Cadence },
): { cadence: Cadence; source: 'record' | 'linked prospect' | 'default' } {
  const own = cleanCadence(rec.cadence);
  if (own) return { cadence: own, source: 'record' };
  const l = cleanCadence(linked?.cadence);
  if (l) return { cadence: l, source: 'linked prospect' };
  return { cadence: cleanCadence(data.settings?.defaultCadence) ?? FALLBACK_CADENCE, source: 'default' };
}

/** Business-day gap for the next push after `attempts` unanswered tries (0-based → first step). */
export function cadenceStep(c: Cadence, attempts: number): number {
  return c.steps[Math.min(Math.max(attempts, 0), c.steps.length - 1)];
}

export function formatCadence(c: Cadence): string {
  return `${c.steps.join(', ')} bd · max ${c.maxAttempts}`;
}
