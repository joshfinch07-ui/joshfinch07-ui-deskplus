import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import type {
  AppData,
  ColdCall,
  Meeting,
  Priority,
  Prospect,
  ProspectType,
  Task,
  Temperature,
  TradeIdea,
  TradeIdeaStatus,
} from '../types';
import { createExampleSeed, EMPTY_DATA } from '../data/seed';
import { addDaysISO, todayISO, uid } from '../utils/dates';

const STORAGE_KEY = 'deskplus-v1';

function loadData(): AppData {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      const seed = createExampleSeed();
      localStorage.setItem(STORAGE_KEY, JSON.stringify(seed));
      return seed;
    }
    return JSON.parse(raw) as AppData;
  } catch {
    return createExampleSeed();
  }
}

function persist(data: AppData) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

function findProspectByCompany(data: AppData, company: string): Prospect | undefined {
  const norm = company.trim().toLowerCase();
  return data.prospects.find((p) => p.company.trim().toLowerCase() === norm);
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
  // Meetings
  bookMeeting: (input: {
    company: string;
    contact?: string;
    meetingDate: string;
    meetingTime?: string;
    timezone?: string;
    notes?: string;
    currencies?: string;
  }) => Meeting;
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

  useEffect(() => {
    persist(data);
  }, [data]);

  const setAndPersist = useCallback((updater: (prev: AppData) => AppData) => {
    setData((prev) => updater(prev));
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
          temperature,
          priority: 3,
          nextSteps: '',
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

  const bookMeeting = useCallback(
    (input: {
      company: string;
      contact?: string;
      meetingDate: string;
      meetingTime?: string;
      timezone?: string;
      notes?: string;
      currencies?: string;
    }): Meeting => {
      let meeting!: Meeting;
      setAndPersist((prev) => {
        const now = new Date().toISOString();
        let prospect = findProspectByCompany(prev, input.company);
        let prospects = prev.prospects;
        if (!prospect) {
          prospect = {
            id: uid(),
            company: input.company.trim(),
            contact: input.contact ?? '',
            temperature: 'Warm',
            priority: 3,
            nextSteps: 'Meeting booked',
            currencyPairs: input.currencies ?? '',
            nextFollowUp: input.meetingDate,
            type: 'Prospect',
            createdAt: now,
            updatedAt: now,
          };
          prospects = [...prospects, prospect];
        } else if (input.contact && !prospect.contact) {
          prospects = prospects.map((p) =>
            p.id === prospect!.id
              ? { ...p, contact: input.contact!, updatedAt: now }
              : p,
          );
        }

        meeting = {
          id: uid(),
          company: input.company.trim(),
          contact: input.contact ?? prospect.contact,
          prospectId: prospect.id,
          meetingDate: input.meetingDate,
          meetingTime: input.meetingTime ?? '',
          timezone: input.timezone ?? 'Australia/Sydney',
          outcome: null,
          sufficient: null,
          rating: null,
          currencies: input.currencies ?? '',
          fxVolume: '',
          notes: input.notes ?? '',
          nextFollowUp: null,
          temperature: null,
          createdAt: now,
          bookedAt: now,
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
            relatedProspectId: prospect.id,
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
            relatedProspectId: prospect.id,
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
            nextSteps:
              input.outcome === 'Attended'
                ? input.notes || prospect.nextSteps
                : `No-show on ${input.meetingDate}. Rebook.`,
            updatedAt: now,
          };
          prospects = prospects.map((p) => (p.id === prospect!.id ? prospect! : p));
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
                  prospectId: prospect!.id,
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
              prospectId: prospect.id,
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
              relatedProspectId: prospect.id,
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
          t.id === id ? { ...t, completed: !t.completed } : t,
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
      updateTradeIdea(id, { status });
    },
    [updateTradeIdea],
  );

  const exportJson = useCallback(() => JSON.stringify(data, null, 2), [data]);

  const importJson = useCallback((json: string) => {
    const parsed = JSON.parse(json) as AppData;
    if (!parsed || parsed.version !== 1) throw new Error('Invalid Desk+ export');
    setData({
      version: 1,
      prospects: parsed.prospects ?? [],
      coldCalls: parsed.coldCalls ?? [],
      meetings: parsed.meetings ?? [],
      tasks: parsed.tasks ?? [],
      tradeIdeas: parsed.tradeIdeas ?? [],
    });
  }, []);

  const wipeExamples = useCallback(() => {
    setAndPersist((prev) => ({
      ...prev,
      prospects: prev.prospects.filter((p) => !p.isExample),
      coldCalls: prev.coldCalls.filter((c) => !c.isExample),
      meetings: prev.meetings.filter((m) => !m.isExample),
      tasks: prev.tasks.filter((t) => !t.isExample),
      tradeIdeas: prev.tradeIdeas.filter((t) => !t.isExample),
    }));
  }, [setAndPersist]);

  const wipeAll = useCallback(() => {
    setData({ ...EMPTY_DATA });
  }, []);

  const loadExamples = useCallback(() => {
    setData(createExampleSeed());
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
      bookMeeting,
      logMeetingOutcome,
      deleteMeeting,
      logCall,
      logEmail,
      addTask,
      toggleTask,
      deleteTask,
      addTradeIdea,
      updateTradeIdea,
      deleteTradeIdea,
      setTradeIdeaStatus,
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
      bookMeeting,
      logMeetingOutcome,
      deleteMeeting,
      logCall,
      logEmail,
      addTask,
      toggleTask,
      deleteTask,
      addTradeIdea,
      updateTradeIdea,
      deleteTradeIdea,
      setTradeIdeaStatus,
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
