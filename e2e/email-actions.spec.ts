import { expect, test, type Page } from '@playwright/test';
import { emailSubject, makeDraft, salesloftClipboard } from '../src/utils/emailDraft';

const TONE = 'Do not quote a rate';
const DEFAULT_STYLE = 'DEFAULT STYLE SHOULD NOT APPEAR';
const WHAT = 'Rate & timing?\nSee "sheet" — #Q4';

function baseData() {
  return {
    version: 1,
    schemaRev: 4,
    updatedAt: '2026-01-01T00:00:00.000Z',
    settings: {
      defaultEmailStyle: DEFAULT_STYLE,
      followUpGapDays: 3,
      defaultCadence: { steps: [2, 3, 5], maxAttempts: 5 },
    },
    prospects: [] as Record<string, unknown>[],
    coldCalls: [],
    coldLeads: [] as Record<string, unknown>[],
    meetings: [],
    tasks: [] as Record<string, unknown>[],
    tradeIdeas: [],
    proposals: [] as Record<string, unknown>[],
    simulations: [] as Record<string, unknown>[],
  };
}

function prospect(extra: Record<string, unknown>) {
  return {
    id: 'p1',
    company: 'Acme',
    contact: 'Jane Smith',
    contactEmail: 'jane@acme.test',
    contactPhone: '0400000000',
    temperature: 'Warm',
    priority: 3,
    nextSteps: '',
    currencyPairs: '',
    nextFollowUp: null,
    type: 'Prospect',
    followUpType: 'email',
    briefWhat: 'Hub points only',
    briefHow: TONE,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...extra,
  };
}

async function openApp(page: Page, data: unknown) {
  await page.addInitScript((payload) => {
    localStorage.setItem('deskplus-v2', JSON.stringify(payload));
    const opened: string[] = [];
    (window as unknown as { __opened: string[] }).__opened = opened;
    window.open = (url?: string | URL) => {
      opened.push(String(url ?? ''));
      return null;
    };
  }, data);
  await page.goto('/');
}

function openedUrls(page: Page) {
  return page.evaluate(() => (window as unknown as { __opened: string[] }).__opened);
}

test('Today opens an encoded Outlook draft and copies the full Salesloft text', async ({ page }) => {
  const data = baseData();
  data.prospects.push(prospect({}));
  data.tasks.push({
    id: 't1',
    title: 'Follow up Acme',
    kind: 'follow-up-email',
    dueDate: '2020-01-01',
    completed: false,
    relatedCompany: 'Acme',
    relatedProspectId: 'p1',
    relatedMeetingId: null,
    briefWhat: WHAT,
    briefHow: TONE,
    createdAt: '2026-01-01T00:00:00.000Z',
  });
  await openApp(page, data);

  const draft = makeDraft({
    to: 'jane@acme.test',
    contactName: 'Jane Smith',
    whatToSay: WHAT,
    subject: emailSubject('Acme', 'follow-up'),
    toneNote: TONE,
  });

  await page.getByRole('button', { name: 'Open in Outlook for Acme', exact: true }).click();
  const [url] = await openedUrls(page);
  const query = url.slice(url.indexOf('?') + 1);
  expect(query).toBe(
    `to=${encodeURIComponent(draft.to)}&subject=${encodeURIComponent(draft.subject)}&body=${encodeURIComponent(draft.body)}`,
  );
  expect(url).not.toContain(TONE);
  expect(url).not.toContain(DEFAULT_STYLE);
  expect(url).not.toContain('+');

  await page.getByRole('button', { name: 'Copy for Salesloft for Acme', exact: true }).click();
  await expect(page.getByRole('status')).toHaveText('Copied for Salesloft');
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(salesloftClipboard(draft));

  const stored = await page.evaluate(() => ({
    raw: localStorage.getItem('deskplus-v2'),
    v1: localStorage.getItem('deskplus-v1'),
    backup: localStorage.getItem('deskplus-v2-pre-rev4-backup'),
  }));
  const saved = JSON.parse(stored.raw ?? '{}') as { version: number; schemaRev: number; tasks: { briefWhat: string }[] };
  expect(saved.version).toBe(1);
  expect(saved.schemaRev).toBe(4);
  expect(saved.tasks[0].briefWhat).toBe(WHAT);
  expect(stored.v1).toBeNull();
  expect(stored.backup).toBeNull();
});

