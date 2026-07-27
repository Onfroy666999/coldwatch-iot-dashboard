import { describe, it, expect, beforeEach, vi } from 'vitest';

// tokenStorage.ts's exported functions all update its in-memory cache
// synchronously and treat Preferences purely as a persistence side-effect
// (fire-and-forget .catch()) — so a minimal in-memory stub is enough here,
// and avoids both the "window is not defined" noise from Capacitor's real
// web-fallback implementation running under Node, and any accidental
// reliance on that failure being silently swallowed.
// vi.hoisted() is required here: vi.mock() factories are hoisted above
// regular imports/consts by vitest, so a plain `const store = new Map()`
// declared before vi.mock would still run after it, throwing a
// temporal-dead-zone error the first time the mock's get() is called.
const { store } = vi.hoisted(() => ({ store: new Map<string, string>() }));
vi.mock('@capacitor/preferences', () => ({
  Preferences: {
    get:    async ({ key }: { key: string }) => ({ value: store.get(key) ?? null }),
    set:    async ({ key, value }: { key: string; value: string }) => { store.set(key, value); },
    remove: async ({ key }: { key: string }) => { store.delete(key); },
  },
}));

import {
  storeToken,
  storeRefreshToken,
  getToken,
  getRefreshToken,
  clearTokens,
  hasSession,
} from './tokenStorage';

// Builds a syntactically-valid (unsigned) JWT with the given `exp` claim —
// storeToken() only reads the payload, it doesn't verify the signature, so
// this is enough to drive it without needing a real signing key.
function fakeJwt(expSecondsFromNow: number): string {
  const header  = btoa(JSON.stringify({ alg: 'none', typ: 'JWT' }));
  const payload = btoa(JSON.stringify({
    sub: 'user-1',
    exp: Math.floor(Date.now() / 1000) + expSecondsFromNow,
  }));
  return `${header}.${payload}.`;
}

beforeEach(() => {
  clearTokens();
});

describe('tokenStorage refresh-token handling', () => {
  it('storeToken reads expiry from the JWT exp claim, not a hardcoded duration', () => {
    storeToken(fakeJwt(3600)); // expires in 1 hour
    expect(getToken()).not.toBeNull();
  });

  it('getToken returns null once the access token has expired', () => {
    storeToken(fakeJwt(-10)); // already expired
    expect(getToken()).toBeNull();
  });

  it('regression guard: an expired access token does NOT wipe the refresh token', () => {
    // This was the actual bug found while building the refresh flow: the
    // original getToken() called clearTokens() on expiry, which also wiped
    // the refresh token — defeating the entire point of having one.
    storeToken(fakeJwt(-10)); // expired
    storeRefreshToken('a-real-refresh-token');

    expect(getToken()).toBeNull(); // access token correctly reported as gone
    expect(getRefreshToken()).toBe('a-real-refresh-token'); // but refresh token survives
  });

  it('hasSession is true with only a refresh token present (no live access token)', () => {
    storeRefreshToken('a-real-refresh-token');
    expect(getToken()).toBeNull();
    expect(hasSession()).toBe(true);
  });

  it('hasSession is false with neither token present', () => {
    expect(hasSession()).toBe(false);
  });

  it('hasSession is true with a live access token even if no refresh token was stored', () => {
    storeToken(fakeJwt(3600));
    expect(hasSession()).toBe(true);
  });

  it('clearTokens wipes both tokens and hasSession becomes false', () => {
    storeToken(fakeJwt(3600));
    storeRefreshToken('a-real-refresh-token');
    clearTokens();
    expect(getToken()).toBeNull();
    expect(getRefreshToken()).toBeNull();
    expect(hasSession()).toBe(false);
  });
});
