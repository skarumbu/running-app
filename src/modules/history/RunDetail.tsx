import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../../AuthContext';
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
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

const ArrowLeftIcon = () => (
  <svg viewBox="0 0 24 24" width="20" height="20" fill="none">
    <path d="M15 6l-6 6 6 6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);

const MoreIcon = () => (
  <svg viewBox="0 0 24 24" width="20" height="20">
    <circle cx="5" cy="12" r="1.7" fill="currentColor"/>
    <circle cx="12" cy="12" r="1.7" fill="currentColor"/>
    <circle cx="19" cy="12" r="1.7" fill="currentColor"/>
  </svg>
);

export default function RunDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { apiFetch } = useAuth();
  const [run, setRun] = useState<RunFull | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiFetch(`/api/runs/${id}`)
      .then(r => { if (!r.ok) throw new Error(`${r.status}`); return r.json(); })
      .then(setRun)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [id, apiFetch]);

  if (loading) return <div className="history-state">Loading…</div>;
  if (error || !run) return <div className="history-state" style={{ color: '#E84545' }}>Error: {error}</div>;

  const d = new Date(run.started_at);
  const when = d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }) +
    ' · ' + d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });

  return (
    <div className="run-detail">
      <div className="detail-topbar">
        <button className="detail-back-btn" onClick={() => navigate('/history')}>
          <ArrowLeftIcon />
        </button>
        <button className="detail-more-btn">
          <MoreIcon />
        </button>
      </div>

      <div className="detail-title-section">
        <div className="detail-title-when">{when}</div>
        <div className="detail-title">{run.name || 'Run'}</div>
      </div>

      <div className="detail-hero">
        <div>
          <div className="detail-hero-dist-value">{(run.distance_meters / 1000).toFixed(2)}</div>
          <div className="detail-hero-dist-unit">km</div>
        </div>
        <div className="detail-hero-divider" />
        <div>
          <div className="detail-hero-time-value">{formatDuration(run.duration_seconds)}</div>
          <div className="detail-hero-time-unit">Time</div>
        </div>
      </div>

      {run.badges_earned.length > 0 && (
        <div className="badges-earned">
          {run.badges_earned.map(b => (
            <span key={b} className="badge-chip">{BADGE_LABELS[b] || b}</span>
          ))}
        </div>
      )}

      <div className="detail-map-wrapper">
        <RouteMap waypoints={run.waypoints} />
      </div>

      <div className="detail-stat-grid">
        <div className="detail-stat-card">
          <div className="detail-stat-label">Avg pace</div>
          <div className="detail-stat-value">{formatPace(run.avg_pace_seconds_per_km)} /km</div>
        </div>
        <div className="detail-stat-card">
          <div className="detail-stat-label">Distance</div>
          <div className="detail-stat-value">{(run.distance_meters / 1000).toFixed(2)} km</div>
        </div>
      </div>
    </div>
  );
}
