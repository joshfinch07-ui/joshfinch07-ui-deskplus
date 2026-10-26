import { useMemo, useState, type ReactNode } from 'react';
import type { ColdLead, Proposal, Prospect, Simulation, Task, TradeIdea } from '../types';
import { useStore, type BriefKind } from '../store/StoreContext';
import { BriefChip, BriefModal, type BriefValue } from '../components/EmailBrief';
import { EmailSendActions } from '../components/EmailSendActions';
import { draftFromBrief, emailSubject, type SubjectKind } from '../utils/emailDraft';
import { DonePopover, type DoneChoice, type GroupPart } from '../components/DonePopover';
import { Toast } from '../components/Toast';
import { linkedDueTasks, recentlyCompleted, type DoneInput, type DoneKind, type OutcomeKind, type UndoToken } from '../store/done';
import { formatWeekday, todayISO, uid } from '../utils/dates';
import type { FollowUpType } from '../types';
import {
  briefState,
  resolveColdLead,
  resolveProspect,
  resolveTask,
  resolveTrade,
  resolveProposal,
  resolveSimulation,
  TYPE_ICON,
  typeOfTask,
  briefLabels,
  findProspect,
  resolveCadence,
  type ResolvedBrief,
} from '../utils/brief';
import { formatDisplay, isDueToday, isOverdue, isDueOrOverdue } from '../utils/dates';

type FollowUpItem =
  | { kind: 'task'; item: Task; due: string | null }
  | { kind: 'prospect'; item: Prospect; due: string | null }
  | { kind: 'trade'; item: TradeIdea; due: string | null }
  | { kind: 'coldlead'; item: ColdLead; due: string | null }
  | { kind: 'proposal'; item: Proposal; due: string | null }
  | { kind: 'simulation'; item: Simulation; due: string | null };

/** One Today row: a single follow-up, or several for the same pipeline company. */
type Row =
  | { type: 'single'; f: FollowUpItem; due: string | null }
  | { type: 'group'; key: string; prospect?: Prospect; company: string; parts: FollowUpItem[]; due: string | null };

const PART_LABEL: Record<string, string> = {
  prospect: 'pipeline follow-up',
  proposal: 'proposal follow-up',
  simulation: 'sim follow-up',
};

function subjectFor(f: FollowUpItem): string {
  if (f.kind === 'task') {
    const kind: SubjectKind = f.item.kind === 'confirmation-email' ? 'confirmation' : 'follow-up';
    return emailSubject(f.item.relatedCompany || '', kind);
  }
  if (f.kind === 'proposal') return emailSubject(f.item.company, 'proposal');
  if (f.kind === 'simulation') return emailSubject(f.item.company, 'sim');
  if (f.kind === 'trade') return emailSubject(f.item.client, 'follow-up');
  return emailSubject(f.item.company, 'follow-up');
}

function inheritedBrief(p: Prospect | undefined): BriefValue | undefined {
  if (!p) return undefined;
  return {
    contactName: p.contact,
    contactEmail: p.contactEmail,
    contactPhone: p.contactPhone,
    briefWhat: p.briefWhat,
    briefHow: p.briefHow,
    followUpType: p.followUpType,
  };
}

function ReminderSection({
  title,
  count,
  variant,
  children,
  empty,
}: {
  title: string;
  count: number;
  variant: 'due-today' | 'overdue';
  children: ReactNode;
  empty: string;
}) {
  return (
    <div className={`reminder-section reminder-${variant}`}>
      <div className="reminder-heading">
        <h3>{title}</h3>
        <span className="count">{count}</span>
      </div>
      {count === 0 ? <p className="empty-hint">{empty}</p> : children}
    </div>
  );
}

