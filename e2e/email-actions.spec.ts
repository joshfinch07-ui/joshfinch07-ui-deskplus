import { expect, test, type Page } from '@playwright/test';
import { buildEmailBody, outlookWebUrl, salesloftClipboard } from '../src/utils/emailDraft';

const WHAT = 'Send the AUD/USD sheet & confirm 100% of Q4?\nSecond line — "thanks" #today';
const TONE = 'Do not quote a rate';
const SUBJECT = 'Following up — Acme & Co';
const TO = 'jane@acme.test';

function appData() {
  return {
    version: 1 as const,
    prospects: [
      {
        id: 'p-acme',
        company: 'Acme & Co',
        contact: 'Jane Smith',
        contactEmail: TO,
        briefWhat: WHAT,
        briefHow: TONE,
        temperature: 'Warm',
        priority: 4,
        nextSteps: 'SHOULD NOT USE THIS IF BRIEF WHAT SET',
        currencyPairs: 'AUDUSD',
        nextFollowUp: '2020-01-01',
        type: 'Prospect',
        createdAt: '2020-01-01T00:00:00.000Z',
        updatedAt: '2020-01-01T00:00:00.000Z',
      },
      {
        id: 'p-plain',
        company: 'Plain Co',
        contact: 'Alex Kim',
        temperature: 'Cold',
        priority: 2,
        nextSteps: 'Follow up on the options overlay idea',
        currencyPairs: '',
        nextFollowUp: '2099-01-01',
        type: 'Prospect',
        createdAt: '2020-01-01T00:00:00.000Z',
        updatedAt: '2020-01-01T00:00:00.000Z',
      },
    ],
    coldCalls: [
      {
        id: 'c-needs',
        company: 'Northwind',
        contact: 'Sam Lee',
        contactEmail: 'sam@northwind.test',
        status: 'needs-email',
        notes: 'Gatekeeper said email the intro & the one-pager',
        createdAt: '2020-01-01T00:00:00.000Z',
      },
    ],
    meetings: [],
    tasks: [
      {
        id: 't-email',
        title: 'Follow-up email to Acme & Co',
        dueDate: '2020-01-01',
        completed: false,
        kind: 'follow-up-email',
        relatedCompany: 'Acme & Co',
        relatedProspectId: 'p-acme',
        relatedMeetingId: null,
        createdAt: '2020-01-01T00:00:00.000Z',
      },
      {
        id: 't-empty',
        title: 'Confirmation email — Nobody',
        dueDate: '2020-01-01',
        completed: false,
        kind: 'confirmation-email',
        relatedCompany: null,
        relatedProspectId: null,
        relatedMeetingId: null,
        createdAt: '2020-01-01T00:00:00.000Z',
      },
      {
        id: 't-general',
        title: 'Document the Acme file',
        dueDate: '2020-01-01',
        completed: false,
        kind: 'general',
        relatedCompany: null,
        relatedProspectId: null,
        relatedMeetingId: null,
        createdAt: '2020-01-01T00:00:00.000Z',
      },
      {
        id: 't-plain',
        title: 'Follow-up email to Plain Co',
        dueDate: '2020-01-01',
        completed: false,
        kind: 'follow-up-email',
        relatedCompany: 'Plain Co',
        relatedProspectId: 'p-plain',
        relatedMeetingId: null,
        createdAt: '2020-01-01T00:00:00.000Z',
      },
    ],
    tradeIdeas: [],
  };
}

async function boot(page: Page, data: ReturnType<typeof appData> = appData()) {
  await page.addInitScript((payload) => {
    localStorage.setItem('deskplus-v1', JSON.stringify(payload));
    localStorage.removeItem('deskplus-mail-prefs');
    const host = window as Window & { __opened?: string[] };
    host.__opened = [];
    window.open = (url?: string | URL) => {
      host.__opened?.push(String(url ?? ''));
      return null;
    };
  }, data);
  await page.goto('/');
}

async function opened(page: Page): Promise<string[]> {
  return page.evaluate(() => (window as Window & { __opened?: string[] }).__opened ?? []);
}

