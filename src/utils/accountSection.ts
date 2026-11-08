import type { AccountSection, AppData, Prospect } from '../types';

/**
 * 2027 Accounts is a classification on the existing prospect record.
 * Only the exact value '2027' leaves Pipeline. Missing / any other value
 * stays in Pipeline, so older JSON is unchanged and nothing is auto-moved.
 */
export function is2027Account(p: { accountSection?: string | null } | null | undefined): boolean {
  return p?.accountSection === '2027';
}

export function prospectsInSection<T extends { accountSection?: string | null }>(
  list: readonly T[],
  section: AccountSection,
): T[] {
  return list.filter((p) => (section === '2027' ? is2027Account(p) : !is2027Account(p)));
}

/**
 * Set classification. Pipeline removes the field so an unclassified account
 * serialises like older saves. Returns the same object when nothing changes.
 */
export function withAccountSection<T extends { accountSection?: AccountSection | string | null }>(
  record: T,
  section: AccountSection,
): T {
  if (section === '2027') {
    if (record.accountSection === '2027') return record;
    return { ...record, accountSection: '2027' };
  }
  if (!Object.prototype.hasOwnProperty.call(record, 'accountSection')) return record;
  const next = { ...record };
  delete next.accountSection;
  return next;
}

/** Move one account between Pipeline and 2027 Accounts. Other collections are untouched. */
export function moveAccountInData(data: AppData, id: string, section: AccountSection, now: string): AppData {
  const cur = data.prospects.find((p) => p.id === id);
  if (!cur) return data;
  const classified = withAccountSection(cur, section);
  if (classified === cur) return data;
  const updated: Prospect = { ...classified, updatedAt: now };
  return {
    ...data,
    prospects: data.prospects.map((p) => (p.id === id ? updated : p)),
  };
}

/**
 * Create or update one prospect. Classification changes only when `accountSection`
 * is present on `input` (the edit form). Other callers leave it alone, so a
 * 2027 account is not silently moved back to Pipeline.
 * The existing id is always kept.
 */
export function mergeProspectWrite(
  existing: Prospect | undefined,
  input: Partial<Prospect> & { company: string },
  now: string,
  newId: string,
): Prospect {
  const touchesSection = Object.prototype.hasOwnProperty.call(input, 'accountSection');
  if (existing) {
    let result: Prospect = {
      ...existing,
      ...input,
      id: existing.id,
      company: input.company.trim(),
      updatedAt: now,
    };
    if (touchesSection) {
      result = withAccountSection(result, input.accountSection === '2027' ? '2027' : 'pipeline');
    }
    return result;
  }
  return {
    id: newId,
    company: input.company.trim(),
    contact: input.contact ?? '',
    temperature: input.temperature ?? 'Cold',
    priority: input.priority ?? 3,
    nextSteps: input.nextSteps ?? '',
    currencyPairs: input.currencyPairs ?? '',
    nextFollowUp: input.nextFollowUp ?? null,
    type: input.type ?? 'Prospect',
    contactEmail: input.contactEmail ?? '',
    contactPhone: input.contactPhone ?? '',
    followUpType: input.followUpType ?? 'email',
    briefWhat: input.briefWhat ?? '',
    briefHow: input.briefHow ?? '',
    isExample: input.isExample,
    createdAt: now,
    updatedAt: now,
    ...(input.documentsSent ? { documentsSent: input.documentsSent } : {}),
    ...(input.accountSection === '2027' ? { accountSection: '2027' as const } : {}),
  };
}
