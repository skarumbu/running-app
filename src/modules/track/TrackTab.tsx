import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../AuthContext';
import { useGPS } from '../../hooks/useGPS';
import { useRunTimer } from '../../hooks/useRunTimer';
import { useWakeLock } from '../../hooks/useWakeLock';
import { showRunTrackingNotification, clearRunTrackingNotification } from '../../lib/runNotification';
import TrackMap from './TrackMap';
import './track.css';

type RunState = 'idle' | 'running' | 'paused' | 'saving';

type Unit = 'km' | 'miles';

function formatTime(secs: number): string {
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function formatPace(distanceMeters: number, elapsedSeconds: number, unit: Unit = 'km'): string {
  if (distanceMeters < 10) return '--:--';
  let distanceInUnit = unit === 'km' ? (distanceMeters / 1000) : (distanceMeters / 1609.344);
  const secsPerUnit = elapsedSeconds / distanceInUnit;
  const m = Math.floor(secsPerUnit / 60);
  const s = Math.floor(secsPerUnit % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

function convertDistance(distanceMeters: number, unit: Unit = 'km'): string {
  if (unit === 'km') return (distanceMeters / 1000).toFixed(2);
  return (distanceMeters / 1609.344).toFixed(2);
}

const PlayIcon = () => (
  <svg viewBox="0 0 24 24" width="26" height="26"><path d="M8 5.5L19 12L8 18.5z" fill="currentColor"/></svg>
);
const PauseIcon = () => (
  <svg viewBox="0 0 24 24" width="28" height="28">
    <rect x="7" y="5.5" width="3.5" height="13" rx="1" fill="currentColor"/>
    <rect x="13.5" y="5.5" width="3.5" height="13" rx="1" fill="currentColor"/>
  </svg>
);
const StopIcon = () => (
  <svg viewBox="0 0 24 24" width="22" height="22"><rect x="6" y="6" width="12" height="12" rx="2" fill="currentColor"/></svg>
);
const CheckIcon = () => (
  <svg viewBox="0 0 24 24" width="14" height="14">
    <path d="M5 12.5l4 4 10-10" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);

export default function TrackTab() {
  const [phase, setPhase] = useState<RunState>('idle');
  const [runName, setRunName] = useState('');
  const [saveError, setSaveError] = useState<string | null>(null);
  const [unit, setUnit] = useState<Unit>(() => {
    if (typeof window !== 'undefined') {
      return (localStorage.getItem('distanceUnit') as Unit) || 'km';
    }
    return 'km';
  });

  const { user, apiFetch } = useAuth();
  const gps = useGPS();
  const timer = useRunTimer();
  const wakeLock = useWakeLock();
  const navigate = useNavigate();

  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('distanceUnit', unit);
    }
  }, [unit]);

  const handleStart = async () => {
    setPhase('running');
    gps.start();
    timer.start();
    await wakeLock.acquire();
    showRunTrackingNotification();
  };

  const handlePause = () => {
    setPhase('paused');
    timer.pause();
    gps.stop();
  };

  const handleResume = async () => {
    setPhase('running');
    timer.resume();
    gps.start();
    await wakeLock.acquire();
  };

  const handleFinish = () => {
    timer.pause();
    gps.stop();
    wakeLock.release();
    clearRunTrackingNotification();
    setPhase('saving');
  };

  const handleSave = async () => {
    setSaveError(null);
    try {
      const res = await apiFetch('/api/runs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: runName.trim() || null,
          duration_seconds: timer.elapsedSeconds,
          distance_meters: gps.distanceMeters,
          waypoints: gps.waypoints,
        }),
      });
      if (!res.ok) throw new Error(`${res.status}`);
      const run = await res.json();
      timer.reset();
      gps.reset();
      setPhase('idle');
      navigate(`/history/${run.id}`);
    } catch (e: any) {
      setSaveError(`Save failed: ${e.message}`);
    }
  };

  const handleDiscard = () => {
    timer.reset();
    gps.reset();
    setPhase('idle');
    setSaveError(null);
  };

  const now = new Date();
  const greeting = now.getHours() < 12 ? 'Good morning' : now.getHours() < 18 ? 'Good afternoon' : 'Good evening';
  const firstName = user?.displayName?.split(' ')[0] || 'Runner';
  const dateStr = now.toLocaleDateString('en-US', { weekday: 'short', month: 'long', day: 'numeric' });

  if (phase === 'saving') {
    const distStr = convertDistance(gps.distanceMeters, unit);
    const unitLabel = unit === 'km' ? 'km' : 'mi';
    return (
      <div className="save-panel">
        <div className="save-panel-header">
          <div className="save-panel-label"><CheckIcon /> Run complete</div>
          <div className="save-panel-title">Nice work.</div>
        </div>

        <div className="save-panel-summary">
          <div className="save-panel-stat">
            <div className="save-panel-stat-value">{distStr}</div>
            <div className="save-panel-stat-label">{unitLabel}</div>
          </div>
          <div className="save-panel-stat">
            <div className="save-panel-stat-value">{formatTime(timer.elapsedSeconds)}</div>
            <div className="save-panel-stat-label">time</div>
          </div>
        </div>

        <TrackMap waypoints={gps.waypoints} />

        <input
          className="run-name-input"
          type="text"
          placeholder="Name this run (optional)"
          value={runName}
          onChange={e => setRunName(e.target.value)}
        />

        {saveError && <p className="save-error">{saveError}</p>}

        <button className="save-btn" onClick={handleSave}>Save run</button>
        <button className="discard-btn" onClick={handleDiscard}>Discard</button>
      </div>
    );
  }

  if (phase === 'idle') {
    return (
      <div className="track-idle">
        <div>
          <div className="track-greeting-date">{dateStr}</div>
          <div className="track-greeting-name">{greeting},<br />{firstName}.</div>
        </div>

        {gps.error && <p className="gps-status error">GPS: {gps.error}</p>}
        {gps.acquiring && <p className="gps-status">Acquiring GPS</p>}

        <button className="track-start-btn" onClick={handleStart}>
          <PlayIcon />
          Start run
        </button>
        <div className="track-gps-hint">GPS auto-pause on</div>
      </div>
    );
  }

  // running or paused
  const isPaused = phase === 'paused';
  const distStr = convertDistance(gps.distanceMeters, unit);
  const unitLabel = unit === 'km' ? 'km' : 'mi';
  const pace = formatPace(gps.distanceMeters, timer.elapsedSeconds, unit);

  return (
    <div className="track-active">
      <div className="track-status-pill">
        <div className={`track-status-dot ${isPaused ? 'paused' : ''}`} />
        <div className={`track-status-label ${isPaused ? 'paused' : ''}`}>
          {isPaused ? 'Paused' : 'Running'}
        </div>
      </div>

      <div className="track-timer-section">
        <div className="track-timer-label">Elapsed time</div>
        <div className="track-timer-value">{formatTime(timer.elapsedSeconds)}</div>
      </div>

      <div className="track-stat-grid">
        <div className="stat-card">
          <div className="stat-card-label">Distance ({unitLabel})</div>
          <div className="stat-card-value accent">{distStr}</div>
        </div>
        <div className="stat-card">
          <div className="stat-card-label">Pace (min/{unitLabel})</div>
          <div className="stat-card-value">{pace}</div>
        </div>
        <div className="stat-card">
          <div className="stat-card-label">Calories</div>
          <div className="stat-card-value">{Math.round(gps.distanceMeters / 1000 * 70) || '0'}</div>
        </div>
      </div>

      <div className="unit-toggle">
        <button className={`unit-toggle-opt${unit === 'km' ? ' active' : ''}`} onClick={() => setUnit('km')}>KM</button>
        <button className={`unit-toggle-opt${unit === 'miles' ? ' active' : ''}`} onClick={() => setUnit('miles')}>MI</button>
      </div>

      <TrackMap waypoints={gps.waypoints} />

      <div className="track-controls">
        <button className="ctrl-btn" onClick={handleFinish}>
          <StopIcon />
        </button>
        <button className="ctrl-btn-primary" onClick={isPaused ? handleResume : handlePause}>
          {isPaused ? <PlayIcon /> : <PauseIcon />}
        </button>
        <button className="ctrl-btn" style={{ fontSize: 10, letterSpacing: '0.14em' }}>
          Lap
        </button>
      </div>
    </div>
  );
}
