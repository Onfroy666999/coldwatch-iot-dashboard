// ── AppContext.tsx ─────────────────────────────────────────────────────────────
//
// Thin provider shell. All state and logic live in the four hooks:
//   useAuth     — authentication, user, login/logout
//   useAlerts   — alert list, acknowledge/resolve, WS arrival handler
//   useSettings — settings, compactMode, updateSettings
//   useDevices  — devices, sim state, WebSocket connections
//
// This file:
//   1. Creates the React context and assembles the context value from the hooks
//   2. Handles the bootstrap sequence (fetch on auth, restore from cache offline)
//   3. Owns toasts and isOnline (too small to warrant their own hooks)
//   4. Re-exports the named types that the rest of the app imports from here
//      (Alert, Device, SensorReading, etc.) — they now live in types.ts but
//      the import path stays './context/AppContext' so no consumer files change.
//
// What's intentionally NOT here:
//   - mapDevice / mapAlert / mapSettings / buildInitialSimState — in types.ts
//   - saveBootstrapCache / loadBootstrapCache / cache helpers — in offlineCache.ts
//   - Any useState or useRef for auth, alerts, settings, or device data

import {
  createContext, useContext, useState, useEffect,
  useCallback, type ReactNode,
} from 'react';
import { bootstrapApi, API_MISCONFIGURED } from '../Lib/api';
import { getToken, clearTokens } from '../Lib/tokenStorage';
import { initPushNotifications } from '../Lib/pushNotifications';
import { mapAlert, avatarFromName, DEFAULT_SETTINGS } from './types';
import { saveBootstrapCache, loadBootstrapCache } from './offlineCache';
import { useAuth }     from './useAuth';
import { useAlerts }   from './useAlerts';
import { useSettings } from './settings';
import { useDevices }  from './useDevices';
import type {
  Alert, Device, DeviceConfig, DeviceReading, DeviceSimState,
  SensorReading, Settings, User, UserRole,
  ProduceMode, ProduceState, ToastMessage,
} from './types';

// ── Re-export all named types the rest of the app imports from this file ───────
// Source of truth is now types.ts; these re-exports keep every consumer's
// import path unchanged — no ripple edits needed.
export type {
  Alert, Device, DeviceConfig, DeviceReading, DeviceSimState,
  SensorReading, Settings, User, UserRole,
  ProduceMode, ProduceState, ToastMessage,
} from './types';
export {
  PRODUCE_THRESHOLDS, STATE_ADJUSTMENTS, DEFAULT_SETTINGS,
  getStateAdjustedTargets, avatarFromName, isValidProduceMode,
} from './types';

// ── Context type ──────────────────────────────────────────────────────────────
// Kept identical to the original so zero consumer code changes.

