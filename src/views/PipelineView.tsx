import { useMemo, useState } from 'react';
import type { Prospect, SortBy, Temperature } from '../types';
import { useStore } from '../store/StoreContext';
import { formatDisplay, isOverdue, isDueToday } from '../utils/dates';
import { TYPE_ICON, briefState, resolveProspect } from '../utils/brief';
import { HubLinks } from '../components/HubLinks';

const COLS: Temperature[] = ['Cold', 'Warm', 'Hot'];

export function PipelineView({ onOpenProspect }: { onOpenProspect: (id: string) => void }) {
  const { data } = useStore();
  const [minPriority, setMinPriority] = useState(0);
  const [sortBy, setSortBy] = useState<SortBy>('nextFollowUp');
  const [docsOnly, setDocsOnly] = useState(false);
  const docsCount = data.prospects.filter((p) => p.documentsSent?.date).length;

  const filtered = useMemo(() => {
    let list = data.prospects.filter((p) => p.priority >= minPriority && (!docsOnly || !!p.documentsSent?.date));
    list = [...list].sort((a, b) => {
      if (sortBy === 'priority') return b.priority - a.priority;
      if (sortBy === 'name') return a.company.localeCompare(b.company);
      // nextFollowUp — nulls last; sooner first
      if (!a.nextFollowUp && !b.nextFollowUp) return 0;
      if (!a.nextFollowUp) return 1;
      if (!b.nextFollowUp) return -1;
      return a.nextFollowUp.localeCompare(b.nextFollowUp);
    });
    return list;
  }, [data.prospects, minPriority, sortBy, docsOnly]);

  const byTemp = (t: Temperature) => filtered.filter((p) => p.temperature === t);

  return (
    <div>
      <div className="section-title">
        <h2>Pipeline</h2>
        <span className="count">{filtered.length} active</span>
      </div>
      <div className="filters">
        <div className="filter-group">
          <label>Min priority</label>
          <select
            className="select"
            style={{ width: 120 }}
            value={minPriority}
            onChange={(e) => setMinPriority(Number(e.target.value))}
          >
            <option value={0}>Any</option>
            <option value={1}>≥ 1</option>
            <option value={2}>≥ 2</option>
            <option value={3}>≥ 3</option>
            <option value={4}>≥ 4</option>
            <option value={5}>5 only</option>
          </select>
        </div>
        <div className="filter-group">
          <label>Sort by</label>
          <select
            className="select"
            style={{ width: 160 }}
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as SortBy)}
          >
            <option value="nextFollowUp">Next follow-up</option>
            <option value="priority">Priority</option>
            <option value="name">Name</option>
          </select>
        </div>
        <div className="filter-group">
          <label>Stage</label>
          <button
            type="button"
            className={`btn btn-sm ${docsOnly ? 'btn-primary' : 'btn-ghost'} docs-filter`}
            onClick={() => setDocsOnly((v) => !v)}
          >
            📄 Documents sent ({docsCount})
          </button>
        </div>
      </div>
      <div className="kanban">
        {COLS.map((col) => {
          const items = byTemp(col);
          return (
            <div key={col} className="kanban-col">
              <div className="kanban-col-header">
                <span>
                  <span className={`dot dot-${col}`} />
                  {col.toUpperCase()}
                </span>
                <span>{items.length}</span>
              </div>
              {items.length === 0 ? (
                <p className="empty-hint">Nothing here.</p>
              ) : (
                items.map((p) => <ProspectCard key={p.id} prospect={p} onOpen={onOpenProspect} />)
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ProspectCard({
  prospect: p,
  onOpen,
}: {
  prospect: Prospect;
  onOpen: (id: string) => void;
}) {
  const { data } = useStore();
  const dueClass = isOverdue(p.nextFollowUp)
    ? 'overdue'
    : isDueToday(p.nextFollowUp)
      ? 'due-today'
      : '';
  return (
    <div className={`prospect-card${p.documentsSent?.date ? ' docs-sent' : ''}`} onClick={() => onOpen(p.id)} role="button" tabIndex={0}
      onKeyDown={(e) => e.key === 'Enter' && onOpen(p.id)}>
      <div className="company">
        {p.company}
        {p.isExample ? <span className="example-badge">EXAMPLE</span> : null}
      </div>
      <div className="meta">{p.contact || 'No contact'}</div>
      {p.documentsSent?.date ? (
        <div
          className="docs-badge"
          title={(p.documentsSent.docs ?? []).join('\n') || 'Documents sent'}
        >
          📄 Docs sent {formatDisplay(p.documentsSent.date)}
          {p.documentsSent.docs?.length ? ` · ${p.documentsSent.docs.length} doc${p.documentsSent.docs.length > 1 ? 's' : ''}` : ''}
          {p.documentsSent.sentBy ? ` · ${p.documentsSent.sentBy}` : ''}
        </div>
      ) : null}
      {p.nextSteps ? (
        <div className="meta" style={{ marginTop: 4 }}>
          {p.nextSteps}
        </div>
      ) : null}
      <div className="chips">
        <span className="chip priority">P{p.priority}</span>
        <span className="chip type">{p.type}</span>
        {p.nextFollowUp ? (
          <span className={`chip ${dueClass}`}>
            {formatDisplay(p.nextFollowUp)}
            {isOverdue(p.nextFollowUp) ? ' overdue' : isDueToday(p.nextFollowUp) ? ' today' : ''}
          </span>
        ) : null}
        {p.currencyPairs ? <span className="chip">{p.currencyPairs}</span> : null}
        {(() => {
          const r = resolveProspect(data, p);
          const st = briefState(r);
          if (st === 'no-brief') return null;
          const call = r.type === 'call';
          return (
            <span
              className={`chip ${st === 'ready' ? 'brief-chip-ok' : 'brief-chip-warn'}`}
              title={st === 'ready' ? `${call ? 'Call' : 'Email'} brief ready → ${call ? r.contactPhone : r.contactEmail}` : `Brief written — no contact ${call ? 'phone' : 'email'}`}
            >
              {TYPE_ICON[r.type]}
              {st === 'ready' ? '' : call ? ' no phone' : ' no email'}
            </span>
          );
        })()}
      </div>
      <HubLinks prospect={p} />
    </div>
  );
}
