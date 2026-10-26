export type Temperature = 'Cold' | 'Warm' | 'Hot';
export type ProspectType = 'Prospect' | 'Existing client';
export type Priority = 1 | 2 | 3 | 4 | 5;
export type TaskKind =
  | 'general'
  | 'call'
  | 'email'
  | 'confirmation-call'
  | 'confirmation-email'
  | 'follow-up-call'
  | 'follow-up-email';
export type TradeIdeaStatus = 'Open' | 'Done' | 'Dead' | 'Parked';
export type ProposalStatus = 'Sent' | 'Discussing' | 'Won' | 'Lost' | 'Parked';
export type SimulationStatus = 'Running' | 'Reviewed' | 'Converted' | 'Ended';
export type MeetingOutcome = 'Attended' | 'No-show' | null;
export type ColdCallStatus = 'queued' | 'called' | 'needs-email' | 'promoted';
export type ColdLeadStatus = 'Open' | 'Parked' | 'Done';

/**
 * Email brief fields (all optional so older saves load unchanged).
 * The morning assistant uses these to draft follow-up emails.
 */
export type FollowUpType = 'email' | 'call';
export type FollowUpOutcome = 'done' | 'no-answer' | 'closed' | 'reopened';

/** Retry cadence: business-day gaps between unanswered attempts, and when to stop. */
export interface Cadence {
  /** e.g. [2, 3, 5] — the last step repeats */
  steps: number[];
  maxAttempts: number;
}

/** One logged follow-up (written by the Today "Sent ✓ / Called ✓" button). */
export interface ActivityEntry {
  id: string;
  /** YYYY-MM-DD (local) */
  date: string;
  /** ISO timestamp */
  at: string;
  type: FollowUpType;
  contactName?: string;
  /** email address or phone number used */
  to?: string;
  /** snapshot of "What to say" / "Call points" */
  what?: string;
  /** snapshot of "How to write it" / "Approach" */
  how?: string;
  /** next follow-up date that was scheduled (null = none) */
  nextFollowUp?: string | null;
  /** done (sent/called) · no-answer (attempt) · closed · reopened. Absent → done. */
  outcome?: FollowUpOutcome;
  /** attempt number for no-answer entries (1, 2, 3…) */
  attempt?: number;
  note?: string;
}

export interface EmailBrief {
  /** Email or Call. Absent on older records → treated as 'email'. */
  followUpType?: FollowUpType;
  contactEmail?: string;
  contactPhone?: string;
  /** Newest last. Absent on older records → []. */
  activityLog?: ActivityEntry[];
  /** Unanswered attempts since the last successful follow-up. Absent → 0. */
  attempts?: number;
  /** Per-lead retry cadence. Absent → Settings default. */
  cadence?: Cadence;
  /** When it was closed from Today (for "Recently completed"). */
  closedAt?: string;
  /** Email: what the email should cover. Call: call points. */
  briefWhat?: string;
  /** Email: how to write it (blank → Settings default style). Call: approach (optional). */
  briefHow?: string;
}

export interface LastActivity {
  date: string; // YYYY-MM-DD
  kind: 'call' | 'email' | 'meeting' | 'no-show' | 'note';
  note?: string;
}

