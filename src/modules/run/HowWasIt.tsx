import React, { useState } from 'react';
import { useAuth } from '../../AuthContext';
import RunFeelForm, { GearOption, RunFeelValues, toRunFeelPayload } from '../../components/RunFeelForm';
import WeatherCard from '../../components/WeatherCard';
import { errorFromResponse, describeRequestError } from '../../lib/apiErrors';
import { MID_RUN_NOTES, labelOf } from '../../lib/feel';
import type { Waypoint } from '../../hooks/useGPS';
import type { MidRunNote, WeatherSummary } from '../../lib/runTypes';

interface Props {
  elapsedSeconds: number;
  distanceMeters: number;
  waypoints: Waypoint[];
  midRunNotes: MidRunNote[];
  /** Gear and soundtrack picked before the run. */
  initial: RunFeelValues;
  gearOptions: GearOption[];
  /** Weather seen before the run, if any. The server fills the saved weather. */
  weather: WeatherSummary | null;
  onSaved: (runId: string) => void;
  onDiscard: () => void;
}

export default function HowWasIt({
  elapsedSeconds, distanceMeters, waypoints, midRunNotes, initial, gearOptions, weather, onSaved, onDiscard,
}: Props) {
  const { apiFetch } = useAuth();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(values: RunFeelValues) {
    setSaving(true);
    setError(null);
    try {
      const res = await apiFetch('/api/runs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          duration_seconds: elapsedSeconds,
          distance_meters: distanceMeters,
          waypoints,
          mid_run_notes: midRunNotes,
          ...toRunFeelPayload(values),
        }),
      });
      if (!res.ok) throw await errorFromResponse(res);
      const run = await res.json();
      onSaved(run.id);
    } catch (e) {
      setError(`Save failed: ${describeRequestError(e)}`);
      setSaving(false);
    }
  }

  const minutes = Math.max(1, Math.round(elapsedSeconds / 60));

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
