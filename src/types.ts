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
export type MeetingOutcome = 'Attended' | 'No-show' | null;
export type ColdCallStatus = 'queued' | 'called' | 'needs-email' | 'promoted';

export interface Prospect {
  id: string;
  company: string;
  contact: string;
  temperature: Temperature;
  priority: Priority;
  nextSteps: string;
  currencyPairs: string;
  nextFollowUp: string | null; // YYYY-MM-DD
  type: ProspectType;
  isExample?: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ColdCall {
  id: string;
  company: string;
  contact: string;
  status: ColdCallStatus;
  notes: string;
  isExample?: boolean;
  createdAt: string;
}

export interface Meeting {
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
}

export interface Task {
  id: string;
  title: string;
  dueDate: string | null; // YYYY-MM-DD
  completed: boolean;
  kind: TaskKind;
  relatedCompany: string | null;
  relatedProspectId: string | null;
  relatedMeetingId: string | null;
  isExample?: boolean;
  createdAt: string;
}

export interface TradeIdea {
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

export interface AppData {
  version: 1;
  prospects: Prospect[];
  coldCalls: ColdCall[];
  meetings: Meeting[];
  tasks: Task[];
  tradeIdeas: TradeIdea[];
}

export type SortBy = 'nextFollowUp' | 'priority' | 'name';
export type ViewId = 'today' | 'pipeline' | 'coldcalls' | 'meetings' | 'tradeideas' | 'tasks';
