import { useMemo, useState } from 'react';
import type { AccountSection, Prospect, SortBy, Temperature } from '../types';
import { useStore } from '../store/StoreContext';
import { formatDisplay, isOverdue, isDueToday } from '../utils/dates';
import { is2027Account, prospectsInSection } from '../utils/accountSection';
import { FollowUpMeeting } from '../components/FollowUpMeeting';
import { HubLinks } from '../components/HubLinks';

const COLS: Temperature[] = ['Cold', 'Warm', 'Hot'];

export function Accounts2027View({
  onOpenProspect,
  onAdd,
  onMoved,
}: {
  onOpenProspect: (id: string) => void;
  onAdd: () => void;
  onMoved?: (message: string) => void;
}) {
  return (
    <PipelineView section="2027" onOpenProspect={onOpenProspect} onAdd={onAdd} onMoved={onMoved} />
  );
}

export function PipelineView({
  onOpenProspect,
  section = 'pipeline',
  onAdd,
  onMoved,
}: {
  onOpenProspect: (id: string) => void;
  section?: AccountSection;
  onAdd?: () => void;
  onMoved?: (message: string) => void;
}) {
  const { data, setAccountSection } = useStore();
  const [minPriority, setMinPriority] = useState(0);
  const [sortBy, setSortBy] = useState<SortBy>('nextFollowUp');
  const [docsOnly, setDocsOnly] = useState(false);
  const is2027 = section === '2027';
  const pool = useMemo(() => prospectsInSection(data.prospects, section), [data.prospects, section]);
  const docsCount = pool.filter((p) => p.documentsSent?.date).length;

  const filtered = useMemo(() => {
    let list = pool.filter((p) => p.priority >= minPriority && (!docsOnly || !!p.documentsSent?.date));
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
  }, [pool, minPriority, sortBy, docsOnly]);

  const byTemp = (t: Temperature) => filtered.filter((p) => p.temperature === t);

  const move = (p: Prospect) => {
    const to2027 = !is2027;
    const ok = confirm(
      to2027
        ? `Move “${p.company}” to 2027 Accounts?\n\nSame account — contacts, notes, follow-ups and meeting links stay. It leaves Pipeline.`
        : `Move “${p.company}” back to Pipeline?\n\nSame account — contacts, notes, follow-ups and meeting links stay. It leaves 2027 Accounts.`,
    );
    if (!ok) return;
    setAccountSection(p.id, to2027 ? '2027' : 'pipeline');
    onMoved?.(to2027 ? `Moved ${p.company} to 2027 Accounts` : `Moved ${p.company} back to Pipeline`);
  };

  return (
    <div data-testid={is2027 ? 'accounts-2027' : 'pipeline'}>
      <div className="section-title">
        <h2>{is2027 ? '2027 Accounts' : 'Pipeline'}</h2>
        <div className="section-title-actions">
          <span className="count">
            {filtered.length} {is2027 ? (filtered.length === 1 ? 'account' : 'accounts') : 'active'}
          </span>
          {is2027 && onAdd ? (
            <button type="button" className="btn btn-primary btn-sm" onClick={onAdd}>
              + Add 2027 account
            </button>
          ) : null}
        </div>
      </div>
      {is2027 ? (
        <p className="section-lead">
          Businesses expected to sign and trade in 2027. Same account cards and fields as Pipeline — a
          classification, not a forecast. Nothing is moved here unless you add it or set Classification to 2027 Accounts.
        </p>
      ) : null}
      {is2027 && pool.length === 0 ? (
        <p className="empty-hint">
          No 2027 accounts yet. Add one here, or open a pipeline prospect and set Classification to 2027 Accounts.
          Existing accounts stay in Pipeline until you move them.
        </p>
      ) : null}
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
                items.map((p) => (
                  <ProspectCard key={p.id} prospect={p} section={section} onOpen={onOpenProspect} onMove={move} />
                ))
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
  section,
  onOpen,
  onMove,
}: {
  prospect: Prospect;
  section: AccountSection;
  onOpen: (id: string) => void;
  onMove: (p: Prospect) => void;
}) {
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
        {is2027Account(p) ? <span className="chip year-2027">2027</span> : null}
        <span className="chip priority">P{p.priority}</span>
        <span className="chip type">{p.type}</span>
        {p.nextFollowUp ? (
          <span className={`chip ${dueClass}`}>
            {formatDisplay(p.nextFollowUp)}
            {isOverdue(p.nextFollowUp) ? ' overdue' : isDueToday(p.nextFollowUp) ? ' today' : ''}
          </span>
        ) : null}
        {p.currencyPairs ? <span className="chip">{p.currencyPairs}</span> : null}
      </div>
      <HubLinks prospect={p} />
      <FollowUpMeeting rec={{ kind: 'prospect', item: p }} variant="card" />
      <button
        type="button"
        className="btn btn-ghost btn-sm card-move"
        onClick={(e) => {
          e.stopPropagation();
          onMove(p);
        }}
      >
        {section === '2027' ? '← Move back to Pipeline' : '→ Move to 2027 Accounts'}
      </button>
    </div>
  );
}
