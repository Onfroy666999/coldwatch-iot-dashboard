/**
 * JWT Token Storage and Management
 * Handles secure storage and refresh of JWT tokens
 */

const TOKEN_KEY = 'cw_auth_token';
const REFRESH_TOKEN_KEY = 'cw_refresh_token';
const USER_ID_KEY = 'cw_user_id';

export interface StoredToken {
  token: string;
  expiresAt: number;
}

/**
 * Store JWT token with expiration time
 */
export function storeToken(token: string, expiresInSeconds: number = 604800): void {
  try {
    const expiresAt = Date.now() + expiresInSeconds * 1000;
    const data: StoredToken = { token, expiresAt };
    localStorage.setItem(TOKEN_KEY, JSON.stringify(data));
  } catch (err) {
    console.error('[TokenStorage] Failed to store token:', err);
  }
}

/**
 * Store refresh token (7 days)
 */
export function storeRefreshToken(refreshToken: string): void {
  try {
    localStorage.setItem(REFRESH_TOKEN_KEY, refreshToken);
  } catch (err) {
    console.error('[TokenStorage] Failed to store refresh token:', err);
  }
}

/**
 * Store user ID for reference
 */
export function storeUserId(userId: string): void {
  try {
    localStorage.setItem(USER_ID_KEY, userId);
  } catch (err) {
    console.error('[TokenStorage] Failed to store user ID:', err);
  }
}

/**
 * Retrieve valid JWT token (returns null if expired or missing)
 */
export function getToken(): string | null {
  try {
    const stored = localStorage.getItem(TOKEN_KEY);
    if (!stored) return null;

    const data: StoredToken = JSON.parse(stored);
    if (Date.now() >= data.expiresAt) {
      // Token expired
      clearTokens();
      return null;
    }

    return data.token;
  } catch (err) {
    console.error('[TokenStorage] Failed to retrieve token:', err);
    return null;
  }
}

/**
 * Get refresh token
 */
export function getRefreshToken(): string | null {
  try {
    return localStorage.getItem(REFRESH_TOKEN_KEY);
  } catch (err) {
    console.error('[TokenStorage] Failed to retrieve refresh token:', err);
    return null;
  }
}

/**
 * Get stored user ID
 */
export function getUserId(): string | null {
  try {
    return localStorage.getItem(USER_ID_KEY);
  } catch (err) {
    console.error('[TokenStorage] Failed to retrieve user ID:', err);
    return null;
  }
}

/**
 * Check if token is still valid (not expired)
 */
export function isTokenValid(): boolean {
  const token = getToken();
  return token !== null;
}

/**
 * Clear all tokens and auth data
 */
export function clearTokens(): void {
  try {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(REFRESH_TOKEN_KEY);
    localStorage.removeItem(USER_ID_KEY);
  } catch (err) {
    console.error('[TokenStorage] Failed to clear tokens:', err);
  }
}
