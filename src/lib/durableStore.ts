import { Capacitor } from '@capacitor/core';
import { Preferences } from '@capacitor/preferences';

// On-device storage for things that must outlive the app: the run outbox and
// the in-progress run checkpoint. On iOS this is @capacitor/preferences
// (UserDefaults), which lives in the app's own container, survives restarts
// and memory-pressure kills, and isn't subject to WebKit's website-data
// eviction the way WKWebView localStorage is. On the web it's localStorage,
// the most durable thing a browser tab has.
// Values are JSON. Only the outbox and checkpoint modules should call this.

const PREFIX = 'run.';

export async function readJson<T>(key: string): Promise<T | null> {
  const raw = Capacitor.isNativePlatform()
    ? (await Preferences.get({ key: PREFIX + key })).value
    : localStorage.getItem(PREFIX + key);
  if (raw == null) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export async function writeJson(key: string, value: unknown): Promise<void> {
  const raw = JSON.stringify(value);
  if (Capacitor.isNativePlatform()) await Preferences.set({ key: PREFIX + key, value: raw });
  else localStorage.setItem(PREFIX + key, raw);
}

export async function removeKey(key: string): Promise<void> {
  if (Capacitor.isNativePlatform()) await Preferences.remove({ key: PREFIX + key });
  else localStorage.removeItem(PREFIX + key);
}
