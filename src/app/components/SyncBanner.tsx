import { useEffect, useState, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { RefreshCw, CheckCircle2 } from 'lucide-react';
import { getPendingCount, getPendingActions, drainQueue, type ColdWatchAction } from '../Lib/ActionQueue';
import { syncApi, alertsApi, devicesApi, settingsApi, usersApi } from '../Lib/api';
import { useApp } from '../context/AppContext';

// ── Real action executor — routes each queued action to the correct API call ──
async function executeAction(action: ColdWatchAction): Promise<void> {
  switch (action.type) {
    case 'UPDATE_SETTINGS':
      await settingsApi.update(action.payload as Record<string, any>);
      break;

    case 'UPDATE_USER':
      await usersApi.updateProfile(action.payload as { name?: string; email?: string; phone?: string });
      break;

    case 'ACKNOWLEDGE_ALERT':
      await alertsApi.acknowledge(action.payload.id);
      break;

    case 'RESOLVE_ALERT':
      await alertsApi.resolve(action.payload.id);
      break;

    case 'ACKNOWLEDGE_ALL_ALERTS':
      await alertsApi.acknowledgeAll();
      break;

    case 'ADD_DEVICE':
      await devicesApi.create({
        name:                action.payload.name,
        location:            action.payload.location,
        type:                'fridge',
        deviceCode:          action.payload.deviceCode,
        unitName:            action.payload.unitName,
        produceMode:         action.payload.produceMode,
        produceState:        action.payload.produceState,
        facilitySize:        action.payload.facilitySize as any,
        transportHours:      action.payload.transportHours,
        useCustomThresholds: action.payload.useCustomThresholds,
        warningTemperature:  action.payload.warningTemperature,
        criticalTemperature: action.payload.criticalTemperature,
        warningHumidity:     action.payload.warningHumidity,
        criticalHumidity:    action.payload.criticalHumidity,
        humidAlertHigh:      action.payload.humidAlertHigh,
        hasActuator:         false,
      });
      break;

    case 'DELETE_DEVICE':
      await devicesApi.delete(action.payload.id);
      break;

    case 'UPDATE_DEVICE':
      await devicesApi.update(action.payload.id, action.payload.patch as Record<string, any>);
      break;

    default:
      // Unknown action type — drain it so it doesn't block the queue forever
      console.warn('[SyncBanner] Unknown action type, skipping:', (action as any).type);
      break;
  }
}

export default function SyncBanner() {
  const { isOnline } = useApp();
  const [pendingCount, setPendingCount] = useState(0);
  const [syncing,      setSyncing]      = useState(false);
  const [justSynced,   setJustSynced]   = useState(false);
  const [syncError,    setSyncError]    = useState(false);
  const drainInProgress                 = useRef(false);

  // Poll pending count every 3s so badge stays accurate
  useEffect(() => {
    let cancelled = false;

    async function refresh() {
      try {
        const count = await getPendingCount();
        if (!cancelled) setPendingCount(count);
      } catch { /* IndexedDB unavailable */ }
    }

    refresh();
    const interval = setInterval(refresh, 3000);
    return () => { cancelled = true; clearInterval(interval); };
  }, []);

  // Drain queue when we come back online
  useEffect(() => {
    if (!isOnline || drainInProgress.current || pendingCount === 0) return;

    async function drain() {
      drainInProgress.current = true;
      setSyncing(true);
      setSyncError(false);

      try {
        // Try batch sync first — sends all actions in one POST /sync request
        const pending = await getPendingActions();
        if (pending.length > 0) {
          try {
            const result = await syncApi.drain(pending.map(p => ({
              id:        p.id,
              action:    p.action,
              createdAt: p.createdAt,
              attempts:  p.attempts,
            })));
            if (result.succeeded > 0) {
              const newCount = await getPendingCount();
              setPendingCount(newCount);
              if (newCount === 0) {
                setJustSynced(true);
                setTimeout(() => setJustSynced(false), 3000);
              }
            }
          } catch {
            // Batch sync failed (e.g. 404 on /sync) — fall back to individual calls
            const processed = await drainQueue(executeAction);
            if (processed > 0) {
              const newCount = await getPendingCount();
              setPendingCount(newCount);
              if (newCount === 0) {
                setJustSynced(true);
                setTimeout(() => setJustSynced(false), 3000);
              }
            }
          }
        }
      } catch (err) {
        console.error('[SyncBanner] Drain failed:', err);
        setSyncError(true);
        setTimeout(() => setSyncError(false), 5000);
      } finally {
        setSyncing(false);
        drainInProgress.current = false;
      }
    }

    drain();
  }, [isOnline, pendingCount]);

  const show = pendingCount > 0 || syncing || justSynced || syncError;

  const bgColor = justSynced ? '#27AE60'
    : syncError   ? '#C0392B'
    : '#E67E22';

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          initial={{ y: -40, opacity: 0 }}
          animate={{ y: 0,   opacity: 1 }}
          exit={{    y: -40, opacity: 0 }}
          transition={{ duration: 0.22, ease: 'easeOut' }}
          className="fixed top-0 left-0 right-0 z-40 flex items-center justify-center gap-2 px-4 py-2 text-white text-xs font-medium"
          style={{ backgroundColor: bgColor }}
        >
          {justSynced ? (
            <>
              <CheckCircle2 className="w-3.5 h-3.5 flex-shrink-0" />
              Changes synced successfully
            </>
          ) : syncError ? (
            <>
              <RefreshCw className="w-3.5 h-3.5 flex-shrink-0" />
              Sync failed — will retry when online
            </>
          ) : syncing ? (
            <>
              <RefreshCw className="w-3.5 h-3.5 flex-shrink-0 animate-spin" />
              Syncing {pendingCount} pending {pendingCount === 1 ? 'change' : 'changes'}…
            </>
          ) : (
            <>
              <RefreshCw className="w-3.5 h-3.5 flex-shrink-0" />
              {pendingCount} {pendingCount === 1 ? 'change' : 'changes'} pending — will sync when online
            </>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
