import { useMemo, useState } from 'react';
import type { ColdLead, ColdLeadStatus, FollowUpType } from '../types';
import { TYPE_ICON, briefState, resolveColdLead, type ResolvedBrief } from '../utils/brief';
import { useStore } from '../store/StoreContext';
import { formatDisplay, isDueToday, isOverdue, todayISO } from '../utils/dates';
import { DateInput } from '../components/DateInput';
import { EmailBriefFields } from '../components/EmailBrief';
import { EmailSendActions } from '../components/EmailSendActions';
import { draftFromBrief, emailSubject } from '../utils/emailDraft';

const STATUS_FILTERS: Array<ColdLeadStatus | 'All'> = ['Open', 'Parked', 'Done', 'All'];

function dueClass(date: string | null, status: ColdLeadStatus): string {
  if (status !== 'Open' || !date) return '';
  if (isOverdue(date)) return ' overdue';
  if (isDueToday(date)) return ' due-today';
  return '';
}

export function ColdLeadsView() {
  const { data, addColdLead, updateColdLead, deleteColdLead, setColdLeadStatus } = useStore();
  const [filter, setFilter] = useState<ColdLeadStatus | 'All'>('Open');
  const [editingId, setEditingId] = useState<string | null>(null);

  const [draftCompany, setDraftCompany] = useState('');
  const [draftContact, setDraftContact] = useState('');
  const [draftFollowUp, setDraftFollowUp] = useState(todayISO());
  const [draftVolume, setDraftVolume] = useState('');
  const [draftNotes, setDraftNotes] = useState('');
  const [draftDateKey, setDraftDateKey] = useState(0);
  const [draftType, setDraftType] = useState<FollowUpType>('email');

  const list = useMemo(() => {
    const rows = [...(data.coldLeads ?? [])];
    const filtered =
      filter === 'All' ? rows : rows.filter((c) => c.status === filter);
    return filtered.sort((a, b) => {
      const da = a.followUpDate || '9999-99-99';
      const db = b.followUpDate || '9999-99-99';
      return da.localeCompare(db);
    });
  }, [data.coldLeads, filter]);

  const submitNew = () => {
    if (!draftCompany.trim()) return;
    addColdLead({
      company: draftCompany.trim(),
      contactName: draftContact.trim(),
      followUpDate: draftFollowUp || null,
      volumeCurrency: draftVolume.trim(),
      notes: draftNotes.trim(),
      status: 'Open',
      followUpType: draftType,
    });
    setDraftCompany('');
    setDraftContact('');
    setDraftFollowUp(todayISO());
    setDraftVolume('');
    setDraftNotes('');
    setDraftDateKey((k) => k + 1);
  };

  const patch = (id: string, field: keyof ColdLead, value: string | null) => {
    updateColdLead(id, { [field]: value } as Partial<ColdLead>);
  };

  return (
    <div>
      <div className="card">
        <div className="section-title">
          <h2>🧊 Cold leads</h2>
          <span className="count">{list.length}</span>
        </div>
        <p className="calendar-hint">
          Really cold / refer-back list — separate from pipeline Cold and Cold calls. Dense one-line rows (Edit → contact email + ✉ email brief);
          due / overdue dates also appear on Today.
        </p>

        <div className="filters" style={{ marginBottom: 10 }}>
          <div className="filter-group">
            <label>Status</label>
            <select
              className="select"
              style={{ width: 120 }}
              value={filter}
              onChange={(e) => setFilter(e.target.value as ColdLeadStatus | 'All')}
            >
              {STATUS_FILTERS.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="cold-leads-row cold-leads-add">
          <input
            className="input cold-col-company"
            placeholder="Company"
            value={draftCompany}
            onChange={(e) => setDraftCompany(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && submitNew()}
          />
          <input
            className="input cold-col-contact"
            placeholder="Contact"
            value={draftContact}
            onChange={(e) => setDraftContact(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && submitNew()}
          />
          <DateInput
            key={draftDateKey}
            className="cold-col-date"
            value={draftFollowUp}
            onChange={setDraftFollowUp}
            aria-label="Follow-up date"
          />
          <TypeSelect value={draftType} onChange={setDraftType} />
          <input
            className="input cold-col-volume"
            placeholder="Pairs / volume"
            value={draftVolume}
            onChange={(e) => setDraftVolume(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && submitNew()}
          />
          <input
            className="input cold-col-notes"
            placeholder="Notes"
            value={draftNotes}
            onChange={(e) => setDraftNotes(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && submitNew()}
          />
          <div className="cold-col-actions">
            <button type="button" className="btn btn-primary btn-sm" onClick={submitNew}>
              Add
            </button>
          </div>
        </div>

        <div className="cold-leads-header cold-leads-row" aria-hidden>
          <span className="cold-col-company">Company</span>
          <span className="cold-col-contact">Contact</span>
          <span className="cold-col-date">Follow-up</span>
          <span className="cold-col-type" />
          <span className="cold-col-volume">Volume / FX</span>
          <span className="cold-col-notes">Notes</span>
          <span className="cold-col-actions">Actions</span>
        </div>

        {list.length === 0 ? (
          <p className="empty-hint">No cold leads — add a row above for refer-backs.</p>
        ) : (
          list.map((c) => (
            <ColdLeadRow
              key={c.id}
              lead={c}
              editing={editingId === c.id}
              onToggleEdit={() => setEditingId(editingId === c.id ? null : c.id)}
              onPatch={patch}
              ready={briefState(resolveColdLead(data, c))}
              brief={resolveColdLead(data, c)}
              defaultStyle={data.settings?.defaultEmailStyle}
              onStatus={setColdLeadStatus}
              onDelete={() => {
                if (confirm(`Delete cold lead “${c.company || 'untitled'}”?`)) {
                  deleteColdLead(c.id);
                }
              }}
            />
          ))
        )}
      </div>
    </div>
  );
}

function ColdLeadRow({
  lead,
  editing,
  onToggleEdit,
  onPatch,
  ready,
  brief,
  defaultStyle,
  onStatus,
  onDelete,
}: {
  lead: ColdLead;
  editing: boolean;
  onToggleEdit: () => void;
  onPatch: (id: string, field: keyof ColdLead, value: string | null) => void;
  ready: 'ready' | 'no-contact' | 'no-brief';
  brief: ResolvedBrief;
  defaultStyle?: string;
  onStatus: (id: string, status: ColdLeadStatus) => void;
  onDelete: () => void;
}) {
  const cls = `cold-leads-row${dueClass(lead.followUpDate, lead.status)}${
    lead.status === 'Done' ? ' cold-leads-done' : ''
  }${lead.status === 'Parked' ? ' cold-leads-parked' : ''}`;

  const ftype: FollowUpType = lead.followUpType ?? 'email';
  const call = ftype === 'call';
  const briefIcon = (
    <span
      className={`brief-dot brief-${ready}`}
      title={
        ready === 'ready'
          ? `${call ? 'Call' : 'Email'} brief ready → ${call ? lead.contactPhone : lead.contactEmail}`
          : ready === 'no-contact'
            ? `${call ? 'Call points' : 'Brief'} written — no contact ${call ? 'phone' : 'email'} yet`
            : `No ${call ? 'call points' : 'email brief'} yet (Edit to add)`
      }
    >
      ●
    </span>
  );

  if (editing) {
    return (
      <div className="cold-lead-block editing">
      <div className={cls}>
        <input
          className="input cold-col-company"
          value={lead.company}
          onChange={(e) => onPatch(lead.id, 'company', e.target.value)}
          autoFocus
        />
        <input
          className="input cold-col-contact"
          value={lead.contactName ?? ''}
          onChange={(e) => onPatch(lead.id, 'contactName', e.target.value)}
        />
        <DateInput
          className="cold-col-date"
          value={lead.followUpDate ?? ''}
          onChange={(v) => onPatch(lead.id, 'followUpDate', v || null)}
          aria-label="Follow-up date"
        />
        <TypeSelect value={ftype} onChange={(v) => onPatch(lead.id, 'followUpType', v)} />
        <input
          className="input cold-col-volume"
          value={lead.volumeCurrency}
          onChange={(e) => onPatch(lead.id, 'volumeCurrency', e.target.value)}
        />
        <input
          className="input cold-col-notes"
          value={lead.notes}
          onChange={(e) => onPatch(lead.id, 'notes', e.target.value)}
          title={lead.notes}
        />
        <div className="cold-col-actions">
          <button type="button" className="btn btn-ghost btn-sm" onClick={onToggleEdit}>
            Done
          </button>
          <button type="button" className="icon-btn" onClick={onDelete} aria-label="Delete">
            ×
          </button>
        </div>
      </div>
      <div className="cold-lead-brief">
        <EmailBriefFields
          compact
          value={lead}
          contactName={lead.contactName}
          subject={emailSubject(lead.company, 'follow-up')}
          defaultStyle={defaultStyle}
          onChange={(p) => {
            for (const [k, v] of Object.entries(p)) onPatch(lead.id, k as keyof ColdLead, v ?? '');
          }}
        />
      </div>
      </div>
    );
  }

  return (
    <div className={cls}>
      <span className="cold-col-company" title={lead.company}>
        {briefIcon}
        {lead.company || '—'}
        {lead.isExample ? <span className="example-badge">EXAMPLE</span> : null}
      </span>
      <span
        className="cold-col-contact"
        title={[lead.contactName, lead.contactEmail, lead.contactPhone].filter(Boolean).join(' · ')}
      >
        {lead.contactName || lead.contactEmail || lead.contactPhone || '—'}
      </span>
      <span className="cold-col-date">
        {formatDisplay(lead.followUpDate)}
        {lead.status === 'Open' && isOverdue(lead.followUpDate)
          ? ' · overdue'
          : lead.status === 'Open' && isDueToday(lead.followUpDate)
            ? ' · today'
            : ''}
      </span>
      <span className="cold-col-type type-icon" title={call ? 'Call follow-up' : 'Email follow-up'}>
        {TYPE_ICON[ftype]}
      </span>
      <span className="cold-col-volume" title={lead.volumeCurrency}>
        {lead.volumeCurrency || '—'}
      </span>
      <span className="cold-col-notes" title={lead.notes || ''}>
        {lead.notes || '—'}
      </span>
      <div className="cold-col-actions">
        {brief.type === 'email' ? (
          <EmailSendActions draft={draftFromBrief(brief, emailSubject(lead.company, 'follow-up'))} label={lead.company || 'cold lead'} />
        ) : null}
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          onClick={onToggleEdit}
          title="Edit row + contact email + email brief"
        >
          Edit
        </button>
        {lead.status !== 'Done' ? (
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => onStatus(lead.id, 'Done')}
            title="Mark done"
          >
            ✓
          </button>
        ) : (
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => onStatus(lead.id, 'Open')}
            title="Reopen"
          >
            ↺
          </button>
        )}
        {lead.status !== 'Parked' ? (
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => onStatus(lead.id, 'Parked')}
            title="Park"
          >
            Park
          </button>
        ) : (
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => onStatus(lead.id, 'Open')}
            title="Unpark"
          >
            Open
          </button>
        )}
        <button type="button" className="icon-btn" onClick={onDelete} aria-label="Delete">
          ×
        </button>
      </div>
    </div>
  );
}

function TypeSelect({ value, onChange }: { value: FollowUpType; onChange: (v: FollowUpType) => void }) {
  return (
    <select
      className="input cold-col-type"
      value={value}
      onChange={(e) => onChange(e.target.value as FollowUpType)}
      aria-label="Follow-up type"
      title="Follow-up type"
    >
      <option value="email">✉ Email</option>
      <option value="call">📞 Call</option>
    </select>
  );
}
