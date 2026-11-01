import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../AuthContext';
import WeatherIcon from '../../components/WeatherIcon';
import { FEELS, MUSIC_KINDS, WEATHER_FEELS, accentVar, feelOf, labelOf } from '../../lib/feel';
import { formatRunDate } from '../../lib/format';
import type { RunSummary } from '../../lib/runTypes';
import { PendingRun, removePending } from '../../lib/outbox';
import { useOutbox } from '../../lib/useOutbox';
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

/** A run saved on this phone that hasn't reached the server yet. */
export function PendingRunCard({ pending, needsSignIn }: { pending: PendingRun; needsSignIn: boolean }) {
  const { payload } = pending;
  const feel = feelOf(payload.feel);
  const startedAt = new Date(new Date(payload.ended_at).getTime() - payload.duration_seconds * 1000).toISOString();
  const status = needsSignIn
    ? "Saved on this phone, will sync when you're signed in"
    : pending.lastError
      ? `Saved on this phone · last try: ${pending.lastError}`
      : 'Saved on this phone · waiting to sync';
  return (
    <div className="run-card pending" data-testid="pending-run">
      <span
        className="run-band"
        data-feel={feel ? feel.word : 'none'}
        style={{ background: feel ? accentVar(feel.accent) : 'var(--line)' }}
      />
      <span className="run-card-body">
        <span className="run-card-top">
          <span className="run-card-title">Waiting to sync</span>
          {feel && <span className="eyebrow run-card-feel">{feel.word}</span>}
        </span>
        <span className="muted-line">{formatRunDate(startedAt)}</span>
        <span className="muted-line pending-status">{status}</span>
        {pending.attempts > 0 && (
          <button
            type="button"
            className="link-btn pending-discard"
            onClick={() => {
              if (window.confirm('Discard this run? It has not been saved anywhere else.')) removePending(pending.clientId);
            }}
          >
            Discard
          </button>
        )}
      </span>
    </div>
  );
}

export default function RunsTab() {
  const [runs, setRuns] = useState<RunSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();
  const { apiFetch, needsSignIn } = useAuth();
  const { pending, syncing, syncNow } = useOutbox();
  // Refetch when a queued run leaves the outbox, so it shows up as a saved run.
  const pendingCount = pending.length;

  useEffect(() => {
    apiFetch('/api/runs')
      .then(r => { if (!r.ok) throw new Error(`${r.status}`); return r.json(); })
      .then((data: RunSummary[]) => { setRuns(data); setError(null); })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [apiFetch, pendingCount]);

  const pendingSection = pending.length > 0 && (
    <section className="stack tight" aria-label="Waiting to sync">
      <div className="pending-head">
        <span className="eyebrow">On this phone · {pending.length}</span>
        <button type="button" className="pill-btn" onClick={() => syncNow()} disabled={syncing}>
          {syncing ? 'Syncing…' : 'Sync now'}
        </button>
      </div>
      {pending.map(p => <PendingRunCard key={p.clientId} pending={p} needsSignIn={needsSignIn} />)}
    </section>
  );

  if (loading) return <div className="state-msg">Loading…</div>;

  return (
    <div className="page">
      <div>
        <div className="eyebrow">Your runs</div>
        <h1 className="h">How they felt</h1>
      </div>
      {pendingSection}
      {error ? (
        <div className="state-msg error">Couldn't load your runs ({error}).</div>
      ) : runs.length === 0 ? (
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
