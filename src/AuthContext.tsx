import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import { Capacitor } from '@capacitor/core';
import { GoogleAuth } from '@southdevs/capacitor-google-auth';
import { withTimeout } from './lib/withTimeout';
import { trackException, trackEvent } from './lib/telemetry';

export interface User {
  id: string;
  /**
   * The Google account's `sub`: the stable id of who is signed in. Read from
   * the token itself, so it's the same online or offline (unlike `id`, which
   * falls back to the sub when /api/users/me can't be reached).
   */
  googleId: string;
  email: string;
  displayName: string;
  token: string;
}

interface AuthContextValue {
  user: User | null;
  loading: boolean;
  /**
   * Signed in, but the Google token expired and couldn't be refreshed
   * silently. The app keeps working (runs queue on the phone) and shows a
   * non-blocking "Sign in to sync". Nothing here ever signs the user out.
   */
  needsSignIn: boolean;
  signOut: () => void;
  googleBtnRef: React.RefObject<HTMLDivElement | null>;
  signInNative: () => void;
  nativeSignInError: string | null;
  /** fetch() against the API with the token; on a 401 it refreshes silently and retries once. */
  apiFetch: (url: string, options?: RequestInit) => Promise<Response>;
  /** Refreshes the token first if it's expired or about to be. Resolves false if that failed. */
  ensureFreshToken: () => Promise<boolean>;
}

function decodeJwtPayload(token: string): Record<string, unknown> {
  const base64 = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
  return JSON.parse(atob(base64));
}

function isTokenExpired(token: string, marginMs = 0): boolean {
  try {
    const payload = decodeJwtPayload(token);
    return (payload['exp'] as number) * 1000 < Date.now() + marginMs;
  } catch {
    return true;
  }
}

const TOKEN_KEY = 'run_google_token';
// Set after a native sign-in so a relaunch can restore it silently; cleared on sign-out.
const NATIVE_SIGNED_IN_KEY = 'run_native_signed_in';
// Refresh a little ahead of expiry so a save doesn't race the clock.
const EXPIRY_MARGIN_MS = 2 * 60 * 1000;
const REFRESH_TIMEOUT_MS = 15000;

function loadGis(): Promise<any> {
  const g = (window as any).google;
  if (g?.accounts?.id) return Promise.resolve(g);
  return new Promise((resolve, reject) => {
    let script = document.querySelector('script[src*="accounts.google.com/gsi/client"]') as HTMLScriptElement | null;
    if (!script) {
      script = document.createElement('script');
      script.src = 'https://accounts.google.com/gsi/client';
      script.async = true; script.defer = true;
      document.head.appendChild(script);
    }
    script.addEventListener('load', () => resolve((window as any).google));
    script.addEventListener('error', () => reject(new Error('Google sign-in script failed to load')));
  });
}

