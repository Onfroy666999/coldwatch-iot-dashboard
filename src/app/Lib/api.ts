/**
 * API Client for ColdWatch Backend
 * Handles authentication, request/response formatting, and error handling
 */

import { getToken, storeToken, storeRefreshToken, storeUserId, clearTokens } from './tokenStorage';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000/api';

export interface ApiResponse<T = any> {
  error?: string;
  message?: string;
  [key: string]: any;
  data?: T;
}

export interface ApiError {
  status: number;
  error: string;
  message: string;
  details?: any;
}

/**
 * Parse error response
 */
function parseError(response: Response, data: any): ApiError {
  return {
    status: response.status,
    error: data?.error || `HTTP ${response.status}`,
    message: data?.message || response.statusText,
    details: data?.issues || data?.details,
  };
}

/**
 * Fetch helper with auth and error handling
 */
async function fetchAPI<T = any>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const url = `${API_BASE_URL}${endpoint}`;
  const token = getToken();

  // Build headers
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    ...options.headers,
  };

  // Add auth token if available
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetch(url, {
    ...options,
    headers,
  });

  let data: any;
  try {
    data = await response.json();
  } catch {
    data = {};
  }

  // Handle non-2xx responses
  if (!response.ok) {
    const error = parseError(response, data);
    throw error;
  }

  return data;
}

/**
 * Authentication API calls
 */
