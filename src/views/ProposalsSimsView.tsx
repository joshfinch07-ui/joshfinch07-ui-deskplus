import { useMemo, useState } from 'react';
import { format, parse } from 'date-fns';
import type { Proposal, ProposalStatus, Simulation, SimulationStatus } from '../types';
import { useStore } from '../store/StoreContext';
import { BriefChip } from '../components/EmailBrief';
import { EmailSendActions } from '../components/EmailSendActions';
import { draftFromBrief, emailSubject } from '../utils/emailDraft';
import { ProposalForm, SimulationForm, PROPOSAL_STATUSES, SIM_STATUSES, nextMonthOf } from '../components/ProposalForms';
import { Toast } from '../components/Toast';
import { resolveProposal, resolveSimulation, TYPE_ICON } from '../utils/brief';
import { formatDisplay, isDueToday, isOverdue } from '../utils/dates';

export type PSSection = 'proposals' | 'sims';
export interface PSFocus {
  section?: PSSection;
  prospectId?: string;
  highlightId?: string;
}

type PSort = 'sent' | 'followup' | 'company' | 'status';
const OPEN_P: ProposalStatus[] = ['Sent', 'Discussing'];
const ACTIVE_S: SimulationStatus[] = ['Running', 'Reviewed'];

const monthLabel = (m: string) => {
  try {
    return format(parse(m, 'yyyy-MM', new Date()), 'MMMM yyyy');
  } catch {
    return m;
  }
};

function dueCls(d: string | null | undefined, open: boolean) {
  if (!open || !d) return '';
  return isOverdue(d) ? ' overdue' : isDueToday(d) ? ' due-today' : '';
}

