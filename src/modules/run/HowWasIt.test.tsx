import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import HowWasIt from './HowWasIt';
import { emptyRunFeelValues } from '../../components/RunFeelForm';

const mockApiFetch = jest.fn();

jest.mock('../../AuthContext', () => ({
  useAuth: () => ({ apiFetch: mockApiFetch }),
}));

const shoe = { id: 'g-shoe', name: 'Pegasus 41', kind: 'shoe' as const, color: 'a1' as const, retired: false };
const tee = { id: 'g-tee', name: 'Blue tee', kind: 'top' as const, color: 'a3' as const, retired: false };
const waypoints = [{ lat: 47.68, lng: -122.34, ts: 0 }, { lat: 47.681, lng: -122.34, ts: 1000 }];

function renderForm(onSaved = jest.fn()) {
  render(
    <MemoryRouter>
      <HowWasIt
        elapsedSeconds={1930}
        distanceMeters={5120}
        waypoints={waypoints}
        midRunNotes={[{ kind: 'great_song', elapsed_s: 600 }]}
        initial={{
          ...emptyRunFeelValues(),
          gear: [{ gear_id: 'g-shoe', comfort: null, note: '' }],
          music: { kind: 'album', title: 'Currents', by: '', helped: null },
        }}
        gearOptions={[shoe, tee]}
        weather={null}
        onSaved={onSaved}
        onDiscard={jest.fn()}
      />
    </MemoryRouter>
  );
  return onSaved;
}

beforeEach(() => mockApiFetch.mockReset());

test('builds one POST with the run, the feel, gear comfort, weather feel, music and note', async () => {
  mockApiFetch.mockResolvedValueOnce({ ok: true, status: 201, json: () => Promise.resolve({ id: 'run-9' }) });
  const onSaved = renderForm();

  expect(screen.getByText('Weather is added when you save.')).toBeInTheDocument();

  fireEvent.click(screen.getByRole('button', { name: /Good/ }));
  fireEvent.click(screen.getByRole('button', { name: 'Fresh legs' }));
  fireEvent.click(screen.getByRole('button', { name: 'In the zone' }));
  fireEvent.click(screen.getByRole('button', { name: 'Felt great' }));
  fireEvent.change(screen.getByLabelText('Note about Pegasus 41'), { target: { value: ' Grippy in the wet ' } });
  fireEvent.click(screen.getByRole('button', { name: /Blue tee/ }));
  fireEvent.click(screen.getAllByRole('button', { name: 'Bothered me' })[1]);
  fireEvent.click(screen.getByRole('button', { name: 'Chilly start' }));
  fireEvent.change(screen.getByLabelText('Artist or by'), { target: { value: 'Tame Impala' } });
  fireEvent.click(screen.getByRole('button', { name: 'Pushed me' }));
  fireEvent.change(screen.getByRole('textbox', { name: 'Anything else?' }), { target: { value: 'Negative split.' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save this run' }));

  await waitFor(() => expect(onSaved).toHaveBeenCalledWith('run-9'));
  expect(mockApiFetch).toHaveBeenCalledTimes(1);
  const [url, options] = mockApiFetch.mock.calls[0];
  expect(url).toBe('/api/runs');
  expect(options.method).toBe('POST');
  expect(JSON.parse(options.body)).toEqual({
    duration_seconds: 1930,
    distance_meters: 5120,
    waypoints,
    mid_run_notes: [{ kind: 'great_song', elapsed_s: 600 }],
    feel: 4,
    body_tags: ['fresh_legs', 'in_the_zone'],
    weather_feel: ['chilly_start'],
    music: { kind: 'album', title: 'Currents', by: 'Tame Impala', helped: 'pushed' },
    note: 'Negative split.',
    gear: [
      { gear_id: 'g-shoe', comfort: 3, note: 'Grippy in the wet' },
      { gear_id: 'g-tee', comfort: 1, note: null },
    ],
  });
});

test('shows the server error and stays on the form when saving fails', async () => {
  mockApiFetch.mockResolvedValueOnce({
    ok: false, status: 400, json: () => Promise.resolve({ error: "gear includes an item that isn't yours" }),
  });
  const onSaved = renderForm();
  fireEvent.click(screen.getByRole('button', { name: 'Save this run' }));
  expect(await screen.findByRole('alert')).toHaveTextContent("Save failed: gear includes an item that isn't yours");
  expect(onSaved).not.toHaveBeenCalled();
  expect(screen.getByRole('button', { name: 'Save this run' })).toBeEnabled();
});
