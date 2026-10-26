import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import type { BookedBy,
  AppData,
  AppSettings,
  EmailBrief,
  ColdCall,
  ColdLead,
  ColdLeadStatus,
  Meeting,
  Priority,
  Prospect,
  ProspectType,
  Task,
  Temperature,
  TradeIdea,
  TradeIdeaStatus,
  Proposal,
  ProposalStatus,
  Simulation,
  SimulationStatus,
} from '../types';
import { applyMerge } from './merge';
import { normCompany, type DupMember } from '../utils/company';
import { addBusinessDaysISO } from '../utils/dates';
import { createExampleSeed, EMPTY_DATA } from '../data/seed';
import { addDaysISO, todayISO, uid } from '../utils/dates';

import { CURRENT_SCHEMA_REV, STORAGE_KEY, normalizeData, saveBackup } from './migrate';
import { applyDone, applyOutcomes, applyReopen, applyUndo, type DoneInput, type ReopenInput, type UndoToken } from './done';

// One verbatim copy per schema upgrade (rev2 used 'deskplus-v2-pre-emailbriefs-backup').
const PRE_UPGRADE_KEY = `deskplus-v2-pre-rev${CURRENT_SCHEMA_REV}-backup`;
export { STORAGE_KEY, normalizeData } from './migrate';

function loadData(): AppData {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      const empty = normalizeData({ ...EMPTY_DATA });
      localStorage.setItem(STORAGE_KEY, JSON.stringify(empty));
      return empty;
    }
    // Safe forward migration: every field of old saves is kept; missing
    // arrays default to [], new email-brief fields are optional.
    const parsed = JSON.parse(raw) as Partial<AppData>;
    if (parsed && parsed.schemaRev !== CURRENT_SCHEMA_REV) {
      // One-time verbatim copy of the pre-upgrade save, just in case.
      try {
        if (!localStorage.getItem(PRE_UPGRADE_KEY)) localStorage.setItem(PRE_UPGRADE_KEY, raw);
      } catch {
        /* storage full — migration itself is still lossless */
      }
    }
    return normalizeData(parsed);
  } catch {
    // Never silently lose an unreadable save: keep the raw text aside first.
    if (raw) {
      try {
        localStorage.setItem(`${STORAGE_KEY}-unreadable-${Date.now()}`, raw);
      } catch {
        /* storage full — nothing more we can do */
      }
    }
    return { ...EMPTY_DATA };
  }
}

function persist(data: AppData) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {
    /* quota exceeded — keep in memory; Export JSON still works */
  }
}

export type BriefKind = 'prospect' | 'coldlead' | 'trade' | 'task' | 'proposal' | 'simulation';
export type BriefPatch = EmailBrief & { contactName?: string };

function findProspectByCompany(data: AppData, company: string): Prospect | undefined {
  // Prospect = hub: exact name first, then the normalised name ("JB's Wear" = "JBs Wear Pty Ltd").
  const norm = company.trim().toLowerCase();
  const n2 = normCompany(company);
  return (
    data.prospects.find((p) => p.company.trim().toLowerCase() === norm) ??
    (n2 ? data.prospects.find((p) => normCompany(p.company) === n2) : undefined)
  );
}