test('opens an encoded Outlook draft and copies it for Salesloft', async ({ page }) => {
  await boot(page);

  const row = page.locator('.list-item', { hasText: 'Follow-up email to Acme & Co' });
  await row.getByRole('button', { name: 'Email follow-up for Follow-up email to Acme & Co' }).click();
  const pop = page.getByRole('dialog', { name: 'Email follow-up for Follow-up email to Acme & Co' });
  await expect(pop.getByText(`Tone: ${TONE}`)).toBeVisible();
  await expect(pop.getByText('No email address')).toHaveCount(0);

  await pop.getByRole('button', { name: 'Open in Outlook' }).click();
  const body = buildEmailBody('Jane Smith', WHAT);
  const expected = outlookWebUrl({ to: TO, subject: SUBJECT, body });
  await expect.poll(() => opened(page)).toEqual([expected]);
  expect(expected.slice(expected.indexOf('?') + 1)).toBe(
    `to=${encodeURIComponent(TO)}&subject=${encodeURIComponent(SUBJECT)}&body=${encodeURIComponent(body)}`,
  );
  expect(expected).not.toContain(encodeURIComponent(TONE));
  expect(expected).not.toContain('SHOULD NOT USE');

  await pop.getByRole('button', { name: 'Copy for Salesloft' }).click();
  await expect(page.getByText('Copied for Salesloft')).toBeVisible();
  const copied = await page.evaluate(() => navigator.clipboard.readText());
  expect(copied).toBe(salesloftClipboard({ to: TO, subject: SUBJECT, body }));
  expect(copied).toContain('Cheers,\nJosh');
  expect(copied).not.toContain(TONE);

  const stored = await page.evaluate(() => ({
    key: localStorage.getItem('deskplus-v1'),
    prefs: localStorage.getItem('deskplus-mail-prefs'),
  }));
  const parsed = JSON.parse(stored.key ?? '{}') as { version: number };
  expect(parsed.version).toBe(1);
  expect(Object.keys(parsed).sort()).toEqual([
    'coldCalls',
    'meetings',
    'prospects',
    'tasks',
    'tradeIdeas',
    'version',
  ]);
  expect(stored.prefs).toBeNull();
});

test('uses a mailto link when desktop Outlook is selected', async ({ page }) => {
  await boot(page);
  await page.getByRole('radio', { name: 'Desktop Outlook (mailto)' }).check();
  await expect(page.getByRole('radio', { name: 'Outlook on the web' })).not.toBeChecked();

  const row = page.locator('.list-item', { hasText: 'Follow-up email to Acme & Co' });
  await row.getByRole('button', { name: 'Email follow-up for Follow-up email to Acme & Co' }).click();
  await page.getByRole('button', { name: 'Open in Outlook' }).click();
  const [url] = await opened(page);
  expect(url.startsWith('mailto:jane%40acme.test?')).toBe(true);
  expect(url).toContain(encodeURIComponent(SUBJECT));

  const prefs = await page.evaluate(() => localStorage.getItem('deskplus-mail-prefs'));
  expect(prefs).toContain('"mailto"');
  expect(await page.evaluate(() => localStorage.getItem('deskplus-v1'))).toContain('"version":1');
});

test('warns when the email or brief is missing and still opens', async ({ page }) => {
  await boot(page);
  const row = page.locator('.list-item', { hasText: 'Confirmation email — Nobody' });
  const chip = row.getByRole('button', { name: 'Email follow-up for Confirmation email — Nobody' });
  await expect(chip).toHaveAttribute('data-missing-email', 'true');
  await expect(chip).toHaveAttribute('data-missing-brief', 'true');
  await expect(chip).toHaveClass(/warn/);
  await chip.click();
  const pop = page.getByRole('dialog', { name: 'Email follow-up for Confirmation email — Nobody' });
  await expect(pop.getByText('No email address')).toBeVisible();
  await expect(pop.getByText('No brief')).toBeVisible();
  await pop.getByRole('button', { name: 'Open in Outlook' }).click();
  const [url] = await opened(page);
  expect(url.startsWith('https://outlook.office.com/mail/deeplink/compose?')).toBe(true);
  const params = new URL(url).searchParams;
  expect(params.get('to')).toBe('');
  expect(params.get('subject')).toBe('Confirming our meeting');
  expect(params.get('body')).toBe('Hi,\n\nCheers,\nJosh');

  const general = page.locator('.list-item', { hasText: 'Document the Acme file' });
  await expect(general.getByRole('button', { name: /Email follow-up/ })).toHaveCount(0);
});

