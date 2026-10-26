import { useState } from 'react';
import type { FollowUpType } from '../types';
import type { ResolvedBrief } from '../utils/brief';
import { briefLabels, briefState, TYPE_ICON } from '../utils/brief';
import { Modal } from './Modal';

export interface BriefValue {
  followUpType?: FollowUpType;
  contactName?: string;
  contactEmail?: string;
  contactPhone?: string;
  briefWhat?: string;
  briefHow?: string;
}

/** Compact ✉ Email / 📞 Call toggle. */
export function TypeToggle({
  value,
  onChange,
  compact = false,
}: {
  value: FollowUpType;
  onChange: (t: FollowUpType) => void;
  compact?: boolean;
}) {
  return (
    <div className={`type-toggle${compact ? ' compact' : ''}`} role="group" aria-label="Follow-up type">
      {(['email', 'call'] as FollowUpType[]).map((t) => (
        <button
          key={t}
          type="button"
          className={value === t ? 'active' : ''}
          onClick={() => onChange(t)}
          title={t === 'email' ? 'Email follow-up' : 'Call follow-up'}
        >
          {TYPE_ICON[t]}
          {compact ? '' : t === 'email' ? ' Email' : ' Call'}
        </button>
      ))}
    </div>
  );
}

/** Contact email/phone + brief. Labels switch for Call ("Call points" / "Approach"). Controlled. */
export function EmailBriefFields({
  value,
  onChange,
  defaultStyle,
  showName = false,
  showType = false,
  inheritHint,
  compact = false,
  hideContact = false,
  inheritedType,
  inherited,
}: {
  value: BriefValue;
  onChange: (patch: BriefValue) => void;
  /** Values that apply when a field is left blank (shown as placeholders). */
  inherited?: BriefValue;
  defaultStyle?: string;
  showName?: boolean;
  showType?: boolean;
  inheritHint?: string;
  compact?: boolean;
  hideContact?: boolean;
  inheritedType?: FollowUpType;
}) {
  const type: FollowUpType = value.followUpType ?? inheritedType ?? 'email';
  const L = briefLabels(type);
  const ph = inheritHint ? 'Blank → linked prospect' : undefined;
  const inh = (v: string | undefined) => (v && v.trim() ? `↳ ${v.trim().slice(0, 90)}` : undefined);
  return (
    <div className={`brief-fields${compact ? ' compact' : ''}`}>
      {hideContact ? null : (
        <div className="brief-contact-row">
          {showName ? (
            <div className="field">
              <label>Contact name</label>
              <input
                value={value.contactName ?? ''}
                onChange={(e) => onChange({ contactName: e.target.value })}
                placeholder={inh(inherited?.contactName) ?? ph ?? 'Jane Smith'}
              />
            </div>
          ) : null}
          <div className="field">
            <label>Contact email</label>
            <input
              type="email"
              value={value.contactEmail ?? ''}
              onChange={(e) => onChange({ contactEmail: e.target.value })}
              placeholder={inh(inherited?.contactEmail) ?? ph ?? 'jane@company.com'}
              autoComplete="off"
            />
          </div>
          <div className="field">
            <label>Contact phone</label>
            <input
              type="tel"
              value={value.contactPhone ?? ''}
              onChange={(e) => onChange({ contactPhone: e.target.value })}
              placeholder={inh(inherited?.contactPhone) ?? ph ?? '04xx xxx xxx'}
              autoComplete="off"
            />
          </div>
        </div>
      )}
      <div className={`brief-box brief-${type}`}>
        <div className="brief-box-head">
          <span className="brief-box-title">{L.box}</span>
          {showType ? <TypeToggle value={type} onChange={(t) => onChange({ followUpType: t })} /> : null}
        </div>
        <div className="field">
          <label>{L.what}</label>
          <textarea
            value={value.briefWhat ?? ''}
            onChange={(e) => onChange({ briefWhat: e.target.value })}
            placeholder={
              inh(inherited?.briefWhat) ??
              (type === 'call'
                ? 'What to cover on the call — e.g. confirm Q4 volumes, ask about USD payables, book a pricing review.'
                : 'Points the email should cover — e.g. recap call, attach forward sheet, propose Thu 10am.')
            }
            rows={compact ? 2 : 3}
          />
        </div>
        <div className="field" style={{ marginBottom: 0 }}>
          <label>{L.how}</label>
          <textarea
            value={value.briefHow ?? ''}
            onChange={(e) => onChange({ briefHow: e.target.value })}
            placeholder={
              inh(inherited?.briefHow) ??
              (type === 'call'
                ? 'Optional — e.g. lead with the rate saving, keep it under 5 min.'
                : defaultStyle?.trim()
                  ? `Blank → default style: “${defaultStyle.trim().slice(0, 80)}${defaultStyle.trim().length > 80 ? '…' : ''}”`
                  : 'Tone / style — e.g. short, friendly, first-name, no jargon. (Set a default in ⚙ Settings.)')
            }
            rows={compact ? 1 : 2}
          />
        </div>
        {inheritHint ? <p className="field-hint">{inheritHint}</p> : null}
      </div>
    </div>
  );
}

