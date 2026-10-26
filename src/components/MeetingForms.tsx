import { useState } from 'react';
import type { BookedBy, Meeting, Priority, ProspectType, Temperature } from '../types';
import { Modal } from './Modal';
import { SegControl } from './SegControl';
import { useStore } from '../store/StoreContext';
import { todayISO } from '../utils/dates';
import { DateInput } from './DateInput';

const TEMPS: Temperature[] = ['Cold', 'Warm', 'Hot'];
const PRIOS: Priority[] = [1, 2, 3, 4, 5];
const TYPES: ProspectType[] = ['Prospect', 'Existing client'];

export function BookMeetingForm({
  onClose,
  initialCompany,
}: {
  onClose: () => void;
  initialCompany?: string;
}) {
  const { bookMeeting } = useStore();
  const [company, setCompany] = useState(initialCompany ?? '');
  const [contact, setContact] = useState('');
  const [meetingDate, setMeetingDate] = useState('');
  const [meetingTime, setMeetingTime] = useState('');
  const [timezone, setTimezone] = useState('Australia/Sydney');
  const [notes, setNotes] = useState('');
  const [currencies, setCurrencies] = useState('');
  const [fxVolume, setFxVolume] = useState('');
  const [bookedBy, setBookedBy] = useState<BookedBy>('Me');
  const [bookedByName, setBookedByName] = useState('');

  const save = () => {
    if (!company.trim() || !meetingDate) return;
    bookMeeting({
      company: company.trim(),
      contact: contact.trim(),
      meetingDate,
      meetingTime,
      timezone,
      notes,
      currencies,
      fxVolume,
      bookedBy,
      bookedByName: bookedBy === 'Me' ? '' : bookedByName.trim(),
    });
    onClose();
  };

  return (
    <Modal
      title="Book a meeting"
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="btn btn-primary" onClick={save} disabled={!company.trim() || !meetingDate}>
            Book meeting
          </button>
        </>
      }
    >
      <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginTop: 0 }}>
        Booking auto-creates a confirmation call task (2 days before) and confirmation email task (1 day before).
        It stays in Upcoming meetings and only joins the Pipeline once you log it as attended.
      </p>
      <BookedByFields bookedBy={bookedBy} setBookedBy={setBookedBy} name={bookedByName} setName={setBookedByName} />
      <div className="field">
        <label>Company</label>
        <input value={company} onChange={(e) => setCompany(e.target.value)} placeholder="Acme Imports" autoFocus />
      </div>
      <div className="field">
        <label>Contact name (optional)</label>
        <input value={contact} onChange={(e) => setContact(e.target.value)} placeholder="Jane Smith" />
      </div>
      <div className="field">
        <label>Meeting date</label>
        <DateInput value={meetingDate} onChange={setMeetingDate} aria-label="Meeting date" />
      </div>
      <div className="field">
        <label>Time (optional)</label>
        <input type="time" value={meetingTime} onChange={(e) => setMeetingTime(e.target.value)} />
      </div>
      <div className="field">
        <label>Timezone</label>
        <select value={timezone} onChange={(e) => setTimezone(e.target.value)}>
          <option value="Australia/Sydney">Australia/Sydney</option>
          <option value="Australia/Melbourne">Australia/Melbourne</option>
          <option value="Asia/Singapore">Asia/Singapore</option>
          <option value="Asia/Hong_Kong">Asia/Hong_Kong</option>
          <option value="Europe/London">Europe/London</option>
          <option value="America/New_York">America/New_York</option>
        </select>
      </div>
      <div className="field">
        <label>Currency pairs (optional)</label>
        <input value={currencies} onChange={(e) => setCurrencies(e.target.value)} placeholder="AUDUSD" />
      </div>
      <div className="field">
        <label>FX volume (optional)</label>
        <input value={fxVolume} onChange={(e) => setFxVolume(e.target.value)} placeholder="e.g. ~AUD 5m / yr" />
      </div>
      <div className="field">
        <label>Notes</label>
        <textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Agenda / context" />
      </div>
    </Modal>
  );
}