export interface Prospect extends EmailBrief {
  id: string;
  company: string;
  contact: string;
  temperature: Temperature;
  priority: Priority;
  nextSteps: string;
  currencyPairs: string;
  nextFollowUp: string | null; // YYYY-MM-DD
  type: ProspectType;
  lastActivity?: LastActivity;
  /** Onboarding documents emailed by Corpay sales support (e.g. Queeny). Absent → none. */
  documentsSent?: DocumentsSent | null;
  /** Records folded in by "Merge duplicates". */
  mergedFrom?: MergedRecord[];
  isExample?: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ColdCall extends EmailBrief {
  id: string;
  company: string;
  contact: string;
  status: ColdCallStatus;
  notes: string;
  isExample?: boolean;
  createdAt: string;
}

export interface ColdLead extends EmailBrief {
  id: string;
  company: string;
  contactName?: string;
  followUpDate: string | null; // YYYY-MM-DD
  volumeCurrency: string;
  notes: string;
  status: ColdLeadStatus;
  lastActivity?: LastActivity;
  mergedFrom?: MergedRecord[];
  isExample?: boolean;
  createdAt: string;
  updatedAt?: string;
}

export interface Meeting extends EmailBrief {
  id: string;
  company: string;
  contact: string;
  prospectId: string | null;
  meetingDate: string; // YYYY-MM-DD
  meetingTime: string; // HH:mm optional
  timezone: string;
  outcome: MeetingOutcome;
  sufficient: boolean | null;
  rating: Priority | null;
  currencies: string;
  fxVolume: string;
  notes: string;
  nextFollowUp: string | null;
  temperature: Temperature | null; // set on outcome log
  isExample?: boolean;
  createdAt: string;
  bookedAt: string;
  /** Who booked it. Absent on older records → 'Me'. */
  bookedBy?: BookedBy;
  /** Name when bookedBy is 'Other' (or Daniel's full name). */
  bookedByName?: string;
}

export interface DocumentsSent {
  date: string; // YYYY-MM-DD
  docs: string[];
  /** Who sent them, e.g. 'Queeny (sales support)'. Optional. */
  sentBy?: string;
}

export type BookedBy = 'Me' | 'Daniel' | 'Other';

export interface Task extends EmailBrief {
  id: string;
  /** Optional override; blank → linked prospect's contact. */
  contactName?: string;
  title: string;
  dueDate: string | null; // YYYY-MM-DD
  completed: boolean;
  kind: TaskKind;
  relatedCompany: string | null;
  relatedProspectId: string | null;
  relatedMeetingId: string | null;
  isExample?: boolean;
  createdAt: string;
  completedAt?: string;
}

export interface TradeIdea extends EmailBrief {
  /** Optional override; blank → linked prospect's contact. */
  contactName?: string;
  id: string;
  client: string;
  prospectId: string | null;
  pair: string;
  structure: string;
  idea: string;
  chaseDate: string | null; // YYYY-MM-DD
  status: TradeIdeaStatus;
  isExample?: boolean;
  createdAt: string;
}

/** Snapshot of records folded into this one by "Merge duplicates" (kept verbatim for safety). */
export interface MergedRecord {
  at: string;
  coll: 'prospects' | 'coldLeads';
  record: Record<string, unknown>;
}

/** A pricing proposal sent to a company. The prospect is the hub for contact + brief. */
export interface Proposal extends EmailBrief {
  id: string;
  /** Display name (copied from the prospect when linked). */
  company: string;
  prospectId: string | null;
  dateSent: string | null; // YYYY-MM-DD
  pairs: string;
  volume: string;
  /** Product / structure / rate notes */
  proposed: string;
  status: ProposalStatus;
  followUpDate: string | null; // YYYY-MM-DD
  /** Optional override; blank → linked prospect's contact. */
  contactName?: string;
  meetingId?: string | null;
  notes?: string;
  isExample?: boolean;
  createdAt: string;
  updatedAt?: string;
}

/** A live (month-end) simulation. */
export interface Simulation extends EmailBrief {
  id: string;
  company: string;
  prospectId: string | null;
  month: string; // YYYY-MM
  pair: string;
  volume: string;
  /** Hedge structure */
  structure: string;
  sentDate: string | null; // YYYY-MM-DD
  /** Outcome / notes */
  outcome: string;
  status: SimulationStatus;
  followUpDate: string | null; // YYYY-MM-DD
  contactName?: string;
  rolledFromId?: string;
  rolledToId?: string;
  /** Set when converted from a Trade idea (rev4 migration); `record` is the original, verbatim. */
  migratedFrom?: { kind: 'tradeIdea'; at: string; record: Record<string, unknown>; linkNote?: string };
  isExample?: boolean;
  createdAt: string;
  updatedAt?: string;
}

export interface AppSettings {
  /** Used when a record's "How to write it" is blank. */
  defaultEmailStyle?: string;
  /** Business days between a Done follow-up and the next one. Default 3. */
  followUpGapDays?: number;
  /** Default retry cadence for "No answer / Push back". Default 2,3,5 · max 5. */
  defaultCadence?: Cadence;
  /** Duplicate groups the user marked "not a duplicate" (sorted member ids joined by +). */
  dismissedDuplicates?: string[];
}

export interface AppData {
  version: 1;
  /** Bumped on every local change (ISO). Used by cloud sync merge. Optional for old saves. */
  updatedAt?: string;
  /** 2 = email briefs, 3 = follow-up type / phone / activity log. Absent on old saves. */
  schemaRev?: number;
  settings?: AppSettings;
  prospects: Prospect[];
  coldCalls: ColdCall[];
  coldLeads: ColdLead[];
  meetings: Meeting[];
  tasks: Task[];
  /** Legacy: converted to `simulations` on load (rev4). Kept for older files/devices. */
  tradeIdeas: TradeIdea[];
  proposals: Proposal[];
  simulations: Simulation[];
}

export type SortBy = 'nextFollowUp' | 'priority' | 'name';
export type ViewId =
  | 'today'
  | 'pipeline'
  | 'coldcalls'
  | 'coldleads'
  | 'meetings'
  | 'tradeideas'
  | 'proposals'
  | 'tasks';
