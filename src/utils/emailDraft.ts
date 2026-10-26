import type { ResolvedBrief } from './brief';

/**
 * Outlook on the web / mailto / Salesloft clipboard.
 * The customer email is only the greeting, `briefWhat`, and "Cheers,\nJosh".
 * `briefHow` and the default email style are tone for Josh, not part of the email.
 * Nothing here is written back to `deskplus-v2`.
 */

export const OUTLOOK_COMPOSE_BASE = 'https://outlook.office.com/mail/deeplink/compose';

/** Stay under common proxy and Outlook URL limits. */
export const MAX_COMPOSE_URL_LENGTH = 7500;

const EMAIL_PATTERN = '[A-Z0-9._%+-]+@[A-Z0-9.-]+\\.[A-Z]{2,}';
const ELLIPSIS = '\u2026';

export type SubjectKind = 'follow-up' | 'confirmation' | 'proposal' | 'sim';

export interface ComposeParts {
  to: string;
  subject: string;
  body: string;
}

export interface EmailDraft extends ComposeParts {
  missingEmail: boolean;
  missingBrief: boolean;
  warnings: string[];
  /** Tone for Josh. Not included in the email. */
  toneNote: string;
  toneIsDefault: boolean;
}

export function contactFirstName(contact: string): string {
  const withoutEmail = contact
    .replace(new RegExp(EMAIL_PATTERN, 'gi'), ' ')
    .replace(/[<>(),;]/g, ' ');
  const first = withoutEmail.split(/\s+/).filter(Boolean)[0] ?? '';
  return first.replace(/^[^A-Za-z]+|[^A-Za-z'-]+$/g, '');
}

export function emailSubject(company: string, kind: SubjectKind = 'follow-up'): string {
  const name = company.replace(/^EXAMPLE\s*·\s*/i, '').trim();
  if (kind === 'confirmation') return name ? `Confirming our meeting — ${name}` : 'Confirming our meeting';
  if (kind === 'proposal') return name ? `Following up on the proposal — ${name}` : 'Following up on the proposal';
  if (kind === 'sim') return name ? `Following up on the simulation — ${name}` : 'Following up on the simulation';
  return name ? `Following up — ${name}` : 'Following up';
}

/** Greeting, what-to-say, then the fixed sign-off. Tone is not included. */
export function buildEmailBody(contactName: string, whatToSay: string): string {
  const first = contactFirstName(contactName);
  const greeting = first ? `Hi ${first},` : 'Hi,';
  const what = whatToSay.trim();
  if (!what) return `${greeting}\n\nCheers,\nJosh`;
  return `${greeting}\n\n${what}\n\nCheers,\nJosh`;
}

export function makeDraft(input: {
  to: string;
  contactName: string;
  whatToSay: string;
  subject: string;
  toneNote?: string;
  toneIsDefault?: boolean;
}): EmailDraft {
  const to = input.to.trim();
  const whatToSay = input.whatToSay.trim();
  const subject = input.subject.trim() || 'Following up';
  const warnings: string[] = [];
  if (!to) warnings.push('No email address');
  if (!whatToSay) warnings.push('No brief');
  return {
    to,
    subject,
    body: buildEmailBody(input.contactName, whatToSay),
    missingEmail: !to,
    missingBrief: !whatToSay,
    warnings,
    toneNote: (input.toneNote ?? '').trim(),
    toneIsDefault: !!input.toneIsDefault && !!(input.toneNote ?? '').trim(),
  };
}

/** `what` is the resolved briefWhat. `how` is briefHow, or the default style when that was blank. */
export function draftFromBrief(brief: Pick<ResolvedBrief, 'contactName' | 'contactEmail' | 'what' | 'how' | 'howIsDefault'>, subject: string): EmailDraft {
  return makeDraft({
    to: brief.contactEmail,
    contactName: brief.contactName,
    whatToSay: brief.what,
    subject,
    toneNote: brief.how,
    toneIsDefault: brief.howIsDefault,
  });
}

export function salesloftClipboard(parts: ComposeParts): string {
  return `Subject: ${parts.subject}\n\n${parts.body}`;
}

export function outlookWebUrl(parts: ComposeParts, maxLength = MAX_COMPOSE_URL_LENGTH): string {
  return fitComposeUrl(OUTLOOK_COMPOSE_BASE, parts, maxLength, true);
}

export function mailtoUrl(parts: ComposeParts, maxLength = MAX_COMPOSE_URL_LENGTH): string {
  return fitComposeUrl('mailto:', parts, maxLength, false);
}

function fitComposeUrl(base: string, parts: ComposeParts, maxLength: number, includeToParam: boolean): string {
  const build = (subject: string, body: string) => {
    const query = includeToParam
      ? `to=${encodeURIComponent(parts.to)}&subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
      : `subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    const prefix = includeToParam ? `${base}?` : `${base}${encodeURIComponent(parts.to)}?`;
    return prefix + query;
  };

  if (build(parts.subject, parts.body).length <= maxLength) return build(parts.subject, parts.body);

  const fittedBody = fitText(parts.body, (body) => build(parts.subject, body), maxLength);
  if (fittedBody != null) return build(parts.subject, fittedBody);

  const fittedSubject = fitText(parts.subject, (subject) => build(subject, ''), maxLength);
  if (fittedSubject != null) return build(fittedSubject, '');

  const empty = build('', '');
  return empty.length <= maxLength ? empty : includeToParam ? base : `mailto:${encodeURIComponent(parts.to)}`;
}

function fitText(text: string, build: (value: string) => string, maxLength: number): string | null {
  if (build('').length > maxLength) return null;
  let best = '';
  let lo = 0;
  let hi = text.length;
  while (lo <= hi) {
    const mid = Math.floor((lo + hi) / 2);
    const candidate = mid === 0 ? '' : safeTruncate(text, mid);
    if (build(candidate).length <= maxLength) {
      best = candidate;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return best;
}

/** Cut on a space or newline when we can, and never split a surrogate pair. */
export function safeTruncate(text: string, maxLen: number): string {
  if (maxLen <= 0 || text.length === 0) return '';
  if (text.length <= maxLen) return text;
  if (maxLen <= ELLIPSIS.length) return ELLIPSIS.slice(0, maxLen);
  let cut = maxLen - ELLIPSIS.length;
  if (cut > 0) {
    const code = text.charCodeAt(cut - 1);
    if (code >= 0xd800 && code <= 0xdbff) cut -= 1;
  }
  if (cut < 0) cut = 0;
  let slice = text.slice(0, cut);
  const breakAt = Math.max(slice.lastIndexOf('\n'), slice.lastIndexOf(' '));
  if (breakAt >= Math.floor(cut * 0.6)) slice = slice.slice(0, breakAt);
  slice = slice.trimEnd();
  if (slice.length > 0) {
    const tail = slice.charCodeAt(slice.length - 1);
    if (tail >= 0xd800 && tail <= 0xdbff) slice = slice.slice(0, -1);
  }
  return slice + ELLIPSIS;
}