export function ProposalsSimsView({
  focus,
  onOpenMeeting,
  onClearFocus,
}: {
  focus?: PSFocus;
  onOpenMeeting: (meetingId: string) => void;
  onClearFocus: () => void;
}) {
  const { data, setProposalStatus, setSimulationStatus, deleteProposal, deleteSimulation, rollSimulation } = useStore();
  const [section, setSection] = useState<PSSection>(focus?.section ?? 'proposals');
  const [pFilter, setPFilter] = useState<'All' | 'Open' | ProposalStatus>('All');
  const [sFilter, setSFilter] = useState<'All' | 'Active' | SimulationStatus>('All');
  const [sort, setSort] = useState<PSort>('sent');
  const [editP, setEditP] = useState<Partial<Proposal> | null>(null);
  const [editS, setEditS] = useState<Partial<Simulation> | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const hubId = focus?.prospectId;
  const hub = hubId ? data.prospects.find((p) => p.id === hubId) : undefined;

  const proposals = data.proposals ?? [];
  const sims = data.simulations ?? [];
  const counts = useMemo(() => {
    const c: Record<ProposalStatus, number> = { Sent: 0, Discussing: 0, Won: 0, Lost: 0, Parked: 0 };
    for (const p of proposals) if (!hubId || p.prospectId === hubId) c[p.status] = (c[p.status] ?? 0) + 1;
    return c;
  }, [proposals, hubId]);
  const decided = counts.Won + counts.Lost;

  const pList = useMemo(() => {
    const l = proposals.filter(
      (p) =>
        (!hubId || p.prospectId === hubId) &&
        (pFilter === 'All' ? true : pFilter === 'Open' ? OPEN_P.includes(p.status) : p.status === pFilter),
    );
    const key = (p: Proposal) =>
      sort === 'sent' ? p.dateSent ?? '' : sort === 'followup' ? p.followUpDate ?? '9999' : sort === 'company' ? p.company.toLowerCase() : String(PROPOSAL_STATUSES.indexOf(p.status));
    return [...l].sort((a, b) => (sort === 'sent' ? key(b).localeCompare(key(a)) : key(a).localeCompare(key(b))));
  }, [proposals, hubId, pFilter, sort]);

  const sGroups = useMemo(() => {
    const l = sims.filter(
      (s) =>
        (!hubId || s.prospectId === hubId) &&
        (sFilter === 'All' ? true : sFilter === 'Active' ? ACTIVE_S.includes(s.status) : s.status === sFilter),
    );
    const by = new Map<string, Simulation[]>();
    for (const s of l) by.set(s.month, [...(by.get(s.month) ?? []), s]);
    return [...by.entries()]
      .sort((a, b) => b[0].localeCompare(a[0]))
      .map(([m, list]) => [m, list.sort((a, b) => a.company.localeCompare(b.company))] as const);
  }, [sims, hubId, sFilter]);

  const meetingOf = (id?: string | null) => (id ? data.meetings.find((m) => m.id === id) : undefined);

  return (
    <div>
      <div className="section-title">
        <h2>Proposals &amp; Sims</h2>
        <div className="subtabs" role="tablist">
          <button type="button" role="tab" aria-selected={section === 'proposals'} className={section === 'proposals' ? 'on' : ''} onClick={() => setSection('proposals')}>
            📄 Proposals <span className="count">{proposals.length}</span>
          </button>
          <button type="button" role="tab" aria-selected={section === 'sims'} className={section === 'sims' ? 'on' : ''} onClick={() => setSection('sims')}>
            📈 Live simulations <span className="count">{sims.length}</span>
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

      {section === 'proposals' ? (
        <div className="card">
          <div className="ps-toolbar">
            <div className="ps-counts">
              <span className="pill pill-won">Won {counts.Won}</span>
              <span className="pill pill-lost">Lost {counts.Lost}</span>
              <span className="pill">Open {counts.Sent + counts.Discussing}</span>
              <span className="pill">Parked {counts.Parked}</span>
              {decided ? <span className="ps-rate">win rate {Math.round((counts.Won / decided) * 100)}%</span> : null}
            </div>
            <select className="select" value={pFilter} onChange={(e) => setPFilter(e.target.value as typeof pFilter)} aria-label="Filter proposals by status">
              <option value="All">All statuses</option>
              <option value="Open">Open (Sent + Discussing)</option>
              {PROPOSAL_STATUSES.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
            <select className="select" value={sort} onChange={(e) => setSort(e.target.value as PSort)} aria-label="Sort proposals">
              <option value="sent">Newest sent</option>
              <option value="followup">Follow-up date</option>
              <option value="company">Company</option>
              <option value="status">Status</option>
            </select>
            <button type="button" className="btn btn-primary btn-sm" onClick={() => setEditP({ prospectId: hub?.id ?? null, company: hub?.company ?? '' })}>
              + New proposal
            </button>
          </div>
          <div className="ps-row ps-head" aria-hidden>
            <span className="c-co">Company</span>
            <span className="c-date">Sent</span>
            <span className="c-pair">Pair · volume</span>
            <span className="c-what">Proposed</span>
            <span className="c-status">Status</span>
            <span className="c-fu">Follow-up</span>
            <span className="c-chip" />
            <span className="c-act" />
          </div>
          {pList.length === 0 ? <p className="empty-hint">No proposals{pFilter !== 'All' ? ` with status ${pFilter}` : ''}. “Send proposal” on a meeting creates one pre-filled.</p> : null}
          {pList.map((p) => {
            const m = meetingOf(p.meetingId);
            const open = OPEN_P.includes(p.status);
            return (
              <div
                key={p.id}
                className={`ps-row prop-row status-${p.status.toLowerCase()}${dueCls(p.followUpDate, open)}${focus?.highlightId === p.id ? ' highlight' : ''}`}
                data-id={p.id}
              >
                <span className="c-co" title={p.company}>
                  {p.prospectId ? '' : <span className="warn-dot" title="Not linked to a pipeline prospect">⚠ </span>}
                  <button type="button" className="row-link" onClick={() => setEditP(p)}>
                    {p.company}
                  </button>
                  {p.isExample ? <span className="example-badge">EX</span> : null}
                </span>
                <span className="c-date">{formatDisplay(p.dateSent)}</span>
                <span className="c-pair" title={`${p.pairs} ${p.volume}`}>
                  {[p.pairs, p.volume].filter(Boolean).join(' · ') || '—'}
                </span>
                <span className="c-what" title={p.proposed}>
                  {p.proposed || '—'}
                </span>
                <span className="c-status">
                  <select value={p.status} onChange={(e) => setProposalStatus(p.id, e.target.value as ProposalStatus)} aria-label={`Status ${p.company}`}>
                    {PROPOSAL_STATUSES.map((s) => (
                      <option key={s}>{s}</option>
                    ))}
                  </select>
                </span>
                <span className="c-fu">
                  {p.followUpDate && open ? `${TYPE_ICON[p.followUpType ?? 'email']} ${formatDisplay(p.followUpDate)}` : '—'}
                  {(p.attempts ?? 0) > 0 && open ? <span className="attempt-chip mini">A{(p.attempts ?? 0) + 1}</span> : null}
                </span>
                <span className="c-chip">
                  {open ? <BriefChip brief={resolveProposal(data, p)} onClick={() => setEditP(p)} /> : null}
                  {open && resolveProposal(data, p).type === 'email' ? (
                    <EmailSendActions
                      draft={draftFromBrief(resolveProposal(data, p), emailSubject(p.company, 'proposal'))}
                      label={p.company}
                    />
                  ) : null}
                  {m ? (
                    <button type="button" className="meeting-chip" onClick={() => onOpenMeeting(m.id)} title="Open the meeting">
                      📅 {formatDisplay(m.meetingDate)}
                    </button>
                  ) : null}
                </span>
                <span className="c-act">
                  <button type="button" className="icon-btn" aria-label="Edit" onClick={() => setEditP(p)}>
                    ✎
                  </button>
                  <button
                    type="button"
                    className="icon-btn"
                    aria-label="Delete"
                    onClick={() => confirm(`Delete the proposal to ${p.company}?`) && deleteProposal(p.id)}
                  >
                    ×
                  </button>
                </span>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="card">
          <div className="ps-toolbar">
            <p className="calendar-hint" style={{ margin: 0, flex: 1 }}>
              Month-end live simulations, newest month first. “Roll ▸” copies a running sim into next month.
            </p>
            <select className="select" value={sFilter} onChange={(e) => setSFilter(e.target.value as typeof sFilter)} aria-label="Filter sims by status">
              <option value="All">All statuses</option>
              <option value="Active">Active (Running + Reviewed)</option>
              {SIM_STATUSES.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
            <button type="button" className="btn btn-primary btn-sm" onClick={() => setEditS({ prospectId: hub?.id ?? null, company: hub?.company ?? '' })}>
              + New simulation
            </button>
          </div>
          {sGroups.length === 0 ? <p className="empty-hint">No simulations yet.</p> : null}
          {sGroups.map(([month, list]) => (
            <div key={month} className="sim-month" data-month={month}>
              <div className="sim-month-head">
                <strong>{monthLabel(month)}</strong> <span className="count">{list.length}</span>
                <span className="section-sub">
                  {list.filter((s) => s.status === 'Running').length} running · {list.filter((s) => s.status === 'Converted').length} converted
                </span>
              </div>
              {list.map((s) => {
                const open = ACTIVE_S.includes(s.status);
                const rolledTo = s.rolledToId ? sims.find((x) => x.id === s.rolledToId) : undefined;
                return (
                  <div
                    key={s.id}
                    className={`ps-row sim-row status-${s.status.toLowerCase()}${dueCls(s.followUpDate, open)}${focus?.highlightId === s.id ? ' highlight' : ''}`}
                    data-id={s.id}
                  >
                    <span className="c-co" title={s.company}>
                      {s.prospectId ? '' : (
                        <button type="button" className="warn-dot link-btn" title="Not linked to a pipeline prospect — click to link" onClick={() => setEditS(s)}>
                          ⚠ link
                        </button>
                      )}{' '}
                      <button type="button" className="row-link" onClick={() => setEditS(s)}>
                        {s.company}
                      </button>
                      {s.migratedFrom ? <span className="mini-tag" title="Converted from a Trade idea">TI</span> : null}
                      {s.isExample ? <span className="example-badge">EX</span> : null}
                    </span>
                    <span className="c-pair" title={`${s.pair} ${s.volume}`}>
                      {[s.pair, s.volume].filter(Boolean).join(' · ') || '—'}
                    </span>
                    <span className="c-what" title={`${s.structure}${s.outcome ? ` — ${s.outcome}` : ''}`}>
                      {s.structure || '—'}
                      {s.outcome ? <span className="muted"> — {s.outcome}</span> : null}
                    </span>
                    <span className="c-date">{s.sentDate ? formatDisplay(s.sentDate) : '—'}</span>
                    <span className="c-status">
                      <select value={s.status} onChange={(e) => setSimulationStatus(s.id, e.target.value as SimulationStatus)} aria-label={`Status ${s.company}`}>
                        {SIM_STATUSES.map((x) => (
                          <option key={x}>{x}</option>
                        ))}
                      </select>
                    </span>
                    <span className="c-fu">{s.followUpDate && open ? `${TYPE_ICON[s.followUpType ?? 'email']} ${formatDisplay(s.followUpDate)}` : '—'}</span>
                    <span className="c-chip">
                      {open ? <BriefChip brief={resolveSimulation(data, s)} onClick={() => setEditS(s)} /> : null}
                      {open && resolveSimulation(data, s).type === 'email' ? (
                        <EmailSendActions
                          draft={draftFromBrief(resolveSimulation(data, s), emailSubject(s.company, 'sim'))}
                          label={s.company}
                        />
                      ) : null}
                    </span>
                    <span className="c-act">
                      {rolledTo ? (
                        <span className="mini-tag" title="Already rolled">→ {rolledTo.month}</span>
                      ) : s.status === 'Running' ? (
                        <button
                          type="button"
                          className="btn btn-sm btn-ghost roll-btn"
                          title={`Copy into ${monthLabel(nextMonthOf(s.month))}`}
                          onClick={() => {
                            const c = rollSimulation(s.id);
                            if (c) setToast(`Rolled ${s.company} into ${monthLabel(c.month)}`);
                          }}
                        >
                          Roll ▸
                        </button>
                      ) : null}
                      <button type="button" className="icon-btn" aria-label="Edit" onClick={() => setEditS(s)}>
                        ✎
                      </button>
                      <button
                        type="button"
                        className="icon-btn"
                        aria-label="Delete"
                        onClick={() => confirm(`Delete the ${s.month} sim for ${s.company}?`) && deleteSimulation(s.id)}
                      >
                        ×
                      </button>
                    </span>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      )}
      {editP ? <ProposalForm initial={editP} onClose={() => setEditP(null)} /> : null}
      {editS ? <SimulationForm initial={editS} onClose={() => setEditS(null)} /> : null}
      {toast ? <Toast message={toast} onDone={() => setToast(null)} /> : null}
    </div>
  );
}
