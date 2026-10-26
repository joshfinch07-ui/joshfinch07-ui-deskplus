import { useState } from 'react';
import type { Cadence, FollowUpType, Temperature } from '../types';
import type { ResolvedBrief } from '../utils/brief';
import { briefLabels, cadenceStep, cleanCadence, formatCadence, parseSteps } from '../utils/brief';
import { addBusinessDaysISO, addDaysISO, formatWeekday, todayISO } from '../utils/dates';
import { CLOSE_OPTIONS, type CloseAs, type DoneKind, type OutcomeKind } from '../store/done';
import { DateInput } from './DateInput';
import { Modal } from './Modal';
import { TypeToggle } from './EmailBrief';

export interface DoneChoice {
  outcome: OutcomeKind;
  nextDate: string | null;
  nextType: FollowUpType;
  clearBrief: boolean;
  completeLinkedTasks: boolean;
  closeAs?: CloseAs;
  coolTo?: Temperature;
  resetAttempts?: boolean;
  /** undefined = unchanged · null = back to default · Cadence = save on this item */
  cadence?: Cadence | null;
  /** Group mode: which parts to apply to, and per-part close option. */
  partIds?: string[];
  partCloseAs?: Record<string, CloseAs>;
}

/** One follow-up inside a company group (e.g. pipeline + proposal). */
export interface GroupPart {
  id: string;
  kind: DoneKind;
  label: string;
}

const CLOSE_LABEL: Partial<Record<CloseAs, string>> = { Done: 'Done (finished)' };
const closeLabel = (kind: DoneKind, o: CloseAs) =>
  kind === 'task' ? 'Complete' : kind === 'prospect' ? 'Stop follow-ups' : (CLOSE_LABEL[o] ?? o);

type Pick = { k: 'bd'; n: number } | { k: 'week' };

const COOLER: Record<Temperature, Temperature | null> = { Hot: 'Warm', Warm: 'Cold', Cold: null };

/**
 * One popover for every Today completion: Done ✓ · No answer / Push back · Close….
 * Default is always to reschedule; closing needs the explicit Close option.
 */
