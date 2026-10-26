import { expect, test } from '@playwright/test';
import {
  MAX_COMPOSE_URL_LENGTH,
  buildEmailBody,
  mailtoUrl,
  outlookWebUrl,
  salesloftClipboard,
} from '../src/utils/emailDraft';

const WHAT = 'Send the AUD/USD sheet & confirm 100% of Q4?\nSecond line — "thanks" #today';
const SUBJECT = 'Following up — Acme & Co';
const TO = 'jane@acme.test';

test('outlook deeplink percent-encodes to, subject, and body', () => {
  const body = buildEmailBody('Jane Smith', WHAT);
  expect(body).toBe(`Hi Jane,\n\n${WHAT}\n\nCheers,\nJosh`);

  const url = outlookWebUrl({ to: TO, subject: SUBJECT, body });
  expect(url.startsWith('https://outlook.office.com/mail/deeplink/compose?')).toBe(true);
  expect(url.slice(url.indexOf('?') + 1)).toBe(
    `to=${encodeURIComponent(TO)}&subject=${encodeURIComponent(SUBJECT)}&body=${encodeURIComponent(body)}`,
  );
  expect(url).not.toMatch(/\s/);
  expect(url).not.toContain('+');
  expect(url).toContain('jane%40acme.test');
  expect(url).toContain('%26');
  expect(url).toContain('%0A');
  expect(url).toContain('%23');
  expect(new URL(url).searchParams.get('body')).toBe(body);
  expect(url.length).toBeLessThanOrEqual(MAX_COMPOSE_URL_LENGTH);
});

test('mailto fallback uses the same encoded subject and body', () => {
  const body = buildEmailBody('Jane Smith', WHAT);
  const url = mailtoUrl({ to: TO, subject: SUBJECT, body });
  expect(url.startsWith('mailto:jane%40acme.test?')).toBe(true);
  expect(url.slice(url.indexOf('?') + 1)).toBe(
    `subject=${encodeURIComponent(SUBJECT)}&body=${encodeURIComponent(body)}`,
  );
  expect(salesloftClipboard({ to: TO, subject: SUBJECT, body })).toBe(`Subject: ${SUBJECT}\n\n${body}`);
});

test('a very long body is truncated on a safe boundary and still encodes', () => {
  const tail = 'ENDMARKER';
  const what = `${'Word '.repeat(4000)}${tail}`;
  const body = buildEmailBody('Jane Smith', what);
  const url = outlookWebUrl({ to: TO, subject: SUBJECT, body });
  expect(url.length).toBeLessThanOrEqual(MAX_COMPOSE_URL_LENGTH);
  expect(url).not.toContain(tail);

  const decoded = new URL(url).searchParams.get('body') ?? '';
  expect(decoded.startsWith('Hi Jane,')).toBe(true);
  expect(decoded.endsWith('\u2026')).toBe(true);
  expect(decoded).not.toContain(tail);
  expect(() => encodeURIComponent(decoded)).not.toThrow();

  const emojiBody = buildEmailBody('Jane', `\u{1F600}`.repeat(6000));
  const emojiUrl = outlookWebUrl({ to: TO, subject: 'Hi', body: emojiBody });
  expect(emojiUrl.length).toBeLessThanOrEqual(MAX_COMPOSE_URL_LENGTH);
  const emojiDecoded = new URL(emojiUrl).searchParams.get('body') ?? '';
  expect(() => encodeURIComponent(emojiDecoded)).not.toThrow();
  expect(emojiDecoded.includes('\uFFFD')).toBe(false);
});

test('missing email and brief still produce a usable draft', () => {
  const body = buildEmailBody('', '');
  expect(body).toBe('Hi,\n\nCheers,\nJosh');
  const url = outlookWebUrl({ to: '', subject: 'Confirming our meeting', body });
  expect(url).toContain('to=&subject=');
  expect(new URL(url).searchParams.get('to')).toBe('');
  expect(new URL(url).searchParams.get('body')).toBe(body);
});