export function LogMeetingForm({
  onClose,
  meeting,
}: {
  onClose: () => void;
  meeting?: Meeting | null;
}) {
  const { logMeetingOutcome } = useStore();
  const [company, setCompany] = useState(meeting?.company ?? '');
  const [contact, setContact] = useState(meeting?.contact ?? '');
  const [meetingDate, setMeetingDate] = useState(meeting?.meetingDate ?? todayISO());
  const [outcome, setOutcome] = useState<'Attended' | 'No-show'>('Attended');
  const [sufficient, setSufficient] = useState<boolean | null>(null);
  const [rating, setRating] = useState<Priority | null>(3);
  const [currencies, setCurrencies] = useState(meeting?.currencies ?? '');
  const [fxVolume, setFxVolume] = useState(meeting?.fxVolume ?? '');
  const [notes, setNotes] = useState(meeting?.notes ?? '');
  const [nextFollowUp, setNextFollowUp] = useState('');
  const [temperature, setTemperature] = useState<Temperature>('Warm');
  const [priority, setPriority] = useState<Priority>(3);
  const [type, setType] = useState<ProspectType>('Prospect');

  const save = () => {
    if (!company.trim() || !meetingDate) return;
    logMeetingOutcome({
      meetingId: meeting?.id,
      company: company.trim(),
      contact: contact.trim(),
      meetingDate,
      outcome,
      sufficient: outcome === 'Attended' ? sufficient : null,
      rating: outcome === 'Attended' ? rating : null,
      currencies,
      fxVolume,
      notes,
      nextFollowUp: nextFollowUp || null,
      temperature,
      priority,
      type,
    });
    onClose();
  };

  return (
    <Modal
      title="Log a meeting"
      onClose={onClose}
      wide
      footer={
        <>
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="btn btn-primary" onClick={save} disabled={!company.trim() || !meetingDate}>
            Log meeting
          </button>
        </>
      }
    >
      <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginTop: 0 }}>
        Choosing a temperature updates or creates the prospect in that Cold / Warm / Hot pipeline column.
      </p>
      <div className="field">
        <label>Company</label>
        <input value={company} onChange={(e) => setCompany(e.target.value)} placeholder="Acme Imports" autoFocus />
      </div>
      <div className="field">
        <label>Contact name (optional)</label>
        <input value={contact} onChange={(e) => setContact(e.target.value)} placeholder="Jane Smith" />
      </div>
      <div className="field">
        <label>Meeting date</label>
        <DateInput value={meetingDate} onChange={setMeetingDate} aria-label="Meeting date" />
      </div>
      <div className="field">
        <label>Outcome</label>
        <SegControl
          options={[
            { value: 'Attended' as const, label: 'Attended' },
            { value: 'No-show' as const, label: 'No-show' },
          ]}
          value={outcome}
          onChange={setOutcome}
        />
      </div>
      {outcome === 'Attended' ? (
        <>
          <div className="field">
            <label>Sufficient meeting?</label>
            <SegControl
              options={[
                { value: 'yes', label: 'Yes' },
                { value: 'no', label: 'No' },
              ]}
              value={sufficient === true ? 'yes' : sufficient === false ? 'no' : ''}
              onChange={(v) => setSufficient(v === 'yes')}
            />
          </div>
          <div className="field">
            <label>Rating (1–5)</label>
            <SegControl
              options={PRIOS.map((p) => ({ value: String(p), label: String(p) }))}
              value={String(rating ?? 3)}
              onChange={(v) => setRating(Number(v) as Priority)}
            />
          </div>
        </>
      ) : null}
      <div className="field">
        <label>Pipeline temperature</label>
        <SegControl
          options={TEMPS.map((t) => ({ value: t, label: t.toUpperCase() }))}
          value={temperature}
          onChange={setTemperature}
          classNameFor={(t) => `temp-${t}`}
        />
      </div>
      <div className="field">
        <label>Priority</label>
        <SegControl
          options={PRIOS.map((p) => ({ value: p, label: String(p) }))}
          value={priority}
          onChange={setPriority}
        />
      </div>
      <div className="field">
        <label>Type</label>
        <SegControl
          options={TYPES.map((t) => ({ value: t, label: t }))}
          value={type}
          onChange={setType}
        />
      </div>
      <div className="field">
        <label>Currencies</label>
        <input value={currencies} onChange={(e) => setCurrencies(e.target.value)} placeholder="AUDUSD, EURAUD" />
      </div>
      <div className="field">
        <label>FX volume</label>
        <input value={fxVolume} onChange={(e) => setFxVolume(e.target.value)} placeholder="e.g. ~AUD 5m / month" />
      </div>
      <div className="field">
        <label>Notes</label>
        <textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="What happened / next angle" />
      </div>
      <div className="field">
        <label>Next follow-up date</label>
        <DateInput value={nextFollowUp} onChange={setNextFollowUp} aria-label="Next follow-up date" />
      </div>
    </Modal>
  );
}