test('Settings can switch Open in Outlook to mailto without touching deskplus-v2', async ({ page }) => {
  const data = baseData();
  data.prospects.push(prospect({ nextFollowUp: '2020-01-01', briefWhat: WHAT }));
  await openApp(page, data);
  const before = await page.evaluate(() => localStorage.getItem('deskplus-v2'));

  await page.getByRole('button', { name: /Settings/ }).click();
  await page.getByRole('radio', { name: 'Desktop Outlook (mailto)' }).check();
  await page.getByRole('dialog', { name: /Settings/ }).getByRole('button', { name: 'Done', exact: true }).click();

  await page.getByRole('button', { name: 'Open in Outlook for Acme', exact: true }).click();
  const [url] = await openedUrls(page);
  expect(url.startsWith('mailto:jane%40acme.test?')).toBe(true);
  expect(url).toContain(`subject=${encodeURIComponent(emailSubject('Acme', 'follow-up'))}`);
  expect(url).not.toContain(TONE);
  expect(url).not.toContain(DEFAULT_STYLE);
  expect(await page.evaluate(() => localStorage.getItem('deskplus-mail-prefs'))).toContain('"mailto"');
  const after = JSON.parse((await page.evaluate(() => localStorage.getItem('deskplus-v2'))) ?? '{}') as {
    schemaRev: number;
    version: number;
  };
  expect(after.schemaRev).toBe(4);
  expect(after.version).toBe(1);
  expect(JSON.parse(before ?? '{}').schemaRev).toBe(4);
});

test('a follow-up with no email and no brief still opens, with the warning state', async ({ page }) => {
  const data = baseData();
  data.tasks.push({
    id: 't-confirm',
    title: 'Confirm meeting',
    kind: 'confirmation-email',
    dueDate: '2020-01-01',
    completed: false,
    relatedCompany: null,
    relatedProspectId: null,
    relatedMeetingId: null,
    createdAt: '2026-01-01T00:00:00.000Z',
  });
  await openApp(page, data);
  const button = page.getByRole('button', { name: 'Open in Outlook for Confirm meeting', exact: true });
  await expect(button).toHaveAttribute('data-missing-email', 'true');
  await expect(button).toHaveAttribute('data-missing-brief', 'true');
  await expect(button).toHaveClass(/warn/);
  await button.click();
  const [url] = await openedUrls(page);
  const params = new URL(url).searchParams;
  expect(params.get('to')).toBe('');
  expect(params.get('subject')).toBe('Confirming our meeting');
  expect(params.get('body')).toBe('Hi,\n\nCheers,\nJosh');
  expect(url).not.toContain(DEFAULT_STYLE);
});

test('call follow-ups do not offer Outlook or Salesloft', async ({ page }) => {
  const data = baseData();
  data.tasks.push({
    id: 't-call',
    title: 'Call Acme',
    kind: 'call',
    dueDate: '2020-01-01',
    completed: false,
    relatedCompany: 'Acme',
    relatedProspectId: null,
    relatedMeetingId: null,
    contactPhone: '0400000000',
    briefWhat: 'Ask about USD payables',
    createdAt: '2026-01-01T00:00:00.000Z',
  });
  await openApp(page, data);
  await expect(page.getByRole('button', { name: /Open in Outlook/ })).toHaveCount(0);
  await expect(page.getByRole('button', { name: /Copy for Salesloft/ })).toHaveCount(0);
  await expect(page.getByRole('button', { name: /Call ready/ })).toBeVisible();
});

