// ── offlineCache.ts ───────────────────────────────────────────────────────────
//
// Pure localStorage helpers — no React, no side effects, no imports.
// Extracted from AppContext so they can be imported by useAuth (for cache
// clearing on logout) and by the bootstrap logic without pulling in the
// entire context module.
//
// Two caches:
//   Bootstrap cache — the last successful API response (user, devices, alerts,
//   settings). Lets the app render meaningful data when the backend is offline.
//
//   Last-reading cache — the most recent temperature/humidity per device.
//   Seeded into sim state so the dashboard shows real last-known values instead
//   of placeholders when the WebSocket hasn't connected yet.

const BOOTSTRAP_CACHE_KEY = 'cw_bootstrap_cache';
const LAST_READING_PREFIX  = 'cw_last_reading_';

// ── Bootstrap cache ───────────────────────────────────────────────────────────

export interface BootstrapCache {
  user:     any;
  devices:  any[];
  alerts:   any[];
  settings: any;
  savedAt:  number;
}

export function saveBootstrapCache(data: BootstrapCache): void {
  try {
    localStorage.setItem(BOOTSTRAP_CACHE_KEY, JSON.stringify(data));
  } catch { /* storage full — fail silently, cache is best-effort */ }
}

export function loadBootstrapCache(): BootstrapCache | null {
  try {
    const raw = localStorage.getItem(BOOTSTRAP_CACHE_KEY);
    return raw ? (JSON.parse(raw) as BootstrapCache) : null;
  } catch { return null; }
}

export function clearBootstrapCache(): void {
  try { localStorage.removeItem(BOOTSTRAP_CACHE_KEY); } catch { /* */ }
}

// ── Last-reading cache ────────────────────────────────────────────────────────

export interface LastReadingEntry {
  temperature: number;
  humidity:    number;
  savedAt:     number;
}

export function saveLastReading(
  deviceId: string,
  temperature: number,
  humidity: number,
): void {
  try {
    localStorage.setItem(
      LAST_READING_PREFIX + deviceId,
      JSON.stringify({ temperature, humidity, savedAt: Date.now() }),
    );
  } catch { /* storage full */ }
}

export function loadLastReading(deviceId: string): LastReadingEntry | null {
  try {
    const raw = localStorage.getItem(LAST_READING_PREFIX + deviceId);
    return raw ? (JSON.parse(raw) as LastReadingEntry) : null;
  } catch { return null; }
}

export function clearLastReadingCache(): void {
  try {
    Object.keys(localStorage)
      .filter(k => k.startsWith(LAST_READING_PREFIX))
      .forEach(k => localStorage.removeItem(k));
  } catch { /* */ }
}
