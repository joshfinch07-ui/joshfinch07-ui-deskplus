import { describe, expect, it } from 'vitest';
import { createExampleSeed } from '../src/data/seed';
import { applyMerge } from '../src/store/merge';
import { normalizeData } from '../src/store/migrate';
import { readDeskPlusPayload } from '../src/sync/github';
import type { AppData, Meeting, Prospect } from '../src/types';
import {
  is2027Account,
  mergeProspectWrite,
  moveAccountInData,
  prospectsInSection,
  withAccountSection,
} from '../src/utils/accountSection';

const NOW = '2026-11-08T00:00:00.000Z';

function prospect(partial: Partial<Prospect> & Pick<Prospect, 'id' | 'company'>): Prospect {
  return {
    contact: 'Ada Lovelace',
    temperature: 'Warm',
    priority: 4,
    nextSteps: 'Send onboarding pack',
    currencyPairs: 'AUDUSD',
    nextFollowUp: '2026-11-10',
    type: 'Prospect',
    contactEmail: 'ada@example.com',
    contactPhone: '0400000000',
    followUpType: 'email',
    briefWhat: 'Cover the 2027 start date',
    briefHow: 'Short and plain',
    activityLog: [
      {
        id: 'act-1',
        date: '2026-11-01',
        at: '2026-11-01T01:00:00.000Z',
        type: 'email',
        what: 'Intro',
      },
    ],
    documentsSent: { date: '2026-11-02', docs: ['KYC'], sentBy: 'Queeny' },
    createdAt: '2026-10-01T00:00:00.000Z',
    updatedAt: '2026-11-01T00:00:00.000Z',
    ...partial,
  };
}

function meeting(partial: Partial<Meeting> & Pick<Meeting, 'id' | 'company'>): Meeting {
  return {
    contact: 'Ada Lovelace',
    prospectId: null,
    meetingDate: '2026-12-01',
    meetingTime: '10:00',
    timezone: 'Australia/Sydney',
    outcome: null,
    sufficient: null,
    rating: null,
    currencies: 'AUDUSD',
    fxVolume: '',
    notes: 'Booked, not sat',
    nextFollowUp: null,
    temperature: null,
    createdAt: NOW,
    bookedAt: NOW,
    bookedBy: 'Daniel',
    bookedByName: 'Daniel',
    ...partial,
  };
}

