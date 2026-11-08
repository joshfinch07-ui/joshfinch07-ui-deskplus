import { useState } from 'react';
import type { AccountSection, Priority, Prospect, ProspectType, Temperature } from '../types';
import { is2027Account } from '../utils/accountSection';
import { Modal } from './Modal';
import { HubLinks } from './HubLinks';
import { nearProspects, prospectByName } from '../utils/company';
import { SegControl } from './SegControl';
import { DateInput } from './DateInput';
import { useStore } from '../store/StoreContext';
import { EmailBriefFields, TypeToggle, type BriefValue } from './EmailBrief';
import { FollowUpMeeting, prefillFor } from './FollowUpMeeting';
import { useNav } from '../nav';

const TEMPS: Temperature[] = ['Cold', 'Warm', 'Hot'];
const PRIOS: Priority[] = [1, 2, 3, 4, 5];
const TYPES: ProspectType[] = ['Prospect', 'Existing client'];

export function ProspectForm({
  initial,
  defaultSection = 'pipeline',
  onClose,
  onSaved,
  onOpenOther,
}: {
  initial?: Prospect | null;
  /** Classification for a new account. Ignored when editing. */
  defaultSection?: AccountSection;
  onClose: () => void;
  onSaved?: (p: Prospect) => void;
  /** Switch the form to another (possibly duplicate) prospect. */
  onOpenOther?: (id: string) => void;
}) {
  const { data, upsertProspect, deleteProspect, logCall, logEmail } = useStore();
  const { book } = useNav();
  const [company, setCompany] = useState(initial?.company ?? '');
  const [section, setSection] = useState<AccountSection>(
    initial ? (is2027Account(initial) ? '2027' : 'pipeline') : defaultSection,
  );
  const [contact, setContact] = useState(initial?.contact ?? '');
  const [temperature, setTemperature] = useState<Temperature>(initial?.temperature ?? 'Cold');
  const [priority, setPriority] = useState<Priority>(initial?.priority ?? 3);
  const [nextSteps, setNextSteps] = useState(initial?.nextSteps ?? '');
  const [currencyPairs, setCurrencyPairs] = useState(initial?.currencyPairs ?? '');
  const [nextFollowUp, setNextFollowUp] = useState(initial?.nextFollowUp ?? '');
  const [type, setType] = useState<ProspectType>(initial?.type ?? 'Prospect');
  const [docsDate, setDocsDate] = useState(initial?.documentsSent?.date ?? '');
  const [docsList, setDocsList] = useState((initial?.documentsSent?.docs ?? []).join('\n'));
  const [docsBy, setDocsBy] = useState(initial?.documentsSent?.sentBy ?? '');
  const hadDocs = !!initial?.documentsSent?.date;
  /** Documents sent → P5 + Hot (once, when first marked; still editable by hand). */
  const markDocs = (date: string) => {
    setDocsDate(date);
    if (date && !hadDocs && !docsDate) {
      setPriority(5);
      setTemperature('Hot');
    }
  };
  const [brief, setBrief] = useState<BriefValue>({
    followUpType: initial?.followUpType ?? 'email',
    contactPhone: initial?.contactPhone ?? '',
    contactEmail: initial?.contactEmail ?? '',
    briefWhat: initial?.briefWhat ?? '',
    briefHow: initial?.briefHow ?? '',
  });

  const save = (keepOpen = false): Prospect | undefined => {
    if (!company.trim()) return undefined;
    const p = upsertProspect({
      id: initial?.id,
      company: company.trim(),
      contact: contact.trim(),
      temperature,
      priority,
      nextSteps,
      currencyPairs,
      nextFollowUp: nextFollowUp || null,
      type,
      accountSection: section === '2027' ? '2027' : undefined,
      contactEmail: (brief.contactEmail ?? '').trim(),
      contactPhone: (brief.contactPhone ?? '').trim(),
      followUpType: brief.followUpType ?? 'email',
      briefWhat: brief.briefWhat ?? '',
      briefHow: brief.briefHow ?? '',
      documentsSent: docsDate
        ? {
            date: docsDate,
            docs: docsList.split(/[\n,]/).map((s) => s.trim()).filter(Boolean),
            ...(docsBy.trim() ? { sentBy: docsBy.trim() } : {}),
          }
        : initial?.documentsSent
          ? null
          : undefined,
    });
    onSaved?.(p);
    if (!keepOpen) onClose();
    return p;
  };

  return (
    <Modal
      title={
        initial
          ? section === '2027'
            ? 'Edit 2027 account'
            : 'Edit prospect'
          : section === '2027'
            ? 'Add 2027 account'
            : 'Add prospect'
      }
      onClose={onClose}
      footer={
        <>
          {initial ? (
            <button
              type="button"
              className="btn-danger"
              style={{ marginRight: 'auto' }}
              onClick={() => {
                if (confirm('Delete this prospect?')) {
                  deleteProspect(initial.id);
                  onClose();
                }
              }}
            >
              Delete
            </button>
          ) : null}
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="btn btn-primary" onClick={() => save()}>
            {initial ? 'Save' : section === '2027' ? 'Add 2027 account' : 'Add prospect'}
          </button>
        </>
      }
    >
      <div className="field">
        <label>Company</label>
        <input value={company} onChange={(e) => setCompany(e.target.value)} placeholder="Acme Imports" autoFocus />
        {(() => {
          if (!company.trim() || (initial && company.trim() === initial.company)) return null;
          const same = prospectByName(data, company);
          const near = same && same.id !== initial?.id ? [same] : nearProspects(data, company, initial?.id).slice(0, 3);
          if (!near.length) return null;
          const bookOf = (p: Prospect) => (is2027Account(p) ? '2027 Accounts' : 'Pipeline');
          const exactOther = !!(same && same.id !== initial?.id);
          return (
            <p className="dup-warn" role="alert">
              ⚠ {exactOther ? `Already in ${bookOf(same!)}` : 'Similar account'}:{' '}
              {near.map((p) => (
                <button key={p.id} type="button" className="link-btn" onClick={() => onOpenOther?.(p.id)}>
                  {p.company}
                  <small> {bookOf(p)}</small>
                </button>
              ))}
              {exactOther
                ? ` — saving will update that account${bookOf(same!) === (section === '2027' ? '2027 Accounts' : 'Pipeline') ? '' : ` and move it to ${section === '2027' ? '2027 Accounts' : 'Pipeline'}`} instead of adding a duplicate.`
                : ' — open it instead of adding a duplicate?'}
            </p>
          );
        })()}
        {initial ? <HubLinks prospect={initial} stop={false} /> : null}
      </div>
      <div className="field" data-testid="account-classification">
        <label id="account-classification-label">Classification</label>
        <SegControl
          options={[
            { value: 'pipeline' as const, label: 'Pipeline' },
            { value: '2027' as const, label: '2027 Accounts' },
          ]}
          value={section}
          onChange={setSection}
        />
        <p className="field-hint">
          {section === '2027'
            ? '2027 Accounts — expected to sign and trade in 2027. Hidden from the Pipeline tab. Saving keeps this same account: contacts, notes, follow-ups and meetings stay linked.'
            : 'Pipeline — current book. Not classified as a 2027 account. Saving keeps this same account.'}
        </p>
      </div>
      <div className="field">
        <label>Contact name (optional)</label>
        <input value={contact} onChange={(e) => setContact(e.target.value)} placeholder="Jane Smith" />
      </div>
      <div className="brief-contact-row">
        <div className="field">
          <label>Contact email (optional)</label>
          <input
            type="email"
            value={brief.contactEmail ?? ''}
            onChange={(e) => setBrief((b) => ({ ...b, contactEmail: e.target.value }))}
            placeholder="jane@company.com"
            autoComplete="off"
          />
        </div>
        <div className="field">
          <label>Contact phone (optional)</label>
          <input
            type="tel"
            value={brief.contactPhone ?? ''}
            onChange={(e) => setBrief((b) => ({ ...b, contactPhone: e.target.value }))}
            placeholder="04xx xxx xxx"
            autoComplete="off"
          />
        </div>
      </div>
      <div className="field">
        <label>Type</label>
        <SegControl
          options={TYPES.map((t) => ({ value: t, label: t }))}
          value={type}
          onChange={setType}
        />
      </div>
      <div className="field">
        <label>Temperature</label>
        <SegControl
          options={TEMPS.map((t) => ({ value: t, label: t.toUpperCase() }))}
          value={temperature}
          onChange={setTemperature}
          classNameFor={(t) => `temp-${t}`}
        />
      </div>
      <div className="field">
        <label>Priority (1 = low, 5 = top)</label>
        <SegControl
          options={PRIOS.map((p) => ({ value: p, label: String(p) }))}
          value={priority}
          onChange={setPriority}
        />
      </div>
      <div className="field docs-sent-field">
        <label>📄 Documents sent (onboarding docs from sales support)</label>
        <DateInput value={docsDate} onChange={markDocs} aria-label="Documents sent date" />
        {docsDate ? (
          <>
            <textarea
              value={docsList}
              onChange={(e) => setDocsList(e.target.value)}
              placeholder="One document per line, e.g. Account application form"
              aria-label="Documents sent list"
              style={{ marginTop: 6 }}
            />
            <input
              value={docsBy}
              onChange={(e) => setDocsBy(e.target.value)}
              placeholder="Sent by (e.g. Queeny)"
              aria-label="Documents sent by"
              style={{ marginTop: 6 }}
            />
            <button type="button" className="link-btn" onClick={() => setDocsDate('')}>
              Clear documents sent
            </button>
            <div style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>Marking documents sent sets P5 + Hot.</div>
          </>
        ) : null}
      </div>
      <div className="field">
        <label>Next steps</label>
        <textarea
          value={nextSteps}
          onChange={(e) => setNextSteps(e.target.value)}
          placeholder="What needs to happen next with this prospect."
        />
      </div>
      <div className="field">
        <label>Currency pairs</label>
        <textarea
          value={currencyPairs}
          onChange={(e) => setCurrencyPairs(e.target.value)}
          placeholder="What they trade / are interested in."
        />
      </div>
      <div className="field">
        <label>Next follow-up (optional)</label>
        <div className="date-type-row">
          <DateInput value={nextFollowUp} onChange={setNextFollowUp} aria-label="Next follow-up date" />
          <TypeToggle
            value={brief.followUpType ?? 'email'}
            onChange={(ft) => setBrief((b) => ({ ...b, followUpType: ft }))}
          />
        </div>
        <p className="field-hint">Click to open the calendar and pick a day.</p>
      </div>
      {initial ? (
        <div className="field">
          <FollowUpMeeting
            rec={{ kind: 'prospect', item: initial }}
            variant="form"
            onBook={() => {
              // Save the edits first so the prefilled form matches what's on screen.
              const p = save(true);
              if (!p) return;
              book(prefillFor({ kind: 'prospect', item: p }));
            }}
          />
        </div>
      ) : null}
      <details className="email-notes" data-testid="email-notes">
        <summary>✉ Email notes (for morning drafts)</summary>
        <p className="field-hint">What to say / how to write it — used by the morning email drafts. Not shown on cards.</p>
        <EmailBriefFields
          hideContact
          hideTitle
          value={brief}
          onChange={(patch) => setBrief((b) => ({ ...b, ...patch }))}
          defaultStyle={data.settings?.defaultEmailStyle}
        />
      </details>
      {initial ? (
        <div className="row-actions" style={{ marginTop: 8 }}>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => {
              logCall(company || initial.company, contact);
              onClose();
            }}
          >
            Log call
          </button>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => {
              logEmail(company || initial.company, contact);
              onClose();
            }}
          >
            Log email
          </button>
        </div>
      ) : null}
    </Modal>
  );
}
