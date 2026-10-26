import { useMemo, useState } from 'react';
import type { ColdLead, Prospect } from '../types';
import { useStore } from '../store/StoreContext';
import { defaultPrimary } from '../store/merge';
import { findDuplicates, type DupGroup, type DupMember } from '../utils/company';
import { formatDisplay } from '../utils/dates';
import { Modal } from './Modal';
import { Toast } from './Toast';

function describe(g: DupGroup) {
  const p = g.members.filter((m) => m.coll === 'prospects').length;
  const c = g.members.length - p;
  return [p ? `${p} pipeline` : '', c ? `${c} cold lead${c > 1 ? 's' : ''}` : ''].filter(Boolean).join(' + ');
}

/** "⚠ N possible duplicate companies" banner + review/merge modal. */
export function DuplicatesBanner() {
  const { data, mergeDuplicates, dismissDuplicate, undoFollowUpDone } = useStore();
  const groups = useMemo(() => findDuplicates(data, data.settings?.dismissedDuplicates ?? []), [data]);
  const [open, setOpen] = useState(false);
  const [keep, setKeep] = useState<Record<string, string>>({});
  const [undo, setUndo] = useState<{ token: ReturnType<typeof mergeDuplicates>; msg: string } | null>(null);
  if (!groups.length && !undo) return null;
  const rec = (m: DupMember) =>
    m.coll === 'prospects' ? data.prospects.find((p) => p.id === m.id) : data.coldLeads.find((c) => c.id === m.id);
  return (
    <>
      {groups.length ? (
        <div className="dup-banner" role="status">
          ⚠ {groups.length} possible duplicate compan{groups.length > 1 ? 'ies' : 'y'}:{' '}
          {groups
            .slice(0, 3)
            .map((g) => `${g.members[0].company} (${describe(g)})`)
            .join(', ')}
          {groups.length > 3 ? '…' : ''}{' '}
          <button type="button" className="btn btn-sm btn-ghost" onClick={() => setOpen(true)}>
            Review &amp; merge
          </button>
        </div>
      ) : null}
      {open ? (
        <Modal title="Duplicate companies" wide onClose={() => setOpen(false)}>
          <p className="field-hint" style={{ marginTop: 0 }}>
            Merging keeps the selected record, fills its blank contact/brief fields from the others, combines notes and activity,
            keeps the soonest open follow-up and re-points meetings/proposals/sims. Removed records are stored inside the kept one,
            a full backup is saved first (⚙ Settings → Backups) and you can Undo.
          </p>
          {groups.length === 0 ? <p className="empty-hint">No duplicates left.</p> : null}
          {groups.map((g) => {
            const def = defaultPrimary(data, g.members);
            const hasProspect = g.members.some((m) => m.coll === 'prospects');
            const sel = keep[g.key] ?? `${def.coll}:${def.id}`;
            return (
              <div key={g.key} className="dup-group" data-key={g.key}>
                <div className="dup-group-head">
                  <strong>{g.members[0].company}</strong> <span className="muted">{describe(g)}{g.exact ? '' : ' · similar names'}</span>
                </div>
                <table className="dup-table">
                  <thead>
                    <tr>
                      <th>Keep</th>
                      <th>Where</th>
                      <th>Name</th>
                      <th>Status</th>
                      <th>Contact</th>
                      <th>Follow-up</th>
                      <th>Notes</th>
                      <th>Created</th>
                    </tr>
                  </thead>
                  <tbody>
                    {g.members.map((m) => {
                      const r = rec(m) as (Prospect & ColdLead) | undefined;
                      if (!r) return null;
                      const k = `${m.coll}:${m.id}`;
                      const disabled = hasProspect && m.coll !== 'prospects';
                      return (
                        <tr key={k} className={sel === k ? 'keep' : ''}>
                          <td>
                            <input
                              type="radio"
                              name={`keep-${g.key}`}
                              checked={sel === k}
                              disabled={disabled}
                              title={disabled ? 'When a pipeline prospect exists it is the hub and is kept' : ''}
                              onChange={() => setKeep((s) => ({ ...s, [g.key]: k }))}
                              aria-label={`Keep ${m.coll === 'prospects' ? 'pipeline' : 'cold lead'} ${r.company}`}
                            />
                          </td>
                          <td>{m.coll === 'prospects' ? 'Pipeline' : 'Cold lead'}</td>
                          <td>{r.company}</td>
                          <td>{m.coll === 'prospects' ? r.temperature : r.status}</td>
                          <td>{(m.coll === 'prospects' ? r.contact : r.contactName) || '—'}</td>
                          <td>{formatDisplay(m.coll === 'prospects' ? r.nextFollowUp : r.followUpDate) || '—'}</td>
                          <td className="dup-notes">{(m.coll === 'prospects' ? r.nextSteps : r.notes) || '—'}</td>
                          <td>{r.createdAt ? new Date(r.createdAt).toLocaleString('en-AU', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }) : '—'}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                <div className="dup-actions">
                  <button
                    type="button"
                    className="btn btn-primary btn-sm"
                    onClick={() => {
                      const [coll, id] = sel.split(':');
                      const primary = g.members.find((m) => m.coll === coll && m.id === id)!;
                      const token = mergeDuplicates(primary, g.members);
                      setUndo({ token, msg: `Merged ${g.members.length} × ${primary.company} (backup saved)` });
                      if (groups.length === 1) setOpen(false);
                    }}
                  >
                    Merge into selected
                  </button>
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => dismissDuplicate(g.key)}>
                    Not a duplicate
                  </button>
                </div>
              </div>
            );
          })}
        </Modal>
      ) : null}
      {undo ? (
        <Toast
          message={undo.msg}
          duration={12000}
          action={{ label: 'Undo', onClick: () => undoFollowUpDone(undo.token) }}
          onDone={() => setUndo(null)}
        />
      ) : null}
    </>
  );
}
