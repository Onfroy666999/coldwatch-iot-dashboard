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
 *   cw_jwt          — the access token (short-lived, ~15min from the backend)
 *   cw_jwt_expiry    — unix timestamp (seconds) when the access token expires
 *   cw_refresh_token — the refresh token (long-lived, ~30 days from the backend)
 *   cw_user_id       — the authenticated user's ID
 */

import { Preferences } from '@capacitor/preferences';

const KEY_TOKEN         = 'cw_jwt';
const KEY_EXPIRY        = 'cw_jwt_expiry';
const KEY_REFRESH_TOKEN = 'cw_refresh_token';
const KEY_USER          = 'cw_user_id';

interface Cache {
  token:        string | null;
  expiry:       number; // unix seconds, 0 = none stored
  refreshToken: string | null;
  userId:       string | null;
}

const cache: Cache = { token: null, expiry: 0, refreshToken: null, userId: null };

function isExpired(expiry: number): boolean {
  // Consider tokens within 60 seconds of expiry as expired — matches the
  // original localStorage-based behavior.
  return expiry !== 0 && Math.floor(Date.now() / 1000) >= expiry - 60;
}

export const ready: Promise<void> = (async () => {
  try {
    const [t, e, r, u] = await Promise.all([
      Preferences.get({ key: KEY_TOKEN }),
      Preferences.get({ key: KEY_EXPIRY }),
      Preferences.get({ key: KEY_REFRESH_TOKEN }),
      Preferences.get({ key: KEY_USER }),
    ]);
    cache.token        = t.value;
    cache.expiry       = Number(e.value ?? 0);
    cache.refreshToken = r.value;
    cache.userId       = u.value;

    // No auto-clear here on an expired access token. With the refresh-token
    // flow, an access token that expired since the app was last opened
    // (its TTL is only ~15min — see backend's auth/index.ts) is the normal,
    // expected state on almost every cold start, not a sign the whole
    // session is dead. api.ts's fetchAPI transparently renews it via the
    // still-present refresh token on the first real request. Only clear
    // everything (clearTokens()) on an explicit logout, or when the
    // refresh token itself turns out to be invalid/expired too — that path
    // lives in api.ts, not here.
  } catch (err) {
    // Hydration failure leaves the cache at its all-null default — the same
    // effective outcome as a logged-out cold start under the old
    // localStorage implementation if it ever threw.
    console.error('[tokenStorage] Failed to hydrate from Preferences:', err);
  }
})();

// Reads the `exp` claim straight out of the JWT rather than trusting a
// separately-passed duration — avoids the access-token TTL ever silently
// drifting out of sync between this file and the actual value the backend
// signs with (auth/index.ts's ACCESS_TOKEN_TTL). No signature verification
// here: this is just reading our own already-trusted token to know when to
// stop using it, not authenticating anything.
function decodeJwtExpiry(token: string): number | null {
  try {
    const payload = token.split('.')[1];
    const json = JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/')));
    return typeof json.exp === 'number' ? json.exp : null;
  } catch {
    return null;
  }
}

/** Store an access token. Its expiry is read from the token's own `exp` claim. */
export function storeToken(token: string): void {
  const expiry = decodeJwtExpiry(token) ?? Math.floor(Date.now() / 1000) + 15 * 60;
  cache.token  = token;
  cache.expiry = expiry;
  Preferences.set({ key: KEY_TOKEN,  value: token }).catch(err => {
    console.error('[tokenStorage] Failed to persist token:', err);
  });
  Preferences.set({ key: KEY_EXPIRY, value: String(expiry) }).catch(err => {
    console.error('[tokenStorage] Failed to persist token expiry:', err);
  });
}

/** Store a refresh token (long-lived, ~30 days — see backend's REFRESH_TOKEN_TTL). */
export function storeRefreshToken(refreshToken: string): void {
  cache.refreshToken = refreshToken;
  Preferences.set({ key: KEY_REFRESH_TOKEN, value: refreshToken }).catch(err => {
    console.error('[tokenStorage] Failed to persist refresh token:', err);
  });
}

/**
 * Return the stored access token if it exists and hasn't expired.
 * Deliberately does NOT clear anything when expired — the refresh token
 * needs to survive so api.ts's fetchAPI can use it to get a new access
 * token. Use hasSession() below for "is there a session at all" checks;
 * use this specifically when you need the current bearer token's value.
 */
export function getToken(): string | null {
  if (!cache.token) return null;
  if (isExpired(cache.expiry)) return null;
  return cache.token;
}

/** Return the stored refresh token, if any. */
export function getRefreshToken(): string | null {
  return cache.refreshToken;
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

/** Remove all stored auth tokens — called on logout, or when a refresh attempt itself fails. */
export function clearTokens(): void {
  cache.token        = null;
  cache.expiry       = 0;
  cache.refreshToken = null;
  cache.userId       = null;
  Preferences.remove({ key: KEY_TOKEN         }).catch(() => {});
  Preferences.remove({ key: KEY_EXPIRY        }).catch(() => {});
  Preferences.remove({ key: KEY_REFRESH_TOKEN }).catch(() => {});
  Preferences.remove({ key: KEY_USER          }).catch(() => {});
}

/**
 * True if there's a session worth restoring on cold start — a live access
 * token OR a refresh token that could mint a new one. Deliberately broader
 * than "getToken() !== null": with a short-lived (~15min) access token,
 * checking only that would force a fresh login on almost every cold start,
 * which is exactly the problem this refresh-token flow was built to fix.
 * Use this for "show dashboard or login screen" decisions; use getToken()
 * when you specifically need the current bearer token's value.
 */
export function hasSession(): boolean {
  return cache.refreshToken !== null || getToken() !== null;
}

/** @deprecated use hasSession() for cold-start checks — kept as an alias so any missed call site fails loudly via a type error instead of silently reintroducing the 15-minute-logout bug. */
export function isAuthenticated(): boolean {
  return hasSession();
}