test('falls back to next steps and copies a cold-lead intro', async ({ page }) => {
  await boot(page);
  const plain = page.locator('.list-item', { hasText: 'Follow-up email to Plain Co' });
  await plain.getByRole('button', { name: 'Email follow-up for Follow-up email to Plain Co' }).click();
  const plainPop = page.getByRole('dialog', { name: 'Email follow-up for Follow-up email to Plain Co' });
  await expect(plainPop.getByText('No email address')).toBeVisible();
  await expect(plainPop.getByText('No brief')).toHaveCount(0);
  await plainPop.getByRole('button', { name: 'Copy for Salesloft' }).click();
  await expect(page.getByText('Copied for Salesloft')).toBeVisible();
  const plainCopy = await page.evaluate(() => navigator.clipboard.readText());
  expect(plainCopy).toContain('Hi Alex,');
  expect(plainCopy).toContain('Follow up on the options overlay idea');
  expect(plainCopy).toContain('Subject: Following up — Plain Co');

  await page.getByRole('button', { name: 'Tasks', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'Email follow-up for Follow-up email to Plain Co' }),
  ).toBeVisible();
  await expect(page.locator('.list-item', { hasText: 'Document the Acme file' }).getByRole('button', { name: /Email follow-up/ })).toHaveCount(0);

  await page.getByRole('button', { name: 'Cold calls', exact: true }).click();
  const cold = page.locator('.list-item', { hasText: 'Northwind' });
  await cold.getByRole('button', { name: 'Email follow-up for Northwind' }).click();
  await page.getByRole('button', { name: 'Open in Outlook' }).click();
  const [url] = await opened(page);
  const params = new URL(url).searchParams;
  expect(params.get('to')).toBe('sam@northwind.test');
  expect(params.get('subject')).toBe('Introduction — Northwind');
  expect(params.get('body')).toContain('Hi Sam,');
  expect(params.get('body')).toContain('Gatekeeper said email the intro & the one-pager');
  expect(params.get('body')).toContain('Cheers,\nJosh');
});

test('truncates a very long compose URL and copies the full note', async ({ page }) => {
  const tail = 'ENDMARKER';
  const what = `${'Word '.repeat(4000)}${tail}`;
  const data = appData();
  const prospect = data.prospects[0] as { briefWhat: string; briefHow: string; nextSteps: string };
  prospect.briefWhat = what;
  prospect.briefHow = '';
  prospect.nextSteps = '';
  await boot(page, data);

  const row = page.locator('.list-item', { hasText: 'Follow-up email to Acme & Co' });
  await row.getByRole('button', { name: 'Email follow-up for Follow-up email to Acme & Co' }).click();
  await page.getByRole('button', { name: 'Copy for Salesloft' }).click();
  const copied = await page.evaluate(() => navigator.clipboard.readText());
  expect(copied).toContain(tail);
  expect(copied).toContain('Cheers,\nJosh');

  await page.getByRole('button', { name: 'Open in Outlook' }).click();
  const [url] = await opened(page);
  expect(url.length).toBeLessThanOrEqual(7500);
  expect(url.startsWith('https://outlook.office.com/mail/deeplink/compose?')).toBe(true);
  const decoded = new URL(url).searchParams.get('body') ?? '';
  expect(decoded.startsWith('Hi Jane,')).toBe(true);
  expect(decoded.endsWith('\u2026')).toBe(true);
  expect(decoded).not.toContain(tail);
  expect(url).not.toMatch(/\s/);
});
