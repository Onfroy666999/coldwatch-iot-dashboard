// ── useSettings ───────────────────────────────────────────────────────────────
//
// Owns everything related to user settings:
//   - settings state (initialised to DEFAULT_SETTINGS)
//   - updateSettings — optimistic local update + API call + offline queue
//   - compactMode shortcut + setCompactMode
//   - seedSettings — for AppProvider bootstrap to inject the server value
//
// Coupling note: autoLogoutMinutes is read by useAuth for the inactivity timer.
// Rather than importing useAuth here, AppProvider reads settings.autoLogoutMinutes
// and passes it into useAuth({ autoLogoutMinutes }) — same pattern as before.

import { useState, useCallback, useEffect } from 'react';
import { settingsApi } from '../Lib/api';
import { enqueueAction, isRetryableError } from '../Lib/ActionQueue';
import { DEFAULT_SETTINGS, mapSettings } from './types';
import type { Settings } from './types';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface UseSettingsReturn {
  settings: Settings;
  compactMode: boolean;
  setCompactMode: (v: boolean) => void;
  updateSettings: (patch: Partial<Settings>) => void;
  /** Seed settings from the bootstrap/API response. Not for arbitrary mutation. */
  seedSettings: (raw: Record<string, unknown>) => void;
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useSettings(): UseSettingsReturn {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);

  // ── compactMode ───────────────────────────────────────────────────────────
  // Derived from settings — exposed as a shortcut so consumers don't have to
  // read settings.compactMode everywhere, matching the existing context API.

  const compactMode = settings.compactMode;

  // Apply to the DOM whenever compactMode changes — covers both the toggle
  // (below) and the initial server-seeded value from seedSettings, since
  // both flow through this same `settings.compactMode` read. Mirrors the
  // [data-compact="true"] selector already defined in theme.css; setting
  // this on <html> means every descendant .compact-p/.compact-gap/
  // .compact-card element picks it up with no per-page wiring.
  useEffect(() => {
    document.documentElement.dataset.compact = String(compactMode);
  }, [compactMode]);

  const setCompactMode = useCallback((v: boolean) => {
    setSettings(prev => ({ ...prev, compactMode: v }));
    settingsApi.update({ compactMode: v }).catch(err => {
      if (isRetryableError(err)) {
        enqueueAction({ type: 'UPDATE_SETTINGS', payload: { compactMode: v } });
      }
    });
  }, []);

  // ── updateSettings ────────────────────────────────────────────────────────
  // Optimistic: apply locally first, then sync to backend. Queues for retry
  // if the call fails (offline or transient error).

  const updateSettings = useCallback((patch: Partial<Settings>) => {
    setSettings(prev => ({ ...prev, ...patch }));
    settingsApi.update(patch as Record<string, unknown>).catch(err => {
      if (isRetryableError(err)) {
        enqueueAction({ type: 'UPDATE_SETTINGS', payload: patch as Record<string, unknown> });
      }
    });
  }, []);

  // ── seedSettings ──────────────────────────────────────────────────────────
  // Called by AppProvider after bootstrap to replace DEFAULT_SETTINGS with the
  // server's actual values. Raw backend object goes through mapSettings for
  // type safety — same mapping AppContext already uses.

  const seedSettings = useCallback((raw: Record<string, unknown>) => {
    setSettings(mapSettings(raw));
  }, []);

  return {
    settings,
    compactMode,
    setCompactMode,
    updateSettings,
    seedSettings,
  };
}
