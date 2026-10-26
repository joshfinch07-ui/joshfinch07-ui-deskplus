/** UI preference only. CRM data stays under `deskplus-v2`. */
export const MAIL_PREFS_KEY = 'deskplus-mail-prefs';

export type MailClient = 'outlook-web' | 'mailto';

export function readMailClient(): MailClient {
  try {
    const raw = localStorage.getItem(MAIL_PREFS_KEY);
    if (!raw) return 'outlook-web';
    const parsed = JSON.parse(raw) as { client?: unknown };
    return parsed.client === 'mailto' ? 'mailto' : 'outlook-web';
  } catch {
    return 'outlook-web';
  }
}

export function writeMailClient(client: MailClient) {
  try {
    localStorage.setItem(MAIL_PREFS_KEY, JSON.stringify({ client }));
  } catch {
    /* Ignore quota or private-mode failures. */
  }
}
