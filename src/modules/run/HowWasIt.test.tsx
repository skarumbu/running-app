import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import HowWasIt from './HowWasIt';
import { emptyRunFeelValues } from '../../components/RunFeelForm';
import { listPending } from '../../lib/outbox';

const mockApiFetch = jest.fn();
const mockEnsureFreshToken = jest.fn();

jest.mock('../../AuthContext', () => ({
  useAuth: () => ({
    apiFetch: mockApiFetch,
    ensureFreshToken: mockEnsureFreshToken,
    user: { googleId: 'g-me', email: 'me@x.com' },
  }),
}));

const ME = { id: 'g-me', email: 'me@x.com' };

const CLIENT_ID = '0f8fad5b-d9cb-469f-a165-70867728950e';
const ENDED_AT = '2026-11-01T08:30:00.000Z';

const shoe = { id: 'g-shoe', name: 'Pegasus 41', kind: 'shoe' as const, color: 'a1' as const, retired: false };
const tee = { id: 'g-tee', name: 'Blue tee', kind: 'top' as const, color: 'a3' as const, retired: false };
const waypoints = [{ lat: 47.68, lng: -122.34, ts: 0 }, { lat: 47.681, lng: -122.34, ts: 1000 }];

const callbacks = { onStoredLocally: jest.fn(), onQueuedDone: jest.fn() };

function renderForm(onSaved = jest.fn(), owner: { id: string; email: string } | null = ME) {
  render(
    <MemoryRouter>
      <HowWasIt
        clientId={CLIENT_ID}
        owner={owner}
        endedAt={ENDED_AT}
        onStoredLocally={callbacks.onStoredLocally}
        onQueuedDone={callbacks.onQueuedDone}
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

beforeEach(() => {
  localStorage.clear();
  mockApiFetch.mockReset();
  mockEnsureFreshToken.mockReset().mockResolvedValue(true);
  callbacks.onStoredLocally.mockReset();
  callbacks.onQueuedDone.mockReset();
});

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
    id: CLIENT_ID,
    ended_at: ENDED_AT,
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
  // Still kept on the phone, so walking away doesn't lose it.
  expect((await listPending()).map(p => p.clientId)).toEqual([CLIENT_ID]);
});

test('a successful save leaves nothing in the outbox', async () => {
  mockApiFetch.mockResolvedValueOnce({ ok: true, status: 201, json: () => Promise.resolve({ id: CLIENT_ID }) });
  const onSaved = jest.fn();
  renderForm(onSaved);
  fireEvent.click(screen.getByRole('button', { name: 'Save this run' }));
  await waitFor(() => expect(onSaved).toHaveBeenCalledWith(CLIENT_ID));
  expect(callbacks.onStoredLocally).toHaveBeenCalled();
  expect(await listPending()).toEqual([]);
});

test('an expired sign-in queues the run on the phone instead of losing it', async () => {
  mockApiFetch.mockResolvedValueOnce({ ok: false, status: 401, json: () => Promise.resolve({}) });
  const onSaved = jest.fn();
  renderForm(onSaved);
  fireEvent.click(screen.getByRole('button', { name: 'Save this run' }));

  expect(await screen.findByRole('status')).toHaveTextContent("Saved on this phone, will sync when you're signed in.");
  expect(onSaved).not.toHaveBeenCalled();
  expect(callbacks.onStoredLocally).toHaveBeenCalled();
  const [queued] = await listPending();
  expect(queued).toMatchObject({ clientId: CLIENT_ID, attempts: 1 });
  expect(queued.payload.feel).toBeNull();

  fireEvent.click(screen.getByRole('button', { name: 'Done' }));
  expect(callbacks.onQueuedDone).toHaveBeenCalled();
});

test('no signal: queued, with the connection message', async () => {
  mockApiFetch.mockRejectedValueOnce(new TypeError('Failed to fetch'));
  renderForm();
  fireEvent.click(screen.getByRole('button', { name: 'Save this run' }));
  expect(await screen.findByRole('status')).toHaveTextContent('will sync when the connection is back');
  expect(await listPending()).toHaveLength(1);
});

test('when the token cannot be refreshed it queues without trying the upload', async () => {
  mockEnsureFreshToken.mockResolvedValue(false);
  renderForm();
  fireEvent.click(screen.getByRole('button', { name: 'Save this run' }));
  expect(await screen.findByRole('status')).toHaveTextContent("will sync when you're signed in");
  expect(mockApiFetch).not.toHaveBeenCalled();
  expect((await listPending())[0].attempts).toBe(0);
});

test('a resumed run started by another account is kept for them, not uploaded as me', async () => {
  renderForm(jest.fn(), { id: 'g-them', email: 'them@x.com' });
  fireEvent.click(screen.getByRole('button', { name: 'Save this run' }));

  expect(await screen.findByText('Saved on this phone, will sync when them@x.com signs in.')).toBeInTheDocument();
  expect(mockApiFetch).not.toHaveBeenCalled();
  const [item] = await listPending();
  expect(item).toMatchObject({ clientId: CLIENT_ID, owner: { id: 'g-them', email: 'them@x.com' }, attempts: 0, lastError: null });
});
