import { useState } from 'react';
import type { TradeIdeaStatus } from '../types';
import { useStore } from '../store/StoreContext';
import { formatDisplay, isOverdue, isDueToday } from '../utils/dates';
import { Modal } from '../components/Modal';
import { SegControl } from '../components/SegControl';

const STATUSES: TradeIdeaStatus[] = ['Open', 'Done', 'Dead', 'Parked'];

export function TradeIdeasView() {
  const { data, addTradeIdea, updateTradeIdea, deleteTradeIdea, setTradeIdeaStatus } = useStore();
  const [open, setOpen] = useState(false);
  const [client, setClient] = useState('');
  const [pair, setPair] = useState('');
  const [structure, setStructure] = useState('');
  const [idea, setIdea] = useState('');
  const [chaseDate, setChaseDate] = useState('');
  const [filter, setFilter] = useState<TradeIdeaStatus | 'All'>('Open');

  const list = data.tradeIdeas.filter((t) => (filter === 'All' ? true : t.status === filter));

  const save = () => {
    if (!client.trim() || !pair.trim()) return;
    addTradeIdea({
      client: client.trim(),
      prospectId: null,
      pair: pair.trim(),
      structure: structure.trim(),
      idea: idea.trim(),
      chaseDate: chaseDate || null,
      status: 'Open',
    });
    setClient('');
    setPair('');
    setStructure('');
    setIdea('');
    setChaseDate('');
    setOpen(false);
  };

  return (
    <div>
      <div className="section-title">
        <h2>Trade ideas</h2>
        <button type="button" className="btn btn-primary btn-sm" onClick={() => setOpen(true)}>
          + Add idea
        </button>
      </div>
      <div className="filters">
        <div className="filter-group">
          <label>Status</label>
          <select
            className="select"
            style={{ width: 140 }}
            value={filter}
            onChange={(e) => setFilter(e.target.value as TradeIdeaStatus | 'All')}
          >
            <option value="All">All</option>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>
      </div>
      {list.length === 0 ? (
        <div className="card">
          <p className="empty-hint">No trade ideas yet. Chase dates due today appear on Today.</p>
        </div>
      ) : (
        list.map((t) => (
          <div
            key={t.id}
            className={`list-item${t.status === 'Open' && isOverdue(t.chaseDate) ? ' overdue' : t.status === 'Open' && isDueToday(t.chaseDate) ? ' due-today' : ''}`}
          >
            <div className="title" style={{ flex: 1 }}>
              <strong>
                {t.client} · {t.pair}
              </strong>
              {t.isExample ? <span className="example-badge">EXAMPLE</span> : null}
              <div style={{ fontWeight: 400, color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                {t.structure}
                {t.structure && t.idea ? ' — ' : ''}
                {t.idea}
              </div>
              <div className="row-actions" style={{ marginTop: 8 }}>
                <SegControl
                  options={STATUSES.map((s) => ({ value: s, label: s }))}
                  value={t.status}
                  onChange={(s) => setTradeIdeaStatus(t.id, s)}
                />
              </div>
              <div className="field" style={{ marginTop: 8, marginBottom: 0, maxWidth: 200 }}>
                <label>Chase date</label>
                <input
                  type="date"
                  value={t.chaseDate ?? ''}
                  onChange={(e) => updateTradeIdea(t.id, { chaseDate: e.target.value || null })}
                />
              </div>
            </div>
            <span className="due">
              {t.chaseDate ? formatDisplay(t.chaseDate) : 'No chase'}
              {t.status === 'Open' && isOverdue(t.chaseDate) ? ' · overdue' : ''}
            </span>
            <button type="button" className="icon-btn" onClick={() => deleteTradeIdea(t.id)}>
              ×
            </button>
          </div>
        ))
      )}

      {open ? (
        <Modal
          title="Add trade idea"
          onClose={() => setOpen(false)}
          footer={
            <>
              <button type="button" className="btn btn-ghost" onClick={() => setOpen(false)}>
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={save}
                disabled={!client.trim() || !pair.trim()}
              >
                Add idea
              </button>
            </>
          }
        >
          <div className="field">
            <label>Client / prospect</label>
            <input value={client} onChange={(e) => setClient(e.target.value)} placeholder="Pacific Trade Co" autoFocus />
          </div>
          <div className="field">
            <label>Pair</label>
            <input value={pair} onChange={(e) => setPair(e.target.value)} placeholder="EURAUD" />
          </div>
          <div className="field">
            <label>Structure</label>
            <input value={structure} onChange={(e) => setStructure(e.target.value)} placeholder="3m forward + collar" />
          </div>
          <div className="field">
            <label>Idea</label>
            <textarea value={idea} onChange={(e) => setIdea(e.target.value)} placeholder="Hedge angle / pitch notes" />
          </div>
          <div className="field">
            <label>Chase date</label>
            <input type="date" value={chaseDate} onChange={(e) => setChaseDate(e.target.value)} />
          </div>
        </Modal>
      ) : null}
    </div>
  );
}
