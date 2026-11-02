import type { RunPayload, SendResult } from './outbox';

type Outbox = typeof import('./outbox');

function loadOutbox(): Outbox {
  let mod!: Outbox;
  jest.isolateModules(() => { mod = require('./outbox'); });
  return mod;
}

function payload(id: string): RunPayload {
  return {
    id,
    ended_at: '2026-11-01T08:00:00.000Z',
    duration_seconds: 1800,
    distance_meters: 5000,
    waypoints: [{ lat: 47.68, lng: -122.34, ts: 0 }],
    mid_run_notes: [],
    feel: 4, body_tags: [], weather_feel: [], music: null, note: null, gear: [],
  };
}

const ok = (runId: string): SendResult => ({ ok: true, runId });
const fail = (error: string, needsSignIn = false, retryable = true): SendResult =>
  ({ ok: false, error, needsSignIn, retryable });

const A = { id: 'g-a', email: 'a@x.com' };
const B = { id: 'g-b', email: 'b@x.com' };

beforeEach(() => localStorage.clear());

test('enqueue stamps the owner and persists across a reload of the module', async () => {
  await loadOutbox().enqueue(payload('a'), A);
  const pending = await loadOutbox().listPending();
  expect(pending).toHaveLength(1);
  expect(pending[0]).toMatchObject({ clientId: 'a', attempts: 0, lastError: null, payload: payload('a'), owner: A });
});

test('enqueueing the same id twice keeps one entry', async () => {
  const outbox = loadOutbox();
  await outbox.enqueue(payload('a'), A);
  await outbox.enqueue(payload('a'), A);
  expect(await outbox.listPending()).toHaveLength(1);
});

test('a successful sync removes the run', async () => {
  const outbox = loadOutbox();
  await outbox.enqueue(payload('a'), A);
  const send = jest.fn().mockResolvedValue(ok('a'));
  const result = await outbox.syncOutbox(send, A.id);
  expect(send).toHaveBeenCalledWith(payload('a'));
  expect(result).toEqual({ synced: ['a'], failed: 0, needsSignIn: false });
  expect(await loadOutbox().listPending()).toEqual([]);
});

test('a failed sync keeps the run and counts the attempt', async () => {
  const outbox = loadOutbox();
  await outbox.enqueue(payload('a'), A);
  await outbox.syncOutbox(jest.fn().mockResolvedValue(fail('Unexpected error (503)')), A.id);
  await outbox.syncOutbox(jest.fn().mockResolvedValue(fail("Couldn't reach the server")), A.id);
  const [item] = await loadOutbox().listPending();
  expect(item.attempts).toBe(2);
  expect(item.lastError).toBe("Couldn't reach the server");
});

test('a sign-in failure stops the pass; the rest stay queued untouched', async () => {
  const outbox = loadOutbox();
  await outbox.enqueue(payload('a'), A);
  await outbox.enqueue(payload('b'), A);
  const send = jest.fn().mockResolvedValue(fail('expired', true));
  const result = await outbox.syncOutbox(send, A.id);
  expect(send).toHaveBeenCalledTimes(1);
  expect(result.needsSignIn).toBe(true);
  const pending = await outbox.listPending();
  expect(pending.map(p => [p.clientId, p.attempts])).toEqual([['a', 1], ['b', 0]]);
});

test('concurrent syncs share one pass, so nothing is sent twice', async () => {
  const outbox = loadOutbox();
  await outbox.enqueue(payload('a'), A);
  const send = jest.fn().mockResolvedValue(ok('a'));
  await Promise.all([outbox.syncOutbox(send, A.id), outbox.syncOutbox(send, A.id)]);
  expect(send).toHaveBeenCalledTimes(1);
});

test('subscribers hear about changes', async () => {
  const outbox = loadOutbox();
  const seen: number[] = [];
  const unsubscribe = outbox.subscribe(p => seen.push(p.length));
  await outbox.enqueue(payload('a'), A);
  await outbox.removePending('a');
  unsubscribe();
  await outbox.enqueue(payload('b'), A);
  expect(seen).toEqual([1, 0]);
});

test("sync uploads only the signed-in account's runs and leaves the others untouched", async () => {
  const outbox = loadOutbox();
  await outbox.enqueue(payload('a1'), A);
  await outbox.enqueue(payload('b1'), B);
  await outbox.enqueue(payload('a2'), A);
  const send = jest.fn((p: RunPayload) => Promise.resolve(ok(p.id)));

  const asA = await outbox.syncOutbox(send, A.id);
  expect(send.mock.calls.map(([p]) => p.id)).toEqual(['a1', 'a2']);
  expect(asA).toEqual({ synced: ['a1', 'a2'], failed: 0, needsSignIn: false });
  const left = await outbox.listPending();
  expect(left).toHaveLength(1);
  expect(left[0]).toMatchObject({ clientId: 'b1', attempts: 0, lastError: null, owner: B });

  // Sending B's run directly as A is refused without touching it.
  expect(await outbox.sendPending('b1', send, A.id)).toMatchObject({ ok: false, notMine: true });
  expect((await outbox.listPending())[0]).toMatchObject({ attempts: 0, lastError: null });

  const asB = await outbox.syncOutbox(send, B.id);
  expect(asB.synced).toEqual(['b1']);
  expect(await outbox.listPending()).toEqual([]);
});

