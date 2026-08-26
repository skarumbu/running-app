import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import HistoryTab from './HistoryTab';

const mockApiFetch = jest.fn();

jest.mock('../../AuthContext', () => ({
  useAuth: () => ({ apiFetch: mockApiFetch }),
}));

function jsonResponse(data: unknown) {
  return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(data) } as Response);
}

const sampleRun = {
  id: 'run-1',
  started_at: '2026-08-24T07:12:00Z',
  route_summary: 'Up and back through Eastlake',
  weather_json: { temp_f: 68, condition: 'Partly cloudy', icon: 'cloudy' },
  route_thumbnail: [{ lat: 47.65, lng: -122.32 }, { lat: 47.651, lng: -122.321 }],
  name: null,
};

beforeEach(() => {
  mockApiFetch.mockReset();
});

test('renders route summary and weather, not distance or time', async () => {
  mockApiFetch.mockReturnValueOnce(jsonResponse([sampleRun]));
  render(<HistoryTab />, { wrapper: MemoryRouter });

  await waitFor(() => expect(screen.getByText('Up and back through Eastlake')).toBeInTheDocument());
  const card = screen.getByText('Up and back through Eastlake').closest('button');
  expect(card).not.toBeNull();
  expect(card).toHaveTextContent(/68/);
  expect(card).not.toHaveTextContent(/km/);
});
