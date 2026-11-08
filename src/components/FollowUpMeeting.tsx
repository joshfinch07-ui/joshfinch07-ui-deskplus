import type { ColdLead, Prospect } from '../types';
import { useStore } from '../store/StoreContext';
import { useNav, type BookPrefill } from '../nav';
import { format, parseISO } from 'date-fns';
import { followUpStatus } from '../utils/followUp';
import { bookedByLabel } from './MeetingForms';

function fmtDow(iso: string): string {
  try {
    return format(parseISO(iso), 'EEE d MMM');
  } catch {
    return iso;
  }
}

type Rec = { kind: 'prospect'; item: Prospect } | { kind: 'coldlead'; item: ColdLead };

export function prefillFor(rec: Rec): BookPrefill {
  if (rec.kind === 'prospect') {
    const p = rec.item;
    return {
      company: p.company,
      contact: p.contact,
      contactEmail: p.contactEmail ?? '',
      contactPhone: p.contactPhone ?? '',
      currencies: p.currencyPairs,
      prospectId: p.id,
    };
  }
  const c = rec.item;
  return {
    company: c.company,
    contact: c.contactName ?? '',
    contactEmail: c.contactEmail ?? '',
    contactPhone: c.contactPhone ?? '',
    currencies: c.volumeCurrency,
    coldLeadId: c.id,
  };
}

/**
 * "Follow-up meeting" status for a prospect / cold lead:
 * Booked (next upcoming meeting: date, time, who booked, link) or Need to book (Book meeting button).
 * Derived from the meetings list, so booking from anywhere flips it to Booked automatically.
 */
export function FollowUpMeeting({
  rec,
  variant = 'card',
  onBook,
}: {
  rec: Rec;
  variant?: 'card' | 'form' | 'row';
  /** Override what the button does (e.g. save the edit form first). */
  onBook?: () => void;
}) {
  const { data } = useStore();
  const { go, book } = useNav();
  const st = followUpStatus(data, rec);
  const stop = (e: React.MouseEvent) => e.stopPropagation();
  const m = st.meeting;
  const open = (e: React.MouseEvent) => {
    stop(e);
    if (onBook) onBook();
    else book(prefillFor(rec));
  };
  if (variant === 'row') {
    return m ? (
      <button
        type="button"
        className="fm-status booked fm-row-chip"
        title={`Follow-up meeting booked ${fmtDow(m.meetingDate)}${m.meetingTime ? ' ' + m.meetingTime : ''} · by ${bookedByLabel(m)} — open in Meetings`}
        data-followup-status="Booked"
        onClick={(e) => {
          stop(e);
          go('meetings', { highlightId: m.id });
        }}
      >
        ✅ {fmtDow(m.meetingDate)}
      </button>
    ) : (
      <button
        type="button"
        className="btn btn-ghost btn-sm fm-book"
        data-followup-status="Need to book"
        title="Need to book a follow-up meeting — opens the Book meeting form prefilled"
        onClick={open}
      >
        📅 Book
      </button>
    );
  }
  return (
    <div
      className={`followup-meeting fm-${variant} ${m ? 'fm-booked' : 'fm-need'}`}
      data-followup-status={st.status}
      onClick={stop}
    >
      {variant === 'form' ? <div className="fm-title">📅 Follow-up meeting</div> : null}
      <span className={`fm-status ${m ? 'booked' : 'need'}`}>{m ? '✅ Booked' : 'Need to book'}</span>
      {m ? (
        <>
          <span className="fm-when">
            {fmtDow(m.meetingDate)}
            {m.meetingTime ? ` · ${m.meetingTime}` : ''}
          </span>
          <span className="fm-by">booked by {bookedByLabel(m)}</span>
          <button
            type="button"
            className="link-btn fm-link"
            onClick={(e) => {
              stop(e);
              go('meetings', { highlightId: m.id });
            }}
          >
            View meeting →
          </button>
          {st.count > 1 ? <span className="fm-by">+{st.count - 1} more</span> : null}
        </>
      ) : (
        <button type="button" className="btn btn-ghost btn-sm fm-book" onClick={open} title="Opens the Book meeting form prefilled from this record">
          📅 Book meeting
        </button>
      )}
    </div>
  );
}