test("a failing upload for one account never counts against another account's runs", async () => {
  const outbox = loadOutbox();
  await outbox.enqueue(payload('a'), A);
  await outbox.enqueue(payload('b'), B);
  await outbox.syncOutbox(jest.fn().mockResolvedValue(fail('Unexpected error (503)')), A.id);
  const byId = Object.fromEntries((await outbox.listPending()).map(p => [p.clientId, p.attempts]));
  expect(byId).toEqual({ a: 1, b: 0 });
});

test("a sign-in mid-pass gets its own pass instead of sharing the other account's", async () => {
  const outbox = loadOutbox();
  await outbox.enqueue(payload('a'), A);
  await outbox.enqueue(payload('b'), B);
  const send = jest.fn((p: RunPayload) => Promise.resolve(ok(p.id)));
  const [asA, asB] = await Promise.all([outbox.syncOutbox(send, A.id), outbox.syncOutbox(send, B.id)]);
  expect(asA.synced).toEqual(['a']);
  expect(asB.synced).toEqual(['b']);
});

test('a run queued before owners existed is never auto-synced, and can be claimed', async () => {
  // Written by the previous version of the app: no owner field at all.
  const legacy = { clientId: 'old', payload: payload('old'), createdAt: '2026-10-30T08:00:00.000Z', attempts: 2, lastError: 'expired' };
  localStorage.setItem('run.outbox.v1', JSON.stringify([legacy]));
  const outbox = loadOutbox();
  const send = jest.fn((p: RunPayload) => Promise.resolve(ok(p.id)));

  expect(outbox.ownershipOf((await outbox.listPending())[0], A.id)).toBe('unknown');
  expect(await outbox.syncOutbox(send, A.id)).toEqual({ synced: [], failed: 0, needsSignIn: false });
  expect(send).not.toHaveBeenCalled();
  expect(await outbox.listPending()).toEqual([legacy]);

  await outbox.claimPending('old', A);
  await outbox.claimPending('old', B); // already owned: a second claim changes nothing
  expect((await outbox.listPending())[0].owner).toEqual(A);
  expect((await outbox.syncOutbox(send, A.id)).synced).toEqual(['old']);
});

test('ownershipOf', () => {
  const outbox = loadOutbox();
  const run = (owner?: typeof A) => ({ clientId: 'x', payload: payload('x'), createdAt: '', attempts: 0, lastError: null, owner });
  expect(outbox.ownershipOf(run(A), A.id)).toBe('mine');
  expect(outbox.ownershipOf(run(A), B.id)).toBe('other');
  expect(outbox.ownershipOf(run(A), undefined)).toBe('other');
  expect(outbox.ownershipOf(run(), A.id)).toBe('unknown');
});

test('newClientId makes v4 UUIDs, with or without crypto.randomUUID', () => {
  const outbox = loadOutbox();
  const v4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
  const original = crypto.randomUUID;
  try {
    (crypto as any).randomUUID = undefined;
    expect(outbox.newClientId()).toMatch(v4);
  } finally {
    (crypto as any).randomUUID = original;
  }
  expect(outbox.newClientId()).not.toBe(outbox.newClientId());
});

test('postRunWith maps responses to results', async () => {
  const outbox = loadOutbox();
  const json = (status: number, body: unknown) => ({ ok: status < 300, status, json: async () => body }) as Response;
  const apiFetch = jest.fn()
    .mockResolvedValueOnce(json(201, { id: 'a' }))
    .mockResolvedValueOnce(json(401, {}))
    .mockResolvedValueOnce(json(500, { error: 'boom' }))
    .mockResolvedValueOnce(json(400, { error: 'bad gear' }))
    .mockRejectedValueOnce(new TypeError('Failed to fetch'));
  const send = outbox.postRunWith(apiFetch);
  expect(await send(payload('a'))).toEqual(ok('a'));
  expect(await send(payload('a'))).toMatchObject({ ok: false, needsSignIn: true, retryable: true });
  expect(await send(payload('a'))).toEqual(fail('boom'));
  expect(await send(payload('a'))).toEqual(fail('bad gear', false, false));
  expect(await send(payload('a'))).toMatchObject({ ok: false, needsSignIn: false, retryable: true });
  expect(JSON.parse(apiFetch.mock.calls[0][1].body).id).toBe('a');
});
