import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import RouteMap from './RouteMap';
import { Waypoint } from '../../hooks/useGPS';
import './history.css';

interface RunFull {
  id: string;
  started_at: string;
  ended_at: string;
  distance_meters: number;
  duration_seconds: number;
  avg_pace_seconds_per_km: number;
  name: string | null;
  waypoints: Waypoint[];
  badges_earned: string[];
}

const BADGE_LABELS: Record<string, string> = {
  first_run: 'First Run',
  '5k': '5K',
  '10k': '10K',
  '21k': 'Half Marathon',
  '42k': 'Marathon',
  longest_streak: '7-Day Streak',
};

function formatPace(secs: number) {
  const m = Math.floor(secs / 60);
  const s = Math.floor(secs % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

function formatDuration(secs: number) {
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  if (h > 0) return `${h}h ${String(m).padStart(2, '0')}m`;
  return `${m}m ${String(s).padStart(2, '0')}s`;
}

export default function RunDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [run, setRun] = useState<RunFull | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/runs/${id}`)
      .then(r => { if (!r.ok) throw new Error(`${r.status}`); return r.json(); })
      .then(setRun)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) return <div className="history-state">Loading…</div>;
  if (error || !run) return <div className="history-state error-msg">Error: {error}</div>;

  return (
    <div className="run-detail">
      <div className="detail-header">
        <button className="back-btn" onClick={() => navigate('/history')}>← Back</button>
        <span className="detail-date">
          {new Date(run.started_at).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
        </span>
        {run.name && <span className="detail-name">{run.name}</span>}
      </div>

      <div className="detail-stats">
        <div className="stat-item">
          <span className="stat-value">{(run.distance_meters / 1000).toFixed(2)}</span>
          <span className="stat-label">km</span>
        </div>
        <div className="stat-item">
          <span className="stat-value">{formatDuration(run.duration_seconds)}</span>
          <span className="stat-label">time</span>
        </div>
        <div className="stat-item">
          <span className="stat-value">{formatPace(run.avg_pace_seconds_per_km)}</span>
          <span className="stat-label">min/km</span>
        </div>
      </div>

      {run.badges_earned.length > 0 && (
        <div className="badges-earned">
          {run.badges_earned.map(b => (
            <span key={b} className="badge-chip">{BADGE_LABELS[b] || b}</span>
          ))}
        </div>
      )}

      <div className="map-wrapper">
        <RouteMap waypoints={run.waypoints} />
      </div>
    </div>
  );
}
