import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../AuthContext';
import { PendingRun, listPending, postRunWith, subscribe, syncOutbox } from './outbox';

/** The queued runs, kept current, and a way to push them now. */
export function useOutbox() {
  const { apiFetch } = useAuth();
  const [pending, setPending] = useState<PendingRun[]>([]);
  const [syncing, setSyncing] = useState(false);

  useEffect(() => {
    let live = true;
    listPending().then(p => { if (live) setPending(p); });
    const unsubscribe = subscribe(p => setPending(p));
    return () => { live = false; unsubscribe(); };
  }, []);

  const syncNow = useCallback(async () => {
    setSyncing(true);
    try {
      return await syncOutbox(postRunWith(apiFetch));
    } finally {
      setSyncing(false);
    }
  }, [apiFetch]);

  return { pending, syncing, syncNow };
}

/**
 * Pushes the outbox on sign-in (including a fresh token after "Sign in to
 * sync") and whenever the app comes back to the foreground. Mounted once,
 * in the signed-in shell. visibilitychange fires in WKWebView when the iOS
 * app resumes, so no extra Capacitor plugin is needed for that.
 */
export function useOutboxAutoSync() {
  const { user, needsSignIn, apiFetch } = useAuth();
  const token = user?.token;

  useEffect(() => {
    if (!token || needsSignIn) return;
    const sync = () => { syncOutbox(postRunWith(apiFetch)); };
    sync();
    const onVisibility = () => { if (document.visibilityState === 'visible') sync(); };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, [token, needsSignIn, apiFetch]);
}