describe('2027 account classification', () => {
  it('starts empty: older JSON and example seed are not classified', () => {
    const old = normalizeData({
      version: 1,
      prospects: [prospect({ id: 'p1', company: 'Real Co' })],
      coldLeads: [
        {
          id: 'c1',
          company: 'Cold Co',
          notes: 'refer back',
          status: 'Open',
          followUpDate: '2026-11-08',
          volumeCurrency: 'AUD',
          contactEmail: 'cold@example.com',
          briefWhat: 'morning draft',
          createdAt: NOW,
        },
      ],
      meetings: [meeting({ id: 'm-booked', company: 'Real Co', prospectId: 'p1', outcome: null })],
      tasks: [],
      settings: { defaultEmailStyle: 'Friendly, short.' },
    });

    expect(old.prospects.every((p) => !('accountSection' in p))).toBe(true);
    expect(prospectsInSection(old.prospects, '2027')).toEqual([]);
    expect(prospectsInSection(old.prospects, 'pipeline').map((p) => p.id)).toEqual(['p1']);
    expect(old.prospects[0].briefWhat).toBe('Cover the 2027 start date');
    expect(old.prospects[0].documentsSent?.sentBy).toBe('Queeny');
    expect(old.coldLeads[0].notes).toBe('refer back');
    expect(old.coldLeads[0].briefWhat).toBe('morning draft');
    expect(old.meetings[0].outcome).toBeNull();
    expect(old.meetings[0].bookedBy).toBe('Daniel');
    expect(old.settings?.defaultEmailStyle).toBe('Friendly, short.');
    expect(JSON.stringify(old)).not.toContain('accountSection');

    const seed = createExampleSeed();
    expect(seed.prospects.length).toBeGreaterThan(0);
    expect(prospectsInSection(seed.prospects, '2027')).toEqual([]);
  });

  it('moves an account in place and back without dropping fields, ids, or links', () => {
    const original = prospect({ id: 'p1', company: 'Harbour FX' });
    const data = normalizeData({
      version: 1,
      prospects: [original, prospect({ id: 'p2', company: 'Stay Put', contact: 'Other' })],
      meetings: [meeting({ id: 'm1', company: 'Harbour FX', prospectId: 'p1' })],
      tasks: [
        {
          id: 't1',
          title: 'Follow-up — Harbour FX',
          dueDate: '2026-11-10',
          completed: false,
          kind: 'follow-up-email',
          relatedCompany: 'Harbour FX',
          relatedProspectId: 'p1',
          relatedMeetingId: 'm1',
          briefWhat: 'Chase the pack',
          createdAt: NOW,
        },
      ],
      coldLeads: [],
      proposals: [],
      simulations: [],
    });

    const moved = moveAccountInData(data, 'p1', '2027', NOW);
    expect(moved).not.toBe(data);
    expect(moved.prospects).toHaveLength(data.prospects.length);
    expect(new Set(moved.prospects.map((p) => p.id)).size).toBe(moved.prospects.length);
    const harbour = moved.prospects.find((p) => p.id === 'p1')!;
    expect(harbour.accountSection).toBe('2027');
    expect(harbour.contact).toBe(original.contact);
    expect(harbour.nextSteps).toBe(original.nextSteps);
    expect(harbour.nextFollowUp).toBe(original.nextFollowUp);
    expect(harbour.contactEmail).toBe(original.contactEmail);
    expect(harbour.briefWhat).toBe(original.briefWhat);
    expect(harbour.briefHow).toBe(original.briefHow);
    expect(harbour.activityLog).toEqual(original.activityLog);
    expect(harbour.documentsSent).toEqual(original.documentsSent);
    expect(prospectsInSection(moved.prospects, 'pipeline').map((p) => p.id)).toEqual(['p2']);
    expect(prospectsInSection(moved.prospects, '2027').map((p) => p.id)).toEqual(['p1']);
    // Other collections are the same arrays — meeting and task links are not rewritten.
    expect(moved.meetings).toBe(data.meetings);
    expect(moved.tasks).toBe(data.tasks);
    expect(moved.coldLeads).toBe(data.coldLeads);
    expect(moved.meetings[0].prospectId).toBe('p1');
    expect(moved.tasks[0].relatedProspectId).toBe('p1');
    expect(moved.tasks[0].briefWhat).toBe('Chase the pack');

    const again = moveAccountInData(moved, 'p1', '2027', '2026-11-08T01:00:00.000Z');
    expect(again).toBe(moved);

    const back = moveAccountInData(moved, 'p1', 'pipeline', '2026-11-08T02:00:00.000Z');
    const restored = back.prospects.find((p) => p.id === 'p1')!;
    expect('accountSection' in restored).toBe(false);
    expect(is2027Account(restored)).toBe(false);
    expect(restored.contact).toBe('Ada Lovelace');
    expect(restored.nextSteps).toBe('Send onboarding pack');
    expect(restored.activityLog?.[0].id).toBe('act-1');
    expect(back.meetings[0].prospectId).toBe('p1');
    expect(prospectsInSection(back.prospects, '2027')).toEqual([]);
    expect(JSON.stringify(restored)).not.toContain('accountSection');
    expect(moveAccountInData(back, 'missing', '2027', NOW)).toBe(back);
  });

  it('only classifies when the edit form sends accountSection', () => {
    const created = mergeProspectWrite(undefined, { company: '  New Pipe  ', contact: 'Jo' }, NOW, 'new-1');
    expect(created.id).toBe('new-1');
    expect(created.company).toBe('New Pipe');
    expect('accountSection' in created).toBe(false);

    const created2027 = mergeProspectWrite(
      undefined,
      {
        company: 'Future Co',
        contact: 'Sam',
        nextSteps: 'Sign in 2027',
        accountSection: '2027',
        documentsSent: { date: '2026-11-03', docs: ['Application'] },
      },
      NOW,
      'new-2',
    );
    expect(created2027.accountSection).toBe('2027');
    expect(created2027.documentsSent?.docs).toEqual(['Application']);
    expect(created2027.contact).toBe('Sam');

    // A caller that does not mention classification (proposal "create prospect", log call) must not clear it.
    const kept = mergeProspectWrite(created2027, { company: 'Future Co', temperature: 'Hot' }, NOW, 'ignored');
    expect(kept.id).toBe('new-2');
    expect(kept.accountSection).toBe('2027');
    expect(kept.temperature).toBe('Hot');
    expect(kept.contact).toBe('Sam');
    expect(kept.nextSteps).toBe('Sign in 2027');

    const cleared = mergeProspectWrite(
      created2027,
      { company: 'Future Co', accountSection: undefined },
      NOW,
      'ignored',
    );
    expect(cleared.id).toBe('new-2');
    expect('accountSection' in cleared).toBe(false);
    expect(cleared.documentsSent).toEqual(created2027.documentsSent);
  });

  it('treats anything other than the exact 2027 value as Pipeline', () => {
    expect(is2027Account(undefined)).toBe(false);
    expect(is2027Account({})).toBe(false);
    expect(is2027Account({ accountSection: 'pipeline' })).toBe(false);
    expect(is2027Account({ accountSection: '2028' })).toBe(false);
    expect(is2027Account({ accountSection: '' })).toBe(false);
    const odd = prospect({ id: 'x', company: 'Odd', accountSection: 'pipeline' });
    expect(prospectsInSection([odd], 'pipeline').map((p) => p.id)).toEqual(['x']);
    expect(withAccountSection(odd, 'pipeline')).not.toHaveProperty('accountSection');
    expect(withAccountSection(prospect({ id: 'y', company: 'Y' }), '2027').accountSection).toBe('2027');
  });

  it('round-trips classification through export JSON, import normalize, and cloud payloads', () => {
    const data = moveAccountInData(
      normalizeData({
        version: 1,
        prospects: [prospect({ id: 'p1', company: 'Harbour FX' }), prospect({ id: 'p2', company: 'Stay Put' })],
        meetings: [meeting({ id: 'm1', company: 'Harbour FX', prospectId: 'p1', outcome: null })],
        coldLeads: [],
      }),
      'p1',
      '2027',
      NOW,
    );

    const exported = JSON.stringify(data);
    const imported = normalizeData(JSON.parse(exported) as AppData);
    expect(imported.prospects.find((p) => p.id === 'p1')?.accountSection).toBe('2027');
    expect(imported.prospects.find((p) => p.id === 'p2')?.accountSection).toBeUndefined();
    expect(imported.meetings[0].prospectId).toBe('p1');
    expect(imported.meetings[0].outcome).toBeNull();
    expect(imported.prospects.find((p) => p.id === 'p1')?.briefWhat).toBe('Cover the 2027 start date');
    expect(prospectsInSection(imported.prospects, 'pipeline').map((p) => p.company)).toEqual(['Stay Put']);

    const envelope = {
      app: 'deskplus',
      format: 1,
      pushedAt: NOW,
      device: 'test-browser',
      data: imported,
    };
    const fromCloud = readDeskPlusPayload(JSON.parse(JSON.stringify(envelope)));
    expect(fromCloud).not.toBeNull();
    const cloudNorm = normalizeData(fromCloud!);
    expect(cloudNorm.prospects.find((p) => p.id === 'p1')?.accountSection).toBe('2027');
    expect(cloudNorm.meetings[0].bookedBy).toBe('Daniel');

    const bare = readDeskPlusPayload(JSON.parse(exported));
    expect(bare?.prospects.find((p) => p.id === 'p1')?.accountSection).toBe('2027');

    expect(readDeskPlusPayload({ note: 'not deskplus' })).toBeNull();
    expect(readDeskPlusPayload(null)).toBeNull();
    expect(readDeskPlusPayload({ app: 'deskplus' })).toBeNull();
  });

  it('keeps classification when merging duplicates and does not fork the id', () => {
    const primary = prospect({ id: 'a', company: 'Acme', accountSection: '2027', contact: 'Ada' });
    const other = prospect({
      id: 'b',
      company: 'Acme Pty Ltd',
      contact: '',
      nextSteps: 'pipeline copy',
      accountSection: undefined,
    });
    const data = normalizeData({
      version: 1,
      prospects: [primary, other],
      meetings: [meeting({ id: 'm1', company: 'Acme Pty Ltd', prospectId: 'b' })],
      coldLeads: [],
    });
    const { next } = applyMerge(
      data,
      { coll: 'prospects', id: 'a', company: 'Acme' },
      [
        { coll: 'prospects', id: 'a', company: 'Acme' },
        { coll: 'prospects', id: 'b', company: 'Acme Pty Ltd' },
      ],
      NOW,
    );
    expect(next.prospects.map((p) => p.id)).toEqual(['a']);
    expect(next.prospects[0].accountSection).toBe('2027');
    expect(next.prospects[0].contact).toBe('Ada');
    expect(next.prospects[0].nextSteps).toContain('Send onboarding pack');
    expect(next.prospects[0].nextSteps).toContain('pipeline copy');
    expect(next.meetings[0].prospectId).toBe('a');
    expect(next.prospects[0].mergedFrom?.some((m) => (m.record as { id?: string }).id === 'b')).toBe(true);
  });
});
