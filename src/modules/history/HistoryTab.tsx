import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../AuthContext';
import DistanceChart from './DistanceChart';
import RouteThumbnail from './RouteThumbnail';
import WeatherIcon, { WeatherIconKey } from './WeatherIcon';
import './history.css';

export interface WeatherSummary {
  temp_f: number;
  condition: string;
  icon: WeatherIconKey;
}

export interface Run {
  id: string;
  started_at: string;
  ended_at: string;
  distance_meters: number;
  duration_seconds: number;
  avg_pace_seconds_per_km: number;
  name: string | null;
  route_summary: string;
  weather_json: WeatherSummary | null;
  route_thumbnail: { lat: number; lng: number }[];
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
          const dateLabel = d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
          return (
            <button key={run.id} className="run-card" onClick={() => navigate(`/history/${run.id}`)}>
              <div className="run-card-thumb">
                <RouteThumbnail points={run.route_thumbnail} />
              </div>
              <div className="run-card-body">
                <div className="run-card-route">{run.route_summary}</div>
                <div className="run-card-meta-row">
                  {run.weather_json && (
                    <span className="run-card-weather">
                      <WeatherIcon icon={run.weather_json.icon} />
                      {run.weather_json.temp_f}&deg;
                    </span>
                  )}
                  <span className="run-card-date">{dateLabel}</span>
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
