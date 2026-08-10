/**
 * ColdWatch API Client
 * Handles authentication, request/response formatting, and error handling.
 */

import { Capacitor } from '@capacitor/core';
import { getToken, getRefreshToken, storeToken, storeRefreshToken, storeUserId, clearTokens } from './tokenStorage';

// No /api prefix — backend registers routes at the root level
export const API_BASE_URL = (import.meta.env.VITE_API_URL as string | undefined) ?? 'http://localhost:3000';

// A native build shipped without VITE_API_URL set falls back to
// 'http://localhost:3000' — on a real Android device that's the phone's own
// loopback interface, not a dev machine, so every request fails immediately
// and looks exactly like "no internet" to the user with no way to tell the
// two apart. Surface this loudly instead: logged here for adb logcat /
// Play Console, and exposed as a flag so AppContext can show an unmissable
// toast the moment the app mounts rather than the user just assuming their
// connection is bad. Not thrown at module scope — an exception during
// import happens before React (and therefore ErrorBoundary) exists yet, so
// it would white-screen instead of ever showing that ErrorBoundary fallback.
export const API_MISCONFIGURED = Capacitor.isNativePlatform() && !import.meta.env.VITE_API_URL;
if (API_MISCONFIGURED) {
  console.error(
    '[api] Native build shipped without VITE_API_URL — falling back to ' +
    'http://localhost:3000, which will not reach the real backend from a device.'
  );
}

export interface ApiError {
  status:    number;
  error:     string;
  message:   string;
  details?:  any;
  offline?:  true; // set when the device has no network connection
}

function parseError(response: Response, data: any): ApiError {
  return {
    status:  response.status,
    error:   data?.error   || `HTTP ${response.status}`,
    message: data?.message || response.statusText,
    details: data?.issues  || data?.details,
  };
}

// ── Human-readable offline error ──────────────────────────────────────────────
// When fetch() fails with a TypeError it almost always means the device is
// offline (no network) or the backend is unreachable.  We catch it here, check
// navigator.onLine, and throw a consistent ApiError so every consumer can show
// "You are offline" instead of a raw "Failed to fetch" stack trace.
function makeOfflineError(): ApiError {
  return {
    status:  0,
    error:   'offline',
    message: navigator.onLine
      ? 'Could not reach the ColdWatch server. Please check your connection.'
      : 'You are offline. Changes will sync when you reconnect.',
    offline: true,
  };
}

// ── Silent token refresh ─────────────────────────────────────────────────────
// Access tokens are short-lived (~15min — see backend's ACCESS_TOKEN_TTL).
// Rather than surface a 401 to every screen the moment one expires mid-session,
// fetchAPI below catches it, exchanges the refresh token for a new access
// token here, and retries the original request once. Module-level (not
// per-call) so concurrent requests that all hit a stale token at once share
// a single /auth/refresh call instead of racing multiple.
let refreshInFlight: Promise<boolean> | null = null;

export async function refreshAccessToken(): Promise<boolean> {
  if (refreshInFlight) return refreshInFlight;

  refreshInFlight = (async () => {
    const refreshToken = getRefreshToken();
    if (!refreshToken) return false;

    try {
      const res = await fetch(`${API_BASE_URL}/auth/refresh`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ refreshToken }),
      });

      if (!res.ok) {
        // The refresh token itself is invalid/expired (backend said so
        // explicitly) — this session is genuinely over, not just offline.
        clearTokens();
        return false;
      }

      const data = await res.json();
      if (!data?.token || !data?.refreshToken) {
        clearTokens();
        return false;
      }

      storeToken(data.token);
      storeRefreshToken(data.refreshToken); // rotated — slides the 30-day window
      return true;
    } catch {
      // Network failure (offline / server unreachable), not a rejection —
      // deliberately don't clearTokens() here. The farmer is mid-field with
      // no signal, not logged out; the original request below will surface
      // its own "you're offline" error instead, and the still-intact
      // refresh token means the next successful connection resumes cleanly.
      return false;
    }
  })();

  try {
    return await refreshInFlight;
  } finally {
    refreshInFlight = null;
  }
}

