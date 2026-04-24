import { useEffect, useState, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { RefreshCw, CheckCircle2 } from 'lucide-react';
import { getPendingCount, getPendingActions, drainQueue } from '../Lib/ActionQueue';
import { syncApi } from '../Lib/api';
import { useApp } from '../context/AppContext';

/**
 * Execute a single action by sending batch to /sync endpoint
 * The backend handles routing each action type appropriately
 */
async function executeAction(): Promise<void> {
  const pending = await getPendingActions();
  if (pending.length === 0) return;

  // Send all pending actions to /sync endpoint
  // Backend will process and return results
  const result = await syncApi.drain(pending.map(p => p.action));
  
  if (result.failed && result.failed.length > 0) {
    throw new Error(`Sync failed: ${result.failed.length} action(s) could not be processed`);
  }
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