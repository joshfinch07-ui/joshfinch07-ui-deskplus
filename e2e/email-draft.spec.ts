import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import {
  buildEmailBody,
  emailSubject,
  makeDraft,
  mailtoUrl,
  outlookWebUrl,
  safeTruncate,
  salesloftClipboard,
  type EmailDraft,
} from '../src/utils/emailDraft';

const WHAT = 'Rate & timing?\nSee "sheet" — #Q4';
const TONE = 'Do not quote a rate';
const DEFAULT_STYLE = 'DEFAULT STYLE SHOULD NOT APPEAR';

function acmeDraft(): EmailDraft {
  return makeDraft({
    to: 'jane@acme.test',
    contactName: 'Jane Smith',
    whatToSay: WHAT,
    subject: emailSubject('Acme', 'follow-up'),
    toneNote: TONE,
    toneIsDefault: false,
  });
}

test('percent-encodes the Outlook compose URL and keeps tone out of the email', () => {
  const draft = acmeDraft();
  expect(draft.body).toBe(`Hi Jane,\n\n${WHAT}\n\nCheers,\nJosh`);
  expect(draft.body).not.toContain(TONE);
  expect(draft.body).not.toContain(DEFAULT_STYLE);

  const url = outlookWebUrl(draft);
  const query = url.slice(url.indexOf('?') + 1);
  expect(url.startsWith('https://outlook.office.com/mail/deeplink/compose?')).toBe(true);
  expect(query).toBe(
    `to=${encodeURIComponent(draft.to)}&subject=${encodeURIComponent(draft.subject)}&body=${encodeURIComponent(draft.body)}`,
  );
  expect(url).not.toMatch(/\s/);
  expect(url).not.toContain('+');
  expect(url).toContain('jane%40acme.test');
  expect(url).toContain('%26');
  expect(url).toContain('%3F');
  expect(url).toContain('%0A');
  expect(url).toContain('%23');
  expect(url).not.toContain(TONE);
  expect(url).not.toContain(DEFAULT_STYLE);

  const clip = salesloftClipboard(draft);
  expect(clip).toBe(`Subject: ${draft.subject}\n\n${draft.body}`);
  expect(clip).not.toContain(TONE);
  expect(clip).not.toContain(DEFAULT_STYLE);
});

test('mailto uses the same encoding and an empty brief still composes', () => {
  const draft = acmeDraft();
  const url = mailtoUrl(draft);
  expect(url.startsWith(`mailto:${encodeURIComponent(draft.to)}?`)).toBe(true);
  expect(url).toContain(`subject=${encodeURIComponent(draft.subject)}`);
  expect(url).toContain(`body=${encodeURIComponent(draft.body)}`);
  expect(url).not.toContain('+');
  expect(url).not.toContain(TONE);

  const empty = makeDraft({ to: '', contactName: '', whatToSay: '', subject: 'Following up' });
  expect(empty.body).toBe('Hi,\n\nCheers,\nJosh');
  expect(empty.warnings).toEqual(['No email address', 'No brief']);
  const emptyUrl = outlookWebUrl(empty);
  expect(emptyUrl).toContain('to=&subject=');
  expect(new URL(emptyUrl).searchParams.get('body')).toBe('Hi,\n\nCheers,\nJosh');
});

test('subjects stay short when the company name is blank', () => {
  expect(emailSubject('', 'follow-up')).toBe('Following up');
  expect(emailSubject('', 'confirmation')).toBe('Confirming our meeting');
  expect(emailSubject('Acme', 'proposal')).toBe('Following up on the proposal — Acme');
  expect(emailSubject('Acme', 'sim')).toBe('Following up on the simulation — Acme');
  expect(emailSubject('EXAMPLE · Acme')).toBe('Following up — Acme');
  expect(buildEmailBody('Jane Smith', WHAT).startsWith('Hi Jane,')).toBe(true);
});

test('long bodies and emoji are truncated inside the URL and left whole on the clipboard', () => {
  const marker = 'ENDMARKER';
  const long = makeDraft({
    to: 'jane@acme.test',
    contactName: 'Jane Smith',
    whatToSay: `${'Word '.repeat(4000)}${marker}`,
    subject: 'Following up — Acme',
  });
  const url = outlookWebUrl(long);
  expect(url.length).toBeLessThanOrEqual(7500);
  expect(url).not.toContain(marker);
  const body = new URL(url).searchParams.get('body') ?? '';
  expect(body.startsWith('Hi Jane,')).toBe(true);
  expect(body.endsWith('\u2026')).toBe(true);
  expect(body).not.toContain(marker);
  expect(salesloftClipboard(long)).toContain(marker);
  expect(salesloftClipboard(long)).toContain('Cheers,\nJosh');

  const emoji = makeDraft({
    to: 'jane@acme.test',
    contactName: '',
    whatToSay: '\u{1F600}'.repeat(6000),
    subject: 'Following up',
  });
  const emojiUrl = outlookWebUrl(emoji);
  expect(emojiUrl.length).toBeLessThanOrEqual(7500);
  const emojiBody = new URL(emojiUrl).searchParams.get('body') ?? '';
  expect(emojiBody.startsWith('Hi,')).toBe(true);
  expect(emojiBody.endsWith('\u2026')).toBe(true);
  for (let i = 0; i < emojiBody.length; i += 1) {
    const code = emojiBody.charCodeAt(i);
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = emojiBody.charCodeAt(i + 1);
      expect(next).toBeGreaterThanOrEqual(0xdc00);
      expect(next).toBeLessThanOrEqual(0xdfff);
      i += 1;
    } else {
      expect(code < 0xdc00 || code > 0xdfff).toBe(true);
    }
  }
  expect(safeTruncate('abc', 0)).toBe('');
});

test('the content security policy still allows GitHub sync and does not allow Outlook fetches', () => {
  const headers = readFileSync(new URL('../public/_headers', import.meta.url), 'utf8');
  expect(headers).toContain("connect-src 'self' https://api.github.com");
  expect(headers).not.toContain('outlook.office.com');
  expect(headers).toContain("form-action 'none'");
  expect(headers).toContain("default-src 'self'");
});
