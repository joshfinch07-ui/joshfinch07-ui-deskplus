import { useMemo, useState } from 'react';
import type { FollowUpType, Proposal, ProposalStatus, Prospect, Simulation, SimulationStatus } from '../types';
import { useStore } from '../store/StoreContext';
import { nearProspects, prospectByName, searchProspects } from '../utils/company';
import { formatDisplay, todayISO } from '../utils/dates';
import { DateInput } from './DateInput';
import { EmailBriefFields, TypeToggle, type BriefValue } from './EmailBrief';
import { Modal } from './Modal';

export const PROPOSAL_STATUSES: ProposalStatus[] = ['Sent', 'Discussing', 'Won', 'Lost', 'Parked'];
export const SIM_STATUSES: SimulationStatus[] = ['Running', 'Reviewed', 'Converted', 'Ended'];

export interface CompanyValue {
  company: string;
  prospectId: string | null;
}

/**
 * Company picker with type-ahead over the pipeline (prospects are the hub).
 * Links to an existing prospect; only offers "Create prospect" when there is no
 * match, and warns about near-duplicate names first.
 */
export function CompanyPicker({
  value,
  onChange,
  autoFocus,
}: {
  value: CompanyValue;
  onChange: (v: CompanyValue) => void;
  autoFocus?: boolean;
}) {
  const { data, upsertProspect } = useStore();
  const [open, setOpen] = useState(false);
  const linked = value.prospectId ? data.prospects.find((p) => p.id === value.prospectId) : undefined;
  const q = value.company;
  const matches = useMemo(() => (linked ? [] : searchProspects(data, q, 8)), [data, q, linked]);
  const exact = !linked && q.trim() ? prospectByName(data, q) : undefined;
  const near = !linked && !exact && q.trim().length >= 3 ? nearProspects(data, q).slice(0, 3) : [];
  const pick = (p: Prospect) => {
    onChange({ company: p.company, prospectId: p.id });
    setOpen(false);
  };
  if (linked)
    return (
      <div className="company-linked">
        <span className="hub-chip" title="Linked prospect — contact and default brief come from here">
          🔗 {linked.company}
        </span>
        <span className="field-hint" style={{ margin: 0 }}>
          {linked.temperature} · {linked.contact || 'no contact'}
        </span>
        <button type="button" className="link-btn" onClick={() => onChange({ company: '', prospectId: null })}>
          change
        </button>
      </div>
    );
  return (
    <div className="company-picker">
      <input
        value={q}
        autoFocus={autoFocus}
        placeholder="Start typing a pipeline company…"
        aria-label="Company"
        role="combobox"
        aria-expanded={open}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onChange={(e) => {
          onChange({ company: e.target.value, prospectId: null });
          setOpen(true);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && matches[0]) {
            e.preventDefault();
            pick(matches[0]);
          }
        }}
      />
      {open && matches.length ? (
        <ul className="company-options" role="listbox">
          {matches.map((p) => (
            <li key={p.id}>
              <button type="button" role="option" aria-selected={false} onMouseDown={(e) => e.preventDefault()} onClick={() => pick(p)}>
                {p.company} <small>{p.temperature}{p.contact ? ` · ${p.contact}` : ''}</small>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      {q.trim() ? (
        <div className="company-help">
          {exact ? (
            <button type="button" className="btn btn-sm btn-ghost" onClick={() => pick(exact)}>
              Link to “{exact.company}”
            </button>
          ) : (
            <>
              {near.length ? (
                <span className="dup-warn" role="alert">
                  ⚠ Similar in pipeline:{' '}
                  {near.map((p) => (
                    <button key={p.id} type="button" className="link-btn" onClick={() => pick(p)}>
                      {p.company}
                    </button>
                  ))}
                  {' '}— use one of these to avoid a duplicate.
                </span>
              ) : null}
              <button
                type="button"
                className="btn btn-sm btn-ghost create-prospect-btn"
                onClick={() => {
                  const p = upsertProspect({ company: q.trim(), temperature: 'Warm' });
                  onChange({ company: p.company, prospectId: p.id });
                }}
              >
                + Create prospect “{q.trim()}”{near.length ? ' anyway' : ''}
              </button>
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}

function useInherited(prospectId: string | null) {
  const { data } = useStore();
  const p = prospectId ? data.prospects.find((x) => x.id === prospectId) : undefined;
  const inherited: BriefValue | undefined = p
    ? { contactName: p.contact, contactEmail: p.contactEmail, contactPhone: p.contactPhone, briefWhat: p.briefWhat, briefHow: p.briefHow }
    : undefined;
  return { p, inherited };
}

const briefOf = (x: Partial<Proposal | Simulation>): BriefValue => ({
  followUpType: x.followUpType,
  contactName: x.contactName,
  contactEmail: x.contactEmail,
  contactPhone: x.contactPhone,
  briefWhat: x.briefWhat,
  briefHow: x.briefHow,
});

export function ProposalForm({
  initial,
  onClose,
  onSaved,
}: {
  /** Existing proposal (edit) or a partial prefill (new, e.g. from a meeting). */
  initial: Partial<Proposal>;
  onClose: () => void;
  onSaved?: (p: Proposal) => void;
}) {
  const { data, addProposal, updateProposal } = useStore();
  const editing = !!initial.id;
  const [v, setV] = useState<Partial<Proposal>>({
    dateSent: todayISO(),
    status: 'Sent',
    pairs: '',
    volume: '',
    proposed: '',
    followUpType: 'email',
    ...initial,
  });
  const set = (patch: Partial<Proposal>) => setV((cur) => ({ ...cur, ...patch }));
  const { p, inherited } = useInherited(v.prospectId ?? null);
  const meetings = data.meetings.filter(
    (m) => (v.prospectId && m.prospectId === v.prospectId) || (!!p && m.company.trim().toLowerCase() === p.company.trim().toLowerCase()) || m.id === v.meetingId,
  );
  const canSave = !!v.prospectId && !!(v.company ?? '').trim();
  const save = () => {
    if (!canSave) return;
    const rec = { ...v, company: p?.company ?? v.company ?? '' } as Proposal;
    if (editing) {
      updateProposal(rec.id, rec);
      onSaved?.(rec);
    } else {
      // (not onSaved?.(addProposal(rec)) — optional call would skip addProposal when onSaved is absent)
      const created = addProposal(rec);
      onSaved?.(created);
    }
    onClose();
  };
  return (
    <Modal
      title={editing ? `Proposal — ${v.company}` : 'New proposal'}
      wide
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="btn btn-primary" disabled={!canSave} onClick={save} title={canSave ? '' : 'Link a pipeline company first'}>
            {editing ? 'Save' : 'Create proposal'}
          </button>
        </>
      }
    >
      <div className="field">
        <label>Company (pipeline)</label>
        <CompanyPicker value={{ company: v.company ?? '', prospectId: v.prospectId ?? null }} onChange={set} autoFocus={!editing && !v.prospectId} />
      </div>
      <div className="form-grid-3">
        <div className="field">
          <label>Date sent</label>
          <DateInput value={v.dateSent ?? ''} onChange={(d) => set({ dateSent: d || null })} aria-label="Date sent" />
        </div>
        <div className="field">
          <label>Pair(s)</label>
          <input value={v.pairs ?? ''} onChange={(e) => set({ pairs: e.target.value })} placeholder="AUDUSD, EURAUD" />
        </div>
        <div className="field">
          <label>Volume</label>
          <input value={v.volume ?? ''} onChange={(e) => set({ volume: e.target.value })} placeholder="USD 2m / yr" />
        </div>
      </div>
      <div className="field">
        <label>What was proposed</label>
        <textarea rows={2} value={v.proposed ?? ''} onChange={(e) => set({ proposed: e.target.value })} placeholder="Product / structure / rate — e.g. 6m forwards at spot +18 pts" />
      </div>
      <div className="form-grid-3">
        <div className="field">
          <label>Status</label>
          <select value={v.status} onChange={(e) => set({ status: e.target.value as ProposalStatus })} aria-label="Proposal status">
            {PROPOSAL_STATUSES.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </div>
        <div className="field">
          <label>Follow-up</label>
          <div className="date-type-row">
            <DateInput value={v.followUpDate ?? ''} onChange={(d) => set({ followUpDate: d || null })} aria-label="Follow-up date" />
            <TypeToggle compact value={(v.followUpType ?? 'email') as FollowUpType} onChange={(t) => set({ followUpType: t })} />
          </div>
        </div>
        <div className="field">
          <label>Meeting</label>
          <select value={v.meetingId ?? ''} onChange={(e) => set({ meetingId: e.target.value || null })} aria-label="Linked meeting">
            <option value="">— none —</option>
            {meetings.map((m) => (
              <option key={m.id} value={m.id}>
                {formatDisplay(m.meetingDate)} · {m.company}
                {m.outcome ? ` (${m.outcome})` : ''}
              </option>
            ))}
          </select>
        </div>
      </div>
      <EmailBriefFields
        value={briefOf(v)}
        onChange={(b) => set(b)}
        showName
        compact
        inherited={inherited}
        inheritedType={p?.followUpType}
        defaultStyle={data.settings?.defaultEmailStyle}
        inheritHint={p ? `Leave blank to use ${p.company}’s contact and brief (shown greyed). Fill a field only to override it for this proposal.` : undefined}
      />
    </Modal>
  );
}

export function nextMonthOf(month: string): string {
  const [y, m] = month.split('-').map(Number);
  return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`;
}

export function SimulationForm({
  initial,
  onClose,
}: {
  initial: Partial<Simulation>;
  onClose: () => void;
}) {
  const { data, addSimulation, updateSimulation } = useStore();
  const editing = !!initial.id;
  const [v, setV] = useState<Partial<Simulation>>({
    month: todayISO().slice(0, 7),
    sentDate: todayISO(),
    status: 'Running',
    pair: '',
    volume: '',
    structure: '',
    outcome: '',
    followUpType: 'email',
    ...initial,
  });
  const set = (patch: Partial<Simulation>) => setV((cur) => ({ ...cur, ...patch }));
  const { p, inherited } = useInherited(v.prospectId ?? null);
  const canSave = !!v.prospectId && /^\d{4}-\d{2}$/.test(v.month ?? '');
  const save = () => {
    if (!canSave) return;
    const rec = { ...v, company: p?.company ?? v.company ?? '' } as Simulation;
    if (editing) updateSimulation(rec.id, rec);
    else addSimulation(rec);
    onClose();
  };
  return (
    <Modal
      title={editing ? `Simulation — ${v.company} · ${v.month}` : 'New live simulation'}
      wide
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="btn btn-primary" disabled={!canSave} onClick={save} title={canSave ? '' : 'Link a pipeline company first'}>
            {editing ? 'Save' : 'Create simulation'}
          </button>
        </>
      }
    >
      {v.migratedFrom ? (
        <p className="field-hint">
          Converted from a Trade idea ({String(v.migratedFrom.record.client ?? '')}, status {String(v.migratedFrom.record.status ?? '')}). {v.migratedFrom.linkNote ?? ''}
        </p>
      ) : null}
      <div className="field">
        <label>Company (pipeline)</label>
        <CompanyPicker value={{ company: v.company ?? '', prospectId: v.prospectId ?? null }} onChange={set} autoFocus={!editing && !v.prospectId} />
      </div>
      <div className="form-grid-3">
        <div className="field">
          <label>Month</label>
          <input type="month" value={v.month ?? ''} onChange={(e) => set({ month: e.target.value })} aria-label="Month" />
        </div>
        <div className="field">
          <label>Sent</label>
          <DateInput value={v.sentDate ?? ''} onChange={(d) => set({ sentDate: d || null })} aria-label="Sent date" />
        </div>
        <div className="field">
          <label>Status</label>
          <select value={v.status} onChange={(e) => set({ status: e.target.value as SimulationStatus })} aria-label="Simulation status">
            {SIM_STATUSES.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </div>
      </div>
      <div className="form-grid-3">
        <div className="field">
          <label>Pair</label>
          <input value={v.pair ?? ''} onChange={(e) => set({ pair: e.target.value })} placeholder="AUDUSD" />
        </div>
        <div className="field">
          <label>Volume</label>
          <input value={v.volume ?? ''} onChange={(e) => set({ volume: e.target.value })} placeholder="USD 1m / month" />
        </div>
        <div className="field">
          <label>Hedge structure</label>
          <input value={v.structure ?? ''} onChange={(e) => set({ structure: e.target.value })} placeholder="12m TARF / collar / forwards" />
        </div>
      </div>
      <div className="form-grid-3">
        <div className="field" style={{ gridColumn: 'span 2' }}>
          <label>Outcome / notes</label>
          <input value={v.outcome ?? ''} onChange={(e) => set({ outcome: e.target.value })} placeholder="e.g. Saved 0.4% vs spot; client wants to review expiries" />
        </div>
        <div className="field">
          <label>Follow-up</label>
          <div className="date-type-row">
            <DateInput value={v.followUpDate ?? ''} onChange={(d) => set({ followUpDate: d || null })} aria-label="Follow-up date" />
            <TypeToggle compact value={(v.followUpType ?? 'email') as FollowUpType} onChange={(t) => set({ followUpType: t })} />
          </div>
        </div>
      </div>
      <EmailBriefFields
        value={briefOf(v)}
        onChange={(b) => set(b)}
        showName
        compact
        inherited={inherited}
        inheritedType={p?.followUpType}
        defaultStyle={data.settings?.defaultEmailStyle}
        inheritHint={p ? `Leave blank to use ${p.company}’s contact and brief. Fill a field only to override it for this sim.` : undefined}
      />
    </Modal>
  );
}