interface StoreApi {
  data: AppData;
  // Prospects
  upsertProspect: (input: Partial<Prospect> & { company: string }) => Prospect;
  updateProspect: (id: string, patch: Partial<Prospect>) => void;
  deleteProspect: (id: string) => void;
  // Cold calls
  bulkAddColdCalls: (lines: string[]) => void;
  updateColdCall: (id: string, patch: Partial<ColdCall>) => void;
  clearColdCalls: () => void;
  promoteColdCall: (id: string, temperature: Temperature) => Prospect;
  // Cold leads (really cold / refer-back)
  addColdLead: (input?: Partial<ColdLead>) => ColdLead;
  updateColdLead: (id: string, patch: Partial<ColdLead>) => void;
  deleteColdLead: (id: string) => void;
  setColdLeadStatus: (id: string, status: ColdLeadStatus) => void;
  // Meetings
  bookMeeting: (input: {
    company: string;
    contact?: string;
    meetingDate: string;
    meetingTime?: string;
    timezone?: string;
    notes?: string;
    currencies?: string;
    fxVolume?: string;
    bookedBy?: BookedBy;
    bookedByName?: string;
  }) => Meeting;
  updateMeeting: (id: string, patch: Partial<Meeting>) => void;
  logMeetingOutcome: (input: {
    meetingId?: string;
    company: string;
    contact?: string;
    meetingDate: string;
    outcome: 'Attended' | 'No-show';
    sufficient?: boolean | null;
    rating?: Priority | null;
    currencies?: string;
    fxVolume?: string;
    notes?: string;
    nextFollowUp?: string | null;
    temperature: Temperature;
    priority?: Priority;
    type?: ProspectType;
  }) => void;
  deleteMeeting: (id: string) => void;
  // Log call / email
  logCall: (company: string, contact?: string, notes?: string) => void;
  logEmail: (company: string, contact?: string, notes?: string) => void;
  // Tasks
  addTask: (title: string, dueDate?: string | null, kind?: Task['kind'], related?: Partial<Task>) => void;
  toggleTask: (id: string) => void;
  deleteTask: (id: string) => void;
  // Trade ideas
  addTradeIdea: (input: Omit<TradeIdea, 'id' | 'createdAt' | 'isExample'>) => void;
  updateTradeIdea: (id: string, patch: Partial<TradeIdea>) => void;
  deleteTradeIdea: (id: string) => void;
  setTradeIdeaStatus: (id: string, status: TradeIdeaStatus) => void;
  // Proposals & live simulations (prospect = hub)
  addProposal: (input: Partial<Proposal> & { company: string }) => Proposal;
  updateProposal: (id: string, patch: Partial<Proposal>) => void;
  deleteProposal: (id: string) => void;
  setProposalStatus: (id: string, status: ProposalStatus) => void;
  addSimulation: (input: Partial<Simulation> & { company: string }) => Simulation;
  updateSimulation: (id: string, patch: Partial<Simulation>) => void;
  deleteSimulation: (id: string) => void;
  setSimulationStatus: (id: string, status: SimulationStatus) => void;
  /** Copy a sim into the following month (status Running). Returns the new sim. */
  rollSimulation: (id: string) => Simulation | null;
  /** Merge duplicate company records (backup first). Returns an undo token. */
  mergeDuplicates: (primary: DupMember, members: DupMember[]) => UndoToken;
  dismissDuplicate: (key: string) => void;
  /** Several Today outcomes at once (company group) — one undo token. */
  markFollowUpsDone: (inputs: DoneInput[]) => UndoToken;
  // Email briefs + settings
  updateBrief: (kind: BriefKind, id: string, patch: BriefPatch) => void;
  updateSettings: (patch: Partial<AppSettings>) => void;
  /** Replace everything (cloud pull / restore). Backs up current data first. */
  replaceData: (next: AppData, reason: string) => void;
  /** Today "Sent ✓ / Called ✓": log activity, schedule next follow-up. Returns an undo token. */
  markFollowUpDone: (input: DoneInput) => UndoToken;
  undoFollowUpDone: (token: UndoToken) => void;
  reopenItem: (input: ReopenInput) => UndoToken;
  // Persistence
  exportJson: () => string;
  importJson: (json: string) => void;
  wipeExamples: () => void;
  wipeAll: () => void;
  loadExamples: () => void;
}

