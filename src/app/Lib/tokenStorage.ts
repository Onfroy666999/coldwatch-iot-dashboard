/**
 * Token storage — persists the JWT and userId via Capacitor Preferences
 * (native SharedPreferences on Android, UserDefaults on iOS, localStorage
 * as the web fallback), backed by an in-memory cache.
 *
 * Previously this used localStorage directly — readable from the WebView's
 * own JS context if the WebView is ever debugged (chrome://inspect). Native
 * Preferences storage isn't part of that inspectable surface. NOTE: this is
 * NOT encryption — SharedPreferences is still readable via root/adb access
 * to the device. If that threat model matters, pair this with a dedicated
 * encrypted secure-storage plugin as a follow-up.
 *
 * Why an in-memory cache: Preferences is Promise-based, but getToken() /
 * getUserId() / isAuthenticated() are called synchronously in several
 * places that matter (useAuth.ts's useState initializers that decide
 * login-vs-dashboard on cold start, api.ts's per-request header builder,
 * useDevices.ts's reconnect check). The cache keeps all of those call
 * sites unchanged; writes go to both the cache and Preferences.
 *
 * Boot sequence: `ready` resolves once the cache has been hydrated from
 * Preferences. App.tsx blocks mounting AppProvider (and therefore every
 * synchronous getToken() read above) until `ready` resolves, so cold-start
 * "stay logged in" behavior is unaffected by the switch to async storage.
 * Any call site reading these functions before `ready` resolves would just
 * see the pre-hydration defaults (all null/logged-out).
 *
 * Keys:
 *   cw_jwt        — the JWT string
 *   cw_jwt_expiry — unix timestamp (seconds) when it expires
 *   cw_user_id    — the authenticated user's ID
 */

import { Preferences } from '@capacitor/preferences';

const KEY_TOKEN  = 'cw_jwt';
const KEY_EXPIRY = 'cw_jwt_expiry';
const KEY_USER   = 'cw_user_id';

interface Cache {
  token:  string | null;
  expiry: number; // unix seconds, 0 = none stored
  userId: string | null;
}

const cache: Cache = { token: null, expiry: 0, userId: null };

function isExpired(expiry: number): boolean {
  // Consider tokens within 60 seconds of expiry as expired — matches the
  // original localStorage-based behavior.
  return expiry !== 0 && Math.floor(Date.now() / 1000) >= expiry - 60;
}

export const ready: Promise<void> = (async () => {
  try {
    const [t, e, u] = await Promise.all([
      Preferences.get({ key: KEY_TOKEN }),
      Preferences.get({ key: KEY_EXPIRY }),
      Preferences.get({ key: KEY_USER }),
    ]);
    cache.token  = t.value;
    cache.expiry = Number(e.value ?? 0);
    cache.userId = u.value;

    if (cache.token && isExpired(cache.expiry)) {
      clearTokens();
    }
  } catch (err) {
    // Hydration failure leaves the cache at its all-null default — the same
    // effective outcome as a logged-out cold start under the old
    // localStorage implementation if it ever threw.
    console.error('[tokenStorage] Failed to hydrate from Preferences:', err);
  }
})();

/** Store a JWT and its TTL. ttlSeconds defaults to 7 days. */
export function storeToken(token: string, ttlSeconds = 7 * 24 * 3600): void {
  const expiry = Math.floor(Date.now() / 1000) + ttlSeconds;
  cache.token  = token;
  cache.expiry = expiry;
  Preferences.set({ key: KEY_TOKEN,  value: token }).catch(err => {
    console.error('[tokenStorage] Failed to persist token:', err);
  });
  Preferences.set({ key: KEY_EXPIRY, value: String(expiry) }).catch(err => {
    console.error('[tokenStorage] Failed to persist token expiry:', err);
  });
}

/** Return the stored JWT if it exists and hasn't expired. */
export function getToken(): string | null {
  if (!cache.token) return null;
  if (isExpired(cache.expiry)) {
    clearTokens();
    return null;
  }
  return cache.token;
}

/** Store the authenticated user's ID. */
export function storeUserId(id: string): void {
  cache.userId = id;
  Preferences.set({ key: KEY_USER, value: id }).catch(err => {
    console.error('[tokenStorage] Failed to persist user id:', err);
  });
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
  Preferences.remove({ key: KEY_TOKEN  }).catch(() => {});
  Preferences.remove({ key: KEY_EXPIRY }).catch(() => {});
  Preferences.remove({ key: KEY_USER   }).catch(() => {});
}

/** True if a valid, non-expired token exists. */
export function isAuthenticated(): boolean {
  return getToken() !== null;
}
