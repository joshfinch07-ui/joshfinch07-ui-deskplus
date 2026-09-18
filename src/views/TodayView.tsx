import { useMemo } from 'react';
import { useStore } from '../store/StoreContext';
import { formatDisplay, isDueToday, isOverdue, isDueOrOverdue } from '../utils/dates';

export function TodayView({
  onOpenProspect,
}: {
  onOpenProspect: (id: string) => void;
}) {
  const { data, toggleTask, deleteTask, setTradeIdeaStatus } = useStore();

  const openTasks = useMemo(
    () => data.tasks.filter((t) => !t.completed),
    [data.tasks],
  );

  const callsToMake = useMemo(
    () =>
      openTasks.filter(
        (t) =>
          (t.kind === 'call' ||
            t.kind === 'confirmation-call' ||
            t.kind === 'follow-up-call') &&
          isDueOrOverdue(t.dueDate),
      ),
    [openTasks],
  );

  const followUpsDue = useMemo(() => {
    const fromTasks = openTasks.filter(
      (t) =>
        t.kind !== 'call' &&
        t.kind !== 'confirmation-call' &&
        t.kind !== 'follow-up-call' &&
        isDueOrOverdue(t.dueDate),
    );
    const fromProspects = data.prospects.filter((p) => isDueOrOverdue(p.nextFollowUp));
    return { fromTasks, fromProspects };
  }, [openTasks, data.prospects]);

  const meetingsToday = useMemo(
    () => data.meetings.filter((m) => isDueToday(m.meetingDate) && !m.outcome),
    [data.meetings],
  );

  const tradeChases = useMemo(
    () =>
      data.tradeIdeas.filter(
        (t) => t.status === 'Open' && isDueOrOverdue(t.chaseDate),
      ),
    [data.tradeIdeas],
  );

  const followUpCount =
    followUpsDue.fromTasks.length + followUpsDue.fromProspects.length + tradeChases.length;
  const overdueFollowUps =
    followUpsDue.fromTasks.some((t) => isOverdue(t.dueDate)) ||
    followUpsDue.fromProspects.some((p) => isOverdue(p.nextFollowUp)) ||
    tradeChases.some((t) => isOverdue(t.chaseDate));

  return (
    <div>
      <div className="kpi-row">
        <div className={`kpi-card${callsToMake.length ? ' has-items' : ''}${callsToMake.some((c) => isOverdue(c.dueDate)) ? ' overdue' : ''}`}>
          <div className="label">Calls to make</div>
          <div className="value">{callsToMake.length}</div>
          <div className="hint">{callsToMake.length ? 'Due today or overdue' : 'All clear.'}</div>
        </div>
        <div className={`kpi-card${followUpCount ? ' has-items' : ''}${overdueFollowUps ? ' overdue' : ''}`}>
          <div className="label">Follow-ups due</div>
          <div className="value">{followUpCount}</div>
          <div className="hint">{followUpCount ? 'Tasks, prospects & trade chases' : 'All clear.'}</div>
        </div>
        <div className={`kpi-card${meetingsToday.length ? ' has-items' : ''}`}>
          <div className="label">Meetings today</div>
          <div className="value">{meetingsToday.length}</div>
          <div className="hint">{meetingsToday.length ? 'On the calendar' : 'None today.'}</div>
        </div>
      </div>

      <div className="card">
        <div className="section-title">
          <h2>📞 Calls to make</h2>
          <span className="count">{callsToMake.length}</span>
        </div>
        {callsToMake.length === 0 ? (
          <p className="empty-hint">All clear</p>
        ) : (
          callsToMake.map((t) => (
            <div
              key={t.id}
              className={`list-item${isOverdue(t.dueDate) ? ' overdue' : ' due-today'}`}
            >
              <button
                type="button"
                className={`check${t.completed ? ' done' : ''}`}
                onClick={() => toggleTask(t.id)}
                aria-label="Complete"
              >
                {t.completed ? '✓' : ''}
              </button>
              <div className="title">
                {t.title}
                {t.isExample ? <span className="example-badge">EXAMPLE</span> : null}
              </div>
              <span className="due">{formatDisplay(t.dueDate)}{isOverdue(t.dueDate) ? ' · overdue' : ''}</span>
              <button type="button" className="icon-btn" onClick={() => deleteTask(t.id)} aria-label="Delete">
                ×
              </button>
            </div>
          ))
        )}
      </div>

      <div className="card">
        <div className="section-title">
          <h2>🔔 Follow-ups due</h2>
          <span className="count">{followUpCount}</span>
        </div>
        {followUpCount === 0 ? (
          <p className="empty-hint">None today</p>
        ) : (
          <>
            {followUpsDue.fromTasks.map((t) => (
              <div
                key={t.id}
                className={`list-item${isOverdue(t.dueDate) ? ' overdue' : ' due-today'}`}
              >
                <button
                  type="button"
                  className="check"
                  onClick={() => toggleTask(t.id)}
                  aria-label="Complete"
                />
                <div className="title">
                  {t.title}
                  {t.isExample ? <span className="example-badge">EXAMPLE</span> : null}
                </div>
                <span className="due">
                  {formatDisplay(t.dueDate)}
                  {isOverdue(t.dueDate) ? ' · overdue' : ' · today'}
                </span>
              </div>
            ))}
            {followUpsDue.fromProspects.map((p) => (
              <div
                key={p.id}
                className={`list-item${isOverdue(p.nextFollowUp) ? ' overdue' : ' due-today'}`}
                style={{ cursor: 'pointer' }}
                onClick={() => onOpenProspect(p.id)}
                onKeyDown={(e) => e.key === 'Enter' && onOpenProspect(p.id)}
                role="button"
                tabIndex={0}
              >
                <div className="title">
                  Prospect follow-up — {p.company}
                  {p.isExample ? <span className="example-badge">EXAMPLE</span> : null}
                  <div style={{ fontWeight: 400, color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                    {p.nextSteps || p.contact || 'Open card'}
                  </div>
                </div>
                <span className="due">
                  {formatDisplay(p.nextFollowUp)}
                  {isOverdue(p.nextFollowUp) ? ' · overdue' : ' · today'}
                </span>
              </div>
            ))}
            {tradeChases.map((t) => (
              <div
                key={t.id}
                className={`list-item${isOverdue(t.chaseDate) ? ' overdue' : ' due-today'}`}
              >
                <button
                  type="button"
                  className="check"
                  onClick={() => setTradeIdeaStatus(t.id, 'Done')}
                  aria-label="Mark done"
                />
                <div className="title">
                  Trade idea chase — {t.client} · {t.pair}
                  {t.isExample ? <span className="example-badge">EXAMPLE</span> : null}
                  <div style={{ fontWeight: 400, color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                    {t.structure} — {t.idea}
                  </div>
                </div>
                <span className="due">
                  {formatDisplay(t.chaseDate)}
                  {isOverdue(t.chaseDate) ? ' · overdue' : ' · today'}
                </span>
              </div>
            ))}
          </>
        )}
      </div>

      <div className="card">
        <div className="section-title">
          <h2>📅 Meetings today</h2>
          <span className="count">{meetingsToday.length}</span>
        </div>
        {meetingsToday.length === 0 ? (
          <p className="empty-hint">None today</p>
        ) : (
          meetingsToday.map((m) => (
            <div key={m.id} className="list-item due-today">
              <div className="title">
                {m.company}
                {m.isExample ? <span className="example-badge">EXAMPLE</span> : null}
                <div style={{ fontWeight: 400, color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                  {m.contact || 'No contact'}
                  {m.meetingTime ? ` · ${m.meetingTime}` : ''} {m.timezone ? `(${m.timezone})` : ''}
                </div>
              </div>
              <span className="due">{formatDisplay(m.meetingDate)}</span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
