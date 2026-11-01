import React from 'react';
import { render, waitFor, act } from '@testing-library/react';
import { useOutboxAutoSync } from './useOutbox';
import { enqueue, listPending, RunPayload } from './outbox';

const mockApiFetch = jest.fn();
let mockAuth: { user: { token: string } | null; needsSignIn: boolean; apiFetch: typeof mockApiFetch };

jest.mock('../AuthContext', () => ({ useAuth: () => mockAuth }));

const payload: RunPayload = {
  id: '9b2f6c1e-3a4d-4e5f-8a7b-6c5d4e3f2a1b',
  ended_at: '2026-11-01T08:30:00.000Z',
  duration_seconds: 1800,
  distance_meters: 5000,
  waypoints: [],
  mid_run_notes: [],
  feel: 3, body_tags: [], weather_feel: [], music: null, note: null, gear: [],
};

function AutoSync() {
  useOutboxAutoSync();
  return null;
}

const created = () => Promise.resolve({ ok: true, status: 201, json: async () => ({ id: payload.id }) } as Response);

beforeEach(async () => {
  localStorage.clear();
  mockApiFetch.mockReset().mockImplementation(created);
  await enqueue(payload);
});

test('signing in (or back in) syncs the outbox', async () => {
  mockAuth = { user: null, needsSignIn: false, apiFetch: mockApiFetch };
  const { rerender } = render(<AutoSync />);
  expect(mockApiFetch).not.toHaveBeenCalled();

  mockAuth = { user: { token: 't1' }, needsSignIn: false, apiFetch: mockApiFetch };
  rerender(<AutoSync />);

  await waitFor(() => expect(mockApiFetch).toHaveBeenCalledWith('/api/runs', expect.objectContaining({ method: 'POST' })));
  await waitFor(async () => expect(await listPending()).toEqual([]));
});

test('waits while a sign-in is needed, then syncs once the new token lands', async () => {
  mockAuth = { user: { token: 'old' }, needsSignIn: true, apiFetch: mockApiFetch };
  const { rerender } = render(<AutoSync />);
  await new Promise(resolve => setTimeout(resolve, 20));
  expect(mockApiFetch).not.toHaveBeenCalled();

  mockAuth = { user: { token: 'new' }, needsSignIn: false, apiFetch: mockApiFetch };
  rerender(<AutoSync />);
  await waitFor(async () => expect(await listPending()).toEqual([]));
});

test('coming back to the foreground syncs', async () => {
  mockAuth = { user: { token: 't1' }, needsSignIn: false, apiFetch: mockApiFetch };
  mockApiFetch.mockImplementation(() => Promise.reject(new TypeError('Failed to fetch')));
  render(<AutoSync />);
  await waitFor(async () => expect((await listPending())[0].attempts).toBe(1));

  mockApiFetch.mockImplementation(created);
  act(() => { document.dispatchEvent(new Event('visibilitychange')); });
  await waitFor(async () => expect(await listPending()).toEqual([]));
});