/** Small readiness indicator for Today rows: ✉ Email ready / 📞 Call ready / missing bits. */
export function BriefChip({ brief, onClick }: { brief: ResolvedBrief; onClick?: () => void }) {
  const st = briefState(brief);
  const call = brief.type === 'call';
  const icon = TYPE_ICON[brief.type];
  const label =
    st === 'ready'
      ? `${icon} ${call ? 'Call' : 'Email'} ready`
      : st === 'no-contact'
        ? `${icon} ${call ? 'Points · no phone' : 'Brief · no email'}`
        : `${icon} ${call ? 'No call points' : 'No brief'}`;
  const to = call ? brief.contactPhone : brief.contactEmail;
  const title =
    st === 'ready'
      ? `${call ? 'Call' : 'To'}: ${brief.contactName ? `${brief.contactName} ` : ''}${call ? to : `<${to}>`}\n${call ? 'Points' : 'What'}: ${brief.what}${brief.how ? `\n${call ? 'Approach' : 'How'}: ${brief.how}${brief.howIsDefault ? ' (default style)' : ''}` : ''}`
      : st === 'no-contact'
        ? call
          ? 'Call points written but no contact phone — add one.'
          : 'Brief written but no contact email — add one so the assistant can draft it.'
        : call
          ? 'No call points yet — click to add.'
          : 'No “What to say” yet — click to add an email brief.';
  return (
    <button
      type="button"
      className={`brief-chip brief-${st}`}
      title={title}
      onClick={(e) => {
        e.stopPropagation();
        onClick?.();
      }}
    >
      {label}
    </button>
  );
}

/** Stand-alone editor used from Today / Tasks / Trade ideas. Saves on "Save". */
export function BriefModal({
  title,
  initial,
  defaultStyle,
  showName = true,
  inheritHint,
  inheritedType,
  onSave,
  onClose,
}: {
  title: string;
  initial: BriefValue;
  defaultStyle?: string;
  showName?: boolean;
  inheritHint?: string;
  inheritedType?: FollowUpType;
  onSave: (v: BriefValue) => void;
  onClose: () => void;
}) {
  const [v, setV] = useState<BriefValue>(initial);
  return (
    <Modal
      title={title}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => {
              onSave(v);
              onClose();
            }}
          >
            Save brief
          </button>
        </>
      }
    >
      <EmailBriefFields
        value={v}
        onChange={(patch) => setV((prev) => ({ ...prev, ...patch }))}
        defaultStyle={defaultStyle}
        showName={showName}
        showType
        inheritedType={inheritedType}
        inheritHint={inheritHint}
      />
    </Modal>
  );
}
