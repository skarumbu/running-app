import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import RunTab from './RunTab';
import { RunCheckpoint, loadCheckpoint, saveCheckpoint } from '../../lib/runCheckpoint';
import { listPending } from '../../lib/outbox';

const mockApiFetch = jest.fn();
const mockNavigate = jest.fn();

jest.mock('../../AuthContext', () => ({
  useAuth: () => ({
    apiFetch: mockApiFetch,
    ensureFreshToken: async () => true,
    user: { googleId: 'g-me', email: 'me@x.com', token: 't' },
  }),
}));
jest.mock('../../lib/useGearList', () => ({ useGearList: () => ({ gear: [] }) }));
jest.mock('./useCurrentWeather', () => ({ useCurrentWeather: () => null }));
jest.mock('../../lib/runNotification', () => ({
  showRunTrackingNotification: jest.fn(),
  clearRunTrackingNotification: jest.fn(),
}));
jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useNavigate: () => mockNavigate,
}));

const CLIENT_ID = 'c0ffee00-1234-4abc-8def-0123456789ab';
const MIN = 60 * 1000;
const watchPosition = jest.fn(() => 7);

function checkpoint(overrides: Partial<Omit<RunCheckpoint, 'savedAt'>>): Omit<RunCheckpoint, 'savedAt'> {
  return {
    clientId: CLIENT_ID,
    owner: { id: 'g-me', email: 'me@x.com' },
    phase: 'paused',
    timer: { accumulatedMs: 10 * MIN, segmentStartedAt: null },
    waypoints: [{ lat: 47.68, lng: -122.34, ts: 1 }, { lat: 47.681, lng: -122.34, ts: 2 }],
    distanceMeters: 1600,
    pickedGear: [],
    music: { kind: 'podcast', title: 'Hard Fork', by: '', helped: null },
    midRunNotes: [{ kind: 'hurting', elapsed_s: 300 }],
    endedAt: null,
    ...overrides,
  };
}

function renderTab() {
  render(<MemoryRouter><RunTab /></MemoryRouter>);
}

beforeEach(() => {
  localStorage.clear();
  mockApiFetch.mockReset();
  mockNavigate.mockReset();
  watchPosition.mockClear();
  Object.defineProperty(navigator, 'geolocation', {
    value: { watchPosition, clearWatch: jest.fn() },
    configurable: true,
  });
});

test('a run left behind can be finished and saved with its own id, then the checkpoint is gone', async () => {
  await saveCheckpoint(checkpoint({}));
  mockApiFetch.mockResolvedValue({ ok: true, status: 201, json: () => Promise.resolve({ id: CLIENT_ID }) });
  renderTab();

  expect(await screen.findByText('Your run is still here')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Finish and save it' }));

  expect(await screen.findByText('How was it?')).toBeInTheDocument();
  expect(screen.getByText(/10 min out there/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Save this run' }));

  await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith(`/runs/${CLIENT_ID}`));
  const body = JSON.parse(mockApiFetch.mock.calls[0][1].body);
  expect(body).toMatchObject({
    id: CLIENT_ID,
    duration_seconds: 600,
    distance_meters: 1600,
    mid_run_notes: [{ kind: 'hurting', elapsed_s: 300 }],
    music: { kind: 'podcast', title: 'Hard Fork', by: null, helped: null },
  });
  expect(body.waypoints).toHaveLength(2);
  await waitFor(async () => expect(await loadCheckpoint()).toBeNull());
});

test('finishing a run that was still going ends it at the last checkpoint, not now', async () => {
  const segmentStartedAt = Date.now() - 60 * MIN; // the app died ~an hour ago...
  localStorage.setItem('run.checkpoint.v1', JSON.stringify({
    ...checkpoint({ phase: 'running', timer: { accumulatedMs: 5 * MIN, segmentStartedAt } }),
    savedAt: segmentStartedAt + 20 * MIN, // ...20 min into that segment
  }));
  mockApiFetch.mockResolvedValue({ ok: true, status: 201, json: () => Promise.resolve({ id: CLIENT_ID }) });
  renderTab();

  fireEvent.click(await screen.findByRole('button', { name: 'Finish and save it' }));
  fireEvent.click(await screen.findByRole('button', { name: 'Save this run' }));

  await waitFor(() => expect(mockApiFetch).toHaveBeenCalled());
  const body = JSON.parse(mockApiFetch.mock.calls[0][1].body);
  expect(body.duration_seconds).toBe(25 * 60);
  expect(Date.parse(body.ended_at)).toBe(segmentStartedAt + 20 * MIN);
});

test('resume picks the run back up, tracking again, with time while the app was gone counted', async () => {
  const segmentStartedAt = Date.now() - 2 * MIN;
  await saveCheckpoint(checkpoint({ phase: 'running', timer: { accumulatedMs: 10 * MIN, segmentStartedAt } }));
  renderTab();

  fireEvent.click(await screen.findByRole('button', { name: 'Resume your run' }));

  expect(await screen.findByRole('button', { name: 'Pause' })).toBeInTheDocument();
  expect(watchPosition).toHaveBeenCalledTimes(1);
  expect(screen.getByText(/^12:0\d$/)).toBeInTheDocument();
  expect(screen.getByText('1.60 km')).toBeInTheDocument();
  expect(screen.getByText('Hurting.')).toBeInTheDocument();
});

test('the active run is checkpointed on start and on each note, and cleared on discard', async () => {
  renderTab();
  fireEvent.click(await screen.findByRole('button', { name: /start/i }));
  await waitFor(async () => expect((await loadCheckpoint())?.phase).toBe('running'));
  const started = await loadCheckpoint();
  expect(started!.clientId).toMatch(/^[0-9a-f-]{36}$/);
  expect(started!.owner).toEqual({ id: 'g-me', email: 'me@x.com' });

  fireEvent.click(screen.getByRole('button', { name: 'Great song' }));
  await waitFor(async () => expect((await loadCheckpoint())?.midRunNotes).toHaveLength(1));

  fireEvent.click(screen.getByRole('button', { name: 'Pause' }));
  await waitFor(async () => expect((await loadCheckpoint())?.phase).toBe('paused'));
  expect((await loadCheckpoint())!.timer.segmentStartedAt).toBeNull();

  fireEvent.click(screen.getByRole('button', { name: 'Finish' }));
  await waitFor(async () => expect((await loadCheckpoint())?.phase).toBe('saving'));
  expect((await loadCheckpoint())!.endedAt).not.toBeNull();

  fireEvent.click(screen.getByRole('button', { name: 'Discard this run' }));
  await waitFor(async () => expect(await loadCheckpoint()).toBeNull());
});

test('a restored run keeps the account that started it, even with someone else signed in', async () => {
  await saveCheckpoint(checkpoint({ owner: { id: 'g-them', email: 'them@x.com' } }));
  renderTab();

  fireEvent.click(await screen.findByRole('button', { name: 'Finish and save it' }));
  fireEvent.click(await screen.findByRole('button', { name: 'Save this run' }));

  expect(await screen.findByText('Saved on this phone, will sync when them@x.com signs in.')).toBeInTheDocument();
  expect(mockApiFetch).not.toHaveBeenCalled();
  expect((await listPending()).map(p => [p.clientId, p.owner])).toEqual([[CLIENT_ID, { id: 'g-them', email: 'them@x.com' }]]);
});
