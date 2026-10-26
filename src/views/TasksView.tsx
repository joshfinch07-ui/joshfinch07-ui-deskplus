import { DateInput } from '../components/DateInput';
import { useMemo, useState } from 'react';
import { useStore } from '../store/StoreContext';
import type { Task } from '../types';
import { BriefChip, BriefModal, type BriefValue } from '../components/EmailBrief';
import { EmailSendActions } from '../components/EmailSendActions';
import { findProspect, resolveTask, typeOfTask } from '../utils/brief';
import { draftFromBrief, emailSubject } from '../utils/emailDraft';
import { formatDisplay, isOverdue, isDueToday, todayISO } from '../utils/dates';

export function TasksView() {
  const { data, addTask, toggleTask, deleteTask, updateBrief } = useStore();
  const [briefTask, setBriefTask] = useState<Task | null>(null);
  const [title, setTitle] = useState('');
  const [due, setDue] = useState(todayISO());

  const open = useMemo(
    () =>
      [...data.tasks]
        .filter((t) => !t.completed)
        .sort((a, b) => (a.dueDate || '9999').localeCompare(b.dueDate || '9999')),
    [data.tasks],
  );
  const done = useMemo(
    () => data.tasks.filter((t) => t.completed).slice(-20).reverse(),
    [data.tasks],
  );

  const submit = () => {
    if (!title.trim()) return;
    addTask(title.trim(), due || null);
    setTitle('');
  };

  return (
    <div>
      <div className="card">
        <div className="section-title">
          <h2>📝 Tasks</h2>
          <span className="count">{open.length} open</span>
        </div>
        <div className="inline-form">
          <input
            className="input grow"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Document follow up with Acme"
            onKeyDown={(e) => e.key === 'Enter' && submit()}
          />
          <DateInput value={due} onChange={setDue} aria-label="Due date" />
          <button type="button" className="btn btn-primary" onClick={submit}>
            Add
          </button>
        </div>
        {open.length === 0 ? (
          <p className="empty-hint">No tasks yet — add one above.</p>
        ) : (
          open.map((t) => (
            <div
              key={t.id}
              className={`list-item${isOverdue(t.dueDate) ? ' overdue' : isDueToday(t.dueDate) ? ' due-today' : ''}`}
            >
              <button
                type="button"
                className="check"
                onClick={() => toggleTask(t.id)}
                aria-label="Complete"
              />
              <div className="title">
                {t.title}
                {t.isExample ? <span className="example-badge">EXAMPLE</span> : null}
                {t.kind !== 'general' ? (
                  <span className="chip" style={{ marginLeft: 8 }}>
                    {t.kind}
                  </span>
                ) : null}
              </div>
              <BriefChip brief={resolveTask(data, t)} onClick={() => setBriefTask(t)} />
              {resolveTask(data, t).type === 'email' ? (
                <EmailSendActions
                  draft={draftFromBrief(
                    resolveTask(data, t),
                    emailSubject(t.relatedCompany || '', t.kind === 'confirmation-email' ? 'confirmation' : 'follow-up'),
                  )}
                  label={t.relatedCompany || t.title}
                />
              ) : null}
              <span className="due">
                {formatDisplay(t.dueDate)}
                {isOverdue(t.dueDate) ? ' · overdue' : ''}
              </span>
              <button type="button" className="icon-btn" onClick={() => deleteTask(t.id)}>
                ×
              </button>
            </div>
          ))
        )}
      </div>

      {done.length > 0 ? (
        <div className="card">
          <div className="section-title">
            <h2 style={{ fontSize: '1rem' }}>Completed</h2>
          </div>
          {done.map((t) => (
            <div key={t.id} className="list-item completed">
              <button
                type="button"
                className="check done"
                onClick={() => toggleTask(t.id)}
                aria-label="Undo"
              >
                ✓
              </button>
              <div className="title">{t.title}</div>
              <span className="due">{formatDisplay(t.dueDate)}</span>
              <button type="button" className="icon-btn" onClick={() => deleteTask(t.id)}>
                ×
              </button>
            </div>
          ))}
        </div>
      ) : null}
      {briefTask ? (
        <BriefModal
          title={`Email brief — ${briefTask.title}`}
          inheritedType={typeOfTask(briefTask)}
          initial={{
            followUpType: briefTask.followUpType,
            contactPhone: briefTask.contactPhone,
            contactName: briefTask.contactName,
            contactEmail: briefTask.contactEmail,
            briefWhat: briefTask.briefWhat,
            briefHow: briefTask.briefHow,
          }}
          inherited={(() => {
            const linked = findProspect(data, briefTask.relatedProspectId, briefTask.relatedCompany);
            if (!linked) return undefined;
            const inherited: BriefValue = {
              contactName: linked.contact,
              contactEmail: linked.contactEmail,
              contactPhone: linked.contactPhone,
              briefWhat: linked.briefWhat,
              briefHow: linked.briefHow,
            };
            return inherited;
          })()}
          subject={emailSubject(briefTask.relatedCompany || '', briefTask.kind === 'confirmation-email' ? 'confirmation' : 'follow-up')}
          inheritHint="Blank fields fall back to the linked prospect’s contact and brief."
          defaultStyle={data.settings?.defaultEmailStyle}
          onSave={(v) => updateBrief('task', briefTask.id, v)}
          onClose={() => setBriefTask(null)}
        />
      ) : null}
    </div>
  );
}