const StoreContext = createContext<StoreApi | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<AppData>(() => loadData());

  const dataRef = useRef(data);
  useEffect(() => {
    dataRef.current = data;
    persist(data);
  }, [data]);

  // Every local change stamps data.updatedAt (used by cloud-sync merge).
  const setAndPersist = useCallback((updater: (prev: AppData) => AppData) => {
    setData((prev) => {
      const next = updater(prev);
      if (next === prev) return prev;
      return { ...next, updatedAt: new Date().toISOString() };
    });
  }, []);

  const upsertProspect = useCallback(
    (input: Partial<Prospect> & { company: string }): Prospect => {
      let result!: Prospect;
      setAndPersist((prev) => {
        const existing = input.id
          ? prev.prospects.find((p) => p.id === input.id)
          : findProspectByCompany(prev, input.company);
        const now = new Date().toISOString();
        if (existing) {
          result = {
            ...existing,
            ...input,
            company: input.company.trim(),
            updatedAt: now,
          };
          return {
            ...prev,
            prospects: prev.prospects.map((p) => (p.id === existing.id ? result : p)),
          };
        }
        result = {
          id: uid(),
          company: input.company.trim(),
          contact: input.contact ?? '',
          temperature: input.temperature ?? 'Cold',
          priority: input.priority ?? 3,
          nextSteps: input.nextSteps ?? '',
          currencyPairs: input.currencyPairs ?? '',
          nextFollowUp: input.nextFollowUp ?? null,
          type: input.type ?? 'Prospect',
          contactEmail: input.contactEmail ?? '',
          contactPhone: input.contactPhone ?? '',
          followUpType: input.followUpType ?? 'email',
          briefWhat: input.briefWhat ?? '',
          briefHow: input.briefHow ?? '',
          isExample: input.isExample,
          createdAt: now,
          updatedAt: now,
        };
        return { ...prev, prospects: [...prev.prospects, result] };
      });
      return result;
    },
    [setAndPersist],
  );

  const updateProspect = useCallback(
    (id: string, patch: Partial<Prospect>) => {
      setAndPersist((prev) => ({
        ...prev,
        prospects: prev.prospects.map((p) =>
          p.id === id ? { ...p, ...patch, updatedAt: new Date().toISOString() } : p,
        ),
      }));
    },
    [setAndPersist],
  );

  const deleteProspect = useCallback(
    (id: string) => {
      setAndPersist((prev) => ({
        ...prev,
        prospects: prev.prospects.filter((p) => p.id !== id),
      }));
    },
    [setAndPersist],
  );

  const bulkAddColdCalls = useCallback(
    (lines: string[]) => {
      const now = new Date().toISOString();
      const items: ColdCall[] = lines
        .map((l) => l.trim())
        .filter(Boolean)
        .map((company) => ({
          id: uid(),
          company,
          contact: '',
          status: 'queued' as const,
          notes: '',
          createdAt: now,
        }));
      if (!items.length) return;
      setAndPersist((prev) => ({ ...prev, coldCalls: [...prev.coldCalls, ...items] }));
    },
    [setAndPersist],
  );

  const updateColdCall = useCallback(
    (id: string, patch: Partial<ColdCall>) => {
      setAndPersist((prev) => ({
        ...prev,
        coldCalls: prev.coldCalls.map((c) => (c.id === id ? { ...c, ...patch } : c)),
      }));
    },
    [setAndPersist],
  );

  const clearColdCalls = useCallback(() => {
    setAndPersist((prev) => ({ ...prev, coldCalls: [] }));
  }, [setAndPersist]);

  const promoteColdCall = useCallback(
    (id: string, temperature: Temperature): Prospect => {
      let prospect!: Prospect;
      setAndPersist((prev) => {
        const cc = prev.coldCalls.find((c) => c.id === id);
        if (!cc) return prev;
        const now = new Date().toISOString();
        const existing = findProspectByCompany(prev, cc.company);
        if (existing) {
          prospect = {
            ...existing,
            contact: cc.contact || existing.contact,
            contactEmail: existing.contactEmail || cc.contactEmail,
            briefWhat: existing.briefWhat || cc.briefWhat,
            briefHow: existing.briefHow || cc.briefHow,
            temperature,
            updatedAt: now,
          };
          return {
            ...prev,
            prospects: prev.prospects.map((p) => (p.id === existing.id ? prospect : p)),
            coldCalls: prev.coldCalls.map((c) =>
              c.id === id ? { ...c, status: 'promoted' as const } : c,
            ),
          };
        }
        prospect = {
          id: uid(),
          company: cc.company,
          contact: cc.contact,
          contactEmail: cc.contactEmail ?? '',
          briefWhat: cc.briefWhat ?? '',
          briefHow: cc.briefHow ?? '',
          temperature,
          priority: 3,
          nextSteps: cc.notes ?? '',
          currencyPairs: '',
          nextFollowUp: todayISO(),
          type: 'Prospect',
          createdAt: now,
          updatedAt: now,
        };
        return {
          ...prev,
          prospects: [...prev.prospects, prospect],
          coldCalls: prev.coldCalls.map((c) =>
            c.id === id ? { ...c, status: 'promoted' as const } : c,
          ),
        };
      });
      return prospect;
    },
    [setAndPersist],
  );

  const addColdLead = useCallback(
    (input: Partial<ColdLead> = {}): ColdLead => {
      let result!: ColdLead;
      setAndPersist((prev) => {
        const now = new Date().toISOString();
        result = {
          id: uid(),
          company: (input.company ?? '').trim(),
          contactName: input.contactName ?? '',
          followUpDate: input.followUpDate ?? null,
          volumeCurrency: input.volumeCurrency ?? '',
          notes: input.notes ?? '',
          status: input.status ?? 'Open',
          followUpType: input.followUpType ?? 'email',
          contactPhone: input.contactPhone ?? '',
          contactEmail: input.contactEmail ?? '',
          briefWhat: input.briefWhat ?? '',
          briefHow: input.briefHow ?? '',
          isExample: input.isExample,
          createdAt: now,
          updatedAt: now,
        };
        return { ...prev, coldLeads: [result, ...(prev.coldLeads ?? [])] };
      });
      return result;
    },
    [setAndPersist],
  );

  const updateColdLead = useCallback(
    (id: string, patch: Partial<ColdLead>) => {
      setAndPersist((prev) => ({
        ...prev,
        coldLeads: (prev.coldLeads ?? []).map((c) =>
          c.id === id ? { ...c, ...patch, updatedAt: new Date().toISOString() } : c,
        ),
      }));
    },
    [setAndPersist],
  );

  const deleteColdLead = useCallback(
    (id: string) => {
      setAndPersist((prev) => ({
        ...prev,
        coldLeads: (prev.coldLeads ?? []).filter((c) => c.id !== id),
      }));
    },
    [setAndPersist],
  );

  const setColdLeadStatus = useCallback(
    (id: string, status: ColdLeadStatus) => {
      // closedAt feeds Today → "Recently completed" (Reopen). Additive field.
      updateColdLead(id, { status, closedAt: status === 'Open' ? undefined : new Date().toISOString() });
    },
    [updateColdLead],
  );

  const bookMeeting = useCallback(

    (input: {
      company: string;
      contact?: string;
      meetingDate: string;
      meetingTime?: string;
      timezone?: string;
      notes?: string;
      currencies?: string;
      fxVolume?: string;
      bookedBy?: BookedBy;
      bookedByName?: string;
    }): Meeting => {
      let meeting!: Meeting;
      setAndPersist((prev) => {
        const now = new Date().toISOString();
        // Booked-but-not-sat meetings stay OUT of the pipeline: only link to an
        // existing prospect; a new one is created when the outcome is logged.
        const prospect = findProspectByCompany(prev, input.company);
        const prospects = prev.prospects;
        const pid = prospect ? prospect.id : null;

        meeting = {
          id: uid(),
          company: input.company.trim(),
          contact: input.contact ?? prospect?.contact ?? '',
          prospectId: pid,
          meetingDate: input.meetingDate,
          meetingTime: input.meetingTime ?? '',
          timezone: input.timezone ?? 'Australia/Sydney',
          outcome: null,
          sufficient: null,
          rating: null,
          currencies: input.currencies ?? '',
          fxVolume: input.fxVolume ?? '',
          notes: input.notes ?? '',
          nextFollowUp: null,
          temperature: null,
          createdAt: now,
          bookedAt: now,
          bookedBy: input.bookedBy ?? 'Me',
          ...(input.bookedByName ? { bookedByName: input.bookedByName } : {}),
        };

        // Auto-create confirmation call (meetingDate - 2) and confirmation email (meetingDate - 1)
        const confCallDue = addDaysISO(input.meetingDate, -2);
        const confEmailDue = addDaysISO(input.meetingDate, -1);
        const newTasks: Task[] = [
          {
            id: uid(),
            title: `Confirmation call — ${meeting.company}`,
            dueDate: confCallDue,
            completed: false,
            kind: 'confirmation-call',
            relatedCompany: meeting.company,
            relatedProspectId: pid,
            relatedMeetingId: meeting.id,
            createdAt: now,
          },
          {
            id: uid(),
            title: `Confirmation email — ${meeting.company}`,
            dueDate: confEmailDue,
            completed: false,
            kind: 'confirmation-email',
            relatedCompany: meeting.company,
            relatedProspectId: pid,
            relatedMeetingId: meeting.id,
            createdAt: now,
          },
        ];

        return {
          ...prev,
          prospects,
          meetings: [...prev.meetings, meeting],
          tasks: [...prev.tasks, ...newTasks],
        };
      });
      return meeting;
    },
    [setAndPersist],
  );

  const logMeetingOutcome = useCallback(
    (input: {
      meetingId?: string;
      company: string;
      contact?: string;
      meetingDate: string;
      outcome: 'Attended' | 'No-show';
      sufficient?: boolean | null;
      rating?: Priority | null;
      currencies?: string;
      fxVolume?: string;
      notes?: string;
      nextFollowUp?: string | null;
      temperature: Temperature;
      priority?: Priority;
      type?: ProspectType;
    }) => {
      setAndPersist((prev) => {
        const now = new Date().toISOString();
        let prospect = findProspectByCompany(prev, input.company);
        let prospects = [...prev.prospects];

        if (prospect) {
          prospect = {
            ...prospect,
            contact: input.contact ?? prospect.contact,
            temperature: input.temperature,
            priority: input.priority ?? prospect.priority,
            currencyPairs: input.currencies ?? prospect.currencyPairs,
            nextFollowUp: input.nextFollowUp ?? prospect.nextFollowUp,
            type: input.type ?? prospect.type,
            lastActivity: {
              date: input.meetingDate,
              kind: input.outcome === 'Attended' ? 'meeting' : 'no-show',
              note: input.notes || undefined,
            },
            nextSteps:
              input.outcome === 'Attended'
                ? input.notes || prospect.nextSteps
                : `No-show on ${input.meetingDate}. Rebook.`,
            updatedAt: now,
          };
          prospects = prospects.map((p) => (p.id === prospect!.id ? prospect! : p));
        } else if (input.outcome === 'No-show') {
          // Not sat → stays out of the pipeline.
          prospect = undefined;
        } else {
          prospect = {
            id: uid(),
            company: input.company.trim(),
            contact: input.contact ?? '',
            temperature: input.temperature,
            priority: input.priority ?? 3,
            nextSteps: input.notes ?? '',
            currencyPairs: input.currencies ?? '',
            nextFollowUp: input.nextFollowUp ?? null,
            type: input.type ?? 'Prospect',
            lastActivity: {
              date: input.meetingDate,
              kind: input.outcome === 'Attended' ? 'meeting' : 'no-show',
              note: input.notes || undefined,
            },
            createdAt: now,
            updatedAt: now,
          };
          prospects = [...prospects, prospect];
        }

        let meetings = [...prev.meetings];
        if (input.meetingId) {
          meetings = meetings.map((m) =>
            m.id === input.meetingId
              ? {
                  ...m,
                  outcome: input.outcome,
                  sufficient: input.sufficient ?? null,
                  rating: input.rating ?? null,
                  currencies: input.currencies ?? m.currencies,
                  fxVolume: input.fxVolume ?? '',
                  notes: input.notes ?? m.notes,
                  nextFollowUp: input.nextFollowUp ?? null,
                  temperature: input.temperature,
                  contact: input.contact ?? m.contact,
                  prospectId: prospect ? prospect.id : m.prospectId,
                }
              : m,
          );
        } else {
          meetings = [
            ...meetings,
            {
              id: uid(),
              company: input.company.trim(),
              contact: input.contact ?? '',
              prospectId: prospect ? prospect.id : null,
              meetingDate: input.meetingDate,
              meetingTime: '',
              timezone: 'Australia/Sydney',
              outcome: input.outcome,
              sufficient: input.sufficient ?? null,
              rating: input.rating ?? null,
              currencies: input.currencies ?? '',
              fxVolume: input.fxVolume ?? '',
              notes: input.notes ?? '',
              nextFollowUp: input.nextFollowUp ?? null,
              temperature: input.temperature,
              createdAt: now,
              bookedAt: now,
            },
          ];
        }

        // If follow-up set, ensure a task surfaces on Today
        let tasks = prev.tasks;
        if (input.nextFollowUp) {
          tasks = [
            ...tasks,
            {
              id: uid(),
              title: `Follow-up — ${input.company.trim()}`,
              dueDate: input.nextFollowUp,
              completed: false,
              kind: 'general',
              relatedCompany: input.company.trim(),
              relatedProspectId: prospect ? prospect.id : null,
              relatedMeetingId: input.meetingId ?? null,
              createdAt: now,
            },
          ];
        }

        return { ...prev, prospects, meetings, tasks };
      });
    },
    [setAndPersist],
  );

  const updateMeeting = useCallback(
    (id: string, patch: Partial<Meeting>) => {
      setAndPersist((prev) => ({
        ...prev,
        meetings: prev.meetings.map((m) => (m.id === id ? { ...m, ...patch } : m)),
      }));
    },
    [setAndPersist],
  );

  const deleteMeeting = useCallback(
    (id: string) => {
      setAndPersist((prev) => ({
        ...prev,
        meetings: prev.meetings.filter((m) => m.id !== id),
      }));
    },
    [setAndPersist],
  );

  const logCall = useCallback(
    (company: string, contact?: string, notes?: string) => {
      setAndPersist((prev) => {
        const now = new Date().toISOString();
        let prospect = findProspectByCompany(prev, company);
        let prospects = prev.prospects;
        if (!prospect) {
          prospect = {
            id: uid(),
            company: company.trim(),
            contact: contact ?? '',
            temperature: 'Cold',
            priority: 3,
            nextSteps: notes ?? 'Called',
            currencyPairs: '',
            nextFollowUp: addDaysISO(todayISO(), 3),
            type: 'Prospect',
            lastActivity: { date: todayISO(), kind: 'call', note: notes || undefined },
            createdAt: now,
            updatedAt: now,
          };
          prospects = [...prospects, prospect];
        } else {
          prospects = prospects.map((p) =>
            p.id === prospect!.id
              ? {
                  ...p,
                  contact: contact || p.contact,
                  nextFollowUp: addDaysISO(todayISO(), 3),
                  nextSteps: notes || p.nextSteps,
                  lastActivity: { date: todayISO(), kind: 'call', note: notes || undefined },
                  updatedAt: now,
                }
              : p,
          );
        }
        const task: Task = {
          id: uid(),
          title: `Follow-up email — ${company.trim()}`,
          dueDate: addDaysISO(todayISO(), 3),
          completed: false,
          kind: 'follow-up-email',
          relatedCompany: company.trim(),
          relatedProspectId: prospect.id,
          relatedMeetingId: null,
          createdAt: now,
        };
        return { ...prev, prospects, tasks: [...prev.tasks, task] };
      });
    },
    [setAndPersist],
  );

  const logEmail = useCallback(
    (company: string, contact?: string, notes?: string) => {
      setAndPersist((prev) => {
        const now = new Date().toISOString();
        let prospect = findProspectByCompany(prev, company);
        let prospects = prev.prospects;
        if (!prospect) {
          prospect = {
            id: uid(),
            company: company.trim(),
            contact: contact ?? '',
            temperature: 'Cold',
            priority: 3,
            nextSteps: notes ?? 'Emailed',
            currencyPairs: '',
            nextFollowUp: addDaysISO(todayISO(), 4),
            type: 'Prospect',
            lastActivity: { date: todayISO(), kind: 'email', note: notes || undefined },
            createdAt: now,
            updatedAt: now,
          };
          prospects = [...prospects, prospect];
        } else {
          prospects = prospects.map((p) =>
            p.id === prospect!.id
              ? {
                  ...p,
                  contact: contact || p.contact,
                  nextFollowUp: addDaysISO(todayISO(), 4),
                  nextSteps: notes || p.nextSteps,
                  lastActivity: { date: todayISO(), kind: 'email', note: notes || undefined },
                  updatedAt: now,
                }
              : p,
          );
        }
        const task: Task = {
          id: uid(),
          title: `Follow-up call — ${company.trim()}`,
          dueDate: addDaysISO(todayISO(), 4),
          completed: false,
          kind: 'follow-up-call',
          relatedCompany: company.trim(),
          relatedProspectId: prospect.id,
          relatedMeetingId: null,
          createdAt: now,
        };
        return { ...prev, prospects, tasks: [...prev.tasks, task] };
      });
    },
    [setAndPersist],
  );

  const addTask = useCallback(
    (
      title: string,
      dueDate: string | null = null,
      kind: Task['kind'] = 'general',
      related: Partial<Task> = {},
    ) => {
      setAndPersist((prev) => ({
        ...prev,
        tasks: [
          ...prev.tasks,
          {
            id: uid(),
            title: title.trim(),
            dueDate,
            completed: false,
            kind,
            relatedCompany: related.relatedCompany ?? null,
            relatedProspectId: related.relatedProspectId ?? null,
            relatedMeetingId: related.relatedMeetingId ?? null,
            createdAt: new Date().toISOString(),
          },
        ],
      }));
    },
    [setAndPersist],
  );

  const toggleTask = useCallback(
    (id: string) => {
      setAndPersist((prev) => ({
        ...prev,
        tasks: prev.tasks.map((t) =>
          t.id === id
            ? {
                ...t,
                completed: !t.completed,
                completedAt: !t.completed ? new Date().toISOString() : undefined,
              }
            : t,
        ),
      }));
    },
    [setAndPersist],
  );

  const deleteTask = useCallback(
    (id: string) => {
      setAndPersist((prev) => ({
        ...prev,
        tasks: prev.tasks.filter((t) => t.id !== id),
      }));
    },
    [setAndPersist],
  );

  const addTradeIdea = useCallback(
    (input: Omit<TradeIdea, 'id' | 'createdAt' | 'isExample'>) => {
      setAndPersist((prev) => ({
        ...prev,
        tradeIdeas: [
          ...prev.tradeIdeas,
          { ...input, id: uid(), createdAt: new Date().toISOString() },
        ],
      }));
    },
    [setAndPersist],
  );

  const updateTradeIdea = useCallback(
    (id: string, patch: Partial<TradeIdea>) => {
      setAndPersist((prev) => ({
        ...prev,
        tradeIdeas: prev.tradeIdeas.map((t) => (t.id === id ? { ...t, ...patch } : t)),
      }));
    },
    [setAndPersist],
  );

  const deleteTradeIdea = useCallback(
    (id: string) => {
      setAndPersist((prev) => ({
        ...prev,
        tradeIdeas: prev.tradeIdeas.filter((t) => t.id !== id),
      }));
    },
    [setAndPersist],
  );

  const setTradeIdeaStatus = useCallback(
    (id: string, status: TradeIdeaStatus) => {
      updateTradeIdea(id, { status, closedAt: status === 'Open' ? undefined : new Date().toISOString() });
    },
    [updateTradeIdea],
  );

  const exportJson = useCallback(() => JSON.stringify(data, null, 2), [data]);

  const replaceData = useCallback((next: AppData, reason: string) => {
    saveBackup(dataRef.current, reason);
    setData(normalizeData(next));
  }, []);

  const importJson = useCallback((json: string) => {
    const parsed = JSON.parse(json) as Partial<AppData>;
    if (!parsed || parsed.version !== 1) throw new Error('Invalid Desk+ export');
    saveBackup(dataRef.current, 'before-import');
    setData({ ...normalizeData(parsed), updatedAt: new Date().toISOString() });
  }, []);

  const updateBrief = useCallback(
    (kind: BriefKind, id: string, patch: BriefPatch) => {
      const now = new Date().toISOString();
      setAndPersist((prev) => {
        switch (kind) {
          case 'prospect': {
            const { contactName, ...rest } = patch;
            const p2: Partial<Prospect> = { ...rest };
            if (contactName !== undefined) p2.contact = contactName;
            return {
              ...prev,
              prospects: prev.prospects.map((p) =>
                p.id === id ? { ...p, ...p2, updatedAt: now } : p,
              ),
            };
          }
          case 'coldlead':
            return {
              ...prev,
              coldLeads: (prev.coldLeads ?? []).map((c) =>
                c.id === id ? { ...c, ...patch, updatedAt: now } : c,
              ),
            };
          case 'trade':
            return {
              ...prev,
              tradeIdeas: prev.tradeIdeas.map((t) => (t.id === id ? { ...t, ...patch } : t)),
            };
          case 'task':
            return {
              ...prev,
              tasks: prev.tasks.map((t) => (t.id === id ? { ...t, ...patch } : t)),
            };
          case 'proposal':
            return {
              ...prev,
              proposals: (prev.proposals ?? []).map((x) => (x.id === id ? { ...x, ...patch, updatedAt: now } : x)),
            };
          case 'simulation':
            return {
              ...prev,
              simulations: (prev.simulations ?? []).map((x) => (x.id === id ? { ...x, ...patch, updatedAt: now } : x)),
            };
          default:
            return prev;
        }
      });
    },
    [setAndPersist],
  );

  const markFollowUpDone = useCallback(
    (input: DoneInput): UndoToken => {
      // Deterministic (ids/timestamps are in `input`), so the token computed from the
      // latest committed data matches what the updater applies.
      const { token } = applyDone(dataRef.current, input);
      setAndPersist((prev) => applyDone(prev, input).next);
      return token;
    },
    [setAndPersist],
  );

  const reopenItem = useCallback(
    (input: ReopenInput): UndoToken => {
      const { token } = applyReopen(dataRef.current, input);
      setAndPersist((prev) => applyReopen(prev, input).next);
      return token;
    },
    [setAndPersist],
  );

  const undoFollowUpDone = useCallback(
    (token: UndoToken) => {
      setAndPersist((prev) => applyUndo(prev, token));
    },
    [setAndPersist],
  );

  const addProposal = useCallback(
    (input: Partial<Proposal> & { company: string }): Proposal => {
      const now = new Date().toISOString();
      const gap = dataRef.current.settings?.followUpGapDays ?? 3;
      const rec: Proposal = {
        prospectId: null,
        dateSent: todayISO(),
        pairs: '',
        volume: '',
        proposed: '',
        status: 'Sent',
        followUpDate: addBusinessDaysISO(todayISO(), gap),
        followUpType: 'email',
        meetingId: null,
        ...input,
        id: uid(),
        company: input.company.trim(),
        createdAt: now,
        updatedAt: now,
      };
      setAndPersist((prev) => ({ ...prev, proposals: [...(prev.proposals ?? []), rec] }));
      return rec;
    },
    [setAndPersist],
  );
  const updateProposal = useCallback(
    (id: string, patch: Partial<Proposal>) => {
      setAndPersist((prev) => ({
        ...prev,
        proposals: (prev.proposals ?? []).map((x) => (x.id === id ? { ...x, ...patch, updatedAt: new Date().toISOString() } : x)),
      }));
    },
    [setAndPersist],
  );
  const deleteProposal = useCallback(
    (id: string) => setAndPersist((prev) => ({ ...prev, proposals: (prev.proposals ?? []).filter((x) => x.id !== id) })),
    [setAndPersist],
  );
  const setProposalStatus = useCallback(
    (id: string, status: ProposalStatus) =>
      updateProposal(id, {
        status,
        closedAt: status === 'Sent' || status === 'Discussing' ? undefined : new Date().toISOString(),
      }),
    [updateProposal],
  );
  const addSimulation = useCallback(
    (input: Partial<Simulation> & { company: string }): Simulation => {
      const now = new Date().toISOString();
      const rec: Simulation = {
        prospectId: null,
        month: todayISO().slice(0, 7),
        pair: '',
        volume: '',
        structure: '',
        sentDate: todayISO(),
        outcome: '',
        status: 'Running',
        followUpDate: null,
        followUpType: 'email',
        ...input,
        id: uid(),
        company: input.company.trim(),
        createdAt: now,
        updatedAt: now,
      };
      setAndPersist((prev) => ({ ...prev, simulations: [...(prev.simulations ?? []), rec] }));
      return rec;
    },
    [setAndPersist],
  );
  const updateSimulation = useCallback(
    (id: string, patch: Partial<Simulation>) => {
      setAndPersist((prev) => ({
        ...prev,
        simulations: (prev.simulations ?? []).map((x) => (x.id === id ? { ...x, ...patch, updatedAt: new Date().toISOString() } : x)),
      }));
    },
    [setAndPersist],
  );
  const deleteSimulation = useCallback(
    (id: string) => setAndPersist((prev) => ({ ...prev, simulations: (prev.simulations ?? []).filter((x) => x.id !== id) })),
    [setAndPersist],
  );
  const setSimulationStatus = useCallback(
    (id: string, status: SimulationStatus) =>
      updateSimulation(id, {
        status,
        closedAt: status === 'Running' || status === 'Reviewed' ? undefined : new Date().toISOString(),
      }),
    [updateSimulation],
  );
  const rollSimulation = useCallback(
    (id: string): Simulation | null => {
      const src = (dataRef.current.simulations ?? []).find((x) => x.id === id);
      if (!src || src.rolledToId) return null;
      const [y, m] = src.month.split('-').map(Number);
      const nm = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`;
      const now = new Date().toISOString();
      const copy: Simulation = {
        ...src,
        id: uid(),
        month: nm,
        status: 'Running',
        sentDate: null,
        outcome: '',
        followUpDate: null,
        activityLog: undefined,
        attempts: undefined,
        closedAt: undefined,
        rolledFromId: src.id,
        rolledToId: undefined,
        migratedFrom: undefined,
        createdAt: now,
        updatedAt: now,
      };
      setAndPersist((prev) => ({
        ...prev,
        simulations: [
          ...(prev.simulations ?? []).map((x) => (x.id === id ? { ...x, rolledToId: copy.id, updatedAt: now } : x)),
          copy,
        ],
      }));
      return copy;
    },
    [setAndPersist],
  );
  const mergeDuplicates = useCallback(
    (primary: DupMember, members: DupMember[]): UndoToken => {
      const at = new Date().toISOString();
      const cur = dataRef.current;
      saveBackup(cur, `before-merge ${members.map((m) => m.company).join(' + ')}`.slice(0, 120));
      const { token } = applyMerge(cur, primary, members, at);
      setAndPersist((prev) => applyMerge(prev, primary, members, at).next);
      return token;
    },
    [setAndPersist],
  );
  const dismissDuplicate = useCallback(
    (key: string) =>
      setAndPersist((prev) => ({
        ...prev,
        settings: { ...(prev.settings ?? {}), dismissedDuplicates: [...(prev.settings?.dismissedDuplicates ?? []), key] },
      })),
    [setAndPersist],
  );
  const markFollowUpsDone = useCallback(
    (inputs: DoneInput[]): UndoToken => {
      const { token } = applyOutcomes(dataRef.current, inputs);
      setAndPersist((prev) => applyOutcomes(prev, inputs).next);
      return token;
    },
    [setAndPersist],
  );

  const updateSettings = useCallback(
    (patch: Partial<AppSettings>) => {
      setAndPersist((prev) => ({ ...prev, settings: { ...(prev.settings ?? {}), ...patch } }));
    },
    [setAndPersist],
  );

  const wipeExamples = useCallback(() => {
    setAndPersist((prev) => ({
      ...prev,
      prospects: prev.prospects.filter((p) => !p.isExample),
      coldCalls: prev.coldCalls.filter((c) => !c.isExample),
      coldLeads: (prev.coldLeads ?? []).filter((c) => !c.isExample),
      meetings: prev.meetings.filter((m) => !m.isExample),
      tasks: prev.tasks.filter((t) => !t.isExample),
      tradeIdeas: prev.tradeIdeas.filter((t) => !t.isExample),
      proposals: (prev.proposals ?? []).filter((x) => !x.isExample),
      simulations: (prev.simulations ?? []).filter((x) => !x.isExample),
    }));
  }, [setAndPersist]);

  const wipeAll = useCallback(() => {
    const prev = dataRef.current;
    saveBackup(prev, 'before-wipe-all');
    // Keep settings (default email style) — wipe is about records.
    setData(normalizeData({ ...EMPTY_DATA, settings: prev.settings, updatedAt: new Date().toISOString() }));
  }, []);

  const loadExamples = useCallback(() => {
    const prev = dataRef.current;
    saveBackup(prev, 'before-load-examples');
    setData(
      normalizeData({
        ...createExampleSeed(),
        settings: prev.settings,
        updatedAt: new Date().toISOString(),
      }),
    );
  }, []);

  const api = useMemo<StoreApi>(
    () => ({
      data,
      upsertProspect,
      updateProspect,
      deleteProspect,
      bulkAddColdCalls,
      updateColdCall,
      clearColdCalls,
      promoteColdCall,
      addColdLead,
      updateColdLead,
      deleteColdLead,
      setColdLeadStatus,
      bookMeeting,
      logMeetingOutcome,
      deleteMeeting,
      updateMeeting,
      logCall,
      logEmail,
      addTask,
      toggleTask,
      deleteTask,
      addTradeIdea,
      updateTradeIdea,
      deleteTradeIdea,
      setTradeIdeaStatus,
      updateBrief,
      updateSettings,
      replaceData,
      markFollowUpDone,
      undoFollowUpDone,
      reopenItem,
      addProposal,
      updateProposal,
      deleteProposal,
      setProposalStatus,
      addSimulation,
      updateSimulation,
      deleteSimulation,
      setSimulationStatus,
      rollSimulation,
      mergeDuplicates,
      dismissDuplicate,
      markFollowUpsDone,
      exportJson,
      importJson,
      wipeExamples,
      wipeAll,
      loadExamples,
    }),
    [
      data,
      upsertProspect,
      updateProspect,
      deleteProspect,
      bulkAddColdCalls,
      updateColdCall,
      clearColdCalls,
      promoteColdCall,
      addColdLead,
      updateColdLead,
      deleteColdLead,
      setColdLeadStatus,
      bookMeeting,
      logMeetingOutcome,
      deleteMeeting,
      updateMeeting,
      logCall,
      logEmail,
      addTask,
      toggleTask,
      deleteTask,
      addTradeIdea,
      updateTradeIdea,
      deleteTradeIdea,
      setTradeIdeaStatus,
      updateBrief,
      updateSettings,
      replaceData,
      markFollowUpDone,
      undoFollowUpDone,
      reopenItem,
      addProposal,
      updateProposal,
      deleteProposal,
      setProposalStatus,
      addSimulation,
      updateSimulation,
      deleteSimulation,
      setSimulationStatus,
      rollSimulation,
      mergeDuplicates,
      dismissDuplicate,
      markFollowUpsDone,
      exportJson,
      importJson,
      wipeExamples,
      wipeAll,
      loadExamples,
    ],
  );

  return <StoreContext.Provider value={api}>{children}</StoreContext.Provider>;
}

export function useStore(): StoreApi {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error('useStore outside provider');
  return ctx;
}