export function DonePopover({
  title,
  kind,
  brief,
  defaultGap,
  linkedTaskCount = 0,
  initialOutcome = 'done',
  attempts = 0,
  cadence,
  cadenceSource,
  hasOwnCadence = false,
  temperature,
  linkedProspectName,
  parts,
  onConfirm,
  onClose,
}: {
  title: string;
  kind: DoneKind;
  brief: ResolvedBrief;
  defaultGap: number;
  linkedTaskCount?: number;
  initialOutcome?: OutcomeKind;
  /** unanswered attempts so far */
  attempts?: number;
  cadence: Cadence;
  cadenceSource: string;
  hasOwnCadence?: boolean;
  /** prospect temperature (or the task's linked prospect) — enables "cool to…" */
  temperature?: Temperature;
  linkedProspectName?: string;
  /** Company group: handle each part or all together. */
  parts?: GroupPart[];
  onConfirm: (c: DoneChoice) => void;
  onClose: () => void;
}) {
  const L = briefLabels(brief.type);
  const today = todayISO();
  const call = brief.type === 'call';
  const [outcome, setOutcome] = useState<OutcomeKind>(initialOutcome);
  const [editCad, setEditCad] = useState(false);
  const [cadSteps, setCadSteps] = useState(cadence.steps.join(', '));
  const [cadMax, setCadMax] = useState(String(cadence.maxAttempts));
  const [cadDirty, setCadDirty] = useState<Cadence | null | undefined>(undefined);
  const effCad = cadDirty === undefined ? cadence : cadDirty ?? cadence;
  const step = cadenceStep(effCad, attempts);
  const doneGap = Math.max(1, Math.round(defaultGap || 3));
  const [pick, setPick] = useState<Pick | null>(null);
  const [override, setOverride] = useState<string | null>(null);
  const [clearBrief, setClearBrief] = useState(true);
  const [completeLinked, setCompleteLinked] = useState(true);
  const [nextType, setNextType] = useState<FollowUpType>(brief.type);
  const closeOptions: CloseAs[] = CLOSE_OPTIONS[kind] ?? ['Done'];
  const [closeAs, setCloseAs] = useState<CloseAs>(closeOptions[0]);
  const [sel, setSel] = useState<string[]>(() => (parts ?? []).map((p) => p.id));
  const [partClose, setPartClose] = useState<Record<string, CloseAs>>(() =>
    Object.fromEntries((parts ?? []).map((p) => [p.id, (CLOSE_OPTIONS[p.kind] ?? ['Done'])[0]])),
  );
  const cooler = temperature ? COOLER[temperature] : null;
  const [coolTo, setCoolTo] = useState<Temperature | ''>('');
  const atMax = attempts >= effCad.maxAttempts;
  const lastOne = !atMax && attempts + 1 >= effCad.maxAttempts;

  const effPick: Pick = pick ?? { k: 'bd', n: outcome === 'no-answer' ? step : doneGap };
  const computed = effPick.k === 'week' ? addDaysISO(today, 7) : addBusinessDaysISO(today, effPick.n);
  const date = override ?? computed;
  const quick: number[] = Array.from(new Set([1, 2, 3, 5, outcome === 'no-answer' ? step : doneGap])).sort((a, b) => a - b);
  const who = [brief.contactName, call ? brief.contactPhone : brief.contactEmail].filter(Boolean).join(' · ');

  const choose = (o: OutcomeKind) => {
    setOutcome(o);
    setPick(null);
    setOverride(null);
  };

  const saveCadence = () => {
    const c = cleanCadence({ steps: parseSteps(cadSteps), maxAttempts: Number(cadMax) });
    if (c) {
      setCadDirty(c);
      setEditCad(false);
      setPick(null);
    }
  };

  const confirm = (extra: Partial<DoneChoice> = {}) =>
    onConfirm({
      outcome,
      nextDate: outcome === 'close' ? null : date,
      nextType,
      clearBrief: outcome === 'done' && clearBrief,
      completeLinkedTasks: outcome === 'done' && linkedTaskCount > 0 && completeLinked,
      closeAs: outcome === 'close' ? closeAs : undefined,
      coolTo: coolTo || undefined,
      cadence: cadDirty,
      ...(parts ? { partIds: sel, partCloseAs: partClose } : {}),
      ...extra,
    });

  const nSel = parts ? sel.length : 1;
  const suffix = parts ? (nSel === parts.length ? ` (all ${nSel})` : ` (${nSel} of ${parts.length})`) : '';
  const primaryLabel = parts && outcome === 'close'
    ? `Close ${nSel} selected`
    : outcome === 'done'
      ? `${L.done} · next ${formatWeekday(date)}`
      : outcome === 'no-answer'
        ? `${call ? 'No answer' : 'Push back'} · ${formatWeekday(date)}`
        : kind === 'task'
          ? 'Complete task (no next step)'
          : kind === 'prospect'
            ? 'Stop follow-ups'
            : `Close as ${closeAs}`;
  const primaryText = `${primaryLabel}${parts && outcome !== 'close' ? suffix : ''}`;

  return (
    <Modal
      title={`${title}`}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className={`btn ${outcome === 'close' && !(closeAs === 'Won' || closeAs === 'Converted') ? 'btn-danger' : 'btn-primary'} outcome-confirm`}
            disabled={!!parts && nSel === 0}
            onClick={() => confirm()}
          >
            {primaryText}
          </button>
        </>
      }
    >
      <div className="outcome-seg" role="radiogroup" aria-label="Outcome">
        <button type="button" role="radio" aria-checked={outcome === 'done'} className={outcome === 'done' ? 'on' : ''} onClick={() => choose('done')}>
          {L.done}
        </button>
        <button
          type="button"
          role="radio"
          aria-checked={outcome === 'no-answer'}
          className={outcome === 'no-answer' ? 'on' : ''}
          onClick={() => choose('no-answer')}
        >
          No answer / Push back
        </button>
        <button type="button" role="radio" aria-checked={outcome === 'close'} className={outcome === 'close' ? 'on close' : ''} onClick={() => choose('close')}>
          Close…
        </button>
      </div>

      {parts ? (
        <div className="group-parts-pick" role="group" aria-label="Apply to">
          <div className="gp-head">
            Apply to{' '}
            <button type="button" className="link-btn" onClick={() => setSel(parts.map((p) => p.id))}>
              all
            </button>
          </div>
          {parts.map((p) => (
            <label key={p.id} className="gp-row">
              <input
                type="checkbox"
                checked={sel.includes(p.id)}
                onChange={(e) => setSel((s) => (e.target.checked ? [...s, p.id] : s.filter((x) => x !== p.id)))}
                aria-label={`Include ${p.label}`}
              />
              <span>{p.label}</span>
              {outcome === 'close' && sel.includes(p.id) ? (
                <select
                  value={partClose[p.id]}
                  onChange={(e) => setPartClose((s) => ({ ...s, [p.id]: e.target.value as CloseAs }))}
                  aria-label={`Close ${p.label} as`}
                >
                  {(CLOSE_OPTIONS[p.kind] ?? ['Done']).map((o) => (
                    <option key={o} value={o}>
                      {closeLabel(p.kind, o)}
                    </option>
                  ))}
                </select>
              ) : null}
            </label>
          ))}
        </div>
      ) : null}
      <p className="done-summary">
        {outcome === 'done'
          ? `Logs today’s ${call ? 'call' : 'email'}${who ? ` (${who})` : ''} with a snapshot of the ${call ? 'call points' : 'brief'} and resets the attempt count.`
          : outcome === 'no-answer'
            ? `Logs attempt ${attempts + 1}${who ? ` (${who})` : ''} as no answer, keeps the ${call ? 'call points' : 'brief'} and pushes it to the next date.`
            : 'Takes it off Today with no next step. It stays in “Recently completed” for 7 days with Reopen.'}
      </p>

      <div className="cadence-line">
        <span className={`attempt-chip${atMax ? ' at-max' : lastOne ? ' last' : ''}`}>
          {atMax ? `Max ${effCad.maxAttempts} reached` : `Attempt ${attempts + 1} of ${effCad.maxAttempts}`}
        </span>
        <span className="cadence-text">
          Cadence {formatCadence(effCad)} ({cadDirty !== undefined ? (cadDirty ? 'this item — unsaved' : 'default — unsaved') : cadenceSource})
        </span>
        <button type="button" className="link-btn" onClick={() => setEditCad((v) => !v)}>
          {editCad ? 'cancel' : 'change'}
        </button>
      </div>
      {editCad ? (
        <div className="cadence-edit">
          <label>
            Gaps (business days)
            <input value={cadSteps} onChange={(e) => setCadSteps(e.target.value)} placeholder="2, 3, 5" aria-label="Cadence steps" />
          </label>
          <label>
            Max attempts
            <input type="number" min={1} max={50} value={cadMax} onChange={(e) => setCadMax(e.target.value)} aria-label="Max attempts" />
          </label>
          <button type="button" className="btn btn-sm btn-ghost" onClick={saveCadence}>
            Use for this item
          </button>
          {hasOwnCadence ? (
            <button
              type="button"
              className="btn btn-sm btn-ghost"
              onClick={() => {
                setCadDirty(null);
                setEditCad(false);
              }}
            >
              Back to default
            </button>
          ) : null}
        </div>
      ) : null}

      {outcome === 'no-answer' && atMax ? (
        <div className="max-banner" role="alert">
          <strong>{attempts} unanswered attempts — max reached.</strong> Move it on?
          <div className="max-actions">
            {cooler && (kind === 'prospect' || kind === 'task') ? (
              <button type="button" className="btn btn-sm btn-ghost" onClick={() => confirm({ coolTo: cooler, resetAttempts: true })}>
                Cool {linkedProspectName ? `${linkedProspectName} ` : ''}to {cooler} &amp; push
              </button>
            ) : null}
            {!parts && (kind === 'coldlead' || kind === 'trade' || kind === 'proposal') ? (
              <button type="button" className="btn btn-sm btn-ghost" onClick={() => confirm({ outcome: 'close', closeAs: 'Parked', nextDate: null })}>
                Park it
              </button>
            ) : null}
            {!parts && kind === 'simulation' ? (
              <button type="button" className="btn btn-sm btn-ghost" onClick={() => confirm({ outcome: 'close', closeAs: 'Ended', nextDate: null })}>
                End it
              </button>
            ) : null}
            <button type="button" className="btn btn-sm btn-ghost" onClick={() => confirm({ resetAttempts: true })}>
              Reset counter &amp; push
            </button>
            <button type="button" className="btn btn-sm btn-ghost" onClick={() => setEditCad(true)}>
              Change cadence
            </button>
          </div>
        </div>
      ) : null}
      {outcome === 'no-answer' && lastOne ? (
        <p className="field-hint">Last attempt in this cadence — next time you’ll be asked to cool, park or reset.</p>
      ) : null}

      {outcome !== 'close' ? (
        <>
          <div className="quick-dates" role="group" aria-label="Next date">
            {quick.map((n) => {
              const on = !override && effPick.k === 'bd' && effPick.n === n;
              const isStep = outcome === 'no-answer' && n === step;
              return (
                <button
                  key={n}
                  type="button"
                  className={`qd${on ? ' on' : ''}`}
                  onClick={() => {
                    setPick({ k: 'bd', n });
                    setOverride(null);
                  }}
                  title={addBusinessDaysISO(today, n)}
                >
                  +{n}
                  {isStep ? <small> cadence</small> : null}
                </button>
              );
            })}
            <button
              type="button"
              className={`qd${!override && effPick.k === 'week' ? ' on' : ''}`}
              onClick={() => {
                setPick({ k: 'week' });
                setOverride(null);
              }}
            >
              +1 wk
            </button>
            <span className="qd-unit">+n = business days (Sat/Sun skipped)</span>
          </div>
          <div className="done-grid">
            <div className="field">
              <label>Next {outcome === 'no-answer' ? 'attempt' : 'follow-up'} {override ? '(custom)' : ''}</label>
              <DateInput value={date} onChange={(v) => setOverride(v || null)} aria-label="Next follow-up date" />
            </div>
            <div className="field">
              <label>Next time</label>
              <TypeToggle value={nextType} onChange={setNextType} />
            </div>
          </div>
          {outcome === 'done' ? (
            <>
              <label className="toggle-row">
                <input type="checkbox" checked={clearBrief} onChange={(e) => setClearBrief(e.target.checked)} />
                <span>Clear “{L.what}” so I write the next one fresh</span>
              </label>
              {linkedTaskCount > 0 ? (
                <label className="toggle-row">
                  <input type="checkbox" checked={completeLinked} onChange={(e) => setCompleteLinked(e.target.checked)} />
                  <span>
                    Also complete {linkedTaskCount} linked follow-up task{linkedTaskCount > 1 ? 's' : ''} due now
                  </span>
                </label>
              ) : null}
            </>
          ) : null}
        </>
      ) : (
        <div className="close-opts">
          {!parts && closeOptions.length > 1 ? (
            <div className="field">
              <label>Close as</label>
              <div className="outcome-seg small">
                {closeOptions.map((o) => (
                  <button key={o} type="button" className={closeAs === o ? 'on' : ''} onClick={() => setCloseAs(o)}>
                    {kind === 'coldlead' || kind === 'trade' ? (o === 'Done' ? 'Done (won/finished)' : o) : o}
                  </button>
                ))}
              </div>
            </div>
          ) : null}
          {cooler && (kind === 'prospect' || kind === 'task') ? (
            <label className="toggle-row">
              <input type="checkbox" checked={!!coolTo} onChange={(e) => setCoolTo(e.target.checked ? cooler : '')} />
              <span>
                Also move {linkedProspectName || 'the lead'} from {temperature} to {cooler}
              </span>
            </label>
          ) : null}
        </div>
      )}
    </Modal>
  );
}
