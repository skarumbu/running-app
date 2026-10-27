import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  BODY_TAGS, COMFORTS, FEELS, MUSIC_HELPED, MUSIC_KINDS, WEATHER_FEELS,
  accentVar, comfortOf, onAccentVar,
  AccentKey, BodyTag, ComfortLevel, FeelLevel, GearKind, MusicHelped, MusicKind, WeatherFeel,
} from '../lib/feel';
import type { Music, RunFull, RunGear } from '../lib/runTypes';
import { GearKindIcon } from './Icons';
import './components.css';
import './runFeelForm.css';

export interface GearChoice {
  gear_id: string;
  comfort: ComfortLevel | null;
  note: string;
}

export interface MusicDraft {
  kind: MusicKind | null;
  title: string;
  by: string;
  helped: MusicHelped | null;
}

export interface RunFeelValues {
  feel: FeelLevel | null;
  body_tags: BodyTag[];
  weather_feel: WeatherFeel[];
  gear: GearChoice[];
  music: MusicDraft;
  note: string;
}

export interface GearOption {
  id: string;
  name: string;
  kind: GearKind;
  color: AccentKey;
  retired: boolean;
}

export const EMPTY_MUSIC: MusicDraft = { kind: null, title: '', by: '', helped: null };

export function emptyRunFeelValues(): RunFeelValues {
  return { feel: null, body_tags: [], weather_feel: [], gear: [], music: EMPTY_MUSIC, note: '' };
}

export function runFeelValuesFromRun(run: RunFull): RunFeelValues {
  return {
    feel: run.feel ?? null,
    body_tags: run.body_tags ?? [],
    weather_feel: run.weather_feel ?? [],
    gear: (run.gear ?? []).map(g => ({ gear_id: g.gear_id, comfort: g.comfort, note: g.note ?? '' })),
    music: run.music
      ? { kind: run.music.kind, title: run.music.title ?? '', by: run.music.by ?? '', helped: run.music.helped }
      : EMPTY_MUSIC,
    note: run.note ?? '',
  };
}

/** The run-feel part of a POST or PATCH /api/runs body. */
export function toRunFeelPayload(values: RunFeelValues) {
  const { music } = values;
  const musicPayload: Music | null = music.kind
    ? { kind: music.kind, title: music.title.trim() || null, by: music.by.trim() || null, helped: music.helped }
    : null;
  return {
    feel: values.feel,
    body_tags: values.body_tags,
    weather_feel: values.weather_feel,
    music: musicPayload,
    note: values.note.trim() || null,
    gear: values.gear.map(g => ({ gear_id: g.gear_id, comfort: g.comfort, note: g.note.trim() || null })),
  };
}

export function gearOptionsFromRun(gear: RunGear[] | undefined): GearOption[] {
  return (gear ?? []).map(g => ({ id: g.gear_id, name: g.name, kind: g.kind, color: g.color, retired: g.retired }));
}

function toggle<T>(list: T[], value: T): T[] {
  return list.includes(value) ? list.filter(v => v !== value) : [...list, value];
}

interface Props {
  initial: RunFeelValues;
  /** Gear the runner can pick from; retired items only show if already picked. */
  gearOptions: GearOption[];
  /** The weather card, or a hint when weather isn't known yet. */
  weatherSlot: React.ReactNode;
  submitLabel: string;
  submitting: boolean;
  error: string | null;
  onSubmit: (values: RunFeelValues) => void;
  footer?: React.ReactNode;
}

