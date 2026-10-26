import { useEffect, useRef, useState } from 'react';
import { useMailClient } from '../mail/MailClientContext';
import type { EmailDraft } from '../utils/emailDraft';
import { mailtoUrl, outlookWebUrl, salesloftClipboard } from '../utils/emailDraft';
import { Toast } from './Toast';

/** Synchronous copy while the click gesture is still active. */
function copyWithCommand(text: string): boolean {
  const area = document.createElement('textarea');
  area.value = text;
  area.setAttribute('readonly', '');
  area.style.position = 'fixed';
  area.style.top = '0';
  area.style.left = '0';
  area.style.width = '1px';
  area.style.height = '1px';
  area.style.opacity = '0';
  area.style.pointerEvents = 'none';
  document.body.appendChild(area);
  area.focus({ preventScroll: true });
  area.select();
  area.setSelectionRange(0, text.length);
  let ok = false;
  try {
    ok = document.execCommand('copy');
  } catch {
    ok = false;
  }
  area.remove();
  return ok;
}

function openCompose(url: string) {
  window.open(url, '_blank', 'noopener,noreferrer');
}

export function EmailActions({
  draft,
  label,
  layout = 'menu',
}: {
  draft: EmailDraft;
  label: string;
  layout?: 'menu' | 'inline';
}) {
  const { client } = useMailClient();
  const [open, setOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const rootRef = useRef<HTMLSpanElement>(null);
  const warn = draft.missingEmail || draft.missingBrief;

  useEffect(() => {
    if (!open) return;
    const onDoc = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const openMail = () => {
    const url = client === 'mailto' ? mailtoUrl(draft) : outlookWebUrl(draft);
    openCompose(url);
  };

  const copy = () => {
    const text = salesloftClipboard(draft);
    const legacyOk = copyWithCommand(text);
    if (legacyOk) setToast('Copied for Salesloft');
    void (async () => {
      try {
        if (navigator.clipboard?.writeText) {
          await Promise.race([
            navigator.clipboard.writeText(text),
            new Promise<void>((_, reject) => {
              setTimeout(() => reject(new Error('clipboard timeout')), 700);
            }),
          ]);
          setToast('Copied for Salesloft');
          return;
        }
      } catch {
        if (!legacyOk) setToast("Couldn't copy — clipboard blocked");
        return;
      }
      if (!legacyOk) setToast("Couldn't copy — clipboard blocked");
    })();
  };

  const warningLines = (
    <>
      {draft.warnings.map((warning) => (
        <p key={warning} className="warn-line">
          {warning}
        </p>
      ))}
      {draft.toneNote ? <p className="tone-line">Tone: {draft.toneNote}</p> : null}
    </>
  );

  const actionButtons = (
    <>
      <button type="button" className="btn btn-ghost btn-sm" onClick={openMail}>
        Open in Outlook
      </button>
      <button type="button" className="btn btn-ghost btn-sm" onClick={() => void copy()}>
        Copy for Salesloft
      </button>
    </>
  );

  const toastNode = toast ? <Toast message={toast} onDone={() => setToast(null)} /> : null;

  if (layout === 'inline') {
    return (
      <div className="email-inline" aria-label={`Email follow-up for ${label}`}>
        {warningLines}
        {actionButtons}
        {toastNode}
      </div>
    );
  }

  return (
    <span
      className={`email-anchor${open ? ' open' : ''}`}
      ref={rootRef}
      onClick={(event) => event.stopPropagation()}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') event.stopPropagation();
      }}
    >
      <button
        type="button"
        className={`icon-btn email-chip${warn ? ' warn' : ''}`}
        aria-label={`Email follow-up for ${label}`}
        aria-expanded={open}
        aria-haspopup="dialog"
        title={warn ? draft.warnings.join(' · ') : 'Email follow-up'}
        data-missing-email={draft.missingEmail ? 'true' : 'false'}
        data-missing-brief={draft.missingBrief ? 'true' : 'false'}
        onClick={() => setOpen((value) => !value)}
      >
        ✉
      </button>
      {open ? (
        <div className="email-pop" role="dialog" aria-label={`Email follow-up for ${label}`}>
          {warningLines}
          <div className="email-pop-actions">{actionButtons}</div>
        </div>
      ) : null}
      {toastNode}
    </span>
  );
}
