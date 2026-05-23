import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';

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
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const googleBtnRef = useRef<HTMLDivElement | null>(null);

  const handleCredentialResponse = useCallback(async (response: { credential: string }) => {
    const token = response.credential;
    sessionStorage.setItem('run_google_token', token);
    const payload = decodeJwtPayload(token);
    // Register/fetch user from API
    try {
      const res = await fetch('/api/users/me', {
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

  // Load GIS script when not authed
  useEffect(() => {
    if (user || loading) return;
    const g = (window as any).google;
    if (g?.accounts) { initGoogleSignIn(); return; }
    const existing = document.querySelector('script[src*="accounts.google.com/gsi/client"]');
    if (existing) { existing.addEventListener('load', initGoogleSignIn); return; }
    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true; script.defer = true;
    script.onload = initGoogleSignIn;
    document.head.appendChild(script);
  }, [user, loading, initGoogleSignIn]);

  // Re-render button when ref becomes available
  useEffect(() => {
    if (!user && !loading) initGoogleSignIn();
  }, [user, loading, googleBtnRef.current, initGoogleSignIn]); // eslint-disable-line

  const signOut = useCallback(() => {
    sessionStorage.removeItem('run_google_token');
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, signOut, googleBtnRef }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
