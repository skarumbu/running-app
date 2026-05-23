import { useState, useRef, useCallback, useEffect } from 'react';

export function useRunTimer() {
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [running, setRunning] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startTimeRef = useRef<number>(0);
  const accumulatedRef = useRef<number>(0);

  const start = useCallback(() => {
    startTimeRef.current = Date.now();
    setRunning(true);
  }, []);

  const pause = useCallback(() => {
    accumulatedRef.current += Math.floor((Date.now() - startTimeRef.current) / 1000);
    setRunning(false);
  }, []);

  const resume = useCallback(() => {
    startTimeRef.current = Date.now();
    setRunning(true);
  }, []);

  const reset = useCallback(() => {
    accumulatedRef.current = 0;
    setRunning(false);
    setElapsedSeconds(0);
  }, []);

  useEffect(() => {
    if (running) {
      intervalRef.current = setInterval(() => {
        const live = Math.floor((Date.now() - startTimeRef.current) / 1000);
        setElapsedSeconds(accumulatedRef.current + live);
      }, 1000);
    } else {
      if (intervalRef.current) clearInterval(intervalRef.current);
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [running]);

  return { elapsedSeconds, running, start, pause, resume, reset };
}
