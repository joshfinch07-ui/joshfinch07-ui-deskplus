import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import type { AppData } from '../types';
import { useStore } from '../store/StoreContext';
import { isEmptyData, recordCount, saveBackup } from '../store/migrate';
import { checkRepo, fetchRemote, putRemote, SyncError, type SyncConfig } from './github';

export const SYNC_CONFIG_KEY = 'deskplus-sync';
const PUSH_DEBOUNCE_MS = 4000;
const FOCUS_PULL_MIN_MS = 60_000;

/** auto = load/focus check; push = after a local edit; manual = Sync now button */
export type SyncMode = 'auto' | 'push' | 'manual' | 'force-push' | 'force-pull';
export type SyncPhase = 'off' | 'idle' | 'syncing' | 'error';

export interface SyncStatus {
  phase: SyncPhase;
  message: string;
  lastSyncedAt?: string;
  pending: boolean;
}

const DEFAULT_CONFIG: SyncConfig = {
  enabled: false,
  repo: '',
  path: 'deskplus-data.json',
  branch: '',
  token: '',
  deviceLabel: '',
};

function loadConfig(): SyncConfig {
  try {
    const raw = localStorage.getItem(SYNC_CONFIG_KEY);
    return raw ? { ...DEFAULT_CONFIG, ...(JSON.parse(raw) as Partial<SyncConfig>) } : { ...DEFAULT_CONFIG };
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}

function saveConfig(cfg: SyncConfig) {
  try {
    localStorage.setItem(SYNC_CONFIG_KEY, JSON.stringify(cfg));
  } catch {
    /* ignore */
  }
}

function fmtTime(iso?: string) {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleString(undefined, {
      day: 'numeric',
      month: 'short',
      hour: 'numeric',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

interface SyncApi {
  config: SyncConfig;
  status: SyncStatus;
  updateConfig: (patch: Partial<SyncConfig>) => void;
  syncNow: (mode?: SyncMode) => Promise<void>;
  testConnection: () => Promise<string>;
}

const Ctx = createContext<SyncApi | null>(null);

export function SyncProvider({ children }: { children: ReactNode }) {
  const { data, replaceData } = useStore();
  const [config, setConfig] = useState<SyncConfig>(() => loadConfig());
  const cfgRef = useRef(config);
  const dataRef = useRef<AppData>(data);
  useEffect(() => {
    dataRef.current = data;
  }, [data]);
  const busy = useRef(false);
  const again = useRef<SyncMode | null>(null);
  const timer = useRef<number | null>(null);
  const lastCheck = useRef(0);
  const privateOk = useRef<string | null>(null);
  const [status, setStatus] = useState<SyncStatus>(() => ({
    phase: config.enabled ? 'idle' : 'off',
    message: config.enabled ? 'Waiting for first sync…' : 'Off — data saved in this browser only',
    lastSyncedAt: config.lastSyncedAt,
    pending: false,
  }));

  const writeCfg = useCallback((patch: Partial<SyncConfig>) => {
    const next = { ...cfgRef.current, ...patch };
    cfgRef.current = next;
    saveConfig(next);
    setConfig(next);
  }, []);

  const configured = (c: SyncConfig) => c.enabled && !!c.token.trim() && !!c.repo.trim();

  const syncNow = useCallback(
    async (mode: SyncMode = 'manual'): Promise<void> => {
      const cfg0 = cfgRef.current;
      if (!configured(cfg0)) {
        setStatus((s) => ({
          ...s,
          phase: cfg0.enabled ? 'error' : 'off',
          message: cfg0.enabled ? 'Add repo + token to start syncing' : 'Off — data saved in this browser only',
        }));
        return;
      }
      if (busy.current) {
        again.current = mode === 'auto' || mode === 'push' ? again.current ?? mode : mode;
        return;
      }
      busy.current = true;
      lastCheck.current = Date.now();
      setStatus((s) => ({ ...s, phase: 'syncing', message: 'Syncing…' }));

      const markSynced = (updatedAt: string | undefined, sha: string, msg: string) => {
        const at = new Date().toISOString();
        writeCfg({ lastSyncedAt: at, lastSyncedUpdatedAt: updatedAt ?? '', lastSha: sha });
        setStatus({ phase: 'idle', message: msg, lastSyncedAt: at, pending: false });
      };

      const run = async (attempt: number): Promise<void> => {
        const cfg = cfgRef.current;
        if (privateOk.current !== cfg.repo) {
          await checkRepo(cfg); // refuses public repos
          privateOk.current = cfg.repo;
        }
        const remote = await fetchRemote(cfg);
        const rData = remote.envelope?.data ?? null;
        const local = dataRef.current;
        const localEmpty = isEmptyData(local);
        const remoteEmpty = !rData || isEmptyData(rData);

        const push = async (msg: string) => {
          const snapshot = dataRef.current;
          if (isEmptyData(snapshot) && !remoteEmpty && mode !== 'force-push') {
            // Never push an empty book over a non-empty cloud copy automatically.
            setStatus((s) => ({
              ...s,
              phase: 'idle',
              message: 'This browser is empty — cloud copy left untouched',
              pending: false,
            }));
            return;
          }
          const sha = await putRemote(cfg, snapshot, remote.sha);
          markSynced(snapshot.updatedAt, sha, msg);
        };

        const adopt = (msg: string) => {
          const incoming = rData as AppData;
          replaceData(incoming, 'before-cloud-pull');
          dataRef.current = incoming;
          markSynced(incoming.updatedAt, remote.sha ?? '', msg);
        };

        try {
          if (mode === 'force-push') {
            if (rData && !remoteEmpty) saveBackup(rData, 'cloud-copy-before-force-push');
            await push('Pushed this browser’s copy to the cloud');
            return;
          }
          if (mode === 'force-pull') {
            if (remoteEmpty) throw new SyncError('Cloud copy is empty — nothing to load');
            adopt(`Loaded cloud copy (${recordCount(rData)} records); previous copy backed up`);
            return;
          }
          if (remoteEmpty && localEmpty) {
            markSynced(local.updatedAt, remote.sha ?? '', 'Nothing to sync yet');
            return;
          }
          if (remoteEmpty) {
            await push(remote.sha ? 'Cloud copy was empty — uploaded this browser’s data' : 'Created cloud copy');
            return;
          }
          if (localEmpty) {
            if (mode === 'push') {
              // Local was just emptied (e.g. Wipe all) — don't undo it, don't push it.
              setStatus((s) => ({
                ...s,
                phase: 'idle',
                message: 'This browser is empty — cloud copy left untouched',
                pending: false,
              }));
              return;
            }
            adopt(`Loaded ${recordCount(rData)} records from the cloud`);
            return;
          }
          const lu = local.updatedAt ?? '';
          const ru = rData!.updatedAt ?? '';
          const base = cfg.lastSyncedUpdatedAt ?? '';
          if (lu && lu === ru) {
            markSynced(lu, remote.sha ?? '', 'Up to date');
            return;
          }
          const localChanged = lu !== base || !base;
          const remoteChanged = ru !== base || !base;
          if (remoteChanged && !localChanged) {
            adopt('Loaded newer cloud copy (this browser’s copy backed up)');
            return;
          }
          if (localChanged && !remoteChanged) {
            await push('Saved to cloud');
            return;
          }
          // Both sides changed since the last sync (or first sync on this device).
          if (ru > lu) {
            const useCloud = window.confirm(
              `Desk+ cloud sync\n\nThe cloud copy is newer (saved ${fmtTime(ru)}${
                remote.envelope?.device ? ` from “${remote.envelope.device}”` : ''
              }) than this browser’s copy (${fmtTime(lu) || 'unknown'}).\n\n` +
                `OK = use the cloud copy (this browser’s copy is kept as a local backup).\n` +
                `Cancel = keep this browser’s copy and upload it (the cloud copy is kept as a local backup and in GitHub history).`,
            );
            if (useCloud) {
              adopt('Loaded newer cloud copy (this browser’s copy backed up)');
              return;
            }
          }
          saveBackup(rData!, 'cloud-copy-before-overwrite');
          await push('Saved to cloud (older cloud copy backed up locally)');
        } catch (e) {
          if (e instanceof SyncError && e.status === 409 && attempt < 2) return run(attempt + 1);
          throw e;
        }
      };

      let ok = false;
      try {
        await run(0);
        ok = true;
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'Sync failed';
        if (e instanceof SyncError && (e.status === 401 || e.status === 404)) privateOk.current = null;
        setStatus((s) => ({ ...s, phase: 'error', message: msg, pending: true }));
      } finally {
        busy.current = false;
        const next = again.current;
        again.current = null;
        if (next) void syncNow(next);
        else if (
          ok &&
          configured(cfgRef.current) &&
          (dataRef.current.updatedAt ?? '') !== (cfgRef.current.lastSyncedUpdatedAt ?? '') &&
          !isEmptyData(dataRef.current)
        ) {
          // edits made while we were syncing
          if (timer.current) window.clearTimeout(timer.current);
          timer.current = window.setTimeout(() => void syncNow('push'), PUSH_DEBOUNCE_MS);
        }
      }
    },
    [replaceData, writeCfg],
  );

  // Pull-on-load (and when settings are first completed).
  const startedFor = useRef<string>('');
  useEffect(() => {
    const key = configured(config) ? `${config.repo}|${config.path}|${config.branch}|${config.token.length}` : '';
    if (!config.enabled) {
      setStatus((s) => ({ ...s, phase: 'off', message: 'Off — data saved in this browser only', pending: false }));
    }
    if (!key || startedFor.current === key) return;
    // Small delay so typing/pasting settings doesn't fire a request per keystroke.
    const h = window.setTimeout(() => {
      startedFor.current = key;
      void syncNow('auto');
    }, startedFor.current ? 1200 : 300);
    return () => window.clearTimeout(h);
  }, [config, syncNow]);

  // Debounced push after every change.
  useEffect(() => {
    const cfg = cfgRef.current;
    if (!configured(cfg)) return;
    if ((data.updatedAt ?? '') === (cfg.lastSyncedUpdatedAt ?? '')) return;
    setStatus((s) => (s.phase === 'syncing' ? s : { ...s, pending: true }));
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      timer.current = null;
      void syncNow('push');
    }, PUSH_DEBOUNCE_MS);
  }, [data.updatedAt, syncNow]);

  // Flush when the tab is hidden; re-check the cloud when it comes back.
  useEffect(() => {
    const onVis = () => {
      if (!configured(cfgRef.current)) return;
      if (document.visibilityState === 'hidden') {
        if (timer.current) {
          window.clearTimeout(timer.current);
          timer.current = null;
          void syncNow('push');
        }
      } else if (Date.now() - lastCheck.current > FOCUS_PULL_MIN_MS) {
        void syncNow('auto');
      }
    };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, [syncNow]);

  const updateConfig = useCallback(
    (patch: Partial<SyncConfig>) => {
      // Changing target repo/path resets the merge baseline.
      const retarget =
        (patch.repo !== undefined && patch.repo !== cfgRef.current.repo) ||
        (patch.path !== undefined && patch.path !== cfgRef.current.path) ||
        (patch.branch !== undefined && patch.branch !== cfgRef.current.branch);
      writeCfg(retarget ? { ...patch, lastSyncedUpdatedAt: '', lastSha: '' } : patch);
      if (retarget) privateOk.current = null;
    },
    [writeCfg],
  );

  const testConnection = useCallback(async () => {
    const r = await checkRepo(cfgRef.current);
    privateOk.current = cfgRef.current.repo;
    return `Connected to ${r.fullName} (private) ✓`;
  }, []);

  const api = useMemo<SyncApi>(
    () => ({ config, status, updateConfig, syncNow, testConnection }),
    [config, status, updateConfig, syncNow, testConnection],
  );
  return <Ctx.Provider value={api}>{children}</Ctx.Provider>;
}

export function useSync(): SyncApi {
  const c = useContext(Ctx);
  if (!c) throw new Error('useSync outside provider');
  return c;
}

export { fmtTime };
