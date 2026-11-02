import React from 'react';
import { formatDuration, formatRunDate } from '../../lib/format';
import type { RunCheckpoint } from '../../lib/runCheckpoint';

interface Props {
  checkpoint: RunCheckpoint;
  onResume: () => void;
  onFinish: () => void;
}

/** Shown on launch when a run was left unsaved, e.g. iOS closed the app mid-run. */
export default function ResumePrompt({ checkpoint, onResume, onFinish }: Props) {
  const { timer, phase } = checkpoint;
  const startedAt = new Date(
    (timer.segmentStartedAt ?? checkpoint.savedAt) - timer.accumulatedMs,
  ).toISOString();
  const bankedSeconds = Math.floor(
    (timer.accumulatedMs + (timer.segmentStartedAt !== null ? checkpoint.savedAt - timer.segmentStartedAt : 0)) / 1000,
  );

  return (
    <div className="page run-resume">
      <div>
        <div className="eyebrow">Unsaved run · {formatRunDate(startedAt)}</div>
        <h1 className="h">Your run is still here</h1>
        <p className="muted-line">
          <span className="num">{formatDuration(bankedSeconds)}</span> recorded before the app closed.
        </p>
      </div>
      {phase !== 'saving' && (
        <button type="button" className="big-btn" onClick={onResume}>Resume your run</button>
      )}
      <button type="button" className={phase === 'saving' ? 'big-btn' : 'big-btn ink'} onClick={onFinish}>
        Finish and save it
      </button>
    </div>
  );
}
