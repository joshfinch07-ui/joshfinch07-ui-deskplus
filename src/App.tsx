import { useCallback, useRef, useState } from 'react';
import type { Prospect, ViewId } from './types';
import { StoreProvider, useStore } from './store/StoreContext';
import { headerDate } from './utils/dates';
import { TodayView } from './views/TodayView';
import { PipelineView } from './views/PipelineView';
import { ColdCallsView } from './views/ColdCallsView';
import { MeetingsView } from './views/MeetingsView';
import { TradeIdeasView } from './views/TradeIdeasView';
import { TasksView } from './views/TasksView';
import { ProspectForm } from './components/ProspectForm';
import { ColdCallModal } from './components/ColdCallModal';
import { BookMeetingForm, LogActivityForm, LogMeetingForm } from './components/MeetingForms';
import { Toast } from './components/Toast';

const TABS: { id: ViewId; label: string }[] = [
  { id: 'today', label: 'Today' },
  { id: 'pipeline', label: 'Pipeline' },
  { id: 'coldcalls', label: 'Cold calls' },
  { id: 'meetings', label: 'Meetings' },
  { id: 'tradeideas', label: 'Trade ideas' },
  { id: 'tasks', label: 'Tasks' },
];

function AppInner() {
  const store = useStore();
  const [view, setView] = useState<ViewId>('today');
  const [prospectForm, setProspectForm] = useState<Prospect | null | 'new'>(null);
  const [coldOpen, setColdOpen] = useState(false);
  const [bookOpen, setBookOpen] = useState(false);
  const [logMeetingOpen, setLogMeetingOpen] = useState(false);
  const [logKind, setLogKind] = useState<'call' | 'email' | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const openProspect = useCallback(
    (id: string) => {
      const p = store.data.prospects.find((x) => x.id === id) ?? null;
      setProspectForm(p);
    },
    [store.data.prospects],
  );

  const exportData = () => {
    const blob = new Blob([store.exportJson()], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `deskplus-export-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    setToast('Exported JSON');
  };

  const importFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        store.importJson(String(reader.result));
        setToast('Import successful');
      } catch (e) {
        setToast(e instanceof Error ? e.message : 'Import failed');
      }
    };
    reader.readAsText(file);
  };

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="brand">
          <h1>
            Desk<span className="plus">+</span>
          </h1>
          <div className="date">{headerDate()}</div>
        </div>
        <div className="header-actions">
          <button type="button" className="btn btn-coldcall" onClick={() => setColdOpen(true)}>
            ☎ Cold call list
          </button>
          <button type="button" className="btn btn-primary" onClick={() => setProspectForm('new')}>
            + Add prospect
          </button>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setLogKind('call')}>
            Log call
          </button>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setLogKind('email')}>
            Log email
          </button>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setBookOpen(true)}>
            Book meeting
          </button>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setLogMeetingOpen(true)}>
            Log meeting
          </button>
        </div>
      </header>

      <nav className="nav-tabs" aria-label="Main">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            className={`nav-tab${view === t.id ? ' active' : ''}`}
            onClick={() => setView(t.id)}
          >
            {t.label}
          </button>
        ))}
      </nav>

      {view === 'today' ? <TodayView onOpenProspect={openProspect} /> : null}
      {view === 'pipeline' ? <PipelineView onOpenProspect={openProspect} /> : null}
      {view === 'coldcalls' ? <ColdCallsView /> : null}
      {view === 'meetings' ? <MeetingsView /> : null}
      {view === 'tradeideas' ? <TradeIdeasView /> : null}
      {view === 'tasks' ? <TasksView /> : null}

      <div className="card" style={{ marginTop: 20 }}>
        <div className="section-title">
          <h2 style={{ fontSize: '1rem' }}>Data</h2>
        </div>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginTop: 0 }}>
          Saved in this browser via localStorage. Export JSON to back up or share with an assistant.
          Sample rows are tagged EXAMPLE.
        </p>
        <div className="data-bar">
          <button type="button" className="btn btn-ghost btn-sm" onClick={exportData}>
            Export JSON
          </button>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => fileRef.current?.click()}>
            Import JSON
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            className="sr-only"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) importFile(f);
              e.target.value = '';
            }}
          />
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => {
              store.wipeExamples();
              setToast('Example data wiped');
            }}
          >
            Wipe examples
          </button>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => {
              store.loadExamples();
              setToast('Example seed loaded');
            }}
          >
            Load examples
          </button>
          <button
            type="button"
            className="btn-danger"
            onClick={() => {
              if (confirm('Wipe ALL Desk+ data in this browser?')) {
                store.wipeAll();
                setToast('All data wiped');
              }
            }}
          >
            Wipe all
          </button>
        </div>
      </div>

      {prospectForm === 'new' ? (
        <ProspectForm onClose={() => setProspectForm(null)} onSaved={() => setToast('Prospect saved')} />
      ) : null}
      {prospectForm && prospectForm !== 'new' ? (
        <ProspectForm
          initial={prospectForm}
          onClose={() => setProspectForm(null)}
          onSaved={() => setToast('Prospect updated')}
        />
      ) : null}
      {coldOpen ? <ColdCallModal onClose={() => setColdOpen(false)} /> : null}
      {bookOpen ? <BookMeetingForm onClose={() => setBookOpen(false)} /> : null}
      {logMeetingOpen ? <LogMeetingForm onClose={() => setLogMeetingOpen(false)} /> : null}
      {logKind ? <LogActivityForm kind={logKind} onClose={() => setLogKind(null)} /> : null}
      {toast ? <Toast message={toast} onDone={() => setToast(null)} /> : null}
    </div>
  );
}

export default function App() {
  return (
    <StoreProvider>
      <AppInner />
    </StoreProvider>
  );
}
