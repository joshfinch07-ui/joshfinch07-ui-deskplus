/**
 * Minimal GitHub Contents API client for Desk+ cloud sync.
 * One JSON file in a PRIVATE repo; written with a fine-grained token that
 * Joshua pastes into Settings (kept only in this browser's localStorage).
 */
import type { AppData } from '../types';

export interface SyncConfig {
  enabled: boolean;
  /** "owner/repo" */
  repo: string;
  /** file path inside the repo */
  path: string;
  /** optional branch; blank = repo default branch */
  branch: string;
  token: string;
  deviceLabel: string;
  lastSyncedAt?: string;
  /** data.updatedAt value known to be identical locally and in the cloud */
  lastSyncedUpdatedAt?: string;
  lastSha?: string;
}

export interface Envelope {
  app: 'deskplus';
  format: 1;
  pushedAt: string;
  device: string;
  data: AppData;
}

export interface RemoteFile {
  sha: string | null;
  envelope: Envelope | null;
}

export class SyncError extends Error {
  status: number;
  constructor(message: string, status = 0) {
    super(message);
    this.status = status;
  }
}

const API = 'https://api.github.com';

function b64encode(str: string): string {
  const bytes = new TextEncoder().encode(str);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(bin);
}

function b64decode(b64: string): string {
  const bin = atob(b64.replace(/\s/g, ''));
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

function repoParts(cfg: SyncConfig): string {
  const repo = cfg.repo.trim().replace(/^https?:\/\/github\.com\//, '').replace(/\.git$/, '').replace(/\/+$/, '');
  if (!/^[\w.-]+\/[\w.-]+$/.test(repo)) throw new SyncError('Repo must look like owner/repo-name');
  return repo;
}

function contentsUrl(cfg: SyncConfig, withRef: boolean): string {
  const path = (cfg.path.trim() || 'deskplus-data.json')
    .replace(/^\/+/, '')
    .split('/')
    .map(encodeURIComponent)
    .join('/');
  const params = new URLSearchParams();
  if (withRef && cfg.branch.trim()) params.set('ref', cfg.branch.trim());
  // cache-buster: never trust a cached sha
  params.set('_', String(Date.now()));
  return `${API}/repos/${repoParts(cfg)}/contents/${path}?${params}`;
}

async function gh(cfg: SyncConfig, url: string, init: RequestInit = {}, accept = 'application/vnd.github+json') {
  if (!cfg.token.trim()) throw new SyncError('No GitHub token set');
  let res: Response;
  try {
    res = await fetch(url, {
      ...init,
      cache: 'no-store',
      headers: {
        Accept: accept,
        Authorization: `Bearer ${cfg.token.trim()}`,
        'X-GitHub-Api-Version': '2022-11-28',
        ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      },
    });
  } catch {
    throw new SyncError('Network error — offline? Will retry on the next change.');
  }
  return res;
}

async function errorFrom(res: Response, what: string): Promise<SyncError> {
  let msg = '';
  try {
    msg = ((await res.json()) as { message?: string }).message ?? '';
  } catch {
    /* ignore */
  }
  if (res.status === 401) return new SyncError('Token rejected (expired or mistyped) — paste a new one', 401);
  if (res.status === 403)
    return new SyncError(`GitHub refused (${msg || 'forbidden'}) — token needs Contents: Read and write on this repo`, 403);
  if (res.status === 404)
    return new SyncError('Repo not found — check owner/repo, and that the token has access to it', 404);
  return new SyncError(`${what} failed: ${res.status} ${msg}`.trim(), res.status);
}

/** Check the repo exists, is PRIVATE, and the token can write. */
export async function checkRepo(cfg: SyncConfig): Promise<{ fullName: string }> {
  const res = await gh(cfg, `${API}/repos/${repoParts(cfg)}`);
  if (!res.ok) throw await errorFrom(res, 'Repo check');
  const j = (await res.json()) as { full_name: string; private: boolean; visibility?: string };
  if (!j.private) {
    throw new SyncError(
      `Repo ${j.full_name} is PUBLIC — sync refused. Make it private (GitHub → repo Settings → Danger Zone → Change visibility).`,
    );
  }
  return { fullName: j.full_name };
}

export async function fetchRemote(cfg: SyncConfig): Promise<RemoteFile> {
  const res = await gh(cfg, contentsUrl(cfg, true));
  if (res.status === 404) {
    // Distinguish "file missing" from "repo missing" so we never push into the void.
    await checkRepo(cfg);
    return { sha: null, envelope: null };
  }
  if (!res.ok) throw await errorFrom(res, 'Download');
  const j = (await res.json()) as { sha: string; content?: string; encoding?: string; type?: string };
  if (j.type && j.type !== 'file') throw new SyncError('Sync path is a folder, not a file');
  let text: string;
  if (j.encoding === 'base64' && j.content) {
    text = b64decode(j.content);
  } else {
    // >1 MB files come back without inline content — fetch raw.
    const raw = await gh(cfg, contentsUrl(cfg, true), {}, 'application/vnd.github.raw+json');
    if (!raw.ok) throw await errorFrom(raw, 'Download');
    text = await raw.text();
  }
  if (!text.trim()) return { sha: j.sha, envelope: null };
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new SyncError('Cloud file is not valid JSON — not touching it. Fix or delete it in GitHub.');
  }
  const obj = parsed as Partial<Envelope> & Partial<AppData>;
  if (obj.app === 'deskplus' && obj.data) return { sha: j.sha, envelope: obj as Envelope };
  // Bare export JSON (e.g. uploaded by hand) is accepted too.
  if (obj.version === 1 && Array.isArray(obj.prospects)) {
    return {
      sha: j.sha,
      envelope: { app: 'deskplus', format: 1, pushedAt: '', device: 'manual upload', data: obj as AppData },
    };
  }
  throw new SyncError('Cloud file is not a Desk+ file — not touching it.');
}

export async function putRemote(cfg: SyncConfig, data: AppData, sha: string | null): Promise<string> {
  const envelope: Envelope = {
    app: 'deskplus',
    format: 1,
    pushedAt: new Date().toISOString(),
    device: cfg.deviceLabel || 'browser',
    data,
  };
  const body: Record<string, string> = {
    message: `Desk+ sync ${envelope.pushedAt}`,
    content: b64encode(JSON.stringify(envelope, null, 1)),
  };
  if (sha) body.sha = sha;
  if (cfg.branch.trim()) body.branch = cfg.branch.trim();
  const res = await gh(cfg, contentsUrl(cfg, false), { method: 'PUT', body: JSON.stringify(body) });
  if (res.status === 409 || res.status === 422) {
    throw new SyncError('Cloud copy changed meanwhile — retrying', 409);
  }
  if (!res.ok) throw await errorFrom(res, 'Upload');
  const j = (await res.json()) as { content?: { sha?: string } };
  return j.content?.sha ?? '';
}