const AuthContext = createContext<AuthContextValue>({
  user: null,
  loading: true,
  needsSignIn: false,
  signOut: () => {},
  googleBtnRef: { current: null } as React.RefObject<HTMLDivElement | null>,
  signInNative: () => {},
  nativeSignInError: null,
  apiFetch: (url, options) => fetch(url, options),
  ensureFreshToken: async () => true,
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [nativeSignInError, setNativeSignInError] = useState<string | null>(null);
  const [needsSignIn, setNeedsSignIn] = useState(false);
  const googleBtnRef = useRef<HTMLDivElement | null>(null);
  // A web silent refresh waits here for GIS to hand a credential to the callback.
  const pendingGisRef = useRef<((token: string) => void) | null>(null);
  const refreshRef = useRef<Promise<string | null> | null>(null);

  const handleCredentialResponse = useCallback(async (response: { credential: string }) => {
    const token = response.credential;
    sessionStorage.setItem(TOKEN_KEY, token);
    setNeedsSignIn(false);
    if (pendingGisRef.current) {
      pendingGisRef.current(token);
      pendingGisRef.current = null;
    }
    const payload = decodeJwtPayload(token);
    // Register/fetch user from API
    try {
      const res = await fetch(`${process.env.REACT_APP_API_URL || ''}/api/users/me`, {
        headers: { 'Authorization': `Bearer ${token}` },
      });
      const data = res.ok ? await res.json() : null;
      setUser({
        id: data?.id ?? (payload['sub'] as string),
        googleId: payload['sub'] as string,
        email: data?.email ?? (payload['email'] as string),
        displayName: data?.displayName ?? (payload['name'] as string) ?? (payload['email'] as string),
        token,
      });
    } catch {
      setUser({
        id: payload['sub'] as string,
        googleId: payload['sub'] as string,
        email: payload['email'] as string,
        displayName: (payload['name'] as string) ?? (payload['email'] as string),
        token,
      });
    }
    setLoading(false);
  }, []);

  const isNative = Capacitor.isNativePlatform();

  /**
   * A fresh Google ID token without user interaction, or null.
   * Native: the plugin's refresh(), which renews through the Google Sign-In
   * SDK. After a relaunch the SDK has no current user, so fall back to
   * signIn(), which restores the previous sign-in silently (only tried if
   * this device has signed in natively before, so it can't pop a sheet on a
   * first launch). Web: GIS One Tap with auto_select, which hands back a
   * credential without a click for a returning user; it can't when the user
   * has to pick an account. Concurrent callers share one attempt.
   */
  const silentRefresh = useCallback((): Promise<string | null> => {
    if (refreshRef.current) return refreshRef.current;
    const attempt = (async (): Promise<string | null> => {
      if (isNative) {
        try {
          const auth = await withTimeout(GoogleAuth.refresh(), REFRESH_TIMEOUT_MS, 'refresh timed out');
          if (auth.idToken) return auth.idToken;
        } catch {
          // fall through to the silent restore below
        }
        if (!localStorage.getItem(NATIVE_SIGNED_IN_KEY)) return null;
        const result = await withTimeout(
          GoogleAuth.signIn({ scopes: ['profile', 'email'], serverClientId: process.env.REACT_APP_GOOGLE_CLIENT_ID }),
          REFRESH_TIMEOUT_MS,
          'silent sign-in timed out',
        );
        return result.authentication.idToken || null;
      }
      const g = await loadGis();
      return withTimeout(new Promise<string>((resolve, reject) => {
        pendingGisRef.current = resolve;
        g.accounts.id.initialize({
          client_id: process.env.REACT_APP_GOOGLE_CLIENT_ID,
          callback: handleCredentialResponse,
          auto_select: true,
        });
        g.accounts.id.prompt((n: any) => {
          if (n?.isNotDisplayed?.() || n?.isSkippedMoment?.()) reject(new Error('One Tap was not shown'));
        });
      }), REFRESH_TIMEOUT_MS, 'web refresh timed out');
    })()
      .then(token => {
        // On the web the GIS callback has already adopted the token.
        if (token && isNative) handleCredentialResponse({ credential: token });
        return token;
      })
      .catch((e: any) => {
        trackEvent('token_refresh_failed', { message: String(e?.message ?? e) });
        return null;
      })
      .finally(() => {
        pendingGisRef.current = null;
        refreshRef.current = null;
      });
    refreshRef.current = attempt;
    return attempt;
  }, [isNative, handleCredentialResponse]);

  // Restore session on load. After a native relaunch an expired token is
  // renewed silently instead of dropping the user at the sign-in screen.
  useEffect(() => {
    const stored = sessionStorage.getItem(TOKEN_KEY);
    if (stored && !isTokenExpired(stored)) {
      handleCredentialResponse({ credential: stored });
      return;
    }
    sessionStorage.removeItem(TOKEN_KEY);
    if (isNative && localStorage.getItem(NATIVE_SIGNED_IN_KEY)) {
      silentRefresh().then(token => { if (!token) setLoading(false); });
    } else {
      setLoading(false);
    }
  }, []); // eslint-disable-line

  const initGoogleSignIn = useCallback(() => {
    const g = (window as any).google;
    if (!g?.accounts) return;
    g.accounts.id.initialize({
      client_id: process.env.REACT_APP_GOOGLE_CLIENT_ID,
      callback: handleCredentialResponse,
    });
    if (googleBtnRef.current) {
      g.accounts.id.renderButton(googleBtnRef.current, {
        theme: 'outline', size: 'large', text: 'signin_with', width: 280,
      });
    }
  }, [handleCredentialResponse]);

  // Web: the GIS button shows on the sign-in screen, and in the "Sign in to
  // sync" banner when a token couldn't be refreshed.
  const showWebButton = !isNative && !loading && (!user || needsSignIn);

  // Web (PWA): load the Google Identity Services script and render its button.
  // Native (Capacitor iOS wrapper): GIS's web button doesn't work from a
  // capacitor://localhost origin, so we use the native Google Sign-In SDK
  // instead — see signInNative below.
  useEffect(() => {
    if (!showWebButton) return;
    loadGis().then(initGoogleSignIn).catch(() => {});
  }, [showWebButton, initGoogleSignIn]);

  // Re-render button when ref becomes available (web only)
  useEffect(() => {
    if (showWebButton) initGoogleSignIn();
  }, [showWebButton, googleBtnRef.current, initGoogleSignIn]); // eslint-disable-line

  useEffect(() => {
    if (!isNative) return;
    GoogleAuth.initialize().catch((e: any) => {
      const message = `Google Sign-In failed to initialize: ${e?.message ?? e}`;
      setNativeSignInError(message);
      trackException(e instanceof Error ? e : new Error(message), { stage: 'initialize' });
    });
  }, [isNative]);

  const signInNative = useCallback(() => {
    setNativeSignInError(null);
    withTimeout(
      GoogleAuth.signIn({
        scopes: ['profile', 'email'],
        // The plugin's native iOS code (Plugin.swift) requires serverClientId
        // to be present — if it's missing, it silently `return`s without ever
        // resolving or rejecting the call, hanging the JS promise forever with
        // no error at all. Reusing the web OAuth client ID here satisfies that
        // guard; the backend doesn't restrict by audience, so any valid client
        // ID works.
        serverClientId: process.env.REACT_APP_GOOGLE_CLIENT_ID,
      }),
      15000,
      'Native sign-in timed out after 15s — the native call never responded'
    )
      .then((result) => {
        trackEvent('native_sign_in_success');
        localStorage.setItem(NATIVE_SIGNED_IN_KEY, '1');
        handleCredentialResponse({ credential: result.authentication.idToken });
      })
      .catch((e: any) => {
        const message = `Sign-in failed: ${e?.message ?? e}`;
        setNativeSignInError(message);
        trackException(e instanceof Error ? e : new Error(message), { stage: 'signIn' });
      });
  }, [handleCredentialResponse]);

  const apiFetch = useCallback(async (url: string, options: RequestInit = {}) => {
    const base = process.env.REACT_APP_API_URL || '';
    const send = (token: string | null) => fetch(`${base}${url}`, {
      ...options,
      headers: {
        ...(options.headers || {}),
        ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
      },
    });
    const res = await send(sessionStorage.getItem(TOKEN_KEY));
    if (res.status !== 401) return res;
    // Google ID tokens last about an hour: refresh and retry once. If that
    // fails, flag it for the UI. Never sign out from here.
    const fresh = await silentRefresh();
    if (!fresh) {
      setNeedsSignIn(true);
      return res;
    }
    const retried = await send(fresh);
    if (retried.status === 401) setNeedsSignIn(true);
    return retried;
  }, [silentRefresh]);

  const ensureFreshToken = useCallback(async () => {
    const token = sessionStorage.getItem(TOKEN_KEY);
    if (token && !isTokenExpired(token, EXPIRY_MARGIN_MS)) return true;
    if (await silentRefresh()) return true;
    setNeedsSignIn(true);
    return false;
  }, [silentRefresh]);

  const signOut = useCallback(() => {
    sessionStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(NATIVE_SIGNED_IN_KEY);
    setNeedsSignIn(false);
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{
      user, loading, needsSignIn, signOut, googleBtnRef, signInNative, nativeSignInError, apiFetch, ensureFreshToken,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
