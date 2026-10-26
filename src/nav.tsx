import { createContext, useContext } from 'react';
import type { ViewId } from './types';

export interface NavFocus {
  section?: 'proposals' | 'sims';
  prospectId?: string;
  highlightId?: string;
}

export const NavContext = createContext<{ go: (view: ViewId, focus?: NavFocus) => void }>({ go: () => {} });
export const useNav = () => useContext(NavContext);
