// Action queue — stores pending backend actions in IndexedDB when offline.
// When connection returns, the queue drains in order (oldest first).
// Adding a new action type: add it to ColdWatchAction union and handle it
// in the executor passed to drainQueue().

export type ColdWatchAction =
  | { type: 'UPDATE_SETTINGS';    payload: Record<string, unknown> }
  | { type: 'UPDATE_USER';        payload: Record<string, unknown> }
  | { type: 'ACKNOWLEDGE_ALERT';  payload: { id: string } }
  | { type: 'RESOLVE_ALERT';      payload: { id: string } }
  | { type: 'ACKNOWLEDGE_ALL_ALERTS'; payload: Record<string, never> }
  | { type: 'ADD_DEVICE'; payload: {
      name:                string;
      location:            string;
      deviceCode?:         string;
      unitName?:           string;
      crops?:              string[];
      produceMode?:        string;
      produceState?:       string;
      transportHours?:     number;
      useCustomThresholds: boolean;
      warningTemperature:  number;
      criticalTemperature: number;
      warningHumidity:     number;
      criticalHumidity:    number;
      humidAlertHigh?:     boolean;
      autoResolveMinutes?: number;
    }}
  | { type: 'DELETE_DEVICE';      payload: { id: string } }
  | { type: 'UPDATE_DEVICE';      payload: { id: string; patch: Record<string, unknown> } }
  | { type: 'DEVICE_COMMAND';     payload: { id: string; command: 'ON' | 'OFF' } };

// ── Retry classification ─────────────────────────────────────────────────────
// An action should only be queued for offline retry when the failure was
// transient (no connection, or the server itself errored). A 4xx response
// means the request was actively rejected — invalid input, already claimed,
// failed validation, etc. — and will *never* succeed by retrying, so it must
// not be queued. Every call site that enqueues an action on failure should
// gate it with this check, not just catch-and-enqueue unconditionally —
// otherwise a permanently-invalid request sits in the queue resending itself
// forever (this is what originally caused devices with codes that don't
// exist in DeviceRegistry to "come back" later once that code was claimed
// by someone else — see useDevices.ts's addDevice).
export function isRetryableError(err: any): boolean {
  const status = err?.status;
  return status === 0 || status === undefined || status >= 500;
}

export interface QueuedAction {
  id:        string;         // cuid-style unique key
  action:    ColdWatchAction;
  createdAt: number;         // Date.now()
  attempts:  number;         // how many times we've tried to send this
}

const DB_NAME    = 'coldwatch-queue';
const DB_VERSION = 1;
const STORE_NAME = 'actions';

// ── DB bootstrap ─────────────────────────────────────────────────────────────

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);

    req.onupgradeneeded = (e) => {
      const db = (e.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        store.createIndex('createdAt', 'createdAt', { unique: false });
      }
    };

    req.onsuccess = (e) => resolve((e.target as IDBOpenDBRequest).result);
    req.onerror   = (e) => reject((e.target as IDBOpenDBRequest).error);
  });
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

// ── Collapsing ────────────────────────────────────────────────────────────────
// A few action types shouldn't pile up in the queue while offline:
//   - DEVICE_COMMAND: rapid ON/OFF toggling offline used to drain as N
//     separate relay clicks in order once reconnected — wear on the
//     compressor contactor for no benefit, since only the final state
//     matters. Collapses to whichever command was issued last.
//   - UPDATE_SETTINGS / UPDATE_DEVICE: these are patch objects (global
//     settings, or a per-device patch). Two patches made offline back to
//     back should merge into one pending update, not queue as two API
//     calls where the second could stomp fields the first one set.
// Every other action type (ACKNOWLEDGE_ALERT, ADD_DEVICE, DELETE_DEVICE,
// etc.) is a one-shot action and must NOT collapse — collapseKeyFor
// returns null for those, and they enqueue exactly as before.
function collapseKeyFor(action: ColdWatchAction): { key: string; merge: boolean } | null {
  switch (action.type) {
    case 'DEVICE_COMMAND':
      return { key: `DEVICE_COMMAND:${action.payload.id}`, merge: false };
    case 'UPDATE_SETTINGS':
      return { key: 'UPDATE_SETTINGS', merge: true };
    case 'UPDATE_DEVICE':
      return { key: `UPDATE_DEVICE:${action.payload.id}`, merge: true };
    default:
      return null;
  }
}

// Merge an incoming patch-style action onto the one already queued under the
// same collapse key. Only reached for the two 'merge: true' cases above.
function mergeActionPayload(existing: ColdWatchAction, incoming: ColdWatchAction): ColdWatchAction {
  if (existing.type === 'UPDATE_SETTINGS' && incoming.type === 'UPDATE_SETTINGS') {
    return { type: 'UPDATE_SETTINGS', payload: { ...existing.payload, ...incoming.payload } };
  }
  if (existing.type === 'UPDATE_DEVICE' && incoming.type === 'UPDATE_DEVICE') {
    return {
      type: 'UPDATE_DEVICE',
      payload: {
        id:    incoming.payload.id,
        patch: { ...existing.payload.patch, ...incoming.payload.patch },
      },
    };
  }
  // Shouldn't happen — collapseKeyFor only marks merge:true for the two
  // cases above, and both branches are covered. Fall back to the newest
  // action rather than throwing if this is ever reached.
  return incoming;
}