test('group rows, cold leads, tasks, proposals, sims, and the prospect editor can send', async ({ page }) => {
  const data = baseData();
  data.prospects.push(
    prospect({
      id: 'hub',
      company: 'Grouped Co',
      contact: 'Alex',
      contactEmail: 'alex@grouped.test',
      nextFollowUp: '2020-01-01',
      briefWhat: 'Hub points only',
      briefHow: TONE,
    }),
  );
  data.proposals.push({
    id: 'prop1',
    company: 'Grouped Co',
    prospectId: 'hub',
    dateSent: '2020-01-02',
    pairs: 'AUDUSD',
    volume: '1m',
    proposed: 'Forwards',
    status: 'Sent',
    followUpDate: '2020-01-01',
    followUpType: 'email',
    briefWhat: 'Proposal points only',
    briefHow: 'Proposal tone only',
    createdAt: '2026-01-01T00:00:00.000Z',
  });
  data.coldLeads.push({
    id: 'c1',
    company: 'Northwind',
    contactName: 'Sam',
    contactEmail: 'sam@northwind.test',
    followUpDate: '2020-02-01',
    volumeCurrency: 'USD',
    notes: '',
    status: 'Open',
    followUpType: 'email',
    briefWhat: 'Cold lead points',
    briefHow: 'Cold tone only',
    createdAt: '2026-01-01T00:00:00.000Z',
  });
  data.tasks.push({
    id: 't1',
    title: 'Docs for Northwind',
    kind: 'follow-up-email',
    dueDate: '2020-03-01',
    completed: false,
    relatedCompany: 'Northwind',
    relatedProspectId: null,
    relatedMeetingId: null,
    contactName: 'Sam',
    contactEmail: 'sam@northwind.test',
    briefWhat: 'Task points',
    briefHow: 'Task tone only',
    createdAt: '2026-01-01T00:00:00.000Z',
  });
  data.simulations.push({
    id: 's1',
    company: 'Fabrikam',
    prospectId: null,
    month: '2026-01',
    pair: 'AUDUSD',
    volume: '1m',
    structure: 'Forwards',
    outcome: '',
    status: 'Running',
    sentDate: '2026-01-01',
    followUpDate: '2026-02-01',
    followUpType: 'email',
    contactName: 'Pat',
    contactEmail: 'pat@fabrikam.test',
    briefWhat: 'Sim points',
    briefHow: 'Sim tone only',
    createdAt: '2026-01-01T00:00:00.000Z',
  });
  await openApp(page, data);

  const group = page.locator('[data-group="Grouped Co"]');
  await group.getByRole('button', { name: 'Open in Outlook for Grouped Co', exact: true }).click();
  await group.getByRole('button', { name: 'Open in Outlook for Grouped Co proposal follow-up', exact: true }).click();
  const grouped = await openedUrls(page);
  expect(new URL(grouped[0]).searchParams.get('body')).toContain('Hub points only');
  expect(new URL(grouped[0]).searchParams.get('body')).not.toContain('Proposal points only');
  expect(new URL(grouped[0]).searchParams.get('body')).not.toContain(TONE);
  expect(new URL(grouped[1]).searchParams.get('body')).toContain('Proposal points only');
  expect(new URL(grouped[1]).searchParams.get('subject')).toBe('Following up on the proposal — Grouped Co');
  expect(grouped[1]).not.toContain('Proposal tone only');

  await page.getByRole('button', { name: 'Cold leads', exact: true }).click();
  await page.getByRole('button', { name: 'Open in Outlook for Northwind', exact: true }).click();

  await page.getByRole('button', { name: 'Tasks', exact: true }).click();
  await page.getByRole('button', { name: 'Open in Outlook for Northwind', exact: true }).click();

  await page.getByRole('button', { name: 'Proposals & Sims', exact: true }).click();
  await page.getByRole('button', { name: 'Open in Outlook for Grouped Co', exact: true }).click();
  await page.getByRole('tab', { name: /Live simulations/ }).click();
  await page.getByRole('button', { name: 'Open in Outlook for Fabrikam', exact: true }).click();

  await page.getByRole('button', { name: 'Pipeline', exact: true }).click();
  await page.getByRole('button', { name: /Grouped Co/ }).click();
  await expect(page.getByText('Tone: Do not quote a rate')).toBeVisible();
  await page.getByRole('button', { name: 'Open in Outlook', exact: true }).click();
  await page.getByRole('button', { name: 'Copy for Salesloft', exact: true }).click();
  await expect(page.getByRole('status')).toHaveText('Copied for Salesloft');

  const urls = await openedUrls(page);
  expect(urls.some((url) => url.includes('sam%40northwind.test') && decodeURIComponent(url).includes('Cold lead points'))).toBe(true);
  expect(urls.some((url) => decodeURIComponent(url).includes('Task points'))).toBe(true);
  expect(urls.some((url) => new URL(url).searchParams.get('subject') === 'Following up on the simulation — Fabrikam')).toBe(true);
  const editor = urls.at(-1) ?? '';
  expect(new URL(editor).searchParams.get('body')).toContain('Hub points only');
  expect(editor).not.toContain(TONE);
  expect(editor).not.toContain(DEFAULT_STYLE);

  const saved = JSON.parse((await page.evaluate(() => localStorage.getItem('deskplus-v2'))) ?? '{}') as { schemaRev: number };
  expect(saved.schemaRev).toBe(4);
});

test('a very long brief is shortened in the URL and copied in full', async ({ page }) => {
  const marker = 'ENDMARKER';
  const what = `${'Word '.repeat(4000)}${marker}`;
  const data = baseData();
  data.tasks.push({
    id: 't-long',
    title: 'Long note',
    kind: 'email',
    dueDate: '2020-01-01',
    completed: false,
    relatedCompany: 'Long Co',
    relatedProspectId: null,
    relatedMeetingId: null,
    contactName: 'Jane Smith',
    contactEmail: 'jane@long.test',
    briefWhat: what,
    createdAt: '2026-01-01T00:00:00.000Z',
  });
  await openApp(page, data);
  await page.getByRole('button', { name: 'Open in Outlook for Long Co', exact: true }).click();
  const [url] = await openedUrls(page);
  expect(url.length).toBeLessThanOrEqual(7500);
  expect(url).not.toContain(marker);
  expect(new URL(url).searchParams.get('body')?.endsWith('\u2026')).toBe(true);
  await page.getByRole('button', { name: 'Copy for Salesloft for Long Co', exact: true }).click();
  const clip = await page.evaluate(() => navigator.clipboard.readText());
  expect(clip).toContain(marker);
  expect(clip).toContain('Cheers,\nJosh');
  expect(clip).not.toContain(DEFAULT_STYLE);
});
