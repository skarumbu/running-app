import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import { Capacitor } from '@capacitor/core';
import { GoogleAuth } from '@southdevs/capacitor-google-auth';
import { withTimeout } from './lib/withTimeout';
import { trackException, trackEvent } from './lib/telemetry';

export interface User {
  id: string;
  email: string;
  displayName: string;
  token: string;
}

interface AuthContextValue {
  user: User | null;
  loading: boolean;
  signOut: () => void;
  googleBtnRef: React.RefObject<HTMLDivElement | null>;
  signInNative: () => void;
  apiFetch: (url: string, options?: RequestInit) => Promise<Response>;
}

function decodeJwtPayload(token: string): Record<string, unknown> {
  const base64 = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
  return JSON.parse(atob(base64));
}

function isTokenExpired(token: string): boolean {
  const payload = decodeJwtPayload(token);
  return (payload['exp'] as number) * 1000 < Date.now();
}

const AuthContext = createContext<AuthContextValue>({
  user: null,
  loading: true,
  signOut: () => {},
  googleBtnRef: { current: null } as React.RefObject<HTMLDivElement | null>,
  signInNative: () => {},
  apiFetch: (url, options) => fetch(url, options),
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const googleBtnRef = useRef<HTMLDivElement | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- read by future UI wiring; only the setter is used here
  const [nativeSignInError, setNativeSignInError] = useState<string | null>(null);

  const handleCredentialResponse = useCallback(async (response: { credential: string }) => {
    const token = response.credential;
    sessionStorage.setItem('run_google_token', token);
    const payload = decodeJwtPayload(token);
    // Register/fetch user from API
    try {
      const res = await fetch(`${process.env.REACT_APP_API_URL || ''}/api/users/me`, {
        headers: { 'Authorization': `Bearer ${token}` },
      });
      const data = res.ok ? await res.json() : null;
      setUser({
        id: data?.id ?? (payload['sub'] as string),
        email: data?.email ?? (payload['email'] as string),
        displayName: data?.displayName ?? (payload['name'] as string) ?? (payload['email'] as string),
        token,
      });
    } catch {
      setUser({
        id: payload['sub'] as string,
        email: payload['email'] as string,
        displayName: (payload['name'] as string) ?? (payload['email'] as string),
        token,
      });
    }
    setLoading(false);
  }, []);

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

  // Restore session on load
  useEffect(() => {
    const stored = sessionStorage.getItem('run_google_token');
    if (stored && !isTokenExpired(stored)) {
      handleCredentialResponse({ credential: stored });
    } else {
      sessionStorage.removeItem('run_google_token');
      setLoading(false);
    }
  }, []); // eslint-disable-line

  const isNative = Capacitor.isNativePlatform();

  // Web (PWA): load the Google Identity Services script and render its button.
  // Native (Capacitor iOS wrapper): GIS's web button doesn't work from a
  // capacitor://localhost origin, so we use the native Google Sign-In SDK
  // instead — see signInNative below.
  useEffect(() => {
    if (isNative || user || loading) return;
    const g = (window as any).google;
    if (g?.accounts) { initGoogleSignIn(); return; }
    const existing = document.querySelector('script[src*="accounts.google.com/gsi/client"]');
    if (existing) { existing.addEventListener('load', initGoogleSignIn); return; }
    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true; script.defer = true;
    script.onload = initGoogleSignIn;
    document.head.appendChild(script);
  }, [isNative, user, loading, initGoogleSignIn]);

  // Re-render button when ref becomes available (web only)
  useEffect(() => {
    if (!isNative && !user && !loading) initGoogleSignIn();
  }, [isNative, user, loading, googleBtnRef.current, initGoogleSignIn]); // eslint-disable-line

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
        handleCredentialResponse({ credential: result.authentication.idToken });
      })
      .catch((e: any) => {
        const message = `Sign-in failed: ${e?.message ?? e}`;
        setNativeSignInError(message);
        trackException(e instanceof Error ? e : new Error(message), { stage: 'signIn' });
      });
  }, [handleCredentialResponse]);

  const apiFetch = useCallback((url: string, options: RequestInit = {}) => {
    const token = sessionStorage.getItem('run_google_token');
    const base = process.env.REACT_APP_API_URL || '';
    return fetch(`${base}${url}`, {
      ...options,
      headers: {
        ...(options.headers || {}),
        ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
      },
    });
  }, []);

  const signOut = useCallback(() => {
    sessionStorage.removeItem('run_google_token');
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, signOut, googleBtnRef, signInNative, apiFetch }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
