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
  }, []);

  if (loading) return <div className="history-state">Loading…</div>;
  if (error) return <div className="history-state error-msg">Error: {error}</div>;
  if (runs.length === 0) return (
    <div className="history-state">
      <p>No runs yet.</p>
      <p className="hint">Go to Track and log your first run!</p>
    </div>
  );

  return (
    <div className="history-tab">
      <DistanceChart runs={runs} />

      <div className="run-list">
        {runs.map(run => (
          <div key={run.id} className="run-card" onClick={() => navigate(`/history/${run.id}`)}>
            <div className="run-card-header">
              <span className="run-date">
                {new Date(run.started_at).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
              </span>
              {run.name && <span className="run-name">{run.name}</span>}
            </div>
            <div className="run-stats">
              <span className="run-stat">
                <strong>{(run.distance_meters / 1000).toFixed(2)}</strong> km
              </span>
              <span className="run-stat">
                <strong>{formatDuration(run.duration_seconds)}</strong>
              </span>
              <span className="run-stat">
                <strong>{formatPace(run.avg_pace_seconds_per_km)}</strong> /km
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
