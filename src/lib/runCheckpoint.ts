import { readJson, removeKey, writeJson } from './durableStore';
import type { MusicDraft } from '../components/RunFeelForm';
import type { Waypoint } from '../hooks/useGPS';
import type { MidRunNote } from './runTypes';
import type { TimerSnapshot } from '../hooks/useRunTimer';

// The run in progress, written to durable storage as it goes so a run
// survives iOS killing the app. Written on start, pause, resume, each mid-run
// note, finish, and at most every CHECKPOINT_INTERVAL_MS while waypoints are
// arriving (piggybacking on GPS wake-ups the app already gets; no timer).
// Cleared when the run is saved to the outbox or discarded.

export const CHECKPOINT_INTERVAL_MS = 30000;

export type CheckpointPhase = 'running' | 'paused' | 'saving';

export interface RunCheckpoint {
  clientId: string;
  phase: CheckpointPhase;
  timer: TimerSnapshot;
  waypoints: Waypoint[];
  distanceMeters: number;
  pickedGear: string[];
  music: MusicDraft;
  midRunNotes: MidRunNote[];
  /** When the run was finished (phase 'saving'), ISO. */
  endedAt: string | null;
  savedAt: number;
}

const KEY = 'checkpoint.v1';

export function loadCheckpoint(): Promise<RunCheckpoint | null> {
  return readJson<RunCheckpoint>(KEY);
}

export function saveCheckpoint(checkpoint: Omit<RunCheckpoint, 'savedAt'>): Promise<void> {
  return writeJson(KEY, { ...checkpoint, savedAt: Date.now() });
}

export function clearCheckpoint(): Promise<void> {
  return removeKey(KEY);
}
