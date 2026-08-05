import { App } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import { API_BASE_URL } from './api';

const VERSION_PATTERN = /^\d+(\.\d+)*$/;

/**
 * Compares two dot-separated version strings segment by segment (e.g.
 * "1.2" vs "1.10.1"). Missing trailing segments are treated as 0, so "1.2"
 * and "1.2.0" compare equal. Returns negative if a < b, positive if a > b,
 * 0 if equal — including when either string isn't version-like (empty,
 * non-numeric, malformed). That last case matters: JS's `Number('')` is 0,
 * not NaN, so without an upfront format check an empty string would
 * silently compare as version "0" and read as "less than everything",
 * incorrectly forcing an update. checkVersion() is documented to fail open
 * on anything it can't confidently compare — this keeps that promise.
 */
export function compareVersions(a: string, b: string): number {
  if (!VERSION_PATTERN.test(a) || !VERSION_PATTERN.test(b)) return 0;

  const aParts = a.split('.').map(Number);
  const bParts = b.split('.').map(Number);
  const len = Math.max(aParts.length, bParts.length);

  for (let i = 0; i < len; i++) {
    const x = aParts[i] ?? 0;
    const y = bParts[i] ?? 0;
    if (x !== y) return x - y;
  }
  return 0;
}

export interface VersionCheckResult {
  updateRequired: boolean;
  currentVersion: string | null;
  minSupportedVersion: string | null;
}

/**
 * Checks the installed app's version against the backend's minimum
 * supported version. Native only — a web session is always the latest
 * deployed build on load, so there's no "stuck on an old version" case
 * to catch there.
 *
 * Fails OPEN on every error path (network failure, non-OK response,
 * unreachable backend): a version-check hiccup should never itself block
 * a user from using the app. The only way updateRequired becomes true is
 * a successful comparison that actually finds the installed version below
 * the server's stated minimum.
 */
export async function checkVersion(): Promise<VersionCheckResult> {
  if (!Capacitor.isNativePlatform()) {
    return { updateRequired: false, currentVersion: null, minSupportedVersion: null };
  }

  try {
    const [{ version: currentVersion }, res] = await Promise.all([
      App.getInfo(),
      fetch(`${API_BASE_URL}/version`),
    ]);

    if (!res.ok) {
      return { updateRequired: false, currentVersion, minSupportedVersion: null };
    }

    const { minSupportedVersion } = (await res.json()) as { minSupportedVersion: string };
    const updateRequired = compareVersions(currentVersion, minSupportedVersion) < 0;

    return { updateRequired, currentVersion, minSupportedVersion };
  } catch (err) {
    console.error('[versionCheck] Failed to check app version:', err);
    return { updateRequired: false, currentVersion: null, minSupportedVersion: null };
  }
}
