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
