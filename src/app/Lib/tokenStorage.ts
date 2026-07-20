/**
 * Token storage — persists the JWT and userId via @capacitor/preferences
 * (native SharedPreferences on Android) instead of localStorage.
 *
 * Why this migration: localStorage sits inside the WebView's own JS-
 * inspectable storage — reachable via chrome://inspect if the WebView is
 * ever debugged. Preferences moves it outside that surface. This is a real,
 * meaningful fix for that specific exposure, but it is NOT encryption —
 * Preferences on Android is an unencrypted wrapper over SharedPreferences,
 * same security tier as localStorage against a rooted device or physical
 * extraction of the app's storage file. True encryption-at-rest would need
 * a dedicated secure-storage plugin backed by the Android Keystore, which
 * is a separate, larger piece of work — deliberately out of scope here.
 *
 * Preferences is Promise-based; there's no synchronous read. But several
 * call sites depend on synchronous access — three useState(() => getToken())
 * initializers in useAuth.ts gate whether the app opens to login or the
 * dashboard on cold start, plus synchronous reads in api.ts's per-request
 * header builder and useDevices.ts's reconnect logic. Rewriting all of
 * those to be async would be a much larger, riskier change touching many
 * files. Instead, every exported function here stays synchronous — backed
 * by an in-memory cache that's write-through to Preferences. Real
 * persistence happens as a fire-and-forget async write; every synchronous
 * read below serves straight from the cache.
 *
 * That cache has to be populated from Preferences before anything reads it,
 * or the app would open to a false "logged out" state on every cold start
 * even for a user with a perfectly valid stored session. hydrateTokenCache()
 * exists for exactly that — App.tsx awaits it once, before AppProvider ever
 * mounts (see AppGate in App.tsx), so useAuth's synchronous initializers
 * see the real persisted values on their very first render.
 *
 * Keys:
 *   cw_jwt        — the JWT string
 *   cw_jwt_expiry — unix timestamp (seconds) when it expires
 *   cw_user_id    — the authenticated user's ID
 */

import { Preferences } from '@capacitor/preferences';

const KEY_SESSION = 'cw_session'; // { token, expiry } as one JSON value
const KEY_USER     = 'cw_user_id';

const cache: { token: string | null; expiry: number; userId: string | null } = {
  token:  null,
  expiry: 0,
  userId: null,
};

let hydrated = false;
let hydrating: Promise<void> | null = null;

/**
 * Populates the in-memory cache from Preferences. Must be awaited exactly
 * once, before the app renders anything that reads a token — see AppGate
 * in App.tsx. Safe to call more than once (idempotent, shares the in-flight
 * promise) in case more than one call site ever needs to await it.
 */
export function hydrateTokenCache(): Promise<void> {
  if (hydrated) return Promise.resolve();
  if (hydrating) return hydrating;

  hydrating = (async () => {
    try {
      const [session, u] = await Promise.all([
        Preferences.get({ key: KEY_SESSION }),
        Preferences.get({ key: KEY_USER }),
      ]);
      if (session.value) {
        try {
          const parsed = JSON.parse(session.value) as { token: string; expiry: number };
          cache.token  = parsed.token  ?? null;
          cache.expiry = parsed.expiry ?? 0;
        } catch {
          // Corrupt value (shouldn't happen — we control every write) —
          // treat as no session rather than throwing.
        }
      }
      cache.userId = u.value ?? null;
    } catch {
      // Preferences unavailable (e.g. Capacitor not initialized yet, or
      // running in a plain browser tab during web dev) — cache stays at
      // its default logged-out state, same as a missing localStorage key
      // would have behaved before this migration.
    }
    hydrated = true;
  })();

  return hydrating;
}

/** Store a JWT and its TTL. ttlSeconds defaults to 7 days. */
export function storeToken(token: string, ttlSeconds = 7 * 24 * 3600): void {
  const expiry = Math.floor(Date.now() / 1000) + ttlSeconds;
  cache.token  = token;
  cache.expiry = expiry;
  // Token and expiry as one write, not two — otherwise a process kill
  // between two separate Preferences.set() calls could persist a token
  // with no expiry, and getToken()'s expiry check below is gated behind
  // `if (cache.expiry && ...)`, so a missing (falsy) expiry would silently
  // disable expiration checking entirely on the next cold start.
  Preferences.set({ key: KEY_SESSION, value: JSON.stringify({ token, expiry }) }).catch(() => {});
}

/** Return the stored JWT if it exists and hasn't expired. */
export function getToken(): string | null {
  if (!cache.token) return null;
  // Consider tokens within 60 seconds of expiry as expired
  if (cache.expiry && Math.floor(Date.now() / 1000) >= cache.expiry - 60) {
    clearTokens();
    return null;
  }
  return cache.token;
}

/** Store the authenticated user's ID. */
export function storeUserId(id: string): void {
  cache.userId = id;
  Preferences.set({ key: KEY_USER, value: id }).catch(() => {});
}

/** Return the stored user ID. */
export function getUserId(): string | null {
  return cache.userId;
}

/** Remove all stored auth tokens — called on logout. */
export function clearTokens(): void {
  cache.token  = null;
  cache.expiry = 0;
  cache.userId = null;
  Preferences.remove({ key: KEY_SESSION }).catch(() => {});
  Preferences.remove({ key: KEY_USER    }).catch(() => {});
}

/** True if a valid, non-expired token exists. */
export function isAuthenticated(): boolean {
  return getToken() !== null;
}
