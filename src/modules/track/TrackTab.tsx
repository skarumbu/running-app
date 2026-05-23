import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useGPS } from '../../hooks/useGPS';
import { useRunTimer } from '../../hooks/useRunTimer';
import { useWakeLock } from '../../hooks/useWakeLock';
import './track.css';

type RunState = 'idle' | 'running' | 'paused' | 'saving';

function formatTime(secs: number): string {
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function formatPace(distanceMeters: number, elapsedSeconds: number): string {
  if (distanceMeters < 10) return '--:--';
  const secsPerKm = elapsedSeconds / (distanceMeters / 1000);
  const m = Math.floor(secsPerKm / 60);
  const s = Math.floor(secsPerKm % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

export default function TrackTab() {
  const [phase, setPhase] = useState<RunState>('idle');
  const [runName, setRunName] = useState('');
  const [saveError, setSaveError] = useState<string | null>(null);

  const gps = useGPS();
  const timer = useRunTimer();
  const wakeLock = useWakeLock();
  const navigate = useNavigate();

  const handleStart = async () => {
    setPhase('running');
    gps.start();
    timer.start();
    await wakeLock.acquire();
  };

  const handlePause = () => {
    setPhase('paused');
    timer.pause();
    // GPS continues collecting so distance stays accurate
  };

  const handleResume = async () => {
    setPhase('running');
    timer.resume();
    await wakeLock.acquire();
  };

  const handleFinish = () => {
    timer.pause();
    gps.stop();
    wakeLock.release();
    setPhase('saving');
  };

  const handleSave = async () => {
    setSaveError(null);
    try {
      const res = await fetch('/api/runs', {
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

  return (
    <div className="track-tab">
      {phase === 'saving' ? (
        <div className="save-panel">
          <h2>Save run</h2>
          <p className="save-summary">
            {(gps.distanceMeters / 1000).toFixed(2)} km &nbsp;·&nbsp; {formatTime(timer.elapsedSeconds)}
          </p>
          <input
            className="run-name-input"
            type="text"
            placeholder="Name this run (optional)"
            value={runName}
            onChange={e => setRunName(e.target.value)}
          />
          {saveError && <p className="error-msg">{saveError}</p>}
          <button className="btn btn-primary" onClick={handleSave}>Save</button>
          <button className="btn btn-ghost" onClick={handleDiscard}>Discard</button>
        </div>
      ) : (
        <>
          <div className="metrics">
            <div className="metric-block">
              <span className="metric-value">{formatTime(timer.elapsedSeconds)}</span>
              <span className="metric-label">Time</span>
            </div>
            <div className="metric-block">
              <span className="metric-value">{(gps.distanceMeters / 1000).toFixed(2)}</span>
              <span className="metric-label">km</span>
            </div>
            <div className="metric-block">
              <span className="metric-value">{formatPace(gps.distanceMeters, timer.elapsedSeconds)}</span>
              <span className="metric-label">min/km</span>
            </div>
          </div>

          {gps.acquiring && <p className="gps-status">Acquiring GPS…</p>}
          {gps.error && <p className="gps-status error-msg">GPS: {gps.error}</p>}

          <div className="controls">
            {phase === 'idle' && (
              <button className="btn btn-start" onClick={handleStart}>Start</button>
            )}
            {phase === 'running' && (
              <>
                <button className="btn btn-secondary" onClick={handlePause}>Pause</button>
                <button className="btn btn-finish" onClick={handleFinish}>Finish</button>
              </>
            )}
            {phase === 'paused' && (
              <>
                <button className="btn btn-primary" onClick={handleResume}>Resume</button>
                <button className="btn btn-finish" onClick={handleFinish}>Finish</button>
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
}
