import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../../AuthContext';
import RouteMap from './RouteMap';
import WeatherCard from '../../components/WeatherCard';
import { ChevronIcon, GearKindIcon } from '../../components/Icons';
import RunFeelForm, {
  RunFeelValues, gearOptionsFromRun, runFeelValuesFromRun, toRunFeelPayload,
} from '../../components/RunFeelForm';
import {
  BODY_TAGS, MID_RUN_NOTES, MUSIC_HELPED, MUSIC_KINDS, WEATHER_FEELS,
  accentVar, comfortOf, feelOf, labelOf, onAccentVar,
} from '../../lib/feel';
import { formatDuration, formatPace, formatRunDate } from '../../lib/format';
import { errorFromResponse, describeRequestError } from '../../lib/apiErrors';
import { useGearList } from '../../lib/useGearList';
import type { RunFull } from '../../lib/runTypes';
import '../../components/components.css';
import '../../components/runFeelForm.css';
import './runs.css';

function RunEditor({ run, onSaved, onCancel }: { run: RunFull; onSaved: (run: RunFull) => void; onCancel: () => void }) {
  const { apiFetch } = useAuth();
  const { gear } = useGearList();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Gear already on the run stays pickable even if it has since been retired.
  const options = gearOptionsFromRun(run.gear);
  for (const g of gear ?? []) if (!options.some(o => o.id === g.id)) options.push(g);

  async function save(values: RunFeelValues) {
    setSaving(true);
    setError(null);
    try {
      const res = await apiFetch(`/api/runs/${run.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(toRunFeelPayload(values)),
      });
      if (!res.ok) throw await errorFromResponse(res);
      onSaved(await res.json());
    } catch (e) {
      setError(`Couldn't save: ${describeRequestError(e)}`);
      setSaving(false);
    }
  }

  return (
    <div className="page">
      <div>
        <div className="eyebrow">{formatRunDate(run.started_at)}</div>
        <h1 className="h">Edit this run</h1>
      </div>
      <RunFeelForm
        initial={runFeelValuesFromRun(run)}
        gearOptions={options}
        weatherSlot={run.weather_json ? <WeatherCard weather={run.weather_json} compact /> : null}
        submitLabel="Save changes"
        submitting={saving}
        error={error}
        onSubmit={save}
        footer={<button type="button" className="link-btn discard-btn" onClick={onCancel}>Cancel</button>}
      />
    </div>
  );
}

export default function RunDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { apiFetch } = useAuth();
  const [run, setRun] = useState<RunFull | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [numbersOpen, setNumbersOpen] = useState(false);
  const [editing, setEditing] = useState(false);
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

  if (loading) return <div className="state-msg">Loading…</div>;
  if (error || !run) return <div className="state-msg error">Couldn't load this run ({error}).</div>;

  if (editing) {
    return <RunEditor run={run} onSaved={r => { setRun(r); setEditing(false); }} onCancel={() => setEditing(false)} />;
  }

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
      setRun(await r.json());
      setEditingNote(false);
    } catch (e) {
      // Leave edit mode open so the user can retry; the rest of the run
      // data already loaded, so this isn't fatal to the page.
    } finally {
      setSavingNote(false);
    }
  }

  const feel = feelOf(run.feel);
  const heroAccent = feel?.accent;
  const weatherFeel = (run.weather_feel ?? []).map(w => labelOf(WEATHER_FEELS, w));
  const gear = run.gear ?? [];
  const midRunNotes = run.mid_run_notes ?? [];

  return (
    <div className="page run-detail">
      <div className="row between">
        <button type="button" className="link-btn" onClick={() => navigate('/runs')}>&larr; Runs</button>
        <button type="button" className="pill-btn" onClick={() => setEditing(true)}>Edit</button>
      </div>

      <section
        className={`detail-hero stack tight${feel ? '' : ' neutral'}`}
        style={heroAccent ? { background: accentVar(heroAccent), color: onAccentVar(heroAccent) } : undefined}
      >
        <div className="detail-hero-when">{formatRunDate(run.started_at)}</div>
        <h1 className="detail-hero-feel">{feel ? `Felt ${feel.word.toLowerCase()}.` : 'How did it feel?'}</h1>
        <div className="detail-hero-route">{run.route_summary}</div>
        {(run.body_tags ?? []).length > 0 && (
          <div className="row">
            {run.body_tags!.map(t => <span key={t} className="tag hero-tag">{labelOf(BODY_TAGS, t)}</span>)}
          </div>
        )}
        {!feel && <button type="button" className="link-btn strong hero-add" onClick={() => setEditing(true)}>Add how it felt &rsaquo;</button>}
      </section>

      <section className="card note-card">
        {editingNote ? (
          <div className="stack tight">
            <textarea
              className="txt"
              aria-label="Note"
              value={noteDraft}
              onChange={e => setNoteDraft(e.target.value)}
              placeholder="How did this run feel?"
            />
            <div className="row note-actions">
              <button type="button" className="pill-btn" onClick={() => setEditingNote(false)} disabled={savingNote}>Cancel</button>
              <button type="button" className="pill-btn primary" onClick={saveNote} disabled={savingNote}>Save</button>
            </div>
          </div>
        ) : run.note ? (
          <button type="button" className="note-text" onClick={startEditingNote}>&ldquo;{run.note}&rdquo;</button>
        ) : (
          <button type="button" className="note-empty" onClick={startEditingNote}>Tap to add a note about this run &rsaquo;</button>
        )}
      </section>

      {run.weather_json && <WeatherCard weather={run.weather_json} extra={weatherFeel.join(', ')} />}
      {!run.weather_json && weatherFeel.length > 0 && (
        <div className="card muted-line">The weather felt: {weatherFeel.join(', ')}</div>
      )}

      {gear.length > 0 && (
        <section className="card stack tight">
          <h2 className="h2">Gear</h2>
          {gear.map(g => {
            const comfort = comfortOf(g.comfort);
            return (
              <div className="gear-row detail-gear" key={g.gear_id}>
                <div className="gear-ic" style={{ background: accentVar(g.color), color: onAccentVar(g.color) }}>
                  <GearKindIcon kind={g.kind} />
                </div>
                <div className="gear-row-text">
                  <b>{g.name}</b>
                  {g.note && <div className="muted-line">{g.note}</div>}
                </div>
                {comfort && (
                  <span className="tag" style={{ background: accentVar(comfort.accent), color: onAccentVar(comfort.accent) }}>
                    {comfort.word}
                  </span>
                )}
              </div>
            );
          })}
        </section>
      )}

      {run.music && (
        <section className="card">
          <div className="np">
            <div className="cover" style={{ background: 'linear-gradient(135deg, var(--a5), var(--a1))' }} />
            <div>
              <div className="eyebrow">{labelOf(MUSIC_KINDS, run.music.kind)}</div>
              <div className="h2 np-title">{run.music.kind === 'silence' ? 'Silence' : run.music.title || 'Untitled'}</div>
              {run.music.by && <div className="muted-line">{run.music.by}</div>}
            </div>
          </div>
          {run.music.helped && (
            <div className="row music-helped"><span className="tag">{labelOf(MUSIC_HELPED, run.music.helped)}</span></div>
          )}
        </section>
      )}

      {midRunNotes.length > 0 && (
        <section className="card stack tight">
          <h2 className="h2">Along the way</h2>
          <div className="row">
            {midRunNotes.map((n, i) => (
              <span className="tag" key={i}>
                {labelOf(MID_RUN_NOTES, n.kind)} <span className="num">{formatDuration(n.elapsed_s)}</span>
              </span>
            ))}
          </div>
        </section>
      )}

      <div className="detail-map">
        <RouteMap waypoints={run.waypoints} />
      </div>

      <section className={`numbers${numbersOpen ? ' open' : ''}`}>
        <button type="button" className="numbers-toggle" aria-expanded={numbersOpen} onClick={() => setNumbersOpen(o => !o)}>
          <span>By the numbers</span>
          <span className="numbers-chevron"><ChevronIcon /></span>
        </button>
        {numbersOpen && (
          <div className="numbers-grid">
            <div><b className="num">{(run.distance_meters / 1000).toFixed(2)}</b><span>km</span></div>
            <div><b className="num">{formatDuration(run.duration_seconds)}</b><span>time</span></div>
            <div><b className="num">{formatPace(run.avg_pace_seconds_per_km)}</b><span>/km</span></div>
          </div>
        )}
      </section>
    </div>
  );
}
