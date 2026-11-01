import { readJson, writeJson } from './durableStore';
import { describeRequestError, errorFromResponse } from './apiErrors';
import type { toRunFeelPayload } from '../components/RunFeelForm';
import type { Waypoint } from '../hooks/useGPS';
import type { MidRunNote } from './runTypes';

// The run outbox: finished runs that are saved on this phone and not yet on
// the server. "How was it?" writes the run here before it tries the upload,
// so a failed upload (expired sign-in, no signal, server error) never loses
// it. This module is the only thing that touches the outbox's storage.

/** The POST /api/runs body. `id` is the client's run id, so a resend is a no-op. */
export type RunPayload = {
  id: string;
  ended_at: string;
  duration_seconds: number;
  distance_meters: number;
  waypoints: Waypoint[];
  mid_run_notes: MidRunNote[];
} & ReturnType<typeof toRunFeelPayload>;

export interface PendingRun {
  clientId: string;
  payload: RunPayload;
  createdAt: string;
  attempts: number;
  lastError: string | null;
}

export type SendResult =
  | { ok: true; runId: string }
  | { ok: false; error: string; needsSignIn: boolean };

export type Send = (payload: RunPayload) => Promise<SendResult>;

export interface SyncResult {
  synced: string[];
  failed: number;
  needsSignIn: boolean;
}

const KEY = 'outbox.v1';

/** A v4 UUID. crypto.randomUUID is missing before iOS 15.4, so build one if needed. */
export function newClientId(): string {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const hex = Array.from(b, x => x.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

// Every read-modify-write goes through this chain so two writers (a save and
// a background sync) can't drop each other's changes.
let chain: Promise<unknown> = Promise.resolve();
function serialized<T>(fn: () => Promise<T>): Promise<T> {
  const next = chain.then(fn, fn);
  chain = next.catch(() => undefined);
  return next;
}

const listeners = new Set<(pending: PendingRun[]) => void>();

async function load(): Promise<PendingRun[]> {
  return (await readJson<PendingRun[]>(KEY)) ?? [];
}

async function store(pending: PendingRun[]): Promise<void> {
  await writeJson(KEY, pending);
  listeners.forEach(l => l(pending));
}

function update(fn: (pending: PendingRun[]) => PendingRun[]): Promise<PendingRun[]> {
  return serialized(async () => {
    const next = fn(await load());
    await store(next);
    return next;
  });
}

export function listPending(): Promise<PendingRun[]> {
  return serialized(load);
}

/** Calls `listener` with the outbox after every change. Returns an unsubscribe. */
export function subscribe(listener: (pending: PendingRun[]) => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

/** Adds a run to the outbox (or replaces the one with the same id). */
export async function enqueue(payload: RunPayload): Promise<void> {
  await update(pending => [
    ...pending.filter(p => p.clientId !== payload.id),
    { clientId: payload.id, payload, createdAt: new Date().toISOString(), attempts: 0, lastError: null },
  ]);
}

export async function removePending(clientId: string): Promise<void> {
  await update(pending => pending.filter(p => p.clientId !== clientId));
}

/** Tries to upload one queued run. Success removes it; failure keeps it and records why. */
export async function sendPending(clientId: string, send: Send): Promise<SendResult> {
  const item = (await listPending()).find(p => p.clientId === clientId);
  if (!item) return { ok: false, error: 'Not in the outbox', needsSignIn: false };
  const result = await send(item.payload);
  if (result.ok) {
    await removePending(clientId);
  } else {
    await update(pending => pending.map(p => (
      p.clientId === clientId ? { ...p, attempts: p.attempts + 1, lastError: result.error } : p
    )));
  }
  return result;
}

let inFlight: Promise<SyncResult> | null = null;

/** Uploads everything in the outbox, oldest first. Concurrent calls share one pass. */
export function syncOutbox(send: Send): Promise<SyncResult> {
  if (inFlight) return inFlight;
  inFlight = (async () => {
    const result: SyncResult = { synced: [], failed: 0, needsSignIn: false };
    for (const item of await listPending()) {
      const r = await sendPending(item.clientId, send);
      if (r.ok) {
        result.synced.push(item.clientId);
      } else {
        result.failed += 1;
        // Without a sign-in the rest will fail the same way; stop here.
        if (r.needsSignIn) { result.needsSignIn = true; break; }
      }
    }
    return result;
  })().finally(() => { inFlight = null; });
  return inFlight;
}

/** The real sender: POST /api/runs through the app's authenticated fetch. */
export function postRunWith(apiFetch: (url: string, options?: RequestInit) => Promise<Response>): Send {
  return async payload => {
    try {
      const res = await apiFetch('/api/runs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        return { ok: false, error: (await errorFromResponse(res)).message, needsSignIn: res.status === 401 };
      }
      const run = await res.json();
      return { ok: true, runId: run.id };
    } catch (e) {
      return { ok: false, error: describeRequestError(e), needsSignIn: false };
    }
  };
}
