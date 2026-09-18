import { useMemo, useState } from 'react';
import type { Meeting } from '../types';
import { useStore } from '../store/StoreContext';
import { formatDisplay, isDueToday, isOverdue } from '../utils/dates';
import { BookMeetingForm, LogMeetingForm } from '../components/MeetingForms';

export function MeetingsView() {
  const { data, deleteMeeting } = useStore();
  const [bookOpen, setBookOpen] = useState(false);
  const [logOpen, setLogOpen] = useState(false);
  const [logTarget, setLogTarget] = useState<Meeting | null>(null);

  const upcoming = useMemo(
    () =>
      [...data.meetings]
        .filter((m) => !m.outcome)
        .sort((a, b) => a.meetingDate.localeCompare(b.meetingDate)),
    [data.meetings],
  );
  const attended = useMemo(
    () => data.meetings.filter((m) => m.outcome === 'Attended'),
    [data.meetings],
  );
  const noShows = useMemo(
    () => data.meetings.filter((m) => m.outcome === 'No-show'),
    [data.meetings],
  );

  return (
    <div>
      <div className="section-title">
        <h2>Meetings</h2>
        <div className="row-actions">
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setBookOpen(true)}>
            + Book meeting
          </button>
          <button
            type="button"
            className="btn btn-primary btn-sm"
            onClick={() => {
              setLogTarget(null);
              setLogOpen(true);
            }}
          >
            + Log meeting
          </button>
        </div>
      </div>

      <div className="card">
        <div className="section-title">
          <h2 style={{ fontSize: '1rem' }}>Upcoming</h2>
          <span className="count">{upcoming.length}</span>
        </div>
        {upcoming.length === 0 ? (
          <p className="empty-hint">No upcoming meetings.</p>
        ) : (
          upcoming.map((m) => (
            <div
              key={m.id}
              className={`list-item${isOverdue(m.meetingDate) ? ' overdue' : isDueToday(m.meetingDate) ? ' due-today' : ''}`}
            >
              <div className="title">
                {m.company}
                {m.isExample ? <span className="example-badge">EXAMPLE</span> : null}
                <div style={{ fontWeight: 400, color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                  {m.contact || 'No contact'}
                  {m.meetingTime ? ` · ${m.meetingTime}` : ''} · {m.timezone}
                </div>
              </div>
              <span className="due">{formatDisplay(m.meetingDate)}</span>
              <div className="row-actions">
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={() => {
                    setLogTarget(m);
                    setLogOpen(true);
                  }}
                >
                  Log outcome
                </button>
                <button type="button" className="icon-btn" onClick={() => deleteMeeting(m.id)}>
                  ×
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      <div className="card">
        <div className="section-title">
          <h2 style={{ fontSize: '1rem' }}>
            <span style={{ marginRight: 6 }}>📅</span> Meeting tracker
          </h2>
        </div>
        <div className="meeting-grid">
          <div>
            <div className="attended-label">ATTENDED ({attended.length})</div>
            {attended.length === 0 ? (
              <p className="empty-hint">No attended meetings logged yet.</p>
            ) : (
              attended.map((m) => (
                <div key={m.id} className="list-item">
                  <div className="title">
                    {m.company}
                    {m.isExample ? <span className="example-badge">EXAMPLE</span> : null}
                    <div style={{ fontWeight: 400, color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                      {formatDisplay(m.meetingDate)}
                      {m.rating ? ` · ★${m.rating}` : ''}
                      {m.temperature ? ` · ${m.temperature}` : ''}
                      {m.notes ? ` — ${m.notes}` : ''}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
          <div>
            <div className="noshow-label">NOT ATTENDED ({noShows.length})</div>
            {noShows.length === 0 ? (
              <p className="empty-hint">No no-shows logged.</p>
            ) : (
              noShows.map((m) => (
                <div key={m.id} className="list-item">
                  <div className="title">
                    {m.company}
                    {m.isExample ? <span className="example-badge">EXAMPLE</span> : null}
                    <div style={{ fontWeight: 400, color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                      {formatDisplay(m.meetingDate)}
                      {m.notes ? ` — ${m.notes}` : ''}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {bookOpen ? <BookMeetingForm onClose={() => setBookOpen(false)} /> : null}
      {logOpen ? (
        <LogMeetingForm
          meeting={logTarget}
          onClose={() => {
            setLogOpen(false);
            setLogTarget(null);
          }}
        />
      ) : null}
    </div>
  );
}