async function fetchAPI<T = any>(endpoint: string, options: RequestInit = {}, _isRetry = false): Promise<T> {
  const url   = `${API_BASE_URL}${endpoint}`;
  const token = getToken();

  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    ...options.headers,
  };

  if (token) {
    (headers as Record<string, string>).Authorization = `Bearer ${token}`;
  }

  let response: Response;
  try {
    response = await fetch(url, { ...options, headers });
  } catch {
    // TypeError: Failed to fetch — device is offline or server is unreachable
    throw makeOfflineError();
  }

  let data: any;
  try {
    // 204 No Content has no body — attempting response.json() on an empty
    // body throws a SyntaxError which in some environments (Capacitor WebView)
    // surfaces as a network failure. Skip the parse entirely for no-body responses.
    data = response.status === 204 || response.headers.get('content-length') === '0'
      ? {}
      : await response.json();
  } catch {
    data = {};
  }

  if (!response.ok) {
    // Transparent refresh-and-retry, exactly once. Skipped for /auth/*
    // endpoints themselves — retrying a failed login/signup/refresh call
    // through this same path would either loop or make no sense (e.g. a
    // wrong-password 401 on /auth/login isn't a stale-token situation).
    const isAuthEndpoint = endpoint.startsWith('/auth/');
    if (response.status === 401 && !_isRetry && !isAuthEndpoint && getRefreshToken()) {
      const refreshed = await refreshAccessToken();
      if (refreshed) {
        return fetchAPI<T>(endpoint, options, true);
      }
    }
    throw parseError(response, data);
  }

  return data;
}

// ── Auth ──────────────────────────────────────────────────────────────────────

export const authApi = {
  signup: async (payload: {
    name:      string;
    email?:    string;
    phone?:    string;
    password:  string;
    role?:     'farmer' | 'warehouse_manager' | 'transporter' | 'other';
  }): Promise<{ user: any; token: string; refreshToken: string }> => {
    const response = await fetchAPI('/auth/signup', {
      method: 'POST',
      body:   JSON.stringify(payload),
    });
    if (response.token) {
      storeToken(response.token);
      storeUserId(response.user.id);
    }
    if (response.refreshToken) {
      storeRefreshToken(response.refreshToken);
    }
    return response;
  },

  login: async (payload: {
    identifier: string;
    password:   string;
  }): Promise<{ user: any; token: string; refreshToken: string }> => {
    const response = await fetchAPI('/auth/login', {
      method: 'POST',
      body:   JSON.stringify(payload),
    });
    if (response.token) {
      storeToken(response.token);
      storeUserId(response.user.id);
    }
    if (response.refreshToken) {
      storeRefreshToken(response.refreshToken);
    }
    return response;
  },

  requestOtp: async (identifier: string): Promise<{ message: string; via: 'sms' | 'email' | null }> =>
    fetchAPI('/auth/request-otp', { method: 'POST', body: JSON.stringify({ identifier }) }),

  verifyOtp: async (identifier: string, otp: string): Promise<{ resetToken: string }> =>
    fetchAPI('/auth/verify-otp', { method: 'POST', body: JSON.stringify({ identifier, otp }) }),

  resetPassword: async (resetToken: string, newPassword: string): Promise<{ message: string }> =>
    fetchAPI('/auth/reset-password', { method: 'POST', body: JSON.stringify({ resetToken, newPassword }) }),

  logout: async (): Promise<void> => {
    try {
      await fetchAPI('/auth/logout', { method: 'POST' });
    } catch {
      // Logout failure (including offline) shouldn't block clearing local tokens
    } finally {
      clearTokens();
    }
  },
};

// ── Devices ───────────────────────────────────────────────────────────────────

// ── Bootstrap (single round-trip app load) ────────────────────────────────────

