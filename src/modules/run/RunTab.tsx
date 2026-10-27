import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useGPS } from '../../hooks/useGPS';
import { useRunTimer } from '../../hooks/useRunTimer';
import { showRunTrackingNotification, clearRunTrackingNotification } from '../../lib/runNotification';
import { useGearList } from '../../lib/useGearList';
import { EMPTY_MUSIC, MusicDraft, emptyRunFeelValues } from '../../components/RunFeelForm';
import type { MidRunNoteKind } from '../../lib/feel';
import type { MidRunNote } from '../../lib/runTypes';
import { useCurrentWeather } from './useCurrentWeather';
import StartPanel from './StartPanel';
import DuringPanel, { Unit } from './DuringPanel';
import HowWasIt from './HowWasIt';
import '../../components/components.css';
import './run.css';

type RunState = 'idle' | 'running' | 'paused' | 'saving';

export default function RunTab() {
  const [phase, setPhase] = useState<RunState>('idle');
  const [pickedGear, setPickedGear] = useState<string[]>([]);
  const [music, setMusic] = useState<MusicDraft>(EMPTY_MUSIC);
  const [midRunNotes, setMidRunNotes] = useState<MidRunNote[]>([]);
  const [unit, setUnit] = useState<Unit>(() => (localStorage.getItem('distanceUnit') as Unit) || 'km');

  const gps = useGPS();
  const timer = useRunTimer();
  const navigate = useNavigate();
  const { gear } = useGearList();
  const weather = useCurrentWeather();

  useEffect(() => {
    localStorage.setItem('distanceUnit', unit);
  }, [unit]);

  const activeGear = gear?.filter(g => !g.retired) ?? null;

  const handleStart = () => {
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
    setPhase('saving');
  };

  const resetRun = () => {
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
        onSaved={id => { resetRun(); navigate(`/runs/${id}`); }}
        onDiscard={resetRun}
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