export function TodayView({
  onOpenProspect,
}: {
  onOpenProspect: (id: string) => void;
}) {
  const {
    data,
    deleteTask,
    updateBrief,
    reopenItem,
    markFollowUpDone,
    markFollowUpsDone,
    undoFollowUpDone,
  } = useStore();
  const [groupFor, setGroupFor] = useState<{ row: Extract<Row, { type: 'group' }>; outcome: OutcomeKind } | null>(null);
  const [briefEdit, setBriefEdit] = useState<{
    kind: BriefKind;
    id: string;
    title: string;
    initial: BriefValue;
    inheritHint?: string;
    inheritedType?: FollowUpType;
    inherited?: BriefValue;
    subject?: string;
    contactName?: string;
  } | null>(null);
  const [doneFor, setDoneForState] = useState<{ f: FollowUpItem; outcome: OutcomeKind } | null>(null);
  const setDoneFor = (f: FollowUpItem | null, outcome: OutcomeKind = 'done') =>
    setDoneForState(f ? { f, outcome } : null);
  const [showAllRecent, setShowAllRecent] = useState(false);
  const [undo, setUndo] = useState<{ token: UndoToken; message: string } | null>(null);

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

  const callsOverdue = useMemo(
    () => callsToMake.filter((t) => isOverdue(t.dueDate)),
    [callsToMake],
  );
  const callsDueToday = useMemo(
    () => callsToMake.filter((t) => isDueToday(t.dueDate)),
    [callsToMake],
  );

  const followUps = useMemo(() => {
    const items: FollowUpItem[] = [];
    for (const t of openTasks) {
      if (
        t.kind === 'call' ||
        t.kind === 'confirmation-call' ||
        t.kind === 'follow-up-call'
      ) {
        continue;
      }
      if (isDueOrOverdue(t.dueDate)) {
        items.push({ kind: 'task', item: t, due: t.dueDate });
      }
    }
    for (const p of data.prospects) {
      if (isDueOrOverdue(p.nextFollowUp)) {
        items.push({ kind: 'prospect', item: p, due: p.nextFollowUp });
      }
    }
    for (const t of data.tradeIdeas) {
      if (t.status === 'Open' && isDueOrOverdue(t.chaseDate)) {
        items.push({ kind: 'trade', item: t, due: t.chaseDate });
      }
    }
    for (const c of data.coldLeads ?? []) {
      if (c.status === 'Open' && isDueOrOverdue(c.followUpDate)) {
        items.push({ kind: 'coldlead', item: c, due: c.followUpDate });
      }
    }
    for (const x of data.proposals ?? []) {
      if ((x.status === 'Sent' || x.status === 'Discussing') && isDueOrOverdue(x.followUpDate)) {
        items.push({ kind: 'proposal', item: x, due: x.followUpDate });
      }
    }
    for (const x of data.simulations ?? []) {
      if ((x.status === 'Running' || x.status === 'Reviewed') && isDueOrOverdue(x.followUpDate)) {
        items.push({ kind: 'simulation', item: x, due: x.followUpDate });
      }
    }
    return items;
  }, [openTasks, data.prospects, data.tradeIdeas, data.coldLeads, data.proposals, data.simulations]);

  /** Prospect = hub: a prospect and its proposals/sims due together become one company row. */
  const rows = useMemo(() => {
    const hubOf = (f: FollowUpItem): Prospect | undefined =>
      f.kind === 'prospect'
        ? f.item
        : f.kind === 'proposal' || f.kind === 'simulation'
          ? findProspect(data, f.item.prospectId, f.item.company)
          : undefined;
    const byHub = new Map<string, FollowUpItem[]>();
    for (const f of followUps) {
      const h = hubOf(f);
      if (h) byHub.set(h.id, [...(byHub.get(h.id) ?? []), f]);
    }
    const out: Row[] = [];
    const done = new Set<string>();
    for (const f of followUps) {
      const h = hubOf(f);
      const parts = h ? byHub.get(h.id)! : [];
      if (h && parts.length > 1) {
        if (done.has(h.id)) continue;
        done.add(h.id);
        const order = { prospect: 0, proposal: 1, simulation: 2 } as Record<string, number>;
        const sorted = [...parts].sort((a, b) => (order[a.kind] ?? 9) - (order[b.kind] ?? 9));
        const due = sorted.map((x) => x.due ?? '').filter(Boolean).sort()[0] ?? null;
        out.push({ type: 'group', key: h.id, prospect: h, company: h.company, parts: sorted, due });
      } else out.push({ type: 'single', f, due: f.due });
    }
    return out;
  }, [followUps, data]);
  const rowsOverdue = rows.filter((r) => isOverdue(r.due));
  const rowsDueToday = rows.filter((r) => isDueToday(r.due));

  const followUpsOverdue = useMemo(
    () => followUps.filter((f) => isOverdue(f.due)),
    [followUps],
  );
  const followUpsDueToday = useMemo(
    () => followUps.filter((f) => isDueToday(f.due)),
    [followUps],
  );

  const meetingsToday = useMemo(
    () => data.meetings.filter((m) => isDueToday(m.meetingDate) && !m.outcome),
    [data.meetings],
  );

  const followUpCount = followUps.length;
  const overdueFollowUps = followUpsOverdue.length > 0;

  const briefFor = (f: FollowUpItem): ResolvedBrief => {
    switch (f.kind) {
      case 'prospect':
        return resolveProspect(data, f.item);
      case 'coldlead':
        return resolveColdLead(data, f.item);
      case 'trade':
        return resolveTrade(data, f.item);
      case 'proposal':
        return resolveProposal(data, f.item);
      case 'simulation':
        return resolveSimulation(data, f.item);
      default:
        return resolveTask(data, f.item);
    }
  };

  const openBrief = (f: FollowUpItem) => {
    if (f.kind === 'prospect') {
      const p = f.item;
      setBriefEdit({
        kind: 'prospect',
        id: p.id,
        title: `Email brief — ${p.company}`,
        initial: { followUpType: p.followUpType ?? 'email', contactName: p.contact, contactEmail: p.contactEmail, contactPhone: p.contactPhone, briefWhat: p.briefWhat, briefHow: p.briefHow },
        subject: emailSubject(p.company, 'follow-up'),
        contactName: p.contact,
      });
    } else if (f.kind === 'coldlead') {
      const c = f.item;
      setBriefEdit({
        kind: 'coldlead',
        id: c.id,
        title: `Email brief — ${c.company}`,
        initial: { followUpType: c.followUpType ?? 'email', contactName: c.contactName, contactEmail: c.contactEmail, contactPhone: c.contactPhone, briefWhat: c.briefWhat, briefHow: c.briefHow },
        subject: emailSubject(c.company, 'follow-up'),
        contactName: c.contactName,
      });
    } else if (f.kind === 'proposal' || f.kind === 'simulation') {
      const it = f.item;
      const hub = findProspect(data, it.prospectId, it.company);
      setBriefEdit({
        kind: f.kind,
        id: it.id,
        title: `${f.kind === 'proposal' ? 'Proposal' : 'Sim'} brief — ${it.company}`,
        initial: {
          followUpType: it.followUpType,
          contactName: it.contactName,
          contactEmail: it.contactEmail,
          contactPhone: it.contactPhone,
          briefWhat: it.briefWhat,
          briefHow: it.briefHow,
        },
        inheritedType: hub?.followUpType ?? 'email',
        inherited: inheritedBrief(hub),
        subject: emailSubject(it.company, f.kind === 'proposal' ? 'proposal' : 'sim'),
        inheritHint: hub
          ? `Blank fields use ${hub.company}’s contact and brief (the pipeline card is the hub).`
          : 'Not linked to a pipeline prospect — link it in Proposals & Sims.',
      });
    } else {
      const it = f.item;
      const isTrade = f.kind === 'trade';
      const linked = isTrade
        ? findProspect(data, f.item.prospectId, f.item.client)
        : findProspect(data, f.item.relatedProspectId, f.item.relatedCompany);
      setBriefEdit({
        kind: isTrade ? 'trade' : 'task',
        id: it.id,
        title: isTrade ? `Email brief — ${f.item.client} · ${f.item.pair}` : `Email brief — ${f.item.title}`,
        initial: {
          followUpType: it.followUpType,
          contactName: it.contactName,
          contactEmail: it.contactEmail,
          contactPhone: it.contactPhone,
          briefWhat: it.briefWhat,
          briefHow: it.briefHow,
        },
        inheritedType: isTrade ? 'email' : typeOfTask(f.item),
        inherited: inheritedBrief(linked),
        subject: subjectFor(f),
        inheritHint: 'Blank fields fall back to the linked prospect’s contact and brief.',
      });
    }
  };

  const doneBtn = (f: FollowUpItem) => {
    const b = briefFor(f);
    return (
      <button
        type="button"
        className={`btn btn-sm done-btn done-${b.type}`}
        onClick={(e) => {
          e.stopPropagation();
          setDoneFor(f);
        }}
        title={b.type === 'call' ? 'Log the call and schedule the next follow-up' : 'Log the email and schedule the next follow-up'}
      >
        {briefLabels(b.type).done}
      </button>
    );
  };

  const linkedProspectOf = (f: FollowUpItem): Prospect | undefined =>
    f.kind === 'task'
      ? findProspect(data, f.item.relatedProspectId, f.item.relatedCompany)
      : f.kind === 'trade'
        ? findProspect(data, undefined, f.item.client)
        : f.kind === 'proposal' || f.kind === 'simulation'
          ? findProspect(data, f.item.prospectId, f.item.company)
          : undefined;
  const cadenceOf = (f: FollowUpItem) => resolveCadence(data, f.item, linkedProspectOf(f));

  const attemptChip = (f: FollowUpItem) => {
    const n = f.item.attempts ?? 0;
    if (!n) return null;
    const { cadence } = cadenceOf(f);
    const atMax = n >= cadence.maxAttempts;
    return (
      <span
        className={`attempt-chip${atMax ? ' at-max' : n + 1 >= cadence.maxAttempts ? ' last' : ''}`}
        title={`${n} unanswered so far · cadence ${cadence.steps.join(', ')} business days · max ${cadence.maxAttempts}`}
      >
        {atMax ? `Max ${cadence.maxAttempts} reached` : `Attempt ${n + 1}`}
      </span>
    );
  };

  const noAnswerBtn = (f: FollowUpItem) => {
    const b = briefFor(f);
    return (
      <button
        type="button"
        className="btn btn-sm noans-btn"
        onClick={(e) => {
          e.stopPropagation();
          setDoneFor(f, 'no-answer');
        }}
        title="Log an unanswered attempt and push it back by the cadence"
      >
        {b.type === 'call' ? 'No answer' : 'Push'}
      </button>
    );
  };

  const sendFor = (f: FollowUpItem, label = itemTitle(f)) => {
    const brief = briefFor(f);
    if (brief.type !== 'email') return null;
    return <EmailSendActions draft={draftFromBrief(brief, subjectFor(f))} label={label} />;
  };

  const chip = (f: FollowUpItem) => (
    <>
      {attemptChip(f)}
      <BriefChip brief={briefFor(f)} onClick={() => openBrief(f)} />
      {sendFor(f)}
      {doneBtn(f)}
      {noAnswerBtn(f)}
    </>
  );

  /** The round check opens the same outcome popover — nothing vanishes without a next step. */
  const checkBtn = (f: FollowUpItem) => (
    <button
      type="button"
      className="check"
      onClick={(e) => {
        e.stopPropagation();
        setDoneFor(f);
      }}
      aria-label="Complete"
      title="Done / no answer / close — choose the next step"
    />
  );

  const itemTitle = (f: FollowUpItem) =>
    f.kind === 'prospect' || f.kind === 'coldlead' || f.kind === 'proposal' || f.kind === 'simulation'
      ? f.item.company
      : f.kind === 'trade'
        ? `${f.item.client} · ${f.item.pair}`
        : f.item.relatedCompany || f.item.title;

  const confirmDone = (f: FollowUpItem, c: DoneChoice) => {
    const b = briefFor(f);
    const before = f.item.attempts ?? 0;
    const { cadence } = cadenceOf(f);
    const token = markFollowUpDone({
      kind: f.kind as DoneKind,
      id: f.item.id,
      outcome: c.outcome,
      closeAs: c.closeAs,
      coolTo: c.coolTo,
      resetAttempts: c.resetAttempts,
      cadence: c.cadence,
      nextDate: c.nextDate,
      nextType: c.nextType,
      clearBrief: c.clearBrief,
      completeLinkedTasks: c.completeLinkedTasks,
      newTaskId: uid(),
      entry: {
        id: uid(),
        date: todayISO(),
        at: new Date().toISOString(),
        type: b.type,
        contactName: b.contactName || undefined,
        to: (b.type === 'call' ? b.contactPhone : b.contactEmail) || undefined,
        what: b.what || undefined,
        how: b.how || undefined,
      },
    });
    setDoneFor(null);
    const max = (c.cadence ?? cadence).maxAttempts;
    const head =
      c.outcome === 'no-answer'
        ? `No answer (attempt ${before + 1}${c.resetAttempts ? ', counter reset' : ''}${!c.resetAttempts && before + 1 >= max ? ` — max ${max} reached` : ''})`
        : c.outcome === 'close'
          ? `Closed${c.closeAs && f.kind !== 'task' && f.kind !== 'prospect' ? ` as ${c.closeAs}` : ''}`
          : briefLabels(b.type).done;
    setUndo({
      token,
      message: `${head} — ${itemTitle(f)}${c.outcome !== 'close' && c.nextDate ? ` · next ${formatWeekday(c.nextDate)}` : ''}`,
    });
  };

  const recent = useMemo(() => recentlyCompleted(data, Date.now(), 7), [data]);
  const reopen = (kind: DoneKind, id: string, title: string) => {
    const token = reopenItem({
      kind,
      id,
      today: todayISO(),
      entry: { id: uid(), date: todayISO(), at: new Date().toISOString(), type: 'email', what: 'Reopened from Today' },
    });
    setUndo({ token, message: `Reopened — ${title}` });
  };

  const linkedCount = (f: FollowUpItem) =>
    f.kind === 'prospect' ? linkedDueTasks(data, f.item, todayISO()).length : 0;

  const readyCount = followUps.filter((f) => briefState(briefFor(f)) === 'ready').length;

  const partLine = (f: FollowUpItem): string => {
    if (f.kind === 'proposal') {
      const x = f.item;
      return `📄 Proposal · ${[x.pairs, x.volume].filter(Boolean).join(' ')} · ${x.status}${x.dateSent ? ` · sent ${formatDisplay(x.dateSent)}` : ''}`;
    }
    if (f.kind === 'simulation') {
      const x = f.item;
      return `📈 Sim ${x.month} · ${[x.pair, x.volume].filter(Boolean).join(' ')}${x.structure ? ` · ${x.structure}` : ''} · ${x.status}`;
    }
    if (f.kind === 'prospect') return `🗂 Pipeline · ${f.item.nextSteps || f.item.temperature}`;
    return itemTitle(f);
  };

  const confirmGroup = (row: Extract<Row, { type: 'group' }>, c: DoneChoice) => {
    const chosen = row.parts.filter((p) => (c.partIds ?? row.parts.map((x) => x.item.id)).includes(p.item.id));
    const at = new Date().toISOString();
    const inputs: DoneInput[] = chosen.map((f) => {
      const b = briefFor(f);
      return {
        kind: f.kind as DoneKind,
        id: f.item.id,
        outcome: c.outcome,
        closeAs: c.partCloseAs?.[f.item.id] ?? c.closeAs,
        coolTo: f.kind === 'prospect' ? c.coolTo : undefined,
        resetAttempts: c.resetAttempts,
        cadence: f.kind === 'prospect' ? c.cadence : undefined,
        nextDate: c.nextDate,
        nextType: c.nextType,
        clearBrief: c.clearBrief,
        completeLinkedTasks: f.kind === 'prospect' && c.completeLinkedTasks,
        newTaskId: uid(),
        entry: {
          id: uid(),
          date: todayISO(),
          at,
          type: b.type,
          contactName: b.contactName || undefined,
          to: (b.type === 'call' ? b.contactPhone : b.contactEmail) || undefined,
          what: b.what || undefined,
          how: b.how || undefined,
          note: chosen.length > 1 ? `Handled together: ${chosen.map((x) => PART_LABEL[x.kind] ?? x.kind).join(' + ')}` : undefined,
        },
      };
    });
    if (!inputs.length) return;
    const token = markFollowUpsDone(inputs);
    setGroupFor(null);
    const head = c.outcome === 'no-answer' ? 'No answer' : c.outcome === 'close' ? 'Closed' : briefLabels(briefFor(chosen[0]).type).done;
    setUndo({
      token,
      message: `${head} — ${row.company}: ${chosen.map((x) => PART_LABEL[x.kind] ?? x.kind).join(' + ')}${c.outcome !== 'close' && c.nextDate ? ` · next ${formatWeekday(c.nextDate)}` : ''}`,
    });
  };

  const renderGroup = (row: Extract<Row, { type: 'group' }>) => {
    const hubPart = row.parts.find((p) => p.kind === 'prospect') ?? row.parts[0];
    const hb = row.prospect ? resolveProspect(data, row.prospect) : briefFor(hubPart);
    const maxAttempts = Math.max(...row.parts.map((p) => p.item.attempts ?? 0));
    return (
      <div key={`g-${row.key}`} className={`list-item group-row${isOverdue(row.due) ? ' overdue' : ' due-today'}`} data-group={row.company}>
        <button
          type="button"
          className="check"
          onClick={() => setGroupFor({ row, outcome: 'done' })}
          aria-label="Complete"
          title="One popover for the whole company — handle each part or all together"
        />
        <div className="title">
          <button type="button" className="row-link" onClick={() => row.prospect && onOpenProspect(row.prospect.id)}>
            {row.company}
          </button>
          : {row.parts.map((p) => PART_LABEL[p.kind] ?? p.kind).join(' + ')}
          {row.prospect?.isExample ? <span className="example-badge">EXAMPLE</span> : null}
          <div className="group-parts">
            {row.parts.map((p) => (
              <div key={p.item.id} className="group-part" data-kind={p.kind}>
                <span className="gp-label">{partLine(p)}</span>
                {attemptChip(p)}
                <span className="due">{formatDisplay(p.due)}</span>
                <button type="button" className="link-btn" onClick={() => setDoneFor(p)} title="Handle just this part">
                  just this
                </button>
                {p.item.id === hubPart.item.id ? null : sendFor(p, `${row.company} ${PART_LABEL[p.kind] ?? p.kind}`)}
              </div>
            ))}
          </div>
        </div>
        {maxAttempts ? <span className="attempt-chip">Attempt {maxAttempts + 1}</span> : null}
        <BriefChip brief={hb} onClick={() => (row.prospect ? openBrief({ kind: 'prospect', item: row.prospect, due: row.due }) : openBrief(hubPart))} />
        {hb.type === 'email' ? (
          <EmailSendActions draft={draftFromBrief(hb, emailSubject(row.company, 'follow-up'))} label={row.company} />
        ) : null}
        <button type="button" className={`btn btn-sm done-btn done-${hb.type}`} onClick={() => setGroupFor({ row, outcome: 'done' })}>
          {briefLabels(hb.type).done} all
        </button>
        <button type="button" className="btn btn-sm noans-btn" onClick={() => setGroupFor({ row, outcome: 'no-answer' })}>
          {hb.type === 'call' ? 'No answer' : 'Push'}
        </button>
        <span className="due">
          {formatDisplay(row.due)}
          {isOverdue(row.due) ? ' · overdue' : ' · today'}
        </span>
      </div>
    );
  };

  const renderRow = (r: Row) => (r.type === 'group' ? renderGroup(r) : renderFollowUp(r.f));

  const renderFollowUp = (f: FollowUpItem) => {
    if (f.kind === 'proposal' || f.kind === 'simulation') {
      const x = f.item;
      const hub = findProspect(data, x.prospectId, x.company);
      return (
        <div key={x.id} className={`list-item${isOverdue(x.followUpDate) ? ' overdue' : ' due-today'}`} data-kind={f.kind}>
          {checkBtn(f)}
          <div className="title">
            {f.kind === 'proposal' ? 'Proposal follow-up' : 'Sim follow-up'} — {x.company}
            {x.isExample ? <span className="example-badge">EXAMPLE</span> : null}
            <div style={{ fontWeight: 400, color: 'var(--text-muted)', fontSize: '0.85rem' }}>
              {partLine(f)}
              {hub ? '' : ' · ⚠ not linked to a pipeline prospect'}
            </div>
          </div>
          {chip(f)}
          <span className="due">
            {TYPE_ICON[briefFor(f).type]} {formatDisplay(x.followUpDate)}
            {isOverdue(x.followUpDate) ? ' · overdue' : ' · today'}
          </span>
        </div>
      );
    }
    if (f.kind === 'task') {
      const t = f.item;
      return (
        <div
          key={t.id}
          className={`list-item${isOverdue(t.dueDate) ? ' overdue' : ' due-today'}`}
        >
          {checkBtn(f)}
          <div className="title">
            {t.title}
            {t.isExample ? <span className="example-badge">EXAMPLE</span> : null}
          </div>
          {chip(f)}
          <span className="due">
            {formatDisplay(t.dueDate)}
            {isOverdue(t.dueDate) ? ' · overdue' : ' · today'}
          </span>
        </div>
      );
    }
    if (f.kind === 'prospect') {
      const p = f.item;
      return (
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
          {chip(f)}
          <span className="due">
            {formatDisplay(p.nextFollowUp)}
            {isOverdue(p.nextFollowUp) ? ' · overdue' : ' · today'}
          </span>
        </div>
      );
    }
    if (f.kind === 'trade') {
      const t = f.item;
      return (
        <div
          key={t.id}
          className={`list-item${isOverdue(t.chaseDate) ? ' overdue' : ' due-today'}`}
        >
          {checkBtn(f)}
          <div className="title">
            Trade idea chase — {t.client} · {t.pair}
            {t.isExample ? <span className="example-badge">EXAMPLE</span> : null}
            <div style={{ fontWeight: 400, color: 'var(--text-muted)', fontSize: '0.85rem' }}>
              {t.structure} — {t.idea}
            </div>
          </div>
          {chip(f)}
          <span className="due">
            {formatDisplay(t.chaseDate)}
            {isOverdue(t.chaseDate) ? ' · overdue' : ' · today'}
          </span>
        </div>
      );
    }
    const c = f.item;
    return (
      <div
        key={c.id}
        className={`list-item${isOverdue(c.followUpDate) ? ' overdue' : ' due-today'}`}
      >
        {checkBtn(f)}
        <div className="title">
          Cold lead — {c.company}
          {c.isExample ? <span className="example-badge">EXAMPLE</span> : null}
          <div style={{ fontWeight: 400, color: 'var(--text-muted)', fontSize: '0.85rem' }}>
            {[c.contactName, c.volumeCurrency, c.notes].filter(Boolean).join(' · ') || 'Refer back'}
          </div>
        </div>
        {chip(f)}
        <span className="due">
          {formatDisplay(c.followUpDate)}
          {isOverdue(c.followUpDate) ? ' · overdue' : ' · today'}
        </span>
      </div>
    );
  };

  const renderCall = (t: Task) => {
    const f: FollowUpItem = { kind: 'task', item: t, due: t.dueDate };
    return (
    <div
      key={t.id}
      className={`list-item${isOverdue(t.dueDate) ? ' overdue' : ' due-today'}`}
    >
      {checkBtn(f)}
      <div className="title">
        {t.title}
        {t.isExample ? <span className="example-badge">EXAMPLE</span> : null}
      </div>
      {chip(f)}
      <span className="due">
        {formatDisplay(t.dueDate)}
        {isOverdue(t.dueDate) ? ' · overdue' : ' · today'}
      </span>
      <button type="button" className="icon-btn" onClick={() => deleteTask(t.id)} aria-label="Delete">
        ×
      </button>
    </div>
    );
  };

  return (
    <div>
      <div className="kpi-row">
        <div
          className={`kpi-card${callsToMake.length ? ' has-items' : ''}${
            callsOverdue.length ? ' overdue' : ''
          }`}
        >
          <div className="label">Calls to make</div>
          <div className="value">{callsToMake.length}</div>
          <div className="hint">
            {callsToMake.length
              ? `${callsDueToday.length} today · ${callsOverdue.length} overdue`
              : 'All clear.'}
          </div>
        </div>
        <div
          className={`kpi-card${followUpCount ? ' has-items' : ''}${
            overdueFollowUps ? ' overdue' : ''
          }`}
        >
          <div className="label">Follow-ups due</div>
          <div className="value">{followUpCount}</div>
          <div className="hint">
            {followUpCount
              ? `${followUpsDueToday.length} today · ${followUpsOverdue.length} overdue`
              : 'All clear.'}
          </div>
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
          <>
            <ReminderSection
              title="Overdue"
              count={callsOverdue.length}
              variant="overdue"
              empty="None overdue"
            >
              {callsOverdue.map(renderCall)}
            </ReminderSection>
            <ReminderSection
              title="Due today"
              count={callsDueToday.length}
              variant="due-today"
              empty="None due today"
            >
              {callsDueToday.map(renderCall)}
            </ReminderSection>
          </>
        )}
      </div>

      <div className="card">
        <div className="section-title">
          <h2>🔔 Follow-ups</h2>
          <span className="count">{followUpCount}</span>
        </div>
        <p className="calendar-hint">
          Calendar-style reminders — tasks, prospect chase dates, trade idea chases, and cold leads.
          {followUpCount ? (
            <>
              {' '}
              <strong>
                ✉/📞 {readyCount}/{followUpCount} ready
              </strong>{' '}
              (email = address + what to say; call = phone + call points). Click a chip to fill one in; “Sent ✓ / Called ✓” logs it, “No answer / Push” counts an attempt — both reschedule.
            </>
          ) : null}
        </p>
        {followUpCount === 0 ? (
          <p className="empty-hint">Nothing due today or overdue</p>
        ) : (
          <>
            <ReminderSection
              title="Overdue"
              count={rowsOverdue.length}
              variant="overdue"
              empty="None overdue"
            >
              {rowsOverdue.map(renderRow)}
            </ReminderSection>
            <ReminderSection
              title="Due today"
              count={rowsDueToday.length}
              variant="due-today"
              empty="None due today"
            >
              {rowsDueToday.map(renderRow)}
            </ReminderSection>
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
      <div className="card recent-card">
        <div className="section-title">
          <h2>
            ✓ Recently completed <span className="section-sub">last 7 days · Reopen puts it back on Today</span>
          </h2>
          <span className="count">{recent.length}</span>
        </div>
        {recent.length === 0 ? (
          <p className="empty-hint">Nothing closed in the last 7 days</p>
        ) : (
          <>
            {(showAllRecent ? recent : recent.slice(0, 8)).map((r) => (
              <div key={`${r.kind}-${r.id}`} className="list-item recent-item">
                <div className="title">
                  {r.title}
                  <span className="recent-what"> · {r.what}</span>
                </div>
                <span className="due">
                  {new Date(r.at).toLocaleString('en-AU', { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}
                </span>
                <button type="button" className="btn btn-sm btn-ghost reopen-btn" onClick={() => reopen(r.kind, r.id, r.title)}>
                  ↺ Reopen
                </button>
              </div>
            ))}
            {recent.length > 8 ? (
              <button type="button" className="link-btn" onClick={() => setShowAllRecent((v) => !v)}>
                {showAllRecent ? 'Show fewer' : `Show all ${recent.length}`}
              </button>
            ) : null}
          </>
        )}
      </div>
      {doneFor
        ? (() => {
            const f = doneFor.f;
            const cad = cadenceOf(f);
            const lp = linkedProspectOf(f);
            const temp = f.kind === 'prospect' ? f.item.temperature : f.kind === 'task' ? lp?.temperature : undefined;
            return (
              <DonePopover
                key={`${f.kind}-${f.item.id}-${doneFor.outcome}`}
                title={itemTitle(f)}
                kind={f.kind as DoneKind}
                brief={briefFor(f)}
                defaultGap={data.settings?.followUpGapDays ?? 3}
                linkedTaskCount={linkedCount(f)}
                initialOutcome={doneFor.outcome}
                attempts={f.item.attempts ?? 0}
                cadence={cad.cadence}
                cadenceSource={cad.source}
                hasOwnCadence={cad.source === 'record'}
                temperature={temp}
                linkedProspectName={f.kind === 'task' ? lp?.company : undefined}
                onConfirm={(c) => confirmDone(f, c)}
                onClose={() => setDoneFor(null)}
              />
            );
          })()
        : null}
      {groupFor
        ? (() => {
            const row = groupFor.row;
            const hubPart = row.parts.find((p) => p.kind === 'prospect') ?? row.parts[0];
            const cad = cadenceOf(hubPart);
            const parts: GroupPart[] = row.parts.map((p) => ({ id: p.item.id, kind: p.kind as DoneKind, label: partLine(p) }));
            return (
              <DonePopover
                key={`g-${row.key}-${groupFor.outcome}`}
                title={`${row.company} — ${row.parts.length} follow-ups`}
                kind={hubPart.kind as DoneKind}
                brief={row.prospect ? resolveProspect(data, row.prospect) : briefFor(hubPart)}
                defaultGap={data.settings?.followUpGapDays ?? 3}
                linkedTaskCount={row.prospect ? linkedDueTasks(data, row.prospect, todayISO()).length : 0}
                initialOutcome={groupFor.outcome}
                attempts={Math.max(...row.parts.map((p) => p.item.attempts ?? 0))}
                cadence={cad.cadence}
                cadenceSource={cad.source}
                hasOwnCadence={cad.source === 'record'}
                temperature={row.prospect?.temperature}
                parts={parts}
                onConfirm={(c) => confirmGroup(row, c)}
                onClose={() => setGroupFor(null)}
              />
            );
          })()
        : null}
      {undo ? (
        <Toast
          message={undo.message}
          duration={10000}
          action={{ label: 'Undo', onClick: () => undoFollowUpDone(undo.token) }}
          onDone={() => setUndo(null)}
        />
      ) : null}
      {briefEdit ? (
        <BriefModal
          title={briefEdit.title}
          initial={briefEdit.initial}
          inheritedType={briefEdit.inheritedType}
          inherited={briefEdit.inherited}
          inheritHint={briefEdit.inheritHint}
          subject={briefEdit.subject}
          contactName={briefEdit.contactName}
          defaultStyle={data.settings?.defaultEmailStyle}
          onSave={(v) => updateBrief(briefEdit.kind, briefEdit.id, v)}
          onClose={() => setBriefEdit(null)}
        />
      ) : null}
    </div>
  );
}