export default function RunFeelForm({
  initial, gearOptions, weatherSlot, submitLabel, submitting, error, onSubmit, footer,
}: Props) {
  const [values, setValues] = useState<RunFeelValues>(initial);
  const set = (patch: Partial<RunFeelValues>) => setValues(v => ({ ...v, ...patch }));
  const setMusic = (patch: Partial<MusicDraft>) => setValues(v => ({ ...v, music: { ...v.music, ...patch } }));
  const setGear = (gearId: string, patch: Partial<GearChoice>) =>
    setValues(v => ({ ...v, gear: v.gear.map(g => (g.gear_id === gearId ? { ...g, ...patch } : g)) }));

  const pickedIds = values.gear.map(g => g.gear_id);
  const visibleGear = gearOptions.filter(g => !g.retired || pickedIds.includes(g.id));
  const gearById = new Map(gearOptions.map(g => [g.id, g]));

  function toggleGear(id: string) {
    setValues(v => ({
      ...v,
      gear: v.gear.some(g => g.gear_id === id)
        ? v.gear.filter(g => g.gear_id !== id)
        : [...v.gear, { gear_id: id, comfort: null, note: '' }],
    }));
  }

  return (
    <form
      className="stack run-feel-form"
      onSubmit={e => { e.preventDefault(); onSubmit(values); }}
    >
      <section className="card stack tight" aria-labelledby="rf-felt">
        <h3 className="h2" id="rf-felt">You felt</h3>
        <div className="feel-grid" role="group" aria-label="How the run felt">
          {FEELS.map(f => (
            <button
              key={f.level}
              type="button"
              className="feel-btn"
              aria-pressed={values.feel === f.level}
              onClick={() => set({ feel: values.feel === f.level ? null : f.level })}
            >
              <span className="blob" style={{ background: accentVar(f.accent) }} />
              {f.word}
            </button>
          ))}
        </div>
        <div className="row">
          {BODY_TAGS.map(t => (
            <button
              key={t.key}
              type="button"
              className="chip"
              aria-pressed={values.body_tags.includes(t.key)}
              onClick={() => set({ body_tags: toggle(values.body_tags, t.key) })}
            >
              {t.label}
            </button>
          ))}
        </div>
      </section>

      <section className="card stack tight" aria-labelledby="rf-gear">
        <h3 className="h2" id="rf-gear">Your gear</h3>
        {visibleGear.length === 0 ? (
          <p className="muted-line">
            Nothing in your closet yet. <Link className="link-btn strong" to="/gear?add=1">Add gear</Link>
          </p>
        ) : (
          <div className="row">
            {visibleGear.map(g => (
              <button
                key={g.id}
                type="button"
                className="chip"
                aria-pressed={pickedIds.includes(g.id)}
                onClick={() => toggleGear(g.id)}
              >
                <span className="dot" style={{ background: accentVar(g.color) }} />
                {g.name}
              </button>
            ))}
          </div>
        )}
        {values.gear.map(choice => {
          const g = gearById.get(choice.gear_id);
          if (!g) return null;
          const comfort = comfortOf(choice.comfort);
          return (
            <div className="gear-comfort" key={choice.gear_id}>
              <div className="gear-row">
                <div className="gear-ic" style={{ background: accentVar(g.color), color: onAccentVar(g.color) }}>
                  <GearKindIcon kind={g.kind} />
                </div>
                <div className="gear-row-text">
                  <b>{g.name}</b>
                  <div className="muted-line">{comfort ? comfort.word : 'How did it feel?'}</div>
                </div>
                <div className="comfort" role="group" aria-label={`How ${g.name} felt`}>
                  {COMFORTS.map(c => {
                    const on = choice.comfort === c.level;
                    return (
                      <button
                        key={c.level}
                        type="button"
                        aria-label={c.word}
                        aria-pressed={on}
                        style={on ? { background: accentVar(c.accent), color: onAccentVar(c.accent) } : undefined}
                        onClick={() => setGear(choice.gear_id, { comfort: on ? null : c.level })}
                      >
                        {c.symbol}
                      </button>
                    );
                  })}
                </div>
              </div>
              <input
                className="txt small"
                aria-label={`Note about ${g.name}`}
                placeholder="Anything about it? (optional)"
                value={choice.note}
                maxLength={500}
                onChange={e => setGear(choice.gear_id, { note: e.target.value })}
              />
            </div>
          );
        })}
      </section>

      <section className="card stack tight" aria-labelledby="rf-weather">
        {weatherSlot}
        <h3 className="h2" id="rf-weather">The weather felt</h3>
        <div className="row">
          {WEATHER_FEELS.map(w => (
            <button
              key={w.key}
              type="button"
              className="chip"
              aria-pressed={values.weather_feel.includes(w.key)}
              onClick={() => set({ weather_feel: toggle(values.weather_feel, w.key) })}
            >
              {w.label}
            </button>
          ))}
        </div>
      </section>

      <section className="card stack tight" aria-labelledby="rf-ears">
        <h3 className="h2" id="rf-ears">In your ears</h3>
        <div className="row">
          {MUSIC_KINDS.map(k => (
            <button
              key={k.key}
              type="button"
              className="chip"
              aria-pressed={values.music.kind === k.key}
              onClick={() => setMusic({ kind: values.music.kind === k.key ? null : k.key })}
            >
              {k.label}
            </button>
          ))}
        </div>
        {values.music.kind && values.music.kind !== 'silence' && (
          <>
            <input
              className="txt"
              aria-label="Title"
              placeholder="Title"
              value={values.music.title}
              maxLength={200}
              onChange={e => setMusic({ title: e.target.value })}
            />
            <input
              className="txt"
              aria-label="Artist or by"
              placeholder="Artist or by"
              value={values.music.by}
              maxLength={200}
              onChange={e => setMusic({ by: e.target.value })}
            />
          </>
        )}
        {values.music.kind && (
          <div className="row">
            <span className="muted-line">Did it help?</span>
            {MUSIC_HELPED.map(h => (
              <button
                key={h.key}
                type="button"
                className="chip small"
                aria-pressed={values.music.helped === h.key}
                onClick={() => setMusic({ helped: values.music.helped === h.key ? null : h.key })}
              >
                {h.label}
              </button>
            ))}
          </div>
        )}
      </section>

      <section className="card stack tight" aria-labelledby="rf-note">
        <h3 className="h2" id="rf-note">Anything else?</h3>
        <textarea
          id="rf-note-text"
          className="txt"
          aria-labelledby="rf-note"
          placeholder="Blister on left heel, saw three herons…"
          value={values.note}
          maxLength={2000}
          onChange={e => set({ note: e.target.value })}
        />
      </section>

      {error && <p className="error-text" role="alert">{error}</p>}
      <button type="submit" className="big-btn" disabled={submitting}>
        {submitting ? 'Saving…' : submitLabel}
      </button>
      {footer}
    </form>
  );
}
