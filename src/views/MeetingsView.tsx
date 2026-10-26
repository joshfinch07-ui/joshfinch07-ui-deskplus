import { useEffect, useMemo, useState } from 'react';
import type { Meeting, Proposal } from '../types';
import { useStore } from '../store/StoreContext';
import { formatDisplay, isDueToday, isOverdue, todayISO } from '../utils/dates';
import { BookMeetingForm, LogMeetingForm, EditBookedByForm, bookedByLabel } from '../components/MeetingForms';
import { ProposalForm } from '../components/ProposalForms';
import { useNav, type NavFocus } from '../nav';
import { prospectByName } from '../utils/company';

/** Linked-proposal chips + "Send proposal" for one meeting. */
function MeetingProposals({ m, onSend }: { m: Meeting; onSend: (m: Meeting) => void }) {
  const { data } = useStore();
  const { go } = useNav();
  const linked = (data.proposals ?? []).filter((p) => p.meetingId === m.id);
  return (
    <span className="meeting-proposals">
      {linked.map((p) => (
        <button
          key={p.id}
          type="button"
          className={`proposal-chip status-${p.status.toLowerCase()}`}
          onClick={() => go('proposals', { section: 'proposals', highlightId: p.id })}
          title={`${p.pairs} ${p.volume} — ${p.proposed}`}
        >
          📄 Proposal · {p.status}
        </button>
      ))}
      <button type="button" className="btn btn-ghost btn-sm send-proposal-btn" onClick={() => onSend(m)}>
        📄 Send proposal
      </button>
    </span>
  );
}

export function MeetingsView({ focus, onClearFocus }: { focus?: NavFocus; onClearFocus?: () => void }) {
  const { data, deleteMeeting } = useStore();
  const [proposalFor, setProposalFor] = useState<Partial<Proposal> | null>(null);
  const sendProposal = (m: Meeting) => {
    const p = (m.prospectId && data.prospects.find((x) => x.id === m.prospectId)) || prospectByName(data, m.company);
    setProposalFor({
      company: p?.company ?? m.company,
      prospectId: p?.id ?? null,
      dateSent: todayISO(),
      meetingId: m.id,
      pairs: m.currencies || p?.currencyPairs || '',
      volume: m.fxVolume || '',
      status: 'Sent',
    });
  };
  const hub = focus?.prospectId ? data.prospects.find((p) => p.id === focus.prospectId) : undefined;
  const inHub = (m: Meeting) => !hub || m.prospectId === hub.id || m.company.trim().toLowerCase() === hub.company.trim().toLowerCase();
  useEffect(() => {
    if (focus?.highlightId) document.querySelector(`[data-meeting="${focus.highlightId}"]`)?.scrollIntoView({ block: 'center' });
  }, [focus?.highlightId]);
  const hl = (m: Meeting) => (focus?.highlightId === m.id ? ' highlight' : '');
  const [bookOpen, setBookOpen] = useState(false);
  const [logOpen, setLogOpen] = useState(false);
  const [logTarget, setLogTarget] = useState<Meeting | null>(null);
  const [editBy, setEditBy] = useState<Meeting | null>(null);

  const upcoming = useMemo(
    () =>
      [...data.meetings]
        .filter((m) => !m.outcome && inHub(m))
        .sort((a, b) => (a.meetingDate + (a.meetingTime || '')).localeCompare(b.meetingDate + (b.meetingTime || ''))),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [data.meetings, hub?.id],
  );
  const attended = useMemo(
    () => data.meetings.filter((m) => m.outcome === 'Attended' && inHub(m)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [data.meetings, hub?.id],
  );
  const noShows = useMemo(
    () => data.meetings.filter((m) => m.outcome === 'No-show' && inHub(m)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [data.meetings, hub?.id],
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

      {hub ? (
        <div className="hub-filter">
          Showing <strong>{hub.company}</strong> only{' '}
          <button type="button" className="link-btn" onClick={onClearFocus}>
            show all
          </button>
        </div>
      ) : null}
      <div className="card upcoming-meetings">
        <div className="section-title">
          <h2 style={{ fontSize: '1rem' }}>Upcoming meetings</h2>
          <span className="count">{upcoming.length}</span>
        </div>
        <p className="empty-hint" style={{ marginTop: 0 }}>
          Booked, not yet sat — not in the Pipeline until you log them as attended.
        </p>
        {upcoming.length === 0 ? (
          <p className="empty-hint">No upcoming meetings.</p>
        ) : (
          ([
            ['Me', 'Booked by me'],
            ['Daniel', 'Booked by Daniel'],
            ['Other', 'Booked by other associates'],
          ] as const).map(([key, label]) => {
            const list = upcoming.filter((m) => (m.bookedBy ?? 'Me') === key);
            return (
              <div key={key} className="booked-group" data-booked-group={key}>
                <div className="attended-label">
                  {label.toUpperCase()} ({list.length})
                </div>
                {list.length === 0 ? (
                  <p className="empty-hint">None.</p>
                ) : (
                  list.map((m) => (
                    <div
                      key={m.id}
                      data-meeting={m.id}
                      className={`list-item${isOverdue(m.meetingDate) ? ' overdue' : isDueToday(m.meetingDate) ? ' due-today' : ''}${hl(m)}`}
                    >
                      <div className="title">
                        {m.company}
                        {m.isExample ? <span className="example-badge">EXAMPLE</span> : null}
                        <div style={{ fontWeight: 400, color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                          {m.contact || 'No contact'}
                          {m.meetingTime ? ` · ${m.meetingTime}` : ''} · {m.timezone}
                          {m.currencies ? ` · ${m.currencies}` : ''}
                          {m.fxVolume ? ` · ${m.fxVolume}` : ''}
                          {key !== 'Me' ? ` · booked by ${bookedByLabel(m)}` : ''}
                        </div>
                        {m.notes ? (
                          <div style={{ fontWeight: 400, color: 'var(--text-muted)', fontSize: '0.8rem', whiteSpace: 'pre-wrap' }}>
                            {m.notes}
                          </div>
                        ) : null}
                      </div>
                      <span className="due">{formatDisplay(m.meetingDate)}</span>
                      <div className="row-actions">
                        <MeetingProposals m={m} onSend={sendProposal} />
                        <button type="button" className="btn btn-ghost btn-sm" onClick={() => setEditBy(m)}>
                          Booked by…
                        </button>
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
            );
          })
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
                <div key={m.id} className={`list-item${hl(m)}`} data-meeting={m.id}>
                  <div className="title">
                    {m.company}
                    {m.isExample ? <span className="example-badge">EXAMPLE</span> : null}
                    <div style={{ fontWeight: 400, color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                      {formatDisplay(m.meetingDate)}
                      {m.rating ? ` · ★${m.rating}` : ''}
                      {m.temperature ? ` · ${m.temperature}` : ''}
                      {m.notes ? ` — ${m.notes}` : ''}
                    </div>
                    <MeetingProposals m={m} onSend={sendProposal} />
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
                <div key={m.id} className={`list-item${hl(m)}`} data-meeting={m.id}>
                  <div className="title">
                    {m.company}
                    {m.isExample ? <span className="example-badge">EXAMPLE</span> : null}
                    <div style={{ fontWeight: 400, color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                      {formatDisplay(m.meetingDate)}
                      {m.notes ? ` — ${m.notes}` : ''}
                    </div>
                    <MeetingProposals m={m} onSend={sendProposal} />
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {proposalFor ? <ProposalForm initial={proposalFor} onClose={() => setProposalFor(null)} /> : null}
      {editBy ? <EditBookedByForm meeting={editBy} onClose={() => setEditBy(null)} /> : null}
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
