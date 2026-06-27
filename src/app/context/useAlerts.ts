// ── useAlerts ─────────────────────────────────────────────────────────────────
//
// Owns everything related to alerts:
//   - alerts state and the mapAlert mapping function
//   - acknowledgeAlert / resolveAlert / acknowledgeAllAlerts
//   - periodic 30s refresh to stay in sync when WebSocket is disconnected
//   - addAlert — called by useDevices when an alert arrives over WebSocket,
//     so the WebSocket handler doesn't need to reach into this hook directly
//
// Coupling note: alerts arrive via the WebSocket which lives in useDevices
// (future hook). Rather than coupling them, useDevices calls addAlert() from
// this hook. The dependency is one-directional: useDevices knows about
// useAlerts, but useAlerts knows nothing about useDevices.

import { useState, useCallback, useEffect, useMemo } from 'react';
import { alertsApi } from '../Lib/api';
import { enqueueAction } from '../Lib/ActionQueue';
import { mapAlert } from './types';
import type { Alert } from './types';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface UseAlertsOptions {
  isAuthenticated: boolean;
}

export interface UseAlertsReturn {
  alerts: Alert[];
  unreadAlertCount: number;
  /** Seed the alert list from the bootstrap/API response — not for arbitrary mutation. */
  seedAlerts: (alerts: Alert[]) => void;
  /** Called by useDevices when an alert arrives over WebSocket. */
  addAlert: (raw: any) => void;
  acknowledgeAlert: (id: string) => void;
  resolveAlert: (id: string) => void;
  acknowledgeAllAlerts: () => void;
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useAlerts({ isAuthenticated }: UseAlertsOptions): UseAlertsReturn {
  const [alerts, setAlerts] = useState<Alert[]>([]);

  // ── Derived ───────────────────────────────────────────────────────────────

  const unreadAlertCount = useMemo(
    () => alerts.filter(a => a.status === 'new' || a.status === 'auto_resolved').length,
    [alerts],
  );

  // ── WebSocket arrival ─────────────────────────────────────────────────────
  // Called by useDevices when a { type: 'alert', data: ... } WebSocket message
  // arrives. Deduplicates by id so rapid reconnects don't duplicate entries.

  const addAlert = useCallback((raw: any) => {
    const mapped = mapAlert(raw);
    setAlerts(prev => {
      if (prev.some(a => a.id === mapped.id)) return prev;
      return [mapped, ...prev];
    });
  }, []);

  // ── Actions ───────────────────────────────────────────────────────────────

  const acknowledgeAlert = useCallback((id: string) => {
    setAlerts(prev =>
      prev.map(a => a.id === id ? { ...a, status: 'acknowledged' as const } : a),
    );
    alertsApi.acknowledge(id).catch(() => {
      enqueueAction({ type: 'ACKNOWLEDGE_ALERT', payload: { id } });
    });
  }, []);

  const resolveAlert = useCallback((id: string) => {
    setAlerts(prev =>
      prev.map(a => a.id === id ? { ...a, status: 'resolved' as const } : a),
    );
    alertsApi.resolve(id).catch(() => {
      enqueueAction({ type: 'RESOLVE_ALERT', payload: { id } });
    });
  }, []);

  const acknowledgeAllAlerts = useCallback(() => {
    setAlerts(prev =>
      prev.map(a =>
        (a.status === 'new' || a.status === 'auto_resolved')
          ? { ...a, status: 'acknowledged' as const }
          : a,
      ),
    );
    alertsApi.acknowledgeAll().catch(() => {
      enqueueAction({ type: 'ACKNOWLEDGE_ALL_ALERTS', payload: {} });
    });
  }, []);

  // ── Periodic refresh ──────────────────────────────────────────────────────
  // Keeps alerts in sync even when the WebSocket for a device isn't connected.
  // 30s is frequent enough to catch new alerts promptly without hammering the
  // backend — the WebSocket handles real-time delivery when it is connected.

  useEffect(() => {
    if (!isAuthenticated) return;
    const interval = setInterval(async () => {
      try {
        const res = await alertsApi.list({ limit: 100 });
        const fetched = (res.alerts ?? []).map(mapAlert);
        const fetchedIds = new Set(fetched.map(a => a.id));
        // Merge: keep any alerts that arrived via WebSocket since the last
        // tick and aren't in the API response yet (race window: alert just
        // fired, not yet persisted when this fetch ran).
        setAlerts(prev => {
          const fresh = prev.filter(a => !fetchedIds.has(a.id));
          return [...fresh, ...fetched];
        });
      } catch { /* offline — silently ignore, WebSocket or next tick will catch up */ }
    }, 30_000);
    return () => clearInterval(interval);
  }, [isAuthenticated]);

  // ── Seed ─────────────────────────────────────────────────────────────────
  // Used by AppProvider bootstrap to set the initial alert list from the API.
  // Intentionally not exposed as raw setAlerts — callers should not be able
  // to set arbitrary state, only seed from a known-good mapped array.
  const seedAlerts = useCallback((mapped: Alert[]) => {
    setAlerts(mapped);
  }, []);

  return {
    alerts,
    unreadAlertCount,
    seedAlerts,
    addAlert,
    acknowledgeAlert,
    resolveAlert,
    acknowledgeAllAlerts,
  };
}
