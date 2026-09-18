import { useState } from 'react';
import type { Priority, Prospect, ProspectType, Temperature } from '../types';
import { Modal } from './Modal';
import { SegControl } from './SegControl';
import { useStore } from '../store/StoreContext';

const TEMPS: Temperature[] = ['Cold', 'Warm', 'Hot'];
const PRIOS: Priority[] = [1, 2, 3, 4, 5];
const TYPES: ProspectType[] = ['Prospect', 'Existing client'];

export function ProspectForm({
  initial,
  onClose,
  onSaved,
}: {
  initial?: Prospect | null;
  onClose: () => void;
  onSaved?: (p: Prospect) => void;
}) {
  const { upsertProspect, deleteProspect, logCall, logEmail } = useStore();
  const [company, setCompany] = useState(initial?.company ?? '');
  const [contact, setContact] = useState(initial?.contact ?? '');
  const [temperature, setTemperature] = useState<Temperature>(initial?.temperature ?? 'Cold');
  const [priority, setPriority] = useState<Priority>(initial?.priority ?? 3);
  const [nextSteps, setNextSteps] = useState(initial?.nextSteps ?? '');
  const [currencyPairs, setCurrencyPairs] = useState(initial?.currencyPairs ?? '');
  const [nextFollowUp, setNextFollowUp] = useState(initial?.nextFollowUp ?? '');
  const [type, setType] = useState<ProspectType>(initial?.type ?? 'Prospect');

  const save = () => {
    if (!company.trim()) return;
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
    });
    onSaved?.(p);
    onClose();
  };

  return (
    <Modal
      title={initial ? 'Edit prospect' : 'Add prospect'}
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
          <button type="button" className="btn btn-primary" onClick={save}>
            {initial ? 'Save' : 'Add prospect'}
          </button>
        </>
      }
    >
      <div className="field">
        <label>Company</label>
        <input value={company} onChange={(e) => setCompany(e.target.value)} placeholder="Acme Imports" autoFocus />
      </div>
      <div className="field">
        <label>Contact name (optional)</label>
        <input value={contact} onChange={(e) => setContact(e.target.value)} placeholder="Jane Smith" />
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
        <label>Next follow-up date (optional)</label>
        <input type="date" value={nextFollowUp} onChange={(e) => setNextFollowUp(e.target.value)} />
      </div>
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