export const authApi = {
  /**
   * Sign up a new user
   */
  signup: async (payload: {
    name: string;
    email?: string;
    password: string;
    role?: 'farmer' | 'warehouse_manager' | 'transporter' | 'other';
  }): Promise<{ user: any; token: string; expiresIn: number }> => {
    const response = await fetchAPI('/auth/signup', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    
    if (response.token) {
      storeToken(response.token, response.expiresIn || 604800);
      storeUserId(response.user.id);
    }
    
    return response;
  },

  /**
   * Login with username/email and password
   */
  login: async (payload: {
    identifier: string; // username or email
    password: string;
  }): Promise<{ user: any; token: string; expiresIn: number }> => {
    const response = await fetchAPI('/auth/login', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    
    if (response.token) {
      storeToken(response.token, response.expiresIn || 604800);
      storeUserId(response.user.id);
    }
    
    return response;
  },

  /**
   * Logout (clears token on frontend)
   */
  logout: async (): Promise<void> => {
    try {
      await fetchAPI('/auth/logout', { method: 'POST' });
    } catch {
      // Logout failure shouldn't block clearing local tokens
    } finally {
      clearTokens();
    }
  },
};

/**
 * Devices API calls
 */
export const devicesApi = {
  /**
   * Get all devices for authenticated user
   */
  list: async (): Promise<{ devices: any[] }> => {
    return fetchAPI('/devices');
  },

  /**
   * Get single device
   */
  get: async (id: string): Promise<{ device: any }> => {
    return fetchAPI(`/devices/${id}`);
  },

  /**
   * Create new device
   */
  create: async (payload: {
    name: string;
    location: string;
    type: string;
    tempOffset?: number;
    humidOffset?: number;
    useCustomThresholds?: boolean;
    warningTemperature?: number;
    criticalTemperature?: number;
    warningHumidity?: number;
    criticalHumidity?: number;
    humidAlertHigh?: boolean;
    produceMode?: string;
    produceState?: string;
    facilitySize?: string;
    transportHours?: number;
    hasActuator?: boolean;
  }): Promise<{ device: any }> => {
    return fetchAPI('/devices', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  /**
   * Update device
   */
  update: async (
    id: string,
    payload: Record<string, any>
  ): Promise<{ device: any }> => {
    return fetchAPI(`/devices/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    });
  },

  /**
   * Delete device
   */
  delete: async (id: string): Promise<void> => {
    await fetchAPI(`/devices/${id}`, { method: 'DELETE' });
  },

  /**
   * Get device API key
   */
  getApiKey: async (id: string, payload: { password: string }): Promise<{ apiKey: string }> => {
    return fetchAPI(`/devices/${id}/api-key`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  /**
   * Rotate device API key
   */
  rotateApiKey: async (id: string): Promise<{ apiKey: string }> => {
    return fetchAPI(`/devices/${id}/api-key/rotate`, {
      method: 'POST',
      body: JSON.stringify({}),
    });
  },
};

/**
 * Alerts API calls
 */
export const alertsApi = {
  /**
   * Get all alerts with optional filters
   */
  list: async (query?: {
    status?: string; // comma-separated: open,acknowledged,resolved,auto_resolved
    severity?: string; // comma-separated: warning,critical
    deviceId?: string;
    type?: string; // comma-separated: TEMP_HIGH,TEMP_LOW,HUMIDITY_HIGH,HUMIDITY_LOW,DEVICE_OFFLINE
    from?: string; // ISO date string
    to?: string; // ISO date string
    limit?: number;
    offset?: number;
    sortBy?: 'createdAt' | 'severity' | 'status';
    sortOrder?: 'asc' | 'desc';
  }): Promise<{ alerts: any[]; pagination: any }> => {
    const params = new URLSearchParams();
    if (query?.status) params.append('status', query.status);
    if (query?.severity) params.append('severity', query.severity);
    if (query?.deviceId) params.append('deviceId', query.deviceId);
    if (query?.type) params.append('type', query.type);
    if (query?.from) params.append('from', query.from);
    if (query?.to) params.append('to', query.to);
    if (query?.limit) params.append('limit', String(query.limit));
    if (query?.offset) params.append('offset', String(query.offset));
    if (query?.sortBy) params.append('sortBy', query.sortBy);
    if (query?.sortOrder) params.append('sortOrder', query.sortOrder);

    const queryStr = params.toString();
    return fetchAPI(`/alerts${queryStr ? '?' + queryStr : ''}`);
  },

  /**
   * Get single alert
   */
  get: async (id: string): Promise<{ alert: any }> => {
    return fetchAPI(`/alerts/${id}`);
  },

  /**
   * Update alert status (acknowledge/resolve)
   */
  updateStatus: async (
    id: string,
    payload: { status: 'acknowledged' | 'resolved' }
  ): Promise<{ alert: any }> => {
    return fetchAPI(`/alerts/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    });
  },

  /**
   * Acknowledge alert
   */
  acknowledge: async (id: string): Promise<{ alert: any }> => {
    return alertsApi.updateStatus(id, { status: 'acknowledged' });
  },

  /**
   * Resolve alert
   */
  resolve: async (id: string): Promise<{ alert: any }> => {
    return alertsApi.updateStatus(id, { status: 'resolved' });
  },

  /**
   * Delete single alert
   */
  delete: async (id: string): Promise<void> => {
    await fetchAPI(`/alerts/${id}`, { method: 'DELETE' });
  },

  /**
   * Bulk delete alerts with optional filters
   */
  bulkDelete: async (query?: {
    status?: string;
    severity?: string;
    deviceId?: string;
    type?: string;
    from?: string;
    to?: string;
  }): Promise<{ deleted: number; message: string }> => {
    const params = new URLSearchParams();
    if (query?.status) params.append('status', query.status);
    if (query?.severity) params.append('severity', query.severity);
    if (query?.deviceId) params.append('deviceId', query.deviceId);
    if (query?.type) params.append('type', query.type);
    if (query?.from) params.append('from', query.from);
    if (query?.to) params.append('to', query.to);

    const queryStr = params.toString();
    return fetchAPI(`/alerts${queryStr ? '?' + queryStr : ''}`, {
      method: 'DELETE',
    });
  },
};

/**
 * Readings API calls
 */
export const readingsApi = {
  /**
   * Get reading history for a device
   */
  list: async (
    deviceId: string,
    query?: {
      limit?: number;
      from?: string; // ISO date string
      to?: string; // ISO date string
    }
  ): Promise<{ readings: any[]; count: number }> => {
    const params = new URLSearchParams();
    if (query?.limit) params.append('limit', String(query.limit));
    if (query?.from) params.append('from', query.from);
    if (query?.to) params.append('to', query.to);

    const queryStr = params.toString();
    return fetchAPI(`/readings/${deviceId}${queryStr ? '?' + queryStr : ''}`);
  },

  /**
   * Get latest reading for a device
   */
  latest: async (deviceId: string): Promise<{ reading: any }> => {
    return fetchAPI(`/readings/${deviceId}/latest`);
  },
};

/**
 * Settings API calls
 */
export const settingsApi = {
  /**
   * Get user settings
   */
  get: async (): Promise<{ settings: any }> => {
    return fetchAPI('/settings');
  },

  /**
   * Update user settings
   */
  update: async (payload: Record<string, any>): Promise<{ settings: any }> => {
    return fetchAPI('/settings', {
      method: 'PATCH',
      body: JSON.stringify(payload),
    });
  },
};

/**
 * Users API calls
 */
export const usersApi = {
  /**
   * Get current user profile
   */
  me: async (): Promise<{ user: any }> => {
    return fetchAPI('/users/me');
  },

  /**
   * Update user profile
   */
  updateProfile: async (payload: {
    name?: string;
    email?: string;
    phone?: string;
  }): Promise<{ user: any }> => {
    return fetchAPI('/users/me', {
      method: 'PATCH',
      body: JSON.stringify(payload),
    });
  },

  /**
   * Register push notification token
   */
  registerPushToken: async (token: string): Promise<{ success: boolean }> => {
    return fetchAPI('/users/me/push-token', {
      method: 'POST',
      body: JSON.stringify({ token }),
    });
  },
};

/**
 * Sync API calls (offline queue drain)
 */
export const syncApi = {
  /**
   * Send batch of offline actions to backend
   */
  drain: async (actions: any[]): Promise<{ processed: number; failed: any[] }> => {
    return fetchAPI('/sync', {
      method: 'POST',
      body: JSON.stringify({ actions }),
    });
  },
};

/**
 * WebSocket connection helper
 */
export function connectWebSocket(
  deviceId: string,
  onMessage: (data: any) => void,
  onError?: (error: any) => void,
  onClose?: () => void
): WebSocket | null {
  try {
    const token = getToken();
    if (!token) {
      console.error('[WebSocket] No auth token available');
      return null;
    }

    const wsUrl = API_BASE_URL.replace('http', 'ws') + `/live/${deviceId}`;
    const ws = new WebSocket(wsUrl);

    ws.onopen = () => {
      // Send auth token immediately after connection
      ws.send(JSON.stringify({ type: 'auth', token }));
    };

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
