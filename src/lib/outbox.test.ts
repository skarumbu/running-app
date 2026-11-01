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

beforeEach(() => localStorage.clear());

test('enqueue persists across a reload of the module', async () => {
  await loadOutbox().enqueue(payload('a'));
  const pending = await loadOutbox().listPending();
  expect(pending).toHaveLength(1);
  expect(pending[0]).toMatchObject({ clientId: 'a', attempts: 0, lastError: null, payload: payload('a') });
});

test('enqueueing the same id twice keeps one entry', async () => {
  const outbox = loadOutbox();
  await outbox.enqueue(payload('a'));
  await outbox.enqueue(payload('a'));
  expect(await outbox.listPending()).toHaveLength(1);
});

test('a successful sync removes the run', async () => {
  const outbox = loadOutbox();
  await outbox.enqueue(payload('a'));
  const send = jest.fn().mockResolvedValue(ok('a'));
  const result = await outbox.syncOutbox(send);
  expect(send).toHaveBeenCalledWith(payload('a'));
  expect(result).toEqual({ synced: ['a'], failed: 0, needsSignIn: false });
  expect(await loadOutbox().listPending()).toEqual([]);
});

test('a failed sync keeps the run and counts the attempt', async () => {
  const outbox = loadOutbox();
  await outbox.enqueue(payload('a'));
  await outbox.syncOutbox(jest.fn().mockResolvedValue(fail('Unexpected error (503)')));
  await outbox.syncOutbox(jest.fn().mockResolvedValue(fail("Couldn't reach the server")));
  const [item] = await loadOutbox().listPending();
  expect(item.attempts).toBe(2);
  expect(item.lastError).toBe("Couldn't reach the server");
});

test('a sign-in failure stops the pass; the rest stay queued untouched', async () => {
  const outbox = loadOutbox();
  await outbox.enqueue(payload('a'));
  await outbox.enqueue(payload('b'));
  const send = jest.fn().mockResolvedValue(fail('expired', true));
  const result = await outbox.syncOutbox(send);
  expect(send).toHaveBeenCalledTimes(1);
  expect(result.needsSignIn).toBe(true);
  const pending = await outbox.listPending();
  expect(pending.map(p => [p.clientId, p.attempts])).toEqual([['a', 1], ['b', 0]]);
});

test('concurrent syncs share one pass, so nothing is sent twice', async () => {
  const outbox = loadOutbox();
  await outbox.enqueue(payload('a'));
  const send = jest.fn().mockResolvedValue(ok('a'));
  await Promise.all([outbox.syncOutbox(send), outbox.syncOutbox(send)]);
  expect(send).toHaveBeenCalledTimes(1);
});

test('subscribers hear about changes', async () => {
  const outbox = loadOutbox();
  const seen: number[] = [];
  const unsubscribe = outbox.subscribe(p => seen.push(p.length));
  await outbox.enqueue(payload('a'));
  await outbox.removePending('a');
  unsubscribe();
  await outbox.enqueue(payload('b'));
  expect(seen).toEqual([1, 0]);
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
