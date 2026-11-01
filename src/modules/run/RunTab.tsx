import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../AuthContext';
import { useGPS } from '../../hooks/useGPS';
import { useRunTimer } from '../../hooks/useRunTimer';
import { showRunTrackingNotification, clearRunTrackingNotification } from '../../lib/runNotification';
import { useGearList } from '../../lib/useGearList';
import { EMPTY_MUSIC, MusicDraft, emptyRunFeelValues } from '../../components/RunFeelForm';
import type { MidRunNoteKind } from '../../lib/feel';
import type { MidRunNote } from '../../lib/runTypes';
import { Owner, newClientId } from '../../lib/outbox';
import {
  CHECKPOINT_INTERVAL_MS, RunCheckpoint, clearCheckpoint, loadCheckpoint, saveCheckpoint,
} from '../../lib/runCheckpoint';
import { useCurrentWeather } from './useCurrentWeather';
import StartPanel from './StartPanel';
import DuringPanel, { Unit } from './DuringPanel';
import HowWasIt from './HowWasIt';
import ResumePrompt from './ResumePrompt';
import '../../components/components.css';
import './run.css';

type RunState = 'idle' | 'running' | 'paused' | 'saving';

export default function RunTab() {
  const [phase, setPhase] = useState<RunState>('idle');
  const [clientId, setClientId] = useState('');
  // The account that started this run; it owns the saved run.
  const [owner, setOwner] = useState<Owner | null>(null);
  const [endedAt, setEndedAt] = useState('');
  const [pickedGear, setPickedGear] = useState<string[]>([]);
  const [music, setMusic] = useState<MusicDraft>(EMPTY_MUSIC);
  const [midRunNotes, setMidRunNotes] = useState<MidRunNote[]>([]);
  const [unit, setUnit] = useState<Unit>(() => (localStorage.getItem('distanceUnit') as Unit) || 'km');

  // A run left behind when the app was killed (or the tab was left mid-run).
  const [restorable, setRestorable] = useState<RunCheckpoint | null>(null);

  // Checkpoint writes read the newest state through this ref, because the
  // GPS callback that triggers them was created on an earlier render.
  const latest = useRef({ phase, clientId, owner, endedAt, pickedGear, music, midRunNotes });
  latest.current = { phase, clientId, owner, endedAt, pickedGear, music, midRunNotes };
  const lastCheckpointAt = useRef(0);

  const timerRef = useRef<ReturnType<typeof useRunTimer> | null>(null);
  const gpsRef = useRef<ReturnType<typeof useGPS> | null>(null);

  const writeCheckpoint = useCallback(() => {
    const l = latest.current;
    if (l.phase === 'idle' || !timerRef.current || !gpsRef.current) return;
    lastCheckpointAt.current = Date.now();
    const route = gpsRef.current.snapshot();
    saveCheckpoint({
      clientId: l.clientId,
      owner: l.owner,
      phase: l.phase,
      timer: timerRef.current.snapshot(),
      waypoints: route.waypoints,
      distanceMeters: route.distanceMeters,
      pickedGear: l.pickedGear,
      music: l.music,
      midRunNotes: l.midRunNotes,
      endedAt: l.endedAt || null,
    }).catch(() => {});
  }, []);

  // Rides on GPS wake-ups the app already gets: no timer, no extra fixes.
  const onRecord = useCallback(() => {
    if (Date.now() - lastCheckpointAt.current >= CHECKPOINT_INTERVAL_MS) writeCheckpoint();
  }, [writeCheckpoint]);

  const gps = useGPS({ onRecord });
  const timer = useRunTimer();
  timerRef.current = timer;
  gpsRef.current = gps;
  const navigate = useNavigate();
  const { user } = useAuth();
  const { gear } = useGearList();
  const weather = useCurrentWeather();

  useEffect(() => {
    localStorage.setItem('distanceUnit', unit);
  }, [unit]);

  useEffect(() => {
    let live = true;
    loadCheckpoint().then(cp => { if (live && cp) setRestorable(cp); });
    return () => {
      live = false;
      // Leaving the tab mid-run: keep the run on disk and don't leave the
      // GPS watcher running with nothing listening. Resume picks it up.
      writeCheckpoint();
      gpsRef.current?.stop();
    };
  }, [writeCheckpoint]);

  // Every state change worth keeping: start, pause, resume, a note, finish.
  useEffect(() => {
    if (phase !== 'idle') writeCheckpoint();
  }, [phase, midRunNotes, endedAt, writeCheckpoint]);

  const activeGear = gear?.filter(g => !g.retired) ?? null;

  const handleStart = () => {
    setClientId(newClientId());
    setOwner(user ? { id: user.googleId, email: user.email } : null);
    setMidRunNotes([]);
    setPhase('running');
    gps.start();
    timer.start();
    showRunTrackingNotification();
  };

  const handlePause = () => {
    setPhase('paused');
    timer.pause();
    gps.stop();
  };

  const handleResume = () => {
    setPhase('running');
    timer.resume();
    gps.start();
  };

  const handleFinish = () => {
    // Pausing first freezes elapsedSeconds; a paused timer must not be paused
    // again or the paused stretch would be counted twice.
    if (phase === 'running') timer.pause();
    gps.stop();
    clearRunTrackingNotification();
    setEndedAt(new Date().toISOString());
    setPhase('saving');
  };

  const restoreRun = (cp: RunCheckpoint, mode: 'resume' | 'finish') => {
    setRestorable(null);
    setClientId(cp.clientId);
    // A checkpoint from before owners were recorded stays ownerless; Runs offers to claim it.
    setOwner(cp.owner ?? null);
    setPickedGear(cp.pickedGear);
    setMusic(cp.music);
    setMidRunNotes(cp.midRunNotes);
    gps.restore(cp.waypoints, cp.distanceMeters);
    if (cp.phase === 'saving' || mode === 'finish') {
      // A run that was still going when the app died ends at the last sign
      // of life (the last checkpoint or fix), not at "now".
      const lastFix = cp.waypoints[cp.waypoints.length - 1]?.ts ?? 0;
      const end = cp.phase === 'saving' && cp.endedAt ? Date.parse(cp.endedAt) : Math.max(cp.savedAt, lastFix);
      const open = cp.timer.segmentStartedAt;
      timer.restore({ accumulatedMs: cp.timer.accumulatedMs + (open !== null ? end - open : 0), segmentStartedAt: null });
      setEndedAt(new Date(end).toISOString());
      setPhase('saving');
      return;
    }
    // Resuming: a running segment carries on from when it started, so time
    // spent while the app was gone counts (you were still out there).
    timer.restore(cp.timer);
    if (cp.phase === 'running') {
      gps.start();
      showRunTrackingNotification();
    }
    setPhase(cp.phase);
  };

  const resetRun = () => {
    // Set before the clear: a save navigates away (unmounting this tab) before
    // the next render, and the unmount checkpoint must not write it back.
    latest.current.phase = 'idle';
    clearCheckpoint().catch(() => {});
    timer.reset();
    gps.reset();
    setMidRunNotes([]);
    setPickedGear([]);
    setMusic(EMPTY_MUSIC);
    setPhase('idle');
  };

  if (phase === 'saving') {
    return (
      <HowWasIt
        clientId={clientId}
        owner={owner}
        endedAt={endedAt}
        elapsedSeconds={timer.elapsedSeconds}
        distanceMeters={gps.distanceMeters}
        waypoints={gps.waypoints}
        midRunNotes={midRunNotes}
        initial={{
          ...emptyRunFeelValues(),
          gear: pickedGear.map(id => ({ gear_id: id, comfort: null, note: '' })),
          music,
        }}
        gearOptions={gear ?? []}
        weather={weather}
        onStoredLocally={() => { clearCheckpoint().catch(() => {}); }}
        onSaved={id => { resetRun(); navigate(`/runs/${id}`); }}
        onQueuedDone={() => { resetRun(); navigate('/runs'); }}
        onDiscard={resetRun}
      />
    );
  }

  if (phase === 'idle' && restorable) {
    return (
      <ResumePrompt
        checkpoint={restorable}
        onResume={() => restoreRun(restorable, 'resume')}
        onFinish={() => restoreRun(restorable, 'finish')}
      />
    );
  }

  if (phase === 'idle') {
    return (
      <StartPanel
        weather={weather}
        gear={activeGear}
        pickedGear={pickedGear}
        onToggleGear={id => setPickedGear(p => (p.includes(id) ? p.filter(x => x !== id) : [...p, id]))}
        music={music}
        onMusic={patch => setMusic(m => ({ ...m, ...patch }))}
        onStart={handleStart}
      />
    );
  }

  return (
    <DuringPanel
      elapsedSeconds={timer.elapsedSeconds}
      distanceMeters={gps.distanceMeters}
      unit={unit}
      onToggleUnit={() => setUnit(u => (u === 'km' ? 'miles' : 'km'))}
      isPaused={phase === 'paused'}
      gpsError={gps.error}
      acquiring={gps.acquiring}
      music={music}
      notes={midRunNotes}
      onNote={(kind: MidRunNoteKind) => setMidRunNotes(n => [...n, { kind, elapsed_s: timer.elapsedSeconds }])}
      onPause={handlePause}
      onResume={handleResume}
      onFinish={handleFinish}
    />
  );
}
