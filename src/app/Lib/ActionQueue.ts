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
      facilitySize?:       string;
      transportHours?:     number;
      useCustomThresholds: boolean;
      warningTemperature:  number;
      criticalTemperature: number;
      warningHumidity:     number;
      criticalHumidity:    number;
      humidAlertHigh?:     boolean;
    }}
  | { type: 'DELETE_DEVICE';      payload: { id: string } }
  | { type: 'UPDATE_DEVICE';      payload: { id: string; patch: Record<string, unknown> } };

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

// ── Public API ────────────────────────────────────────────────────────────────

// Enqueue an action — call this from AppContext instead of making API calls directly.
export async function enqueueAction(action: ColdWatchAction): Promise<void> {
  const db = await openDB();
  const entry: QueuedAction = {
    id:        generateId(),
    action,
    createdAt: Date.now(),
    attempts:  0,
  };

  return new Promise((resolve, reject) => {
    const tx    = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const req   = store.add(entry);
    req.onsuccess = () => resolve();
    req.onerror   = () => reject(req.error);
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