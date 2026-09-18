import { useMemo, useState } from 'react';
import { useStore } from '../store/StoreContext';
import { formatDisplay, isOverdue, isDueToday, todayISO } from '../utils/dates';

export function TasksView() {
  const { data, addTask, toggleTask, deleteTask } = useStore();
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
          <input
            className="input"
            type="date"
            style={{ width: 160 }}
            value={due}
            onChange={(e) => setDue(e.target.value)}
          />
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
    </div>
  );
}