export function LogActivityForm({
  kind,
  onClose,
  initialCompany,
}: {
  kind: 'call' | 'email';
  onClose: () => void;
  initialCompany?: string;
}) {
  const { logCall, logEmail } = useStore();
  const [company, setCompany] = useState(initialCompany ?? '');
  const [contact, setContact] = useState('');
  const [notes, setNotes] = useState('');

  const save = () => {
    if (!company.trim()) return;
    if (kind === 'call') logCall(company.trim(), contact.trim(), notes);
    else logEmail(company.trim(), contact.trim(), notes);
    onClose();
  };

  return (
    <Modal
      title={kind === 'call' ? 'Log call' : 'Log email'}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="btn btn-primary" onClick={save} disabled={!company.trim()}>
            {kind === 'call' ? 'Log call' : 'Log email'}
          </button>
        </>
      }
    >
      <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginTop: 0 }}>
        {kind === 'call'
          ? 'Creates a follow-up email task due in 3 days.'
          : 'Creates a follow-up call task due in 4 days.'}
      </p>
      <div className="field">
        <label>Company</label>
        <input value={company} onChange={(e) => setCompany(e.target.value)} placeholder="Acme Imports" autoFocus />
      </div>
      <div className="field">
        <label>Contact (optional)</label>
        <input value={contact} onChange={(e) => setContact(e.target.value)} />
      </div>
      <div className="field">
        <label>Notes</label>
        <textarea value={notes} onChange={(e) => setNotes(e.target.value)} />
      </div>
    </Modal>
  );
}

export function bookedByLabel(m: Pick<Meeting, 'bookedBy' | 'bookedByName'>): string {
  const b = m.bookedBy ?? 'Me';
  if (b === 'Me') return 'Me';
  if (b === 'Daniel') return m.bookedByName || 'Daniel';
  return m.bookedByName || 'Other associate';
}

export function BookedByFields({
  bookedBy,
  setBookedBy,
  name,
  setName,
}: {
  bookedBy: BookedBy;
  setBookedBy: (b: BookedBy) => void;
  name: string;
  setName: (n: string) => void;
}) {
  return (
    <>
      <div className="field">
        <label>Booked by</label>
        <SegControl
          options={[
            { value: 'Me' as const, label: 'Me' },
            { value: 'Daniel' as const, label: 'Daniel' },
            { value: 'Other' as const, label: 'Other associate' },
          ]}
          value={bookedBy}
          onChange={setBookedBy}
        />
      </div>
      {bookedBy === 'Other' ? (
        <div className="field">
          <label>Associate name</label>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Sarah Lee" />
        </div>
      ) : null}
    </>
  );
}

export function EditBookedByForm({ meeting, onClose }: { meeting: Meeting; onClose: () => void }) {
  const { updateMeeting } = useStore();
  const [bookedBy, setBookedBy] = useState<BookedBy>(meeting.bookedBy ?? 'Me');
  const [name, setName] = useState(meeting.bookedByName ?? '');
  const save = () => {
    updateMeeting(meeting.id, { bookedBy, bookedByName: bookedBy === 'Me' ? '' : name.trim() });
    onClose();
  };
  return (
    <Modal
      title={`Booked by — ${meeting.company}`}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button type="button" className="btn btn-primary" onClick={save}>Save</button>
        </>
      }
    >
      <BookedByFields bookedBy={bookedBy} setBookedBy={setBookedBy} name={name} setName={setName} />
    </Modal>
  );
}
