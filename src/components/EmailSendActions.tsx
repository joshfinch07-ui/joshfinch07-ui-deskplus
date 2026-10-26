import { useState } from 'react';
import type { EmailDraft } from '../utils/emailDraft';
import { mailtoUrl, outlookWebUrl, salesloftClipboard } from '../utils/emailDraft';
import { readMailClient } from '../utils/mailClient';
import { Toast } from './Toast';

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
  area.setSelectionRange(0, area.value.length);
  let ok = false;
  try {
    ok = document.execCommand('copy');
  } catch {
    ok = false;
  }
  area.remove();
  return ok;
}

export function EmailSendActions({
  draft,
  label,
  layout = 'icons',
}: {
  draft: EmailDraft;
  label: string;
  layout?: 'icons' | 'inline';
}) {
  const [toast, setToast] = useState<string | null>(null);
  const warn = draft.missingEmail || draft.missingBrief;
  const tone = draft.toneNote
    ? draft.toneIsDefault
      ? `Tone (default style): ${draft.toneNote}`
      : `Tone: ${draft.toneNote}`
    : '';

  const openMail = () => {
    const url = readMailClient() === 'mailto' ? mailtoUrl(draft) : outlookWebUrl(draft);
    window.open(url, '_blank', 'noopener,noreferrer');
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

  const toastNode = toast ? <Toast message={toast} onDone={() => setToast(null)} /> : null;

  if (layout === 'inline') {
    return (
      <div className="send-inline" aria-label={`Email follow-up for ${label}`}>
        {draft.warnings.map((warning) => (
          <p key={warning} className="warn-line">
            {warning}
          </p>
        ))}
        {tone ? <p className="tone-line">{tone}</p> : null}
        <button type="button" className="btn btn-ghost btn-sm" onClick={openMail}>
          Open in Outlook
        </button>
        <button type="button" className="btn btn-ghost btn-sm" onClick={copy}>
          Copy for Salesloft
        </button>
        {toastNode}
      </div>
    );
  }

  const hint = [...draft.warnings, tone].filter(Boolean).join(' · ');
  return (
    <span
      className="send-actions"
      onClick={(event) => event.stopPropagation()}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') event.stopPropagation();
      }}
    >
      <button
        type="button"
        className={`icon-btn send-btn${warn ? ' warn' : ''}`}
        aria-label={`Open in Outlook for ${label}`}
        title={hint || 'Open in Outlook'}
        data-missing-email={draft.missingEmail ? 'true' : 'false'}
        data-missing-brief={draft.missingBrief ? 'true' : 'false'}
        onClick={openMail}
      >
        ↗
      </button>
      <button
        type="button"
        className={`icon-btn send-btn${warn ? ' warn' : ''}`}
        aria-label={`Copy for Salesloft for ${label}`}
        title={hint || 'Copy subject and body for Salesloft'}
        onClick={copy}
      >
        ⎘
      </button>
      {toastNode}
    </span>
  );
}
