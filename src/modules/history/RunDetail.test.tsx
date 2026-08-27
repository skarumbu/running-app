import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import RunDetail from './RunDetail';

const mockApiFetch = jest.fn();

jest.mock('../../AuthContext', () => ({
  useAuth: () => ({ apiFetch: mockApiFetch }),
}));

jest.mock('./RouteMap', () => () => <div data-testid="route-map" />);

function jsonResponse(data: unknown, ok = true) {
  return Promise.resolve({ ok, status: ok ? 200 : 500, json: () => Promise.resolve(data) } as Response);
}

const baseRun = {
  id: 'run-1',
  started_at: '2026-08-24T07:12:00Z',
  ended_at: '2026-08-24T07:41:00Z',
  distance_meters: 4820,
  duration_seconds: 1721,
  avg_pace_seconds_per_km: 357,
  waypoints: [{ lat: 47.65, lng: -122.32, ts: 0 }, { lat: 47.651, lng: -122.321, ts: 1 }],
  badges_earned: [],
  route_summary: 'Up and back through Eastlake',
  weather_json: { temp_f: 68, condition: 'Partly cloudy', icon: 'cloudy' as const },
  note: null as string | null,
};

function renderDetail() {
  return render(
    <MemoryRouter initialEntries={['/history/run-1']}>
      <Routes>
        <Route path="/history/:id" element={<RunDetail />} />
      </Routes>
    </MemoryRouter>
  );
}

beforeEach(() => {
  mockApiFetch.mockReset();
});

test('"By the Numbers" starts collapsed and expands on click', async () => {
  mockApiFetch.mockReturnValueOnce(jsonResponse(baseRun));
  renderDetail();

  await waitFor(() => expect(screen.getByText('Up and back through Eastlake')).toBeInTheDocument());
  expect(screen.queryByText('4.82 km')).not.toBeInTheDocument();

  fireEvent.click(screen.getByText('By the Numbers'));
  expect(screen.getByText('4.82 km')).toBeInTheDocument();
});

test('shows a prompt to add a note when there is none, and saves a new note', async () => {
  mockApiFetch
    .mockReturnValueOnce(jsonResponse(baseRun))
    .mockReturnValueOnce(jsonResponse({ ...baseRun, note: 'Felt great!' }));
  renderDetail();

  await waitFor(() => expect(screen.getByText(/Tap to add a note/i)).toBeInTheDocument());
  fireEvent.click(screen.getByText(/Tap to add a note/i));

  const textarea = screen.getByRole('textbox');
  fireEvent.change(textarea, { target: { value: 'Felt great!' } });
  fireEvent.click(screen.getByText('Save'));

  await waitFor(() => expect(screen.getByText('Felt great!')).toBeInTheDocument());
  expect(mockApiFetch).toHaveBeenLastCalledWith('/api/runs/run-1', expect.objectContaining({
    method: 'PATCH',
    body: JSON.stringify({ note: 'Felt great!' }),
  }));
});