// ── Public API ────────────────────────────────────────────────────────────────

// Enqueue an action — call this from AppContext instead of making API calls directly.
// For collapsible action types (see collapseKeyFor), this replaces or merges
// into whichever pending entry already shares that key rather than always
// appending a new one.
export async function enqueueAction(action: ColdWatchAction): Promise<void> {
  const db = await openDB();
  const collapse = collapseKeyFor(action);

  return new Promise((resolve, reject) => {
    const tx    = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);

    // store.put() both inserts (new id) and overwrites (existing id) by keyPath.
    const put = (finalAction: ColdWatchAction, id: string, createdAt: number) => {
      const entry: QueuedAction = { id, action: finalAction, createdAt, attempts: 0 };
      const req = store.put(entry);
      req.onsuccess = () => resolve();
      req.onerror   = () => reject(req.error);
    };

    if (!collapse) {
      put(action, generateId(), Date.now());
      return;
    }

    // Scan pending actions for one already sharing this collapse key. The
    // queue is small (only what accumulated while offline), so a full scan
    // here is cheap — there's no index to look this up more directly.
    const getAllReq = store.getAll();
    getAllReq.onsuccess = () => {
      const existing = (getAllReq.result as QueuedAction[])
        .find(e => collapseKeyFor(e.action)?.key === collapse.key);

      if (!existing) {
        put(action, generateId(), Date.now());
        return;
      }

      const finalAction = collapse.merge ? mergeActionPayload(existing.action, action) : action;
      // Reuse the existing entry's id/createdAt so it keeps its place in the
      // drain order instead of jumping to the back of the queue.
      put(finalAction, existing.id, existing.createdAt);
    };
    getAllReq.onerror = () => reject(getAllReq.error);
  });
}

// Get all pending actions in chronological order.
export async function getPendingActions(): Promise<QueuedAction[]> {
  const db = await openDB();

  return new Promise((resolve, reject) => {
    const tx      = db.transaction(STORE_NAME, 'readonly');
    const store   = tx.objectStore(STORE_NAME);
    const index   = store.index('createdAt');
    const req     = index.getAll();
    req.onsuccess = () => resolve(req.result as QueuedAction[]);
    req.onerror   = () => reject(req.error);
  });
}

// Get the count of pending actions — used for the UI badge.
export async function getPendingCount(): Promise<number> {
  const db = await openDB();

  return new Promise((resolve, reject) => {
    const tx      = db.transaction(STORE_NAME, 'readonly');
    const store   = tx.objectStore(STORE_NAME);
    const req     = store.count();
    req.onsuccess = () => resolve(req.result);
    req.onerror   = () => reject(req.error);
  });
}

// Remove a successfully processed action.
export async function removeAction(id: string): Promise<void> {
  const db = await openDB();

  return new Promise((resolve, reject) => {
    const tx    = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const req   = store.delete(id);
    req.onsuccess = () => resolve();
    req.onerror   = () => reject(req.error);
  });
}

// Increment attempt count on a failed action.
export async function incrementAttempts(id: string): Promise<void> {
  const db = await openDB();

  return new Promise((resolve, reject) => {
    const tx    = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const getReq = store.get(id);

    getReq.onsuccess = () => {
      const entry = getReq.result as QueuedAction | undefined;
      if (!entry) { resolve(); return; }
      const updated = { ...entry, attempts: entry.attempts + 1 };
      const putReq  = store.put(updated);
      putReq.onsuccess = () => resolve();
      putReq.onerror   = () => reject(putReq.error);
    };
    getReq.onerror = () => reject(getReq.error);
  });
}

// Drain the queue — call this when connection is restored.
// executor: async function that takes an action and sends it to the backend.
// Returns the number of actions successfully processed.
export async function drainQueue(
  executor: (action: ColdWatchAction) => Promise<void>
): Promise<number> {
  const pending = await getPendingActions();
  if (pending.length === 0) return 0;

  let processed = 0;

  for (const entry of pending) {
    try {
      await executor(entry.action);
      await removeAction(entry.id);
      processed++;
    } catch (err) {
      // A 4xx response means the server actively rejected the request
      // (invalid device code, already claimed, failed validation, etc.) —
      // retrying it will never succeed, so drop it instead of leaving it to
      // be resent forever. Only genuinely transient failures (no status /
      // offline, or 5xx) stay queued for retry.
      const status = (err as any)?.status;
      const permanent = typeof status === 'number' && status >= 400 && status < 500;
      if (permanent) {
        await removeAction(entry.id);
      } else {
        await incrementAttempts(entry.id);
      }
    }
  }

  return processed;
}

// Clear the entire queue — used on logout so stale actions don't persist.
export async function clearQueue(): Promise<void> {
  const db = await openDB();

  return new Promise((resolve, reject) => {
    const tx    = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const req   = store.clear();
    req.onsuccess = () => resolve();
    req.onerror   = () => reject(req.error);
  });
}