import React from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import RunsTab from './RunsTab';

const mockApiFetch = jest.fn();

jest.mock('../../AuthContext', () => ({
  useAuth: () => ({ apiFetch: mockApiFetch }),
}));

function jsonResponse(data: unknown) {
  return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(data) } as Response);
}

const feltRun = {
  id: 'run-2',
  started_at: '2026-10-25T14:10:00Z',
  route_summary: 'Loop around Green Lake',
  weather_json: { temp_f: 52, condition: 'Overcast', icon: 'cloudy' },
  distance_meters: 8400,
  duration_seconds: 2652,
  feel: 5,
  body_tags: ['fresh_legs'],
  weather_feel: ['just_right', 'windy'],
  music: { kind: 'album', title: 'Currents', by: 'Tame Impala', helped: 'pushed' },
  gear: [
    { gear_id: 'g1', name: 'Pegasus 41', kind: 'shoe', color: 'a1', retired: false, comfort: 3, note: null },
    { gear_id: 'g2', name: 'Shokz OpenRun', kind: 'headphones', color: 'a5', retired: false, comfort: 3, note: null },
    { gear_id: 'g3', name: 'Running cap', kind: 'hat', color: 'a2', retired: false, comfort: 2, note: null },
  ],
};

// Saved before the run-feel change: no feel fields at all.
const oldRun = {
  id: 'run-1',
  started_at: '2026-08-24T07:12:00Z',
  route_summary: 'Up and back through Eastlake',
  weather_json: { temp_f: 68, condition: 'Partly cloudy', icon: 'cloudy' },
  distance_meters: 4820,
  duration_seconds: 1721,
};

beforeEach(() => mockApiFetch.mockReset());

test('a felt run shows its feel band, weather feel, music and up to two gear tags, but no distance', async () => {
  mockApiFetch.mockReturnValueOnce(jsonResponse([feltRun]));
  render(<RunsTab />, { wrapper: MemoryRouter });

  const title = await screen.findByText('Loop around Green Lake');
  const card = title.closest('button')!;
  expect(within(card).getByTestId('feel-band')).toHaveAttribute('data-feel', 'Flying');
  expect(within(card).getByTestId('feel-band')).toHaveStyle({ background: 'var(--a1)' });
  expect(card).toHaveTextContent('Flying');
  expect(card).toHaveTextContent('52° · Just right');
  expect(within(card).getByText('Currents')).toBeInTheDocument();
  expect(within(card).getByText('Pegasus 41')).toBeInTheDocument();
  expect(within(card).getByText('Shokz OpenRun')).toBeInTheDocument();
  expect(within(card).queryByText('Running cap')).not.toBeInTheDocument();
  expect(card).not.toHaveTextContent(/km|8\.4/);
});

test('a run saved before feel existed renders with a neutral band', async () => {
  mockApiFetch.mockReturnValueOnce(jsonResponse([feltRun, oldRun]));
  render(<RunsTab />, { wrapper: MemoryRouter });

  const card = (await screen.findByText('Up and back through Eastlake')).closest('button')!;
  const band = within(card).getByTestId('feel-band');
  expect(band).toHaveAttribute('data-feel', 'none');
  expect(band).toHaveStyle({ background: 'var(--line)' });
  expect(card).toHaveTextContent('68°');
  expect(card).not.toHaveTextContent(/Rough|Meh|Steady|Good|Flying/);
});

test('shows an empty state when there are no runs', async () => {
  mockApiFetch.mockReturnValueOnce(jsonResponse([]));
  render(<RunsTab />, { wrapper: MemoryRouter });
  await waitFor(() => expect(screen.getByText(/No runs yet/)).toBeInTheDocument());
});

describe('runs waiting on this phone', () => {
  const queued = {
    id: '6ec0bd7f-11c0-43da-975e-2a8ad9ebae0b',
    ended_at: '2026-11-01T08:30:00.000Z',
    duration_seconds: 1800,
    distance_meters: 5000,
    waypoints: [],
    mid_run_notes: [],
    feel: 2 as const, body_tags: [], weather_feel: [], music: null, note: null, gear: [],
  };

  beforeEach(() => { localStorage.clear(); mockApiFetch.mockReset(); });
  afterEach(() => localStorage.clear());

  test('show as a pending card, even when the list can\'t load, and Sync now uploads them', async () => {
    const { enqueue, listPending } = require('../../lib/outbox');
    await enqueue(queued);
    let online = false;
    mockApiFetch.mockImplementation((url: string, init?: RequestInit) => {
      if (!online) return Promise.reject(new TypeError('Failed to fetch'));
      if (init?.method === 'POST') {
        return Promise.resolve({ ok: true, status: 201, json: () => Promise.resolve({ id: queued.id }) } as Response);
      }
      return jsonResponse([{ ...feltRun, id: queued.id, route_summary: 'Synced loop' }]);
    });

    render(<MemoryRouter><RunsTab /></MemoryRouter>);

    const card = await screen.findByTestId('pending-run');
    expect(card).toHaveTextContent('Waiting to sync');
    expect(card).toHaveTextContent('Saved on this phone');
    expect(screen.getByText(/Couldn't load your runs/)).toBeInTheDocument();

    online = true;
    screen.getByRole('button', { name: 'Sync now' }).click();

    await waitFor(() => expect(screen.queryByTestId('pending-run')).not.toBeInTheDocument());
    expect(await screen.findByText('Synced loop')).toBeInTheDocument();
    const post = mockApiFetch.mock.calls.find(c => c[1]?.method === 'POST');
    expect(JSON.parse(post[1].body).id).toBe(queued.id);
    expect(await listPending()).toEqual([]);
  });
});
