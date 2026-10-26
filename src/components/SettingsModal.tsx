import { useState } from 'react';
import { Modal } from './Modal';
import { useStore } from '../store/StoreContext';
import { listBackups } from '../store/migrate';
import type { Cadence } from '../types';
import { cleanCadence, FALLBACK_CADENCE, parseSteps } from '../utils/brief';
import { fmtTime, useSync } from '../sync/SyncContext';
import { readMailClient, writeMailClient, type MailClient } from '../utils/mailClient';

export function SettingsModal({ onClose, onToast }: { onClose: () => void; onToast: (m: string) => void }) {
  const { data, updateSettings, replaceData } = useStore();
  const { config, status, updateConfig, syncNow, testConnection } = useSync();
  const [style, setStyle] = useState(data.settings?.defaultEmailStyle ?? '');
  const [gap, setGap] = useState(String(data.settings?.followUpGapDays ?? 3));
  const dc = cleanCadence(data.settings?.defaultCadence) ?? FALLBACK_CADENCE;
  const [cadSteps, setCadSteps] = useState(dc.steps.join(', '));
  const [cadMax, setCadMax] = useState(String(dc.maxAttempts));
  const [showToken, setShowToken] = useState(false);
  const [testMsg, setTestMsg] = useState('');
  const [backups, setBackups] = useState(() => listBackups());
  const [mailClient, setMailClient] = useState<MailClient>(() => readMailClient());
  const chooseMail = (client: MailClient) => {
    setMailClient(client);
    writeMailClient(client);
  };

  const saveStyle = () => {
    const g = Math.min(60, Math.max(1, Math.round(Number(gap)) || 3));
    const patch: { defaultEmailStyle?: string; followUpGapDays?: number; defaultCadence?: Cadence } = {};
    const nc = cleanCadence({ steps: parseSteps(cadSteps), maxAttempts: Number(cadMax) });
    if (nc && JSON.stringify(nc) !== JSON.stringify(dc)) patch.defaultCadence = nc;
    if ((data.settings?.defaultEmailStyle ?? '') !== style) patch.defaultEmailStyle = style;
    if ((data.settings?.followUpGapDays ?? 3) !== g) patch.followUpGapDays = g;
    if (Object.keys(patch).length) updateSettings(patch);
  };

  return (
    <Modal
      title="⚙ Settings"
      wide
      onClose={() => {
        saveStyle();
        onClose();
      }}
      footer={
        <button
          type="button"
          className="btn btn-primary"
          onClick={() => {
            saveStyle();
            onClose();
          }}
        >
          Done
        </button>
      }
    >
      <div className="settings-section">
        <h4>✉ Follow-ups</h4>
        <div className="field">
          <label>Default email style</label>
          <textarea
            value={style}
            onChange={(e) => setStyle(e.target.value)}
            onBlur={saveStyle}
            rows={3}
            placeholder="e.g. Short (under 120 words), warm and direct, first name, Australian spelling, no jargon, sign off “Cheers, Josh”."
          />
          <p className="field-hint">
            Tone only, for any follow-up whose “How to write it” is blank. It is not pasted into the email.
          </p>
        </div>
        <div className="field">
          <label>Open in Outlook</label>
          <div className="mail-client" role="radiogroup" aria-label="Mail client">
            <label>
              <input
                type="radio"
                name="mail-client"
                checked={mailClient === 'outlook-web'}
                onChange={() => chooseMail('outlook-web')}
              />
              Outlook on the web
            </label>
            <label>
              <input
                type="radio"
                name="mail-client"
                checked={mailClient === 'mailto'}
                onChange={() => chooseMail('mailto')}
              />
              Desktop Outlook (mailto)
            </label>
          </div>
          <p className="field-hint">
            Drafts use “What to say”, a Hi first-name greeting, and “Cheers, Josh”. “How to write it” and the default
            style stay as tone only.
          </p>
        </div>
        <div className="field" style={{ maxWidth: 320 }}>
          <label>Default follow-up gap (business days)</label>
          <input
            type="number"
            min={1}
            max={60}
            value={gap}
            onChange={(e) => setGap(e.target.value)}
            onBlur={saveStyle}
          />
          <p className="field-hint">After “Sent ✓ / Called ✓” the next follow-up defaults to today + this many weekdays.</p>
        </div>
        <div className="cadence-settings">
          <div className="field" style={{ maxWidth: 220 }}>
            <label>Default retry cadence (business days)</label>
            <input value={cadSteps} onChange={(e) => setCadSteps(e.target.value)} onBlur={saveStyle} placeholder="2, 3, 5" aria-label="Default cadence steps" />
          </div>
          <div className="field" style={{ maxWidth: 120 }}>
            <label>Max attempts</label>
            <input type="number" min={1} max={50} value={cadMax} onChange={(e) => setCadMax(e.target.value)} onBlur={saveStyle} aria-label="Default max attempts" />
          </div>
        </div>
        <p className="field-hint" style={{ marginTop: -4 }}>
          “No answer / Push back” moves the item by the next gap (e.g. 2, then 3, then 5 — the last repeats). At max attempts
          Today asks you to cool it, park it or reset. Each lead can override this from its popover.
        </p>
      </div>

      <div className="settings-section">
        <h4>☁ Cloud sync — private GitHub repo</h4>
        <p className="field-hint" style={{ marginTop: 0, marginBottom: 10 }}>
          Every change is saved (after a few seconds) to one JSON file in <strong>your private</strong> GitHub repo, so your
          assistant can read today’s follow-ups. The token is stored only in this browser — never in Export JSON or in the
          synced file. Public repos are refused.
        </p>
        <label className="toggle-row">
          <input
            type="checkbox"
            checked={config.enabled}
            onChange={(e) => updateConfig({ enabled: e.target.checked })}
          />
          <span>Enable cloud sync</span>
        </label>
        <div className="settings-grid">
          <div className="field">
            <label>Repo (owner/name)</label>
            <input
              value={config.repo}
              onChange={(e) => updateConfig({ repo: e.target.value.trim() })}
              placeholder="your-github-name/deskplus-data"
              autoComplete="off"
              spellCheck={false}
            />
          </div>
          <div className="field">
            <label>File path</label>
            <input
              value={config.path}
              onChange={(e) => updateConfig({ path: e.target.value.trim() })}
              placeholder="deskplus-data.json"
              spellCheck={false}
            />
          </div>
          <div className="field settings-span2">
            <label>GitHub fine-grained token (Contents: read &amp; write, this repo only)</label>
            <div className="token-row">
              <input
                type={showToken ? 'text' : 'password'}
                value={config.token}
                onChange={(e) => updateConfig({ token: e.target.value.trim() })}
                placeholder="github_pat_…"
                autoComplete="off"
                spellCheck={false}
              />
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setShowToken((v) => !v)}>
                {showToken ? 'Hide' : 'Show'}
              </button>
            </div>
          </div>
          <div className="field">
            <label>This device’s name (optional)</label>
            <input
              value={config.deviceLabel}
              onChange={(e) => updateConfig({ deviceLabel: e.target.value })}
              placeholder="Work laptop"
            />
          </div>
          <div className="field">
            <label>Branch (optional)</label>
            <input
              value={config.branch}
              onChange={(e) => updateConfig({ branch: e.target.value.trim() })}
              placeholder="default branch"
              spellCheck={false}
            />
          </div>
        </div>

        <div className={`sync-status sync-${status.phase}`}>
          <span className="sync-dot" />
          <span>
            <strong>
              {status.phase === 'off'
                ? 'Sync off'
                : status.phase === 'syncing'
                  ? 'Syncing…'
                  : status.phase === 'error'
                    ? 'Sync problem'
                    : 'Synced'}
            </strong>
            {' — '}
            {status.message}
            {status.lastSyncedAt ? ` · Last synced ${fmtTime(status.lastSyncedAt)}` : ' · Never synced'}
            {status.pending && status.phase !== 'syncing' ? ' · changes waiting' : ''}
          </span>
        </div>

        <div className="data-bar" style={{ marginTop: 10 }}>
          <button
            type="button"
            className="btn btn-primary btn-sm"
            disabled={!config.enabled}
            onClick={() => void syncNow('manual')}
          >
            Sync now
          </button>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            disabled={!config.repo || !config.token}
            onClick={async () => {
              setTestMsg('Testing…');
              try {
                setTestMsg(await testConnection());
              } catch (e) {
                setTestMsg(e instanceof Error ? e.message : 'Failed');
              }
            }}
          >
            Test connection
          </button>
          {testMsg ? <span className="field-hint" style={{ margin: 0 }}>{testMsg}</span> : null}
        </div>

        <details className="settings-advanced">
          <summary>Advanced · backups &amp; manual override</summary>
          <div className="data-bar" style={{ marginTop: 8 }}>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              disabled={!config.enabled}
              onClick={() => {
                if (confirm('Replace the cloud copy with THIS browser’s data? (Cloud copy is backed up locally and kept in GitHub history.)'))
                  void syncNow('force-push');
              }}
            >
              Upload this browser → cloud
            </button>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              disabled={!config.enabled}
              onClick={() => {
                if (confirm('Replace THIS browser’s data with the cloud copy? (This browser’s copy is backed up first.)'))
                  void syncNow('force-pull').then(() => setBackups(listBackups()));
              }}
            >
              Load cloud → this browser
            </button>
          </div>
          <p className="field-hint">
            Local backups (kept automatically before any overwrite — cloud pull, import, wipe, load examples):
          </p>
          {backups.length === 0 ? (
            <p className="empty-hint" style={{ textAlign: 'left', padding: '4px 0' }}>None yet.</p>
          ) : (
            backups.map((b) => (
              <div key={b.at + b.reason} className="backup-row">
                <span>
                  {fmtTime(b.at)} · {b.reason} · {b.records} records
                </span>
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={() => {
                    if (confirm(`Restore the backup from ${fmtTime(b.at)}? Current data is backed up first.`)) {
                      replaceData({ ...b.data, updatedAt: new Date().toISOString() }, 'before-restore');
                      setBackups(listBackups());
                      onToast('Backup restored');
                    }
                  }}
                >
                  Restore
                </button>
              </div>
            ))
          )}
        </details>
      </div>
    </Modal>
  );
}
