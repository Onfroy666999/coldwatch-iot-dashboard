/**
 * Token storage — persists the JWT and userId in localStorage.
 *
 * Using localStorage (not sessionStorage) so the user stays logged in
 * across browser/app restarts. The token is checked on app init in
 * AppContext to rehydrate the session without another login round-trip.
 *
 * Keys:
 *   cw_jwt        — the JWT string
 *   cw_jwt_expiry — unix timestamp (seconds) when it expires
 *   cw_user_id    — the authenticated user's ID
 */

const KEY_TOKEN  = 'cw_jwt';
const KEY_EXPIRY = 'cw_jwt_expiry';
const KEY_USER   = 'cw_user_id';

/** Store a JWT and its TTL. ttlSeconds defaults to 7 days. */
export function storeToken(token: string, ttlSeconds = 7 * 24 * 3600): void {
  try {
    const expiry = Math.floor(Date.now() / 1000) + ttlSeconds;
    localStorage.setItem(KEY_TOKEN,  token);
    localStorage.setItem(KEY_EXPIRY, String(expiry));
  } catch { /* ignore — storage quota exceeded */ }
}

/** Return the stored JWT if it exists and hasn't expired. */
export function getToken(): string | null {
  try {
    const token  = localStorage.getItem(KEY_TOKEN);
    const expiry = Number(localStorage.getItem(KEY_EXPIRY) ?? 0);
    if (!token) return null;
    // Consider tokens within 60 seconds of expiry as expired
    if (expiry && Math.floor(Date.now() / 1000) >= expiry - 60) {
      clearTokens();
      return null;
    }
    return token;
  } catch {
    return null;
  }
}

/** Store the authenticated user's ID. */
export function storeUserId(id: string): void {
  try { localStorage.setItem(KEY_USER, id); } catch { /* */ }
}

/** Return the stored user ID. */
export function getUserId(): string | null {
  try { return localStorage.getItem(KEY_USER); } catch { return null; }
}

/** Remove all stored auth tokens — called on logout. */
export function clearTokens(): void {
  try {
    localStorage.removeItem(KEY_TOKEN);
    localStorage.removeItem(KEY_EXPIRY);
    localStorage.removeItem(KEY_USER);
  } catch { /* */ }
}

/** True if a valid, non-expired token exists. */
export function isAuthenticated(): boolean {
  return getToken() !== null;
}
