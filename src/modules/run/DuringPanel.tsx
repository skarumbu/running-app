import React from 'react';
import type { MusicDraft } from '../../components/RunFeelForm';
import { MID_RUN_NOTES, MUSIC_KINDS, labelOf, MidRunNoteKind } from '../../lib/feel';
import { formatDuration } from '../../lib/format';
import type { MidRunNote } from '../../lib/runTypes';

export type Unit = 'km' | 'miles';

function formatDistance(meters: number, unit: Unit): string {
  return unit === 'km' ? `${(meters / 1000).toFixed(2)} km` : `${(meters / 1609.344).toFixed(2)} mi`;
}

interface Props {
  elapsedSeconds: number;
  distanceMeters: number;
  unit: Unit;
  onToggleUnit: () => void;
  isPaused: boolean;
  gpsError: string | null;
  acquiring: boolean;
  music: MusicDraft;
  notes: MidRunNote[];
  onNote: (kind: MidRunNoteKind) => void;
  onPause: () => void;
  onResume: () => void;
  onFinish: () => void;
}

export default function DuringPanel({
  elapsedSeconds, distanceMeters, unit, onToggleUnit, isPaused, gpsError, acquiring,
  music, notes, onNote, onPause, onResume, onFinish,
}: Props) {
  const last = notes[notes.length - 1];

  return (
    <div className="page run-during">
      <div className="eyebrow">
        {isPaused ? 'Paused' : 'Running · tracking in the background'}
      </div>

      <section className="going-card stack tight" aria-live="polite">
        <div className="going-ask">How's it going?</div>
        <div className="going-word">{last ? `${labelOf(MID_RUN_NOTES, last.kind)}.` : 'Find your rhythm.'}</div>
        <div className="going-hint">
          {last ? `Noted at ${formatDuration(last.elapsed_s)}. Tap again any time.` : 'Tap to jot a feeling mid-run. It lands in your log.'}
        </div>
        <div className="row">
          {MID_RUN_NOTES.map(n => (
            <button key={n.key} type="button" className="going-chip" onClick={() => onNote(n.key)}>
              {n.label}
            </button>
          ))}
        </div>
      </section>

      {music.kind && (
        <section className="card">
          <div className="np">
            <div className="cover" style={{ background: 'linear-gradient(135deg, var(--a5), var(--a3))' }} />
            <div>
              <div className="eyebrow">{labelOf(MUSIC_KINDS, music.kind)}</div>
              <div className="h2 np-title">{music.kind === 'silence' ? 'Just you and the road' : music.title || 'Your running mix'}</div>
            </div>
          </div>
        </section>
      )}

      <button type="button" className="quiet-stats num" onClick={onToggleUnit} aria-label="Elapsed time and distance; tap to switch units">
        <span>{formatDuration(elapsedSeconds)}</span>
        <span>{formatDistance(distanceMeters, unit)}</span>
      </button>
      {acquiring && <p className="muted-line">Finding GPS…</p>}
      {gpsError && <p className="error-text">GPS: {gpsError}</p>}

      <div className="during-controls">
        <button type="button" className="big-btn outline" onClick={isPaused ? onResume : onPause}>
          {isPaused ? 'Resume' : 'Pause'}
        </button>
        <button type="button" className="big-btn ink" onClick={onFinish}>Finish</button>
      </div>
    </div>
  );
}
