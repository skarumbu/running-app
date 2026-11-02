import React, { useState } from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { AuthProvider, useAuth } from './AuthContext';

// The plugin ships ESM only; the web path under test never calls it.
jest.mock('@southdevs/capacitor-google-auth', () => ({ GoogleAuth: {} }));

function jwt(claims: Record<string, unknown>): string {
  const b64 = (o: unknown) => btoa(JSON.stringify(o)).replace(/=+$/, '');
  return `${b64({ alg: 'none' })}.${b64(claims)}.sig`;
}

const inAnHour = () => Math.floor(Date.now() / 1000) + 3600;
const OLD = jwt({ sub: 'g1', email: 'r@x.com', name: 'Runner', exp: inAnHour() });
const FRESH = jwt({ sub: 'g1', email: 'r@x.com', name: 'Runner', exp: inAnHour() + 60 });

const json = (status: number, body: unknown = {}) =>
  Promise.resolve({ ok: status < 300, status, json: async () => body } as Response);

/** A stand-in for Google Identity Services. `oneTap` says whether a silent prompt yields a credential. */
function installGis(oneTap: boolean) {
  let callback: (r: { credential: string }) => void = () => {};
  (window as any).google = {
    accounts: {
      id: {
        initialize: jest.fn((cfg: any) => { callback = cfg.callback; }),
        renderButton: jest.fn(),
        prompt: jest.fn((listener?: (n: any) => void) => {
          if (oneTap) callback({ credential: FRESH });
          else listener?.({ isNotDisplayed: () => true, isSkippedMoment: () => false });
        }),
      },
    },
  };
}

function Probe() {
  const { user, needsSignIn, apiFetch } = useAuth();
  const [status, setStatus] = useState<number | null>(null);
  return (
    <div>
      <span data-testid="user">{user ? user.email : 'signed out'}</span>
      <span data-testid="needs">{needsSignIn ? 'needs sign-in' : 'ok'}</span>
      <span data-testid="status">{status ?? ''}</span>
      <button onClick={() => apiFetch('/api/runs', { method: 'POST', body: '{}' }).then(r => setStatus(r.status))}>
        save
      </button>
    </div>
  );
}

const fetchMock = jest.fn();

beforeEach(() => {
  sessionStorage.clear();
  sessionStorage.setItem('run_google_token', OLD);
  fetchMock.mockReset();
  (global as any).fetch = fetchMock;
});

afterEach(() => { delete (window as any).google; });

function authHeaderOf(call: unknown[]): string | undefined {
  return ((call[1] as RequestInit)?.headers as Record<string, string>)?.Authorization;
}

async function renderSignedIn() {
  render(<AuthProvider><Probe /></AuthProvider>);
  await waitFor(() => expect(screen.getByTestId('user')).toHaveTextContent('r@x.com'));
}

test('a 401 refreshes the token silently and retries the request once', async () => {
  installGis(true);
  fetchMock.mockImplementation((url: string, init?: RequestInit) => {
    if (url.endsWith('/api/users/me')) return json(200, { id: 'u1', email: 'r@x.com', displayName: 'Runner' });
    const auth = (init?.headers as Record<string, string>)?.Authorization;
    return auth === `Bearer ${FRESH}` ? json(201, { id: 'run-1' }) : json(401);
  });
  await renderSignedIn();

  fireEvent.click(screen.getByText('save'));

  await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('201'));
  const posts = fetchMock.mock.calls.filter(c => (c[0] as string).endsWith('/api/runs'));
  expect(posts.map(authHeaderOf)).toEqual([`Bearer ${OLD}`, `Bearer ${FRESH}`]);
  expect(sessionStorage.getItem('run_google_token')).toBe(FRESH);
  expect(screen.getByTestId('needs')).toHaveTextContent('ok');
});

test('when the refresh fails the user stays signed in and is flagged to sign in again', async () => {
  installGis(false);
  fetchMock.mockImplementation((url: string) =>
    url.endsWith('/api/users/me') ? json(200, { id: 'u1', email: 'r@x.com', displayName: 'Runner' }) : json(401));
  await renderSignedIn();

  fireEvent.click(screen.getByText('save'));

  await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('401'));
  expect(screen.getByTestId('needs')).toHaveTextContent('needs sign-in');
  expect(screen.getByTestId('user')).toHaveTextContent('r@x.com');
  // One attempt only: no retry without a new token.
  expect(fetchMock.mock.calls.filter(c => (c[0] as string).endsWith('/api/runs'))).toHaveLength(1);
});