interface AppContextType {
  // ── Sim / selected device (flattened for consumer convenience) ──────────────
  currentTemperature: number;
  currentHumidity:    number;
  deviceStatus:       'online' | 'offline';
  systemStatus:       'cooling' | 'idle' | 'override';
  targetTemperature:  number;
  targetHumidity:     number;
  autoMode:           boolean;
  sensorHistory:      SensorReading[];
  lastReadingAt:      number | undefined;
  selectedDeviceId:   string;
  setSelectedDeviceId: (id: string) => void;
  // ── Alerts ──────────────────────────────────────────────────────────────────
  alerts:              Alert[];
  unreadAlertCount:    number;
  acknowledgeAlert:    (id: string) => void;
  resolveAlert:        (id: string) => void;
  acknowledgeAllAlerts: () => void;
  // ── Devices ─────────────────────────────────────────────────────────────────
  devices:             Device[];
  deviceConfigs:       Device[];   // alias kept for backward compat
  deviceReadings:      Record<string, DeviceReading[]>;
  deviceHistories:     Record<string, SensorReading[]>;
  addDevice: (
    name: string, location: string,
    produceInfo?: { cropIds: import('../data/produce').CropId[]; produceState: ProduceState; facilitySize: 'small' | 'medium' | 'large'; transportHours: number },
    deviceCode?: string, unitName?: string,
  ) => Promise<Device>;
  updateDevice:       (id: string, patch: Partial<Device>) => void;
  updateDeviceConfig: (id: string, patch: Partial<Device>) => void; // alias
  deleteDevice:       (id: string) => void;
  refreshDevices:     () => Promise<void>;
  updateProduceSetup: (deviceId: string, produceInfo: any) => void;
  reconnectWebSockets: () => void;
  // ── Produce ─────────────────────────────────────────────────────────────────
  produceMode:         ProduceMode;
  setProduceMode:      (mode: ProduceMode) => void;
  applyProduceProfile: (deviceId: string, mode: ProduceMode) => void;
  // ── Sim controls ────────────────────────────────────────────────────────────
  setTargetTemperature: (t: number)  => void;
  setTargetHumidity:    (h: number)  => void;
  setAutoMode:          (a: boolean) => void;
  startCooling:         () => Promise<void>;
  stopCooling:          () => Promise<void>;
  // ── Settings ────────────────────────────────────────────────────────────────
  settings:        Settings;
  compactMode:     boolean;
  setCompactMode:  (v: boolean) => void;
  updateSettings:  (patch: Partial<Settings>) => void;
  // ── Auth / user ─────────────────────────────────────────────────────────────
  user:              User;
  isAuthenticated:   boolean;
  isLoading:         boolean;
  activePage:        string;
  setActivePage:     (page: string) => void;
  login: (email: string, name: string, id: string, avatar: string, role?: UserRole, surveyComplete?: boolean) => void;
  logout:            () => void;
  deleteAccount:     () => Promise<void>;
  updateUser:        (patch: Partial<User>) => void;
  completeSurvey:    (role: UserRole, notifPrefs: Partial<Settings>, notificationEmail?: string, notificationPhone?: string) => void;
  // ── Toasts ──────────────────────────────────────────────────────────────────
  toasts:       ToastMessage[];
  addToast:     (toast: ToastMessage) => void;
  dismissToast: (id: string) => void;
  // ── Network ─────────────────────────────────────────────────────────────────
  isOnline:       boolean;
  isAdvancedUser: boolean;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

// ── Provider ──────────────────────────────────────────────────────────────────

export function AppProvider({ children }: { children: ReactNode }) {

  // ── Toasts ────────────────────────────────────────────────────────────────

  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const addToast = useCallback((toast: ToastMessage) => {
    setToasts(prev => [...prev, toast]);
    if (toast.duration !== Infinity) {
      setTimeout(
        () => setToasts(prev => prev.filter(t => t.id !== toast.id)),
        toast.duration ?? 4000,
      );
    }
  }, []);

  const dismissToast = useCallback(
    (id: string) => setToasts(prev => prev.filter(t => t.id !== id)),
    [],
  );

  // ── Online detection ──────────────────────────────────────────────────────

  const [isOnline, setIsOnline] = useState(() => navigator.onLine);
  useEffect(() => {
    const on  = () => setIsOnline(true);
    const off = () => setIsOnline(false);
    window.addEventListener('online',  on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online',  on);
      window.removeEventListener('offline', off);
    };
  }, []);

  // ── Hooks ─────────────────────────────────────────────────────────────────
  // onReset is the logout callback: each hook cleans up its own state here
  // so useAuth doesn't need to import or know about the other hooks.

  // isAuthenticated bridge: lets useAlerts poll only when the user is
  // signed in, without useAlerts needing to import the auth hook directly.
  const [isAuthenticated, setIsAuthenticated] = useState(() => !!getToken());

  const alerts   = useAlerts({ isAuthenticated });
  const settings = useSettings();
  const devices  = useDevices({ addAlert: alerts.addAlert, addToast });

  const auth = useAuth({
    autoLogoutMinutes: settings.settings.autoLogoutMinutes,
    onReset: () => {
      // Close the WebSocket
      devices.wsRef.current?.close();
      devices.wsRef.current = null;
      // Reset each hook's own state
      alerts.seedAlerts([]);
      settings.seedSettings(DEFAULT_SETTINGS as unknown as Record<string, unknown>);
      devices.seedDevices([]);
    },
  });

  // Keep the bridge in sync whenever auth state changes
  useEffect(() => {
    setIsAuthenticated(auth.isAuthenticated);
  }, [auth.isAuthenticated]);

  // ── Bootstrap ─────────────────────────────────────────────────────────────
  // Single request on every auth. On failure, restores from offline cache.

  useEffect(() => {
    if (!auth.isAuthenticated) return;

    let cancelled = false;

    async function bootstrap() {
      auth.setIsLoading(true);
      try {
        const { user: u, devices: rawDevices, alerts: rawAlerts, settings: rawSettings } =
          await bootstrapApi.get();

        if (cancelled) return;

        auth.setUser({
          id:                u.id,
          name:              u.name,
          email:             u.email ?? '',
          avatar:            avatarFromName(u.name),
          role:              u.role,
          surveyComplete:    u.surveyComplete ?? false,
          phone:             u.phone ?? '',
          notificationEmail: u.notificationEmail ?? '',
        });

        settings.seedSettings(rawSettings as unknown as Record<string, unknown>);
        alerts.seedAlerts((rawAlerts ?? []).map(mapAlert));
        devices.seedDevices(rawDevices ?? []);

        saveBootstrapCache({
          user:     u,
          devices:  rawDevices ?? [],
          alerts:   rawAlerts  ?? [],
          settings: rawSettings,
          savedAt:  Date.now(),
        });

      } catch (err: any) {
        if (cancelled) return;

        if (err?.status === 401) {
          clearTokens();
          auth.setIsAuthenticated(false);
          auth.setActivePage('login');
          return;
        }

        // Offline — restore from cache
        const cache = loadBootstrapCache();
        if (cache) {
          const u = cache.user;
          auth.setUser({
            id:                u.id,
            name:              u.name,
            email:             u.email ?? '',
            avatar:            avatarFromName(u.name),
            role:              u.role,
            surveyComplete:    u.surveyComplete ?? false,
            phone:             u.phone ?? '',
            notificationEmail: u.notificationEmail ?? '',
          });
          settings.seedSettings((cache.settings ?? DEFAULT_SETTINGS) as unknown as Record<string, unknown>);
          alerts.seedAlerts((cache.alerts ?? []).map(mapAlert));
          devices.seedDevices(cache.devices ?? []);
        }
      } finally {
        if (!cancelled) auth.setIsLoading(false);
      }
    }

    bootstrap();
    return () => { cancelled = true; };
  }, [auth.isAuthenticated]); // eslint-disable-line

  // ── completeSurvey bridge ─────────────────────────────────────────────────
  // useAuth fires the API calls but can't update settings state (different hook).
  // AppProvider wraps it to also seed the local settings immediately.

  const completeSurvey = useCallback((
    role: UserRole,
    notifPrefs: Partial<Settings>,
    notificationEmail?: string,
    notificationPhone?: string,
  ) => {
    auth.completeSurvey(role, notifPrefs, notificationEmail, notificationPhone);
    settings.updateSettings(notifPrefs);
  }, [auth.completeSurvey, settings.updateSettings]); // eslint-disable-line

  // ── Push notifications ────────────────────────────────────────────────────

  // A native build shipped without VITE_API_URL is misconfigured — see the
  // comment in api.ts. Every request will fail, indistinguishable from being
  // offline, so make sure this is impossible to miss rather than silent.
  useEffect(() => {
    if (!API_MISCONFIGURED) return;
    addToast({
      id:       'api-misconfigured',
      type:     'error',
      message:  'This build is missing its server configuration and cannot connect. Please contact support.',
      duration: Infinity,
    });
  }, []); // eslint-disable-line

  useEffect(() => {
    if (!auth.isAuthenticated) return;
    return initPushNotifications({
      // App is open and in the foreground when the push lands — FCM won't
      // show a system tray banner in this case, so surface a toast instead.
      onNotificationReceived: (notification) => {
        addToast({
          id:      `push-${Date.now()}`,
          type:    (notification.data as Record<string, string> | undefined)?.severity === 'critical' ? 'error' : 'warning',
          message: notification.title
            ? `${notification.title}${notification.body ? ` — ${notification.body}` : ''}`
            : (notification.body ?? 'New alert on one of your devices'),
        });
      },
      // User tapped the tray notification (background or killed-app launch).
      // The push payload doesn't carry an alertId/deviceId yet, so this can
      // only land on the Alerts list rather than the specific alert.
      onNotificationAction: () => {
        auth.setActivePage('alerts');
      },
    });
  }, [auth.isAuthenticated]); // eslint-disable-line

  // ── Derived values ────────────────────────────────────────────────────────

  const selectedDevice = devices.devices.find(d => d.id === devices.selectedDeviceId);
  const deviceStatus   = selectedDevice?.status ?? 'offline';

  // ── Context value ─────────────────────────────────────────────────────────

  return (
    <AppContext.Provider value={{
      // Sim (flattened from selectedSim)
      currentTemperature: devices.selectedSim.currentTemperature,
      currentHumidity:    devices.selectedSim.currentHumidity,
      deviceStatus,
      systemStatus:       devices.selectedSim.systemStatus,
      targetTemperature:  devices.selectedSim.targetTemperature,
      targetHumidity:     devices.selectedSim.targetHumidity,
      autoMode:           devices.selectedSim.autoMode,
      sensorHistory:      devices.selectedSim.sensorHistory,
      lastReadingAt:      devices.selectedSim.lastReadingAt,
      selectedDeviceId:   devices.selectedDeviceId,
      setSelectedDeviceId: devices.setSelectedDeviceId,

      // Alerts
      alerts:               alerts.alerts,
      unreadAlertCount:     alerts.unreadAlertCount,
      acknowledgeAlert:     alerts.acknowledgeAlert,
      resolveAlert:         alerts.resolveAlert,
      acknowledgeAllAlerts: alerts.acknowledgeAllAlerts,

      // Devices
      devices:             devices.devices,
      deviceConfigs:       devices.devices,
      deviceReadings:      devices.deviceReadings,
      deviceHistories:     devices.deviceHistories,
      addDevice:           devices.addDevice,
      updateDevice:        devices.updateDevice,
      updateDeviceConfig:  devices.updateDevice,
      deleteDevice:        devices.deleteDevice,
      refreshDevices:      devices.refreshDevices,
      updateProduceSetup:  devices.updateProduceSetup,
      reconnectWebSockets: devices.reconnectWebSockets,

      // Produce
      produceMode:         devices.produceMode,
      setProduceMode:      devices.setProduceMode,
      applyProduceProfile: devices.applyProduceProfile,

      // Sim controls
      setTargetTemperature: devices.setTargetTemperature,
      setTargetHumidity:    devices.setTargetHumidity,
      setAutoMode:          devices.setAutoMode,
      startCooling:         devices.startCooling,
      stopCooling:          devices.stopCooling,

      // Settings
      settings:       settings.settings,
      compactMode:    settings.compactMode,
      setCompactMode: settings.setCompactMode,
      updateSettings: settings.updateSettings,

      // Auth / user
      user:             auth.user,
      isAuthenticated:  auth.isAuthenticated,
      isLoading:        auth.isLoading,
      activePage:       auth.activePage,
      setActivePage:    auth.setActivePage,
      login:            auth.login,
      logout:           auth.logout,
      deleteAccount:    auth.deleteAccount,
      updateUser:       auth.updateUser,
      completeSurvey,

      // Toasts
      toasts,
      addToast,
      dismissToast,
      
      // Network
      isOnline,
      isAdvancedUser: auth.user.role === 'warehouse_manager',
    }}>
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used within an AppProvider');
  return ctx;
}
