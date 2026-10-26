import type { ColdCall, Prospect, Task } from '../types';

/**
 * Outlook / mailto / Salesloft drafts.
 *
 * CRM records are unchanged. When a stored object already has `contactEmail`,
 * `briefWhat`, or `briefHow`, those are read. They are never written or migrated.
 * The customer email is a fixed template: greeting, what-to-say, then
 * "Cheers,\nJosh". `briefHow` is tone guidance for Josh and stays out of the email.
 */

export const OUTLOOK_COMPOSE_BASE = 'https://outlook.office.com/mail/deeplink/compose';

/** Stay under common proxy and Outlook URL limits. */
export const MAX_COMPOSE_URL_LENGTH = 7500;

const EMAIL_KINDS = new Set(['email', 'confirmation-email', 'follow-up-email']);
const EMAIL_PATTERN = '[A-Z0-9._%+-]+@[A-Z0-9.-]+\\.[A-Z]{2,}';
const ELLIPSIS = '\u2026';

export interface ComposeParts {
  to: string;
  subject: string;
  body: string;
}

export interface EmailDraft extends ComposeParts {
  missingEmail: boolean;
  missingBrief: boolean;
  warnings: string[];
  /** Internal note from `briefHow`. Not included in the email. */
  toneNote: string;
}

export function isEmailFollowUp(kind: string): boolean {
  return EMAIL_KINDS.has(kind);
}

export function extractEmail(text: string): string {
  const match = text.match(new RegExp(EMAIL_PATTERN, 'i'));
  return match?.[0] ?? '';
}

export function contactFirstName(contact: string): string {
  const withoutEmail = contact
    .replace(new RegExp(EMAIL_PATTERN, 'gi'), ' ')
    .replace(/[<>(),;]/g, ' ');
  const first = withoutEmail.split(/\s+/).filter(Boolean)[0] ?? '';
  return first.replace(/^[^A-Za-z]+|[^A-Za-z'-]+$/g, '');
}

export function displayCompany(company: string): string {
  return company.replace(/^EXAMPLE\s*·\s*/i, '').trim();
}

export function followUpSubject(
  company: string,
  kind: 'follow-up' | 'confirmation' | 'intro',
): string {
  const name = displayCompany(company);
  if (kind === 'confirmation') {
    return name ? `Confirming our meeting — ${name}` : 'Confirming our meeting';
  }
  if (kind === 'intro') {
    return name ? `Introduction — ${name}` : 'Introduction';
  }
  return name ? `Following up — ${name}` : 'Following up';
}

/** Greeting, what-to-say, then the fixed sign-off. */
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
  };
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

export function optionalField(record: object | null | undefined, key: string): string {
  if (!record) return '';
  const value = (record as Record<string, unknown>)[key];
  return typeof value === 'string' ? value.trim() : '';
}

function pickTo(...candidates: string[]): string {
  for (const candidate of candidates) {
    const found = extractEmail(candidate);
    if (found) return found;
  }
  return '';
}

export function draftForTask(task: Task, prospects: Prospect[]): EmailDraft {
  const linked =
    prospects.find((p) => !!task.relatedProspectId && p.id === task.relatedProspectId) ??
    prospects.find(
      (p) =>
        !!task.relatedCompany &&
        p.company.trim().toLowerCase() === task.relatedCompany.trim().toLowerCase(),
    );
  const company = linked?.company || task.relatedCompany || '';
  const contact = linked?.contact || optionalField(task, 'contact') || '';
  return makeDraft({
    to: pickTo(optionalField(task, 'contactEmail'), optionalField(linked, 'contactEmail'), contact, task.title),
    contactName: contact,
    whatToSay: optionalField(task, 'briefWhat') || optionalField(linked, 'briefWhat') || linked?.nextSteps || '',
    subject: followUpSubject(company, task.kind === 'confirmation-email' ? 'confirmation' : 'follow-up'),
    toneNote: optionalField(task, 'briefHow') || optionalField(linked, 'briefHow'),
  });
}

export function draftForProspect(prospect: Prospect): EmailDraft {
  return makeDraft({
    to: pickTo(optionalField(prospect, 'contactEmail'), prospect.contact),
    contactName: prospect.contact,
    whatToSay: optionalField(prospect, 'briefWhat') || prospect.nextSteps,
    subject: followUpSubject(prospect.company, 'follow-up'),
    toneNote: optionalField(prospect, 'briefHow'),
  });
}

export function draftForColdCall(call: ColdCall): EmailDraft {
  return makeDraft({
    to: pickTo(optionalField(call, 'contactEmail'), call.contact, call.notes),
    contactName: call.contact,
    whatToSay: optionalField(call, 'briefWhat') || call.notes,
    subject: followUpSubject(call.company, 'intro'),
    toneNote: optionalField(call, 'briefHow'),
  });
}

/** Live prospect-form values. A stored contactEmail is used when the contact line has none. */
export function draftForProspectFields(input: {
  company: string;
  contact: string;
  whatToSay: string;
  contactEmail?: string;
  toneNote?: string;
}): EmailDraft {
  return makeDraft({
    to: pickTo(input.contact, input.contactEmail ?? ''),
    contactName: input.contact,
    whatToSay: input.whatToSay,
    subject: followUpSubject(input.company, 'follow-up'),
    toneNote: input.toneNote,
  });
}

/**
 * Percent-encode query values with encodeURIComponent (spaces are %20, not +).
 * Shrinks the body, then the subject, until the URL fits.
 */
function fitComposeUrl(
  base: string,
  parts: ComposeParts,
  maxLength: number,
  includeToParam: boolean,
): string {
  const build = (subject: string, body: string) => {
    const query = includeToParam
      ? `to=${encodeURIComponent(parts.to)}&subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
      : `subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    const prefix = includeToParam ? `${base}?` : `${base}${encodeURIComponent(parts.to)}?`;
    return prefix + query;
  };

  if (build(parts.subject, parts.body).length <= maxLength) {
    return build(parts.subject, parts.body);
  }

  const fittedBody = fitText(parts.body, (body) => build(parts.subject, body), maxLength);
  if (fittedBody != null) return build(parts.subject, fittedBody);

  const fittedSubject = fitText(parts.subject, (subject) => build(subject, ''), maxLength);
  if (fittedSubject != null) return build(fittedSubject, '');

  const empty = build('', '');
  return empty.length <= maxLength ? empty : includeToParam ? base : `mailto:${encodeURIComponent(parts.to)}`;
}

/** Longest safe truncation of `text` for which `build` stays within maxLength. */
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
