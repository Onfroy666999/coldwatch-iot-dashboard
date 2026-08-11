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

import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { Haptics, NotificationType } from '@capacitor/haptics';
import { alertsApi } from '../Lib/api';
import { enqueueAction, isRetryableError } from '../Lib/ActionQueue';
import { mapAlert } from './types';
import type { Alert } from './types';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface UseAlertsOptions {
  isAuthenticated: boolean;
}

export interface UseAlertsReturn {
  alerts: Alert[];
  unreadAlertCount: number;
  /** Latest critical-alert message for the aria-live announcer — see App.tsx. */
  criticalAnnouncement: string;
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
  // Screen-reader announcement for critical alerts — read by the aria-live
  // region in App.tsx. A trailing zero-width space is toggled on/off each
  // time so that two critical alerts with identical text back-to-back still
  // register as a DOM content change (aria-live only fires on actual
  // changes), without the toggle itself being audible to the screen reader.
  const [criticalAnnouncement, setCriticalAnnouncement] = useState('');
  const announcementSeq = useRef(0);

  // ── Derived ───────────────────────────────────────────────────────────────

  const unreadAlertCount = useMemo(
    () => alerts.filter(a => a.status === 'new' || a.status === 'auto_resolved').length,
    [alerts],
  );

  // ── WebSocket arrival ─────────────────────────────────────────────────────
  // Called by useDevices when a { type: 'alert', data: ... } WebSocket message
  // arrives. Deduplicates by id so rapid reconnects don't duplicate entries.

  // Tracks every alert id we've already seen (from bootstrap seeding or a
  // prior WS arrival) purely so the haptic feedback below fires exactly
  // once per alert. Deliberately not derived from `alerts` state itself —
  // the actual state update happens via setAlerts' functional form, which
  // React may invoke more than once (e.g. StrictMode) and must stay a pure
  // function with no side effects; this ref is what lets us fire the
  // haptic outside of that, in the addAlert call itself.
  const seenAlertIds = useRef<Set<string>>(new Set());

  // Shared by both arrival paths (WebSocket via addAlert, and the periodic
  // refresh below when the socket is disconnected) so a critical alert gets
  // announced to screen readers no matter how it arrives.
  const announceCritical = useCallback((message: string) => {
    announcementSeq.current += 1;
    const zwsp = announcementSeq.current % 2 === 0 ? '\u200B' : '';
    setCriticalAnnouncement(`Critical alert: ${message}${zwsp}`);
  }, []);

  const addAlert = useCallback((raw: any) => {
    const mapped = mapAlert(raw);
    if (seenAlertIds.current.has(mapped.id)) return;
    seenAlertIds.current.add(mapped.id);

    if (mapped.severity === 'critical') {
      // Fire-and-forget: on web this is a graceful no-op, and a failure
      // here (e.g. no native bridge) shouldn't block the alert itself
      // from being added to the list.
      Haptics.notification({ type: NotificationType.Error }).catch(() => {});
      announceCritical(mapped.message);
    }

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
    alertsApi.acknowledge(id).catch(err => {
      if (isRetryableError(err)) {
        enqueueAction({ type: 'ACKNOWLEDGE_ALERT', payload: { id } });
      }
    });
  }, []);

  const resolveAlert = useCallback((id: string) => {
    setAlerts(prev =>
      prev.map(a => a.id === id ? { ...a, status: 'resolved' as const } : a),
    );
    alertsApi.resolve(id).catch(err => {
      if (isRetryableError(err)) {
        enqueueAction({ type: 'RESOLVE_ALERT', payload: { id } });
      }
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
    alertsApi.acknowledgeAll().catch(err => {
      if (isRetryableError(err)) {
        enqueueAction({ type: 'ACKNOWLEDGE_ALL_ALERTS', payload: {} });
      }
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
        // Catch critical alerts this tick is seeing for the first time — the
        // WebSocket path already announces on arrival via addAlert, but if
        // the socket was disconnected when this alert fired, this is the
        // only place it'll ever get announced. Batched into one announcement
        // rather than one setCriticalAnnouncement call per alert, since React
        // would otherwise batch those calls and only the last message would
        // actually reach the live region.
        const newCritical = fetched.filter(a => a.severity === 'critical' && !seenAlertIds.current.has(a.id));
        if (newCritical.length === 1) {
          announceCritical(newCritical[0].message);
        } else if (newCritical.length > 1) {
          announceCritical(`${newCritical.length} new critical alerts — ${newCritical.map(a => a.message).join('; ')}`);
        }
        for (const a of fetched) seenAlertIds.current.add(a.id);
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
  }, [isAuthenticated, announceCritical]);

  // ── Seed ─────────────────────────────────────────────────────────────────
  // Used by AppProvider bootstrap to set the initial alert list from the API.
  // Intentionally not exposed as raw setAlerts — callers should not be able
  // to set arbitrary state, only seed from a known-good mapped array.
  const seedAlerts = useCallback((mapped: Alert[]) => {
    for (const a of mapped) seenAlertIds.current.add(a.id);
    setAlerts(mapped);
  }, []);

  return {
    alerts,
    unreadAlertCount,
    criticalAnnouncement,
    seedAlerts,
    addAlert,
    acknowledgeAlert,
    resolveAlert,
    acknowledgeAllAlerts,
  };
}
