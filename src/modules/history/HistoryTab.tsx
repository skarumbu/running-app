import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../AuthContext';
import DistanceChart from './DistanceChart';
import './history.css';

export interface Run {
  id: string;
  started_at: string;
  ended_at: string;
  distance_meters: number;
  duration_seconds: number;
  avg_pace_seconds_per_km: number;
  name: string | null;
}

function formatPace(secsPerKm: number): string {
  if (!secsPerKm) return '--:--';
  const m = Math.floor(secsPerKm / 60);
  const s = Math.floor(secsPerKm % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

function formatDuration(secs: number): string {
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m ${s}s`;
}

const ChevronIcon = () => (
  <svg viewBox="0 0 24 24" width="18" height="18" fill="none">
    <path d="M9 6l6 6-6 6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);

export default function HistoryTab() {
  const [runs, setRuns] = useState<Run[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();
  const { apiFetch } = useAuth();

  useEffect(() => {
    apiFetch('/api/runs')
      .then(r => { if (!r.ok) throw new Error(`${r.status}`); return r.json(); })
      .then((data: Run[]) => setRuns(data))
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [apiFetch]);

  if (loading) return <div className="history-state">Loading…</div>;
  if (error) return <div className="history-state" style={{ color: '#E84545' }}>Error: {error}</div>;
  if (runs.length === 0) return (
    <div className="history-state">
      <p>No runs yet.</p>
      <p className="hint">Go to Track and log your first run!</p>
    </div>
  );

  const now = new Date();
  const monthName = now.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  const monthKm = runs.reduce((a, r) => a + r.distance_meters / 1000, 0);
  const monthHours = (runs.reduce((a, r) => a + r.duration_seconds, 0) / 3600).toFixed(1);

  return (
    <div className="history-tab">
      <div className="history-heading">
        <div className="history-heading-date">{monthName}</div>
        <div className="history-heading-title">History</div>
      </div>

      <div className="month-summary">
        <div className="month-stat">
          <div className="month-stat-value">{monthKm.toFixed(1)}</div>
          <div className="month-stat-label">km</div>
        </div>
        <div className="month-stat">
          <div className="month-stat-value">{runs.length}</div>
          <div className="month-stat-label">Runs</div>
        </div>
        <div className="month-stat">
          <div className="month-stat-value">{monthHours}</div>
          <div className="month-stat-label">Hours</div>
        </div>
      </div>

      <DistanceChart runs={runs} />

      <div className="run-list">
        {runs.map(run => {
          const d = new Date(run.started_at);
          const day = d.getDate();
          const weekday = d.toLocaleDateString('en-US', { weekday: 'short' });
          const time = d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
          return (
            <button key={run.id} className="run-card" onClick={() => navigate(`/history/${run.id}`)}>
              <div className="run-card-date">
                <div className="run-card-day">{day}</div>
                <div className="run-card-weekday">{weekday}</div>
              </div>
              <div className="run-card-body">
                <div className="run-card-distance">
                  {(run.distance_meters / 1000).toFixed(2)} <span>km</span>
                </div>
                <div className="run-card-meta">
                  {formatDuration(run.duration_seconds)} · {formatPace(run.avg_pace_seconds_per_km)} /km
                  {run.name ? ` · ${run.name}` : ''}
                </div>
              </div>
              <div className="run-card-chevron"><ChevronIcon /></div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
