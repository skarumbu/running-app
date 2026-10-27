// The run-feel vocabulary: one typed table per scale or tag set, so screens
// look up words and colours here instead of branching on values.
//
// Tag keys are what the API stores. They mirror the tuples at the top of
// api/function_app.py (BODY_TAGS, WEATHER_FEEL_TAGS, ...); keep both in sync.

export type AccentKey = 'a1' | 'a2' | 'a3' | 'a4' | 'a5';
export const ACCENT_KEYS: readonly AccentKey[] = ['a1', 'a2', 'a3', 'a4', 'a5'];

export function isAccentKey(value: unknown): value is AccentKey {
  return typeof value === 'string' && (ACCENT_KEYS as readonly string[]).includes(value);
}

/** CSS value for an accent, e.g. `var(--a1)`. Unknown keys fall back to a neutral line colour. */
export function accentVar(key: string): string {
  return isAccentKey(key) ? `var(--${key})` : 'var(--line)';
}

/** CSS value for text drawn on top of an accent. */
export function onAccentVar(key: string): string {
  return isAccentKey(key) ? `var(--on-${key})` : 'var(--ink)';
}

export type FeelLevel = 1 | 2 | 3 | 4 | 5;

export interface FeelInfo {
  level: FeelLevel;
  word: string;
  accent: AccentKey;
}

export const FEELS: readonly FeelInfo[] = [
  { level: 1, word: 'Rough', accent: 'a5' },
  { level: 2, word: 'Meh', accent: 'a3' },
  { level: 3, word: 'Steady', accent: 'a4' },
  { level: 4, word: 'Good', accent: 'a2' },
  { level: 5, word: 'Flying', accent: 'a1' },
];

/** The feel for a stored value, or null for runs saved without one. */
export function feelOf(level: number | null | undefined): FeelInfo | null {
  return FEELS.find(f => f.level === level) ?? null;
}

export type ComfortLevel = 1 | 2 | 3;

export interface ComfortInfo {
  level: ComfortLevel;
  word: string;
  /** Past-tense phrase for sentences: "it usually felt great". */
  phrase: string;
  symbol: string;
  accent: AccentKey;
}

export const COMFORTS: readonly ComfortInfo[] = [
  { level: 1, word: 'Bothered me', phrase: 'bothered you', symbol: '–', accent: 'a5' },
  { level: 2, word: 'Fine', phrase: 'felt fine', symbol: '~', accent: 'a2' },
  { level: 3, word: 'Felt great', phrase: 'felt great', symbol: '+', accent: 'a4' },
];

/** The comfort level for a value; averages are rounded to the nearest level. */
export function comfortOf(level: number | null | undefined): ComfortInfo | null {
  if (level == null) return null;
  return COMFORTS.find(c => c.level === Math.round(level)) ?? null;
}

export interface Option<K extends string = string> {
  key: K;
  label: string;
}

export const BODY_TAGS = [
  { key: 'fresh_legs', label: 'Fresh legs' },
  { key: 'heavy_legs', label: 'Heavy legs' },
  { key: 'side_stitch', label: 'Side stitch' },
  { key: 'tight_calves', label: 'Tight calves' },
  { key: 'breathing_easy', label: 'Breathing easy' },
  { key: 'hungry', label: 'Hungry' },
  { key: 'in_the_zone', label: 'In the zone' },
] as const;
export type BodyTag = typeof BODY_TAGS[number]['key'];

export const WEATHER_FEELS = [
  { key: 'too_hot', label: 'Too hot' },
  { key: 'just_right', label: 'Just right' },
  { key: 'chilly_start', label: 'Chilly start' },
  { key: 'cold_hands', label: 'Cold hands' },
  { key: 'windy', label: 'Windy' },
  { key: 'loved_the_rain', label: 'Loved the rain' },
] as const;
export type WeatherFeel = typeof WEATHER_FEELS[number]['key'];

export const MID_RUN_NOTES = [
  { key: 'strong', label: 'Strong' },
  { key: 'hurting', label: 'Hurting' },
  { key: 'great_song', label: 'Great song' },
  { key: 'lovely_view', label: 'Lovely view' },
] as const;
export type MidRunNoteKind = typeof MID_RUN_NOTES[number]['key'];

export const MUSIC_KINDS = [
  { key: 'playlist', label: 'Playlist' },
  { key: 'album', label: 'Album' },
  { key: 'podcast', label: 'Podcast' },
  { key: 'silence', label: 'Silence' },
] as const;
export type MusicKind = typeof MUSIC_KINDS[number]['key'];

export const MUSIC_HELPED = [
  { key: 'pushed', label: 'Pushed me' },
  { key: 'background', label: 'Background' },
  { key: 'distracting', label: 'Distracting' },
] as const;
export type MusicHelped = typeof MUSIC_HELPED[number]['key'];

export const GEAR_KINDS = [
  { key: 'shoe', label: 'Shoe' },
  { key: 'top', label: 'Top' },
  { key: 'bottom', label: 'Bottom' },
  { key: 'headphones', label: 'Headphones' },
  { key: 'hat', label: 'Hat' },
  { key: 'other', label: 'Other' },
] as const;
export type GearKind = typeof GEAR_KINDS[number]['key'];

/** The display label for a stored key; unknown keys are shown as-is. */
export function labelOf(options: readonly Option[], key: string): string {
  return options.find(o => o.key === key)?.label ?? key;
}
