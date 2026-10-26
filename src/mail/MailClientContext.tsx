import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

/** UI preference only. CRM data stays under `deskplus-v1`. */
export const MAIL_PREFS_KEY = 'deskplus-mail-prefs';

export type MailClient = 'outlook-web' | 'mailto';

interface MailPrefs {
  client: MailClient;
}

interface MailClientApi {
  client: MailClient;
  setClient: (client: MailClient) => void;
}

const MailClientContext = createContext<MailClientApi | null>(null);

function readPrefs(): MailPrefs {
  try {
    const raw = localStorage.getItem(MAIL_PREFS_KEY);
    if (!raw) return { client: 'outlook-web' };
    const parsed = JSON.parse(raw) as { client?: unknown };
    return { client: parsed.client === 'mailto' ? 'mailto' : 'outlook-web' };
  } catch {
    return { client: 'outlook-web' };
  }
}

function writePrefs(prefs: MailPrefs) {
  try {
    localStorage.setItem(MAIL_PREFS_KEY, JSON.stringify(prefs));
  } catch {
    /* Ignore quota or private-mode failures. The in-memory choice still applies. */
  }
}

export function MailClientProvider({ children }: { children: ReactNode }) {
  const [client, setClientState] = useState<MailClient>(() => readPrefs().client);

  const setClient = useCallback((next: MailClient) => {
    setClientState(next);
    writePrefs({ client: next });
  }, []);

  const value = useMemo(() => ({ client, setClient }), [client, setClient]);

  return <MailClientContext.Provider value={value}>{children}</MailClientContext.Provider>;
}

export function useMailClient(): MailClientApi {
  const ctx = useContext(MailClientContext);
  if (!ctx) throw new Error('useMailClient must be used within MailClientProvider');
  return ctx;
}
