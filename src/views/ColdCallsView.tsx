import { useState } from 'react';
import type { Temperature } from '../types';
import { useStore } from '../store/StoreContext';

export function ColdCallsView() {
  const { data, bulkAddColdCalls, updateColdCall, clearColdCalls, promoteColdCall } = useStore();
  const [text, setText] = useState('');
  const active = data.coldCalls.filter((c) => c.status !== 'promoted');
  const promoted = data.coldCalls.filter((c) => c.status === 'promoted');

  const add = () => {
    bulkAddColdCalls(text.split(/\n/).map((l) => l.trim()).filter(Boolean));
    setText('');
  };

  return (
    <div>
      <div className="section-title">
        <h2>Cold calls</h2>
        <span className="count">{active.length} queued</span>
      </div>
      <div className="card">
        <div className="field">
          <label>Bulk add (one company per line)</label>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={'Acme Imports\nBlock Earner\nGyrostream'}
            rows={4}
          />
        </div>
        <div className="row-actions">
          <button type="button" className="btn btn-primary" onClick={add} disabled={!text.trim()}>
            Add to list
          </button>
          <button
            type="button"
            className="btn-danger"
            onClick={() => {
              if (confirm('Clear whole cold call list?')) clearColdCalls();
            }}
          >
            Clear whole list
          </button>
        </div>
      </div>

      <div className="card">
        <div className="section-title">
          <h2 style={{ fontSize: '1rem' }}>List</h2>
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
                <input
                  className="input"
                  style={{ marginTop: 6, maxWidth: 280 }}
                  placeholder="Contact"
                  value={c.contact}
                  onChange={(e) => updateColdCall(c.id, { contact: e.target.value })}
                />
                <input
                  className="input"
                  style={{ marginTop: 6 }}
                  placeholder="Notes"
                  value={c.notes}
                  onChange={(e) => updateColdCall(c.id, { notes: e.target.value })}
                />
                <div className="row-actions" style={{ marginTop: 8 }}>
                  <span className={`status-pill status-${c.status}`}>{c.status.replace('-', ' ')}</span>
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    onClick={() => updateColdCall(c.id, { status: 'called' })}
                  >
                    Called
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    onClick={() => updateColdCall(c.id, { status: 'needs-email' })}
                  >
                    Needs email
                  </button>
                  {(['Cold', 'Warm'] as Temperature[]).map((temp) => (
                    <button
                      key={temp}
                      type="button"
                      className="btn btn-primary btn-sm"
                      onClick={() => promoteColdCall(c.id, temp)}
                    >
                      → {temp}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {promoted.length > 0 ? (
        <div className="card">
          <div className="section-title">
            <h2 style={{ fontSize: '1rem' }}>Promoted</h2>
            <span className="count">{promoted.length}</span>
          </div>
          {promoted.map((c) => (
            <div key={c.id} className="list-item">
              <div className="title">
                {c.company} <span className="status-pill status-promoted">promoted</span>
              </div>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
