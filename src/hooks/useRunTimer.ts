import { useState, useRef, useCallback, useEffect } from 'react';

// Elapsed time is derived from timestamps (accumulated ms plus the current
// segment), not counted by the interval. The interval only refreshes the
// display, and only while the page is visible: no once-a-second re-render
// with the screen locked. Coming back to the app recomputes immediately.
export function useRunTimer() {
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [running, setRunning] = useState(false);
  const startTimeRef = useRef<number>(0);
  const accumulatedMsRef = useRef<number>(0);
  const runningRef = useRef(false);

  const compute = useCallback(() => {
    const live = runningRef.current ? Date.now() - startTimeRef.current : 0;
    return Math.floor((accumulatedMsRef.current + live) / 1000);
  }, []);

  const start = useCallback(() => {
    startTimeRef.current = Date.now();
    runningRef.current = true;
    setRunning(true);
  }, []);

  const pause = useCallback(() => {
    // Finish calls pause() even when already paused; don't count that gap twice.
    if (!runningRef.current) return;
    accumulatedMsRef.current += Date.now() - startTimeRef.current;
    runningRef.current = false;
    setRunning(false);
    setElapsedSeconds(Math.floor(accumulatedMsRef.current / 1000));
  }, []);

  const resume = start;

  const reset = useCallback(() => {
    accumulatedMsRef.current = 0;
    runningRef.current = false;
    setRunning(false);
    setElapsedSeconds(0);
  }, []);

  useEffect(() => {
    if (!running) return;
    let interval: ReturnType<typeof setInterval> | null = null;
    const sync = () => {
      if (interval) clearInterval(interval);
      interval = null;
      if (document.visibilityState === 'hidden') return;
      setElapsedSeconds(compute());
      interval = setInterval(() => setElapsedSeconds(compute()), 1000);
    };
    sync();
    document.addEventListener('visibilitychange', sync);
    return () => {
      document.removeEventListener('visibilitychange', sync);
      if (interval) clearInterval(interval);
    };
  }, [running, compute]);

  return { elapsedSeconds, running, start, pause, resume, reset };
}