export const bootstrapApi = {
  get: async (): Promise<{
    user:     any;
    devices:  any[];
    alerts:   any[];
    settings: any;
  }> => fetchAPI('/bootstrap'),
};

// ── Devices ───────────────────────────────────────────────────────────────────

export const devicesApi = {
  list: async (): Promise<{ devices: any[] }> =>
    fetchAPI('/devices'),

  get: async (id: string): Promise<{ device: any }> =>
    fetchAPI(`/devices/${id}`),

  create: async (payload: {
    name:                  string;
    location:              string;
    type?:                 string;
    deviceCode?:           string;
    unitName?:             string;
    tempOffset?:           number;
    humidOffset?:          number;
    useCustomThresholds?:  boolean;
    warningTemperature?:   number;
    criticalTemperature?:  number;
    warningHumidity?:      number;
    criticalHumidity?:     number;
    humidAlertHigh?:       boolean;
    produceMode?:          string;
    produceState?:         string;
    transportHours?:       number;
    crops?:                string[];
    hasActuator?:          boolean;
  }): Promise<{ device: any; apiKey: string }> =>
    fetchAPI('/devices', { method: 'POST', body: JSON.stringify(payload) }),

  update: async (id: string, patch: Record<string, any>): Promise<{ device: any }> =>
    fetchAPI(`/devices/${id}`, { method: 'PATCH', body: JSON.stringify(patch) }),

  delete: async (id: string): Promise<void> =>
    fetchAPI(`/devices/${id}`, { method: 'DELETE' }),

  // Requires password confirmation — returns the raw API key
  getApiKey: async (id: string, payload: { password: string }): Promise<{ apiKey: string }> =>
    fetchAPI(`/devices/${id}/api-key`, { method: 'POST', body: JSON.stringify(payload) }),

  // Generate a new API key — old one is invalidated immediately
  rotateApiKey: async (id: string): Promise<{ apiKey: string; message: string }> =>
    fetchAPI(`/devices/${id}/rotate-api-key`, { method: 'POST', body: JSON.stringify({}) }),

  // Manual actuator control (Start/Stop Cooling) — publishes ON/OFF over MQTT
  sendCommand: async (id: string, command: 'ON' | 'OFF'): Promise<{ ok: boolean; command: string }> =>
    fetchAPI(`/devices/${id}/command`, { method: 'POST', body: JSON.stringify({ command }) }),
};

// ── Alerts ────────────────────────────────────────────────────────────────────

