import React from 'react';
import { Link } from 'react-router-dom';
import WeatherCard from '../../components/WeatherCard';
import type { MusicDraft } from '../../components/RunFeelForm';
import { MUSIC_KINDS, accentVar } from '../../lib/feel';
import { partOfDay } from '../../lib/format';
import type { Gear, WeatherSummary } from '../../lib/runTypes';

interface Props {
  weather: WeatherSummary | null;
  /** Active gear, or null while it loads. */
  gear: Gear[] | null;
  pickedGear: string[];
  onToggleGear: (id: string) => void;
  music: MusicDraft;
  onMusic: (patch: Partial<MusicDraft>) => void;
  onStart: () => void;
}

export default function StartPanel({ weather, gear, pickedGear, onToggleGear, music, onMusic, onStart }: Props) {
  return (
    <div className="page run-start">
      <div>
        <div className="eyebrow">{partOfDay(new Date())}</div>
        <h1 className="h">Ready when<br />you are.</h1>
      </div>

      {weather && <WeatherCard weather={weather} accent="a2" />}

      <section className="card stack tight" aria-labelledby="start-wearing">
        <div className="row between">
          <h2 className="h2" id="start-wearing">Wearing today</h2>
          {gear && gear.length > 0 && <span className="eyebrow">tap to pick</span>}
        </div>
        {gear && gear.length > 0 && (
          <div className="row">
            {gear.map(g => (
              <button
                key={g.id}
                type="button"
                className="chip"
                aria-pressed={pickedGear.includes(g.id)}
                onClick={() => onToggleGear(g.id)}
              >
                <span className="dot" style={{ background: accentVar(g.color) }} />
                {g.name}
              </button>
            ))}
          </div>
        )}
        {gear && gear.length === 0 && <p className="muted-line">Your closet is empty. Add shoes, tops or headphones to track how they feel.</p>}
        <Link className="link-btn" to="/gear?add=1">+ Add gear</Link>
      </section>

      <section className="card stack tight" aria-labelledby="start-sound">
        <h2 className="h2" id="start-sound">Soundtrack</h2>
        <div className="row">
          {MUSIC_KINDS.map(k => (
            <button
              key={k.key}
              type="button"
              className="chip"
              aria-pressed={music.kind === k.key}
              onClick={() => onMusic({ kind: music.kind === k.key ? null : k.key })}
            >
              {k.label}
            </button>
          ))}
        </div>
        {music.kind && music.kind !== 'silence' && (
          <input
            className="txt"
            aria-label="What are you putting on?"
            placeholder="What are you putting on?"
            value={music.title}
            maxLength={200}
            onChange={e => onMusic({ title: e.target.value })}
          />
        )}
      </section>

      <button type="button" className="big-btn" onClick={onStart}>Start run</button>
    </div>
  );
}
