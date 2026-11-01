import { readJson, writeJson } from './durableStore';
import { describeRequestError, errorFromResponse } from './apiErrors';
import type { toRunFeelPayload } from '../components/RunFeelForm';
import type { Waypoint } from '../hooks/useGPS';
import type { MidRunNote } from './runTypes';

// The run outbox: finished runs that are saved on this phone and not yet on
// the server. "How was it?" writes the run here before it tries the upload,
// so a failed upload (expired sign-in, no signal, server error) never loses
// it. This module is the only thing that touches the outbox's storage.
//
// Each run remembers the Google account that recorded it, and only that
// account uploads it: a phone shared by two runners never files one person's
// run under the other. `ownershipOf` is the one place that decides.

/** The POST /api/runs body. `id` is the client's run id, so a resend is a no-op. */
export type RunPayload = {
  id: string;
  ended_at: string;
  duration_seconds: number;
  distance_meters: number;
  waypoints: Waypoint[];
  mid_run_notes: MidRunNote[];
} & ReturnType<typeof toRunFeelPayload>;

/** The account a run belongs to: its Google `sub`, and its email to show. */
export interface Owner {
  id: string;
  email: string;
}

export interface PendingRun {
  clientId: string;
  payload: RunPayload;
  createdAt: string;
  attempts: number;
  lastError: string | null;
  /** Missing on runs queued before owners were recorded (and on a few resumed runs); see `ownershipOf`. */
  owner?: Owner | null;
}

/**
 * Whose run this is, from the signed-in account's point of view. Only 'mine'
 * is ever uploaded. 'unknown' (no recorded owner) waits until someone claims
 * it with `claimPending`; it's never uploaded on a guess.
 */
export type Ownership = 'mine' | 'other' | 'unknown';

export function ownershipOf(pending: PendingRun, accountId: string | null | undefined): Ownership {
  if (!pending.owner) return 'unknown';
  return accountId && pending.owner.id === accountId ? 'mine' : 'other';
}

export type SendResult =
  | { ok: true; runId: string }
  | {
      ok: false;
      error: string;
      /** A 401 even after a silent refresh. */
      needsSignIn: boolean;
      /** Worth trying again later (sign-in, network, 5xx), as opposed to a request the server rejected. */
      retryable: boolean;
      /** Not sent: the run belongs to another account (or none yet). Not a failure; nothing was recorded. */
      notMine?: boolean;
    };

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

/** Adds a run, recorded by `owner`, to the outbox (or replaces the one with the same id). */
export async function enqueue(payload: RunPayload, owner: Owner | null): Promise<void> {
  await update(pending => [
    ...pending.filter(p => p.clientId !== payload.id),
    { clientId: payload.id, payload, createdAt: new Date().toISOString(), attempts: 0, lastError: null, owner },
  ]);
}

/** Gives a run with no recorded owner to `owner`, so it syncs as theirs. Owned runs are left alone. */
export async function claimPending(clientId: string, owner: Owner): Promise<void> {
  await update(pending => pending.map(p => (p.clientId === clientId && !p.owner ? { ...p, owner } : p)));
}

export async function removePending(clientId: string): Promise<void> {
  await update(pending => pending.filter(p => p.clientId !== clientId));
}

/**
 * Tries to upload one queued run as `accountId`. Success removes it; failure
 * keeps it and records why. Another account's run isn't sent or touched.
 */
export async function sendPending(clientId: string, send: Send, accountId: string | null | undefined): Promise<SendResult> {
  const item = (await listPending()).find(p => p.clientId === clientId);
  if (!item) return { ok: false, error: 'Not in the outbox', needsSignIn: false, retryable: false };
  if (ownershipOf(item, accountId) !== 'mine') {
    return { ok: false, error: 'Saved by another account', needsSignIn: false, retryable: true, notMine: true };
  }
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

let inFlight: { accountId: string | null | undefined; pass: Promise<SyncResult> } | null = null;

/**
 * Uploads the signed-in account's runs, oldest first, skipping everyone
 * else's. Concurrent calls for the same account share one pass; a call for a
 * different account (a sign-in mid-pass) runs its own pass after it.
 */
export function syncOutbox(send: Send, accountId: string | null | undefined): Promise<SyncResult> {
  if (inFlight && inFlight.accountId === accountId) return inFlight.pass;
  const before = inFlight ? inFlight.pass.catch(() => undefined) : undefined;
  const pass: Promise<SyncResult> = (async () => {
    await before;
    const result: SyncResult = { synced: [], failed: 0, needsSignIn: false };
    const mine = (await listPending()).filter(p => ownershipOf(p, accountId) === 'mine');
    for (const item of mine) {
      const r = await sendPending(item.clientId, send, accountId);
      if (r.ok) {
        result.synced.push(item.clientId);
      } else {
        result.failed += 1;
        // Without a sign-in the rest will fail the same way; stop here.
        if (r.needsSignIn) { result.needsSignIn = true; break; }
      }
    }
    return result;
  })().finally(() => { if (inFlight?.pass === pass) inFlight = null; });
  inFlight = { accountId, pass };
  return pass;
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
        return {
          ok: false,
          error: (await errorFromResponse(res)).message,
          needsSignIn: res.status === 401,
          retryable: res.status === 401 || res.status >= 500,
        };
      }
      const run = await res.json();
      return { ok: true, runId: run.id };
    } catch (e) {
      return { ok: false, error: describeRequestError(e), needsSignIn: false, retryable: true };
    }
  };
}