export const alertsApi = {
  list: async (query?: {
    status?:    string; // comma-separated: open,acknowledged,resolved,auto_resolved
    severity?:  string; // comma-separated: warning,critical
    deviceId?:  string;
    type?:      string; // comma-separated: TEMP_HIGH,TEMP_LOW,HUMIDITY_HIGH,HUMIDITY_LOW,DEVICE_OFFLINE
    from?:      string; // ISO date string
    to?:        string;
    limit?:     number;
    offset?:    number;
    sortBy?:    'createdAt' | 'severity' | 'status';
    sortOrder?: 'asc' | 'desc';
  }): Promise<{ alerts: any[]; pagination: any }> => {
    const params = new URLSearchParams();
    if (query?.status)    params.append('status',    query.status);
    if (query?.severity)  params.append('severity',  query.severity);
    if (query?.deviceId)  params.append('deviceId',  query.deviceId);
    if (query?.type)      params.append('type',      query.type);
    if (query?.from)      params.append('from',      query.from);
    if (query?.to)        params.append('to',        query.to);
    if (query?.limit)     params.append('limit',     String(query.limit));
    if (query?.offset)    params.append('offset',    String(query.offset));
    if (query?.sortBy)    params.append('sortBy',    query.sortBy);
    if (query?.sortOrder) params.append('sortOrder', query.sortOrder);
    const qs = params.toString();
    return fetchAPI(`/alerts${qs ? '?' + qs : ''}`);
  },

  get: async (id: string): Promise<{ alert: any }> =>
    fetchAPI(`/alerts/${id}`),

  acknowledge: async (id: string): Promise<{ alert: any }> =>
    fetchAPI(`/alerts/${id}/acknowledge`, { method: 'POST' }),

  resolve: async (id: string): Promise<{ alert: any }> =>
    fetchAPI(`/alerts/${id}/resolve`, { method: 'POST' }),

  acknowledgeAll: async (): Promise<{ acknowledged: number }> =>
    fetchAPI('/alerts/acknowledge-all', { method: 'POST' }),

  delete: async (id: string): Promise<void> =>
    fetchAPI(`/alerts/${id}`, { method: 'DELETE' }),

  bulkDelete: async (query?: {
    status?:   string;
    severity?: string;
    deviceId?: string;
    type?:     string;
    from?:     string;
    to?:       string;
  }): Promise<{ deleted: number; message: string }> => {
    const params = new URLSearchParams();
    if (query?.status)   params.append('status',   query.status);
    if (query?.severity) params.append('severity', query.severity);
    if (query?.deviceId) params.append('deviceId', query.deviceId);
    if (query?.type)     params.append('type',     query.type);
    if (query?.from)     params.append('from',     query.from);
    if (query?.to)       params.append('to',       query.to);
    const qs = params.toString();
    return fetchAPI(`/alerts${qs ? '?' + qs : ''}`, { method: 'DELETE' });
  },
};

// ── Readings ──────────────────────────────────────────────────────────────────

export const readingsApi = {
  list: async (deviceId: string, query?: {
    limit?: number;
    from?:  string;
    to?:    string;
  }): Promise<{ readings: any[]; count: number }> => {
    const params = new URLSearchParams();
    if (query?.limit) params.append('limit', String(query.limit));
    if (query?.from)  params.append('from',  query.from);
    if (query?.to)    params.append('to',    query.to);
    const qs = params.toString();
    return fetchAPI(`/readings/${deviceId}${qs ? '?' + qs : ''}`);
  },

  latest: async (deviceId: string): Promise<{ reading: any }> =>
    fetchAPI(`/readings/${deviceId}/latest`),
};

// ── Settings ──────────────────────────────────────────────────────────────────

export const settingsApi = {
  get: async (): Promise<{ settings: any }> =>
    fetchAPI('/settings'),

  update: async (payload: Record<string, any>): Promise<{ settings: any }> =>
    fetchAPI('/settings', { method: 'PATCH', body: JSON.stringify(payload) }),
};

// ── Users ─────────────────────────────────────────────────────────────────────

export const usersApi = {
  me: async (): Promise<{ user: any }> =>
    fetchAPI('/users/me'),

  updateProfile: async (payload: {
    name?:              string;
    email?:             string;
    phone?:             string;
    notificationEmail?: string;
    notificationPhone?: string;
    role?:              string;
    surveyComplete?:    boolean;
  }): Promise<{ user: any }> =>
    fetchAPI('/users/me', { method: 'PATCH', body: JSON.stringify(payload) }),

  changePassword: async (payload: {
    currentPassword: string;
    newPassword:     string;
  }): Promise<{ message: string }> =>
    fetchAPI('/users/me/change-password', { method: 'POST', body: JSON.stringify(payload) }),

  registerPushToken: async (token: string): Promise<{ message: string }> =>
    fetchAPI('/users/me/push-token', { method: 'POST', body: JSON.stringify({ token }) }),

  removePushToken: async (): Promise<{ message: string }> =>
    fetchAPI('/users/me/push-token', { method: 'DELETE' }),

  deleteAccount: async (): Promise<{ message: string }> =>
    fetchAPI('/users/me', { method: 'DELETE' }),
};

// ── Sync (offline queue drain) ────────────────────────────────────────────────

