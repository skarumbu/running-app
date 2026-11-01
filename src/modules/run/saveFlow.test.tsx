// The save flow end to end through the real AuthProvider: an expired token
// on "How was it?" is refreshed and retried, and when it can't be, the run is
// kept on the phone and the user stays signed in.
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AuthProvider, useAuth } from '../../AuthContext';
import HowWasIt from './HowWasIt';
import RunsTab from '../runs/RunsTab';
import { emptyRunFeelValues } from '../../components/RunFeelForm';
import { listPending } from '../../lib/outbox';

jest.mock('@southdevs/capacitor-google-auth', () => ({ GoogleAuth: {} }));

function jwt(claims: Record<string, unknown>): string {
  const b64 = (o: unknown) => btoa(JSON.stringify(o)).replace(/=+$/, '');
  return `${b64({ alg: 'none' })}.${b64(claims)}.sig`;
}
const exp = () => Math.floor(Date.now() / 1000) + 3600;
const OLD = jwt({ sub: 'g1', email: 'r@x.com', name: 'Runner', exp: exp() });
const FRESH = jwt({ sub: 'g1', email: 'r@x.com', name: 'Runner', exp: exp() + 60 });
const CLIENT_ID = '3d6f0a5e-8c1b-4e7a-9f2d-1a2b3c4d5e6f';

const respond = (status: number, body: unknown = {}) =>
  Promise.resolve({ ok: status < 300, status, json: async () => body } as Response);

function installGis(oneTap: boolean) {
  let callback: (r: { credential: string }) => void = () => {};
  (window as any).google = {
    accounts: {
      id: {
        initialize: (cfg: any) => { callback = cfg.callback; },
        renderButton: () => {},
        prompt: (listener?: (n: any) => void) => {
          if (oneTap) callback({ credential: FRESH });
          else listener?.({ isNotDisplayed: () => true, isSkippedMoment: () => false });
        },
      },
    },
  };
}

function Who() {
  const { user, needsSignIn } = useAuth();
  return <span data-testid="who">{user ? user.email : 'signed out'}{needsSignIn ? ' (needs sign-in)' : ''}</span>;
}

const onSaved = jest.fn();
const fetchMock = jest.fn();

function renderApp(extra?: React.ReactNode) {
  render(
    <AuthProvider>
      <MemoryRouter>
        <Who />
        <HowWasIt
          clientId={CLIENT_ID}
          endedAt="2026-11-01T08:30:00.000Z"
          elapsedSeconds={4200}
          distanceMeters={12000}
          waypoints={[{ lat: 47.68, lng: -122.34, ts: 0 }]}
          midRunNotes={[]}
          initial={emptyRunFeelValues()}
          gearOptions={[]}
          weather={null}
          onStoredLocally={() => {}}
          onSaved={onSaved}
          onQueuedDone={() => {}}
          onDiscard={() => {}}
        />
        {extra}
      </MemoryRouter>
    </AuthProvider>
  );
}

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  sessionStorage.setItem('run_google_token', OLD);
  onSaved.mockReset();
  fetchMock.mockReset();
  (global as any).fetch = fetchMock;
});

afterEach(() => { delete (window as any).google; });

test('401 on save: the token is refreshed silently and the POST retried', async () => {
  installGis(true);
  fetchMock.mockImplementation((url: string, init?: RequestInit) => {
    if (url.endsWith('/api/users/me')) return respond(200, { id: 'u1', email: 'r@x.com', displayName: 'Runner' });
    const auth = (init?.headers as Record<string, string>)?.Authorization;
    return auth === `Bearer ${FRESH}` ? respond(201, { id: CLIENT_ID }) : respond(401);
  });
  renderApp();
  await waitFor(() => expect(screen.getByTestId('who')).toHaveTextContent('r@x.com'));

  fireEvent.click(screen.getByRole('button', { name: 'Save this run' }));

  await waitFor(() => expect(onSaved).toHaveBeenCalledWith(CLIENT_ID));
  const posts = fetchMock.mock.calls.filter(c => c[1]?.method === 'POST');
  expect(posts).toHaveLength(2);
  expect(JSON.parse(posts[0][1].body).id).toBe(JSON.parse(posts[1][1].body).id);
  expect(await listPending()).toEqual([]);
});

test('refresh fails: the run is queued, the user is not signed out, and Runs shows it pending', async () => {
  installGis(false);
  fetchMock.mockImplementation((url: string) =>
    url.endsWith('/api/users/me') ? respond(200, { id: 'u1', email: 'r@x.com', displayName: 'Runner' }) : respond(401));
  renderApp(<RunsTab />);
  await waitFor(() => expect(screen.getByTestId('who')).toHaveTextContent('r@x.com'));

  fireEvent.click(screen.getByRole('button', { name: 'Save this run' }));

  expect(await screen.findByText("Saved on this phone, will sync when you're signed in.")).toBeInTheDocument();
  expect(screen.getByTestId('who')).toHaveTextContent('r@x.com (needs sign-in)');
  expect(onSaved).not.toHaveBeenCalled();
  expect((await listPending()).map(p => p.clientId)).toEqual([CLIENT_ID]);
  const card = await screen.findByTestId('pending-run');
  expect(card).toHaveTextContent("will sync when you're signed in");
});
