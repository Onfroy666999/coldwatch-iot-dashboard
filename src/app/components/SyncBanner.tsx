import { useEffect, useState, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { RefreshCw, CheckCircle2 } from 'lucide-react';
import { getPendingCount, drainQueue } from '../Lib/ActionQueue';
import { useApp } from '../context/AppContext';

// When the backend is ready, replace this stub with real API calls.
// For now it silently succeeds so the queue drains without errors.
async function executeAction(): Promise<void> {
  // TODO: replace with actual API call per action.type
  // e.g. case 'UPDATE_SETTINGS': await api.post('/settings', action.payload)
  return Promise.resolve();
}

export default function SyncBanner() {
  const { isOnline } = useApp();
  const [pendingCount, setPendingCount]   = useState(0);
  const [syncing, setSyncing]             = useState(false);
  const [justSynced, setJustSynced]       = useState(false);
  const drainInProgress                   = useRef(false);

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
      try {
        const processed = await drainQueue(executeAction);
        if (processed > 0) {
          setPendingCount(0);
          setJustSynced(true);
          // Hide the "synced" confirmation after 3 seconds
          setTimeout(() => setJustSynced(false), 3000);
        }
      } catch { /* retry next tick */ } finally {
        setSyncing(false);
        drainInProgress.current = false;
      }
    }

    drain();
  }, [isOnline, pendingCount]);

  const show = pendingCount > 0 || syncing || justSynced;

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          initial={{ y: -40, opacity: 0 }}
          animate={{ y: 0,   opacity: 1 }}
          exit={{    y: -40, opacity: 0 }}
          transition={{ duration: 0.22, ease: 'easeOut' }}
          className="fixed top-0 left-0 right-0 z-40 flex items-center justify-center gap-2 px-4 py-2 text-white text-xs font-medium"
          style={{ backgroundColor: justSynced ? '#27AE60' : '#E67E22' }}
        >
          {justSynced ? (
            <>
              <CheckCircle2 className="w-3.5 h-3.5 flex-shrink-0" />
              Changes synced successfully
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