export const syncApi = {
  drain: async (actions: any[]): Promise<{
    results:   Array<{ id: string; type: string; status: 'ok' | 'error'; error?: string; permanent?: boolean }>;
    succeeded: number;
    failed:    number;
  }> =>
    fetchAPI('/sync', { method: 'POST', body: JSON.stringify({ actions }) }),
};

// ── Produce Records ───────────────────────────────────────────────────────────

export const produceRecordsApi = {
  create: async (payload: {
    deviceId:              string;
    deviceCode?:           string;
    unitName?:             string;
    conditionOnRemoval:    string;
    conditionImageBase64?: string;
    conditionImageMime?:   string;
    aiAssessment?:         string;
    storageDurationDays:   number;
    produceMode?:          string;
    crops?:                string[];
  }): Promise<{ record: any }> =>
    fetchAPI('/produce-records', { method: 'POST', body: JSON.stringify(payload) }),

  list: async (): Promise<{ records: any[] }> =>
    fetchAPI('/produce-records'),
};

// ── AI Insights ───────────────────────────────────────────────────────────────

export const insightsApi = {
  list: async (deviceId: string): Promise<{ insights: AIInsight[] }> =>
    fetchAPI(`/insights/${deviceId}`),
};

export interface AIInsight {
  id:        string;
  type:      string;
  title:     string;
  body:      string;
  severity:  'info' | 'warning';
  updatedAt: string;
}

// ── WebSocket ─────────────────────────────────────────────────────────────────
// Token is passed as a query parameter — the backend verifies it on the
// upgrade request before the WebSocket handshake completes.
//
// Single multiplexed connection per user, not one per device — the backend's
// /ws endpoint (see websocket.ts) delivers every device this user owns over
// this one socket, with each message self-identifying via a `deviceId` field
// (see useDevices.ts's openWebSocket, which routes on it).

export function connectWebSocket(
  onMessage: (data: any) => void,
  onError?:  (error: any) => void,
  onClose?:  () => void
): WebSocket | null {
  try {
    const token = getToken();
    if (!token) {
      console.error('[WebSocket] No auth token — cannot connect');
      return null;
    }

    // Convert http(s) base URL to ws(s) and append token as query param
    const wsBase = API_BASE_URL.replace(/^http/, 'ws');
    const wsUrl  = `${wsBase}/ws?token=${encodeURIComponent(token)}`;
    const ws     = new WebSocket(wsUrl);

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        onMessage(data);
      } catch (err) {
        console.error('[WebSocket] Failed to parse message:', err);
      }
    };

    ws.onerror = (event) => {
      console.error('[WebSocket] Error:', event);
      onError?.(event);
    };

    ws.onclose = () => {
      console.log('[WebSocket] Disconnected');
      onClose?.();
    };

    return ws;
  } catch (err) {
    console.error('[WebSocket] Failed to connect:', err);
    onError?.(err);
    return null;
  }
}

// ── AI Proxy ──────────────────────────────────────────────────────────────────
// Routes Groq calls through the backend so the API key never touches the browser.

export const aiApi = {
  chat: async (payload: {
    model:        string;
    messages:     Array<{ role: string; content: any }>;
    temperature?: number;
    max_tokens?:  number;
  }): Promise<any> =>
    fetchAPI('/ai/chat', { method: 'POST', body: JSON.stringify(payload) }),

  vision: async (payload: {
    base64Image: string;
    mimeType:    string;
    deviceId?:   string; // links the assessment to a device's history server-side
  }): Promise<{ detectedProduce: string | null; state: string; confidence: string; explanation: string }> =>
    fetchAPI('/ai/vision', { method: 'POST', body: JSON.stringify(payload) }),

  // GET /ai/assessments/:deviceId — a device's produce assessment history,
  // most recent first. Useful for showing past check-ins on a device, or
  // feeding history into a future AI context.
  assessmentsForDevice: async (deviceId: string): Promise<{ assessments: any[]; count: number }> =>
    fetchAPI(`/ai/assessments/${deviceId}`),
};
