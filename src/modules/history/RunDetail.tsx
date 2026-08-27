import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../../AuthContext';
import RouteMap from './RouteMap';
import WeatherIcon, { WeatherIconKey } from './WeatherIcon';
import { Waypoint } from '../../hooks/useGPS';
import './history.css';

interface WeatherSummary {
  temp_f: number;
  condition: string;
  icon: WeatherIconKey;
}

interface RunFull {
  id: string;
  started_at: string;
  ended_at: string;
  distance_meters: number;
  duration_seconds: number;
  avg_pace_seconds_per_km: number;
  waypoints: Waypoint[];
  badges_earned: string[];
  route_summary: string;
  weather_json: WeatherSummary | null;
  note: string | null;
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

const ChevronIcon = () => (
  <svg viewBox="0 0 24 24" width="18" height="18" fill="none">
    <path d="M9 6l6 6-6 6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);

export default function RunDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { apiFetch } = useAuth();
  const [run, setRun] = useState<RunFull | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [numbersOpen, setNumbersOpen] = useState(false);
  const [editingNote, setEditingNote] = useState(false);
  const [noteDraft, setNoteDraft] = useState('');
  const [savingNote, setSavingNote] = useState(false);

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

  function startEditingNote() {
    setNoteDraft(run!.note || '');
    setEditingNote(true);
  }

  async function saveNote() {
    setSavingNote(true);
    try {
      const r = await apiFetch(`/api/runs/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ note: noteDraft || null }),
      });
      if (!r.ok) throw new Error(`${r.status}`);
      const updated = await r.json();
      setRun(updated);
      setEditingNote(false);
    } catch (e) {
      // Leave edit mode open so the user can retry; error state isn't
      // fatal to the page since the rest of the run data already loaded.
    } finally {
      setSavingNote(false);
    }
  }

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
      </div>

      <div className="weather-hero">
        <div className="weather-hero-top">
          <div className="weather-hero-route">{run.route_summary}</div>
          {run.weather_json && (
            <div className="weather-hero-temp">
              <WeatherIcon icon={run.weather_json.icon} size={20} />
              {run.weather_json.temp_f}&deg;
            </div>
          )}
        </div>
        {run.weather_json && <div className="weather-hero-condition">{run.weather_json.condition}</div>}
      </div>

      <div className="note-card">
        <div className="note-label">Note</div>
        {editingNote ? (
          <div className="note-edit">
            <textarea
              className="note-textarea"
              value={noteDraft}
              onChange={e => setNoteDraft(e.target.value)}
              placeholder="How did this run feel?"
            />
            <div className="note-edit-actions">
              <button className="note-cancel-btn" onClick={() => setEditingNote(false)} disabled={savingNote}>Cancel</button>
              <button className="note-save-btn" onClick={saveNote} disabled={savingNote}>Save</button>
            </div>
          </div>
        ) : run.note ? (
          <div className="note-text" onClick={startEditingNote}>{run.note}</div>
        ) : (
          <div className="note-empty" onClick={startEditingNote}>Tap to add a note about this run &rsaquo;</div>
        )}
      </div>

      <div className="detail-map-wrapper">
        <RouteMap waypoints={run.waypoints} />
      </div>

      {run.badges_earned.length > 0 && (
        <div className="badges-earned">
          {run.badges_earned.map(b => (
            <span key={b} className="badge-chip">{BADGE_LABELS[b] || b}</span>
          ))}
        </div>
      )}

      <div className={`numbers-section${numbersOpen ? ' open' : ''}`}>
        <button className="numbers-toggle" onClick={() => setNumbersOpen(o => !o)}>
          <span className="numbers-toggle-label">By the Numbers</span>
          <span className="numbers-chevron"><ChevronIcon /></span>
        </button>
        {numbersOpen && (
          <div className="numbers-body">
            <div className="detail-stat-grid">
              <div className="detail-stat-card">
                <div className="detail-stat-label">Distance</div>
                <div className="detail-stat-value">{(run.distance_meters / 1000).toFixed(2)} km</div>
              </div>
              <div className="detail-stat-card">
                <div className="detail-stat-label">Time</div>
                <div className="detail-stat-value">{formatDuration(run.duration_seconds)}</div>
              </div>
              <div className="detail-stat-card">
                <div className="detail-stat-label">Avg pace</div>
                <div className="detail-stat-value">{formatPace(run.avg_pace_seconds_per_km)} /km</div>
              </div>
              <div className="detail-stat-card">
                <div className="detail-stat-label">Weather</div>
                <div className="detail-stat-value">{run.weather_json ? `${run.weather_json.temp_f}°F` : '—'}</div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
