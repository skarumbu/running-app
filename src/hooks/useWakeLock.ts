import { useRef, useCallback } from 'react';

export function useWakeLock() {
  const lockRef = useRef<WakeLockSentinel | null>(null);

  const acquire = useCallback(async () => {
    if (!('wakeLock' in navigator)) return;
    try {
      lockRef.current = await navigator.wakeLock.request('screen');
    } catch {
      // wake lock not granted — non-fatal
    }
  }, []);

  const release = useCallback(async () => {
    if (lockRef.current) {
      await lockRef.current.release();
      lockRef.current = null;
    }
  }, []);

  return { acquire, release };
}
