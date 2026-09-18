import { useState } from 'react';
import type { Temperature } from '../types';
import { Modal } from './Modal';
import { useStore } from '../store/StoreContext';

export function ColdCallModal({ onClose }: { onClose: () => void }) {
  const { data, bulkAddColdCalls, updateColdCall, clearColdCalls, promoteColdCall } = useStore();
  const [text, setText] = useState('');
  const active = data.coldCalls.filter((c) => c.status !== 'promoted');

  const add = () => {
    const lines = text.split(/\n/).map((l) => l.trim()).filter(Boolean);
    bulkAddColdCalls(lines);
    setText('');
  };

  return (
    <Modal
      title="Cold call list"
      onClose={onClose}
      wide
      footer={
        <>
          <button
            type="button"
            className="btn-danger"
            style={{ marginRight: 'auto' }}
            onClick={() => {
              if (confirm('Clear the whole cold call list?')) clearColdCalls();
            }}
          >
            Clear whole list
          </button>
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Done
          </button>
        </>
      }
    >
      <div className="field">
        <label>Add accounts (one per line)</label>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={'Acme Imports\nBlock Earner\nGyrostream'}
          rows={4}
        />
      </div>
      <button type="button" className="btn btn-primary" onClick={add} disabled={!text.trim()}>
        Add to list
      </button>
      <div className="divider" />
      <div className="section-title">
        <h2 style={{ fontSize: '0.95rem' }}>Today&apos;s list</h2>
        <span className="count">{active.length}</span>
      </div>
      {active.length === 0 ? (
        <p className="empty-hint">No accounts queued yet.</p>
      ) : (
        active.map((c) => (
          <div key={c.id} className="list-item">
            <div style={{ flex: 1 }}>
              <div className="title">
                {c.company}
                {c.isExample ? <span className="example-badge">EXAMPLE</span> : null}
              </div>
              <div className="meta" style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>
                {c.contact || 'No contact'} {c.notes ? `· ${c.notes}` : ''}
              </div>
              <div className="row-actions" style={{ marginTop: 8 }}>
                <span className={`status-pill status-${c.status}`}>{c.status.replace('-', ' ')}</span>
                {c.status === 'queued' ? (
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    onClick={() => updateColdCall(c.id, { status: 'called' })}
                  >
                    Called
                  </button>
                ) : null}
                {c.status !== 'needs-email' ? (
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    onClick={() => updateColdCall(c.id, { status: 'needs-email' })}
                  >
                    Needs email
                  </button>
                ) : null}
                <PromoteButtons
                  onPromote={(temp) => {
                    promoteColdCall(c.id, temp);
                  }}
                />
              </div>
            </div>
          </div>
        ))
      )}
    </Modal>
  );
}

function PromoteButtons({ onPromote }: { onPromote: (t: Temperature) => void }) {
  return (
    <>
      <button type="button" className="btn btn-sm btn-primary" onClick={() => onPromote('Cold')}>
        → Cold
      </button>
      <button type="button" className="btn btn-sm btn-primary" onClick={() => onPromote('Warm')}>
        → Warm
      </button>
    </>
  );
}
