import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../AuthContext';
import WeatherIcon from '../../components/WeatherIcon';
import { FEELS, MUSIC_KINDS, WEATHER_FEELS, accentVar, feelOf, labelOf } from '../../lib/feel';
import { formatRunDate } from '../../lib/format';
import type { RunSummary } from '../../lib/runTypes';
import '../../components/components.css';
import './runs.css';

function musicLabel(run: RunSummary): string | null {
  const { music } = run;
  if (!music) return null;
  if (music.kind === 'silence') return 'Silence';
  return music.title || labelOf(MUSIC_KINDS, music.kind);
}

export function RunCard({ run, onOpen }: { run: RunSummary; onOpen: () => void }) {
  const feel = feelOf(run.feel);
  const firstWeatherFeel = run.weather_feel?.[0];
  const music = musicLabel(run);
  return (
    <button type="button" className="run-card" onClick={onOpen}>
      <span
        className="run-band"
        data-testid="feel-band"
        data-feel={feel ? feel.word : 'none'}
        style={{ background: feel ? accentVar(feel.accent) : 'var(--line)' }}
      />
      <span className="run-card-body">
        <span className="run-card-top">
          <span className="run-card-title">{run.route_summary || 'Run'}</span>
          {feel && <span className="eyebrow run-card-feel">{feel.word}</span>}
        </span>
        <span className="muted-line">{formatRunDate(run.started_at)}</span>
        <span className="run-card-tags">
          {run.weather_json && (
            <span className="tag">
              <WeatherIcon icon={run.weather_json.icon} size={14} />
              <span className="tag-text">
                {run.weather_json.temp_f}&deg;{firstWeatherFeel ? ` · ${labelOf(WEATHER_FEELS, firstWeatherFeel)}` : ''}
              </span>
            </span>
          )}
          {music && <span className="tag"><span aria-hidden="true">♪</span><span className="tag-text">{music}</span></span>}
          {(run.gear ?? []).slice(0, 2).map(g => (
            <span className="tag" key={g.gear_id}>
              <span className="dot" style={{ background: accentVar(g.color) }} />
              <span className="tag-text">{g.name}</span>
            </span>
          ))}
        </span>
      </span>
    </button>
  );
}

export default function RunsTab() {
  const [runs, setRuns] = useState<RunSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();
  const { apiFetch } = useAuth();

  useEffect(() => {
    apiFetch('/api/runs')
      .then(r => { if (!r.ok) throw new Error(`${r.status}`); return r.json(); })
      .then((data: RunSummary[]) => setRuns(data))
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [apiFetch]);

  if (loading) return <div className="state-msg">Loading…</div>;
  if (error) return <div className="state-msg error">Couldn't load your runs ({error}).</div>;

  return (
    <div className="page">
      <div>
        <div className="eyebrow">Your runs</div>
        <h1 className="h">How they felt</h1>
      </div>
      {runs.length === 0 ? (
        <p className="state-msg">No runs yet. Head to Run and log your first one.</p>
      ) : (
        <>
          <div className="row feel-legend" aria-label="Feel colours">
            {[...FEELS].reverse().map(f => (
              <span className="tag" key={f.level}>
                <span className="dot" style={{ background: accentVar(f.accent) }} />{f.word}
              </span>
            ))}
          </div>
          {runs.map(run => (
            <RunCard key={run.id} run={run} onOpen={() => navigate(`/runs/${run.id}`)} />
          ))}
        </>
      )}
    </div>
  );
}
