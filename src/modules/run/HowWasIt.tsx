import React, { useState } from 'react';
import { useAuth } from '../../AuthContext';
import RunFeelForm, { GearOption, RunFeelValues, toRunFeelPayload } from '../../components/RunFeelForm';
import WeatherCard from '../../components/WeatherCard';
import { describeRequestError } from '../../lib/apiErrors';
import { Owner, RunPayload, enqueue, postRunWith, sendPending } from '../../lib/outbox';
import { MID_RUN_NOTES, labelOf } from '../../lib/feel';
import type { Waypoint } from '../../hooks/useGPS';
import type { MidRunNote, WeatherSummary } from '../../lib/runTypes';

interface Props {
  /** The client's id for this run; resending it never makes a second run. */
  clientId: string;
  /** The account that started the run (null if unknown); only it uploads the run. */
  owner: Owner | null;
  /** When Finish was tapped, ISO. */
  endedAt: string;
  elapsedSeconds: number;
  distanceMeters: number;
  waypoints: Waypoint[];
  midRunNotes: MidRunNote[];
  /** Gear and soundtrack picked before the run. */
  initial: RunFeelValues;
  gearOptions: GearOption[];
  /** Weather seen before the run, if any. The server fills the saved weather. */
  weather: WeatherSummary | null;
  /** The run is safely in the on-phone outbox (the in-progress checkpoint can go). */
  onStoredLocally: () => void;
  onSaved: (runId: string) => void;
  /** Upload failed for now; the run waits in the outbox. */
  onQueuedDone: () => void;
  onDiscard: () => void;
}

export default function HowWasIt({
  clientId, owner, endedAt, elapsedSeconds, distanceMeters, waypoints, midRunNotes, initial, gearOptions, weather,
  onStoredLocally, onSaved, onQueuedDone, onDiscard,
}: Props) {
  const { apiFetch, ensureFreshToken, user } = useAuth();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [queued, setQueued] = useState<{ needsSignIn: boolean; notMine?: boolean } | null>(null);

  // On the phone first, then the upload: a failed upload can't lose the run.
  async function save(values: RunFeelValues) {
    setSaving(true);
    setError(null);
    const payload: RunPayload = {
      id: clientId,
      ended_at: endedAt,
      duration_seconds: elapsedSeconds,
      distance_meters: distanceMeters,
      waypoints,
      mid_run_notes: midRunNotes,
      ...toRunFeelPayload(values),
    };
    try {
      await enqueue(payload, owner);
    } catch (e) {
      setError(`Couldn't save on this phone: ${describeRequestError(e)}`);
      setSaving(false);
      return;
    }
    onStoredLocally();
    if (!(await ensureFreshToken())) {
      setQueued({ needsSignIn: true });
      return;
    }
    const result = await sendPending(clientId, postRunWith(apiFetch), user?.googleId);
    if (result.ok) {
      onSaved(result.runId);
    } else if (result.retryable) {
      setQueued({ needsSignIn: result.needsSignIn, notMine: result.notMine });
    } else {
      // The server rejected it (e.g. gear that isn't yours): fixable here.
      // It stays in the outbox, so leaving now still keeps it.
      setError(`Save failed: ${result.error}`);
      setSaving(false);
    }
  }

  const minutes = Math.max(1, Math.round(elapsedSeconds / 60));

  if (queued) {
    return (
      <div className="page run-log">
        <div>
          <div className="eyebrow">Just now · {minutes} min out there</div>
          <h1 className="h">Saved on this phone</h1>
        </div>
        <section className="card stack tight" role="status">
          <p className="queued-line">
            {queued.notMine
              ? owner
                ? `Saved on this phone, will sync when ${owner.email} signs in.`
                : 'Saved on this phone. Upload it from Runs.'
              : queued.needsSignIn
                ? "Saved on this phone, will sync when you're signed in."
                : 'Saved on this phone, will sync when the connection is back.'}
          </p>
          <p className="muted-line">It's waiting in Runs. Nothing is lost.</p>
        </section>
        <button type="button" className="big-btn" onClick={onQueuedDone}>Done</button>
      </div>
    );
  }

  return (
    <div className="page run-log">
      <div>
        <div className="eyebrow">Just now · {minutes} min out there</div>
        <h1 className="h">How was it?</h1>
        {midRunNotes.length > 0 && (
          <p className="muted-line along-the-way">
            Along the way: {midRunNotes.map(n => labelOf(MID_RUN_NOTES, n.kind)).join(' · ')}
          </p>
        )}
      </div>
      <RunFeelForm
        initial={initial}
        gearOptions={gearOptions}
        weatherSlot={weather
          ? <WeatherCard weather={weather} compact extra="before you set off" />
          : <p className="muted-line">Weather is added when you save.</p>}
        submitLabel="Save this run"
        submitting={saving}
        error={error}
        onSubmit={save}
        footer={
          <button type="button" className="link-btn discard-btn" onClick={onDiscard} disabled={saving}>
            Discard this run
          </button>
        }
      />
    </div>
  );
}
