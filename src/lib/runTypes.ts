// Shapes returned by the API for runs and gear.
import type { Waypoint } from '../hooks/useGPS';
import type {
  AccentKey, BodyTag, ComfortLevel, FeelLevel, GearKind, MidRunNoteKind,
  MusicHelped, MusicKind, WeatherFeel,
} from './feel';

export type WeatherIconKey = 'clear' | 'cloudy' | 'rain' | 'snow' | 'storm';

export interface WeatherSummary {
  temp_f: number;
  condition: string;
  icon: WeatherIconKey;
}

export interface Music {
  kind: MusicKind;
  title: string | null;
  by: string | null;
  helped: MusicHelped | null;
}

export interface MidRunNote {
  kind: MidRunNoteKind;
  elapsed_s: number;
}

/** A gear item as worn on one run. */
export interface RunGear {
  gear_id: string;
  name: string;
  kind: GearKind;
  color: AccentKey;
  retired: boolean;
  comfort: ComfortLevel | null;
  note: string | null;
}

// The feel fields are optional because runs saved before the run-feel
// change have none of them; screens must render those runs neutrally.
export interface RunSummary {
  id: string;
  started_at: string;
  route_summary: string;
  weather_json: WeatherSummary | null;
  feel?: FeelLevel | null;
  body_tags?: BodyTag[];
  weather_feel?: WeatherFeel[];
  music?: Music | null;
  gear?: RunGear[];
}

export interface RunFull extends RunSummary {
  ended_at: string;
  distance_meters: number;
  duration_seconds: number;
  avg_pace_seconds_per_km: number;
  waypoints: Waypoint[];
  note: string | null;
  mid_run_notes?: MidRunNote[];
}

/** A gear item in the closet, with stats across every run it was worn on. */
export interface Gear {
  id: string;
  name: string;
  kind: GearKind;
  color: AccentKey;
  retired: boolean;
  run_count: number;
  rated_count: number;
  avg_comfort: number | null;
}
