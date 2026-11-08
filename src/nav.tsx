import { createContext, useContext } from 'react';
import type { ViewId } from './types';

export interface NavFocus {
  section?: 'proposals' | 'sims';
  prospectId?: string;
  highlightId?: string;
}

/** Prefill for the Book meeting form when it is opened from a prospect / cold lead. */
export interface BookPrefill {
  company: string;
  contact?: string;
  contactEmail?: string;
  contactPhone?: string;
  currencies?: string;
  fxVolume?: string;
  /** Link the meeting to this pipeline prospect. */
  prospectId?: string | null;
  /** Link the meeting to this cold lead. */
  coldLeadId?: string | null;
}

export const NavContext = createContext<{
  go: (view: ViewId, focus?: NavFocus) => void;
  /** Open the Book meeting form prefilled from a prospect / cold lead. */
  book: (prefill: BookPrefill) => void;
}>({ go: () => {}, book: () => {} });
export const useNav = () => useContext(NavContext);
