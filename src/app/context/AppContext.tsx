import {
  createContext, useContext, useState, useEffect,
  useCallback, useRef, type ReactNode,
} from 'react';
import { enqueueAction, clearQueue } from '../Lib/ActionQueue';
import {
  authApi, devicesApi, alertsApi, settingsApi, usersApi,
  connectWebSocket,
} from '../Lib/api';
import { getToken, clearTokens, getUserId } from '../Lib/tokenStorage';

// ── Shared types ──────────────────────────────────────────────────────────────

export interface SensorReading {
  timestamp: Date;
  temperature: number;
  humidity: number;
}

export interface Alert {
  id: string;
  severity: 'critical' | 'warning' | 'info';
  message: string;
  deviceId: string;
  deviceName: string;
  timestamp: Date;
  status: 'new' | 'acknowledged' | 'resolved' | 'auto_resolved';
  tempC?: number;
  humidityPct?: number;
  peakTempC?: number;
  peakHumidityPct?: number;
  resolvedAt?: Date;
  durationMinutes?: number;
  systemAction?: string;
  autoResolved?: boolean;
}

export interface Device {
  id: string;
  name: string;
  location: string;
  status: 'online' | 'offline';
  lastSeen: Date;
  firmwareVersion: string;
  batteryLevel: number;
  tempOffset: number;
  humidOffset: number;
  useCustomThresholds: boolean;
  warningTemperature: number;
  criticalTemperature: number;
  warningHumidity: number;
  criticalHumidity: number;
  humidAlertHigh?: boolean;
  produceMode?: ProduceMode;
  produceState?: ProduceState;
  facilitySize?: 'small' | 'medium' | 'large';
  transportHours?: number;
  produceSetupComplete?: boolean;
  deviceCode?: string;
  unitName?: string;
  storedSince?: Date;
}

export type DeviceConfig = Device;

interface DeviceSimState {
  currentTemperature: number;
  currentHumidity: number;
  systemStatus: 'cooling' | 'idle' | 'override';
  targetTemperature: number;
  targetHumidity: number;
  autoMode: boolean;
  sensorHistory: SensorReading[];
}

export interface Settings {
  warningTemperature: number;
  criticalTemperature: number;
  warningHumidity: number;
  criticalHumidity: number;
  inAppNotifications: boolean;
  emailAlerts: boolean;
  smsAlerts: boolean;
  alertRepeatInterval: string;
  userPhone: string;
  escalationContact: string;
  compactMode: boolean;
  tempUnit: 'C' | 'F';
  samplingInterval: string;
  dataRetention: string;
  autoLogoutMinutes: number;
}

export type UserRole = 'farmer' | 'warehouse_manager' | 'transporter' | 'other';

export interface User {
  id: string;
  name: string;
  email: string;
  avatar: string;
  profilePicture?: string;
  role?: UserRole;
  surveyComplete?: boolean;
  notificationEmail?: string;
}

export interface DeviceReading {
  time: string;
  temperature: number;
}

export type ProduceMode = 'mixed' | 'tubers' | 'fruits' | 'leafy' | 'legumes' | 'meat';
export type ProduceState = 'fresh' | 'dried' | 'in-between' | 'almost-damaged';

export const PRODUCE_THRESHOLDS: Record<ProduceMode, {
  targetTemperature: number; targetHumidity: number;
  warningTemperature: number; criticalTemperature: number;
  warningHumidity: number; criticalHumidity: number;
  humidAlertHigh: boolean;
}> = {
  mixed:   { targetTemperature: 11, targetHumidity: 88, warningTemperature: 13, criticalTemperature: 15, warningHumidity: 85, criticalHumidity: 90, humidAlertHigh: true  },
  tubers:  { targetTemperature: 13, targetHumidity: 75, warningTemperature: 16, criticalTemperature: 18, warningHumidity: 70, criticalHumidity: 80, humidAlertHigh: true  },
  fruits:  { targetTemperature: 10, targetHumidity: 85, warningTemperature: 13, criticalTemperature: 15, warningHumidity: 80, criticalHumidity: 90, humidAlertHigh: false },
  leafy:   { targetTemperature:  4, targetHumidity: 95, warningTemperature:  6, criticalTemperature:  8, warningHumidity: 90, criticalHumidity: 98, humidAlertHigh: false },
  legumes: { targetTemperature: 15, targetHumidity: 65, warningTemperature: 20, criticalTemperature: 25, warningHumidity: 60, criticalHumidity: 70, humidAlertHigh: true  },
  meat:    { targetTemperature:  2, targetHumidity: 60, warningTemperature:  4, criticalTemperature:  7, warningHumidity: 55, criticalHumidity: 70, humidAlertHigh: true  },
};

export const STATE_ADJUSTMENTS: Record<ProduceState, { tempOffset: number; humidOffset: number }> = {
  'fresh':          { tempOffset:  0, humidOffset:  0 },
  'in-between':     { tempOffset: +1, humidOffset: -3 },
  'dried':          { tempOffset: +4, humidOffset: -12 },
  'almost-damaged': { tempOffset: -2, humidOffset: +4 },
};

export function getStateAdjustedTargets(mode: ProduceMode, state: ProduceState) {
  const base = PRODUCE_THRESHOLDS[mode];
  const adj  = STATE_ADJUSTMENTS[state];
  return {
    targetTemperature: parseFloat(Math.min(base.criticalTemperature - 1, Math.max(base.targetTemperature + adj.tempOffset, 0)).toFixed(1)),
    targetHumidity:    parseFloat(Math.min(98, Math.max(30, base.targetHumidity + adj.humidOffset)).toFixed(0)),
  };
}

export interface ToastMessage {
  id: string;
  type: 'success' | 'error' | 'warning' | 'info';
  message: string;
  duration?: number;
}

// ── Defaults ──────────────────────────────────────────────────────────────────

const DEFAULT_SETTINGS: Settings = {
  warningTemperature: 10, criticalTemperature: 15,
  warningHumidity: 80,    criticalHumidity: 90,
  inAppNotifications: true, emailAlerts: true, smsAlerts: false,
  alertRepeatInterval: '15min',
  userPhone: '', escalationContact: '',
  compactMode: false, tempUnit: 'C',
  samplingInterval: '10s', dataRetention: '30d', autoLogoutMinutes: 0,
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function avatarFromName(name: string): string {
  return name.trim().split(/\s+/).map(n => n[0]).join('').toUpperCase().slice(0, 2) || 'U';
}

/** Map a backend alert to the frontend Alert shape. */
function mapAlert(a: any): Alert {
  const typeToMessage: Record<string, string> = {
    TEMP_HIGH:      'Temperature too high',
    TEMP_LOW:       'Temperature too low',
    HUMIDITY_HIGH:  'Humidity too high',
    HUMIDITY_LOW:   'Humidity too low',
    DEVICE_OFFLINE: 'Device went offline',
  };
  // Backend uses 'open' — frontend uses 'new'
  const statusMap: Record<string, Alert['status']> = {
    open:          'new',
    acknowledged:  'acknowledged',
    resolved:      'resolved',
    auto_resolved: 'auto_resolved',
  };
  return {
    id:          a.id,
    severity:    a.severity as Alert['severity'],
    message:     a.report ?? typeToMessage[a.type] ?? a.type,
    deviceId:    a.deviceId,
    deviceName:  a.deviceName,
    timestamp:   new Date(a.createdAt),
    status:      statusMap[a.status] ?? 'new',
    tempC:       a.type?.includes('TEMP')     ? a.triggerValue   : undefined,
    humidityPct: a.type?.includes('HUMIDITY') ? a.triggerValue   : undefined,
    resolvedAt:  a.resolvedAt ? new Date(a.resolvedAt) : undefined,
    autoResolved: a.status === 'auto_resolved',
  };
}

/** Map a backend device to the frontend Device shape. */
function mapDevice(d: any): Device {
  return {
    id:                  d.id,
    name:                d.unitName ?? d.name,
    location:            d.location,
    status:              d.status as 'online' | 'offline',
    lastSeen:            d.lastSeenAt ? new Date(d.lastSeenAt) : new Date(),
    firmwareVersion:     '—',
    batteryLevel:        100,
    tempOffset:          d.tempOffset ?? 0,
    humidOffset:         d.humidOffset ?? 0,
    useCustomThresholds: d.useCustomThresholds ?? false,
    warningTemperature:  d.warningTemperature  ?? 10,
    criticalTemperature: d.criticalTemperature ?? 15,
    warningHumidity:     d.warningHumidity     ?? 80,
    criticalHumidity:    d.criticalHumidity    ?? 90,
    humidAlertHigh:      d.humidAlertHigh,
    produceMode:         d.produceMode as ProduceMode | undefined,
    produceState:        d.produceState as ProduceState | undefined,
    facilitySize:        d.facilitySize as Device['facilitySize'],
    transportHours:      d.transportHours,
    produceSetupComplete: d.produceSetupComplete ?? false,
    deviceCode:          d.deviceCode,
    unitName:            d.unitName,
    storedSince:         d.storedSince ? new Date(d.storedSince) : undefined,
  };
}

/** Map backend settings to frontend Settings shape. */
function mapSettings(s: any): Settings {
  return {
    warningTemperature:  s.warningTemperature  ?? DEFAULT_SETTINGS.warningTemperature,
    criticalTemperature: s.criticalTemperature ?? DEFAULT_SETTINGS.criticalTemperature,
    warningHumidity:     s.warningHumidity     ?? DEFAULT_SETTINGS.warningHumidity,
    criticalHumidity:    s.criticalHumidity    ?? DEFAULT_SETTINGS.criticalHumidity,
    inAppNotifications:  s.inAppNotifications  ?? DEFAULT_SETTINGS.inAppNotifications,
    emailAlerts:         s.emailAlerts         ?? DEFAULT_SETTINGS.emailAlerts,
    smsAlerts:           s.smsAlerts           ?? DEFAULT_SETTINGS.smsAlerts,
    alertRepeatInterval: s.alertRepeatInterval ?? DEFAULT_SETTINGS.alertRepeatInterval,
    userPhone:           DEFAULT_SETTINGS.userPhone,
    escalationContact:   DEFAULT_SETTINGS.escalationContact,
    compactMode:         s.compactMode         ?? DEFAULT_SETTINGS.compactMode,
    tempUnit:            (s.tempUnit as 'C' | 'F') ?? DEFAULT_SETTINGS.tempUnit,
    samplingInterval:    s.samplingInterval    ?? DEFAULT_SETTINGS.samplingInterval,
    dataRetention:       s.dataRetention       ?? DEFAULT_SETTINGS.dataRetention,
    autoLogoutMinutes:   s.autoLogoutMinutes   ?? DEFAULT_SETTINGS.autoLogoutMinutes,
  };
}

function buildInitialSimState(device: Device): DeviceSimState {
  const targetTemp = device.produceMode
    ? PRODUCE_THRESHOLDS[device.produceMode].targetTemperature
    : 8;
  const targetHumid = device.produceMode
    ? PRODUCE_THRESHOLDS[device.produceMode].targetHumidity
    : 85;
  const now = new Date();
  // Build 60-minute history seeded to realistic values
  const sensorHistory: SensorReading[] = Array.from({ length: 60 }, (_, i) => ({
    timestamp:   new Date(now.getTime() - (60 - i) * 60000),
    temperature: targetTemp + Math.random() * 2,
    humidity:    targetHumid + (Math.random() - 0.5) * 5,
  }));
  return {
    currentTemperature: targetTemp + Math.random(),
    currentHumidity:    targetHumid,
    systemStatus:       device.status === 'online' ? 'cooling' : 'idle',
    targetTemperature:  targetTemp,
    targetHumidity:     targetHumid,
    autoMode:           true,
    sensorHistory,
  };
}

// ── Context type ──────────────────────────────────────────────────────────────

interface AppContextType {
  currentTemperature: number;
  currentHumidity: number;
  deviceStatus: 'online' | 'offline';
  systemStatus: 'cooling' | 'idle' | 'override';
  targetTemperature: number;
  targetHumidity: number;
  autoMode: boolean;
  sensorHistory: SensorReading[];
  selectedDeviceId: string;
  setSelectedDeviceId: (id: string) => void;
  alerts: Alert[];
  unreadAlertCount: number;
  deviceReadings: Record<string, DeviceReading[]>;
  deviceHistories: Record<string, SensorReading[]>;
  devices: Device[];
  deviceConfigs: Device[];
  settings: Settings;
  user: User;
  isAuthenticated: boolean;
  activePage: string;
  compactMode: boolean;
  setCompactMode: (v: boolean) => void;
  produceMode: ProduceMode;
  setProduceMode: (mode: ProduceMode) => void;
  applyProduceProfile: (mode: ProduceMode) => void;
  setActivePage: (page: string) => void;
  setTargetTemperature: (temp: number) => void;
  setTargetHumidity: (humidity: number) => void;
  setAutoMode: (auto: boolean) => void;
  startCooling: () => void;
  stopCooling: () => void;
  acknowledgeAlert: (id: string) => void;
  resolveAlert: (id: string) => void;
  acknowledgeAllAlerts: () => void;
  updateSettings: (settings: Partial<Settings>) => void;
  updateDevice: (id: string, patch: Partial<Device>) => void;
  updateDeviceConfig: (id: string, patch: Partial<Device>) => void;
  updateUser: (patch: Partial<User>) => void;
  completeSurvey: (role: UserRole, notifPrefs: Partial<Settings>, notificationEmail?: string) => void;
  addDevice: (name: string, location: string, produceInfo?: any, deviceCode?: string, unitName?: string, storedSince?: Date) => void;
  updateProduceSetup: (deviceId: string, produceInfo: any) => void;
  deleteDevice: (id: string) => void;
  login: (email: string, name: string, id: string, avatar: string, role?: UserRole, surveyComplete?: boolean) => void;
  logout: () => void;
  deleteAccount: () => Promise<void>;
  reconnectWebSockets: () => void;
  addToast: (toast: ToastMessage) => void;
  toasts: ToastMessage[];
  dismissToast: (id: string) => void;
  isOnline: boolean;
  isAdvancedUser: boolean;
  isLoading: boolean;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

// ── Provider ──────────────────────────────────────────────────────────────────

export function AppProvider({ children }: { children: ReactNode }) {

  // ── Auth ────────────────────────────────────────────────────────────────────
  // Rehydrate from token — if a valid JWT exists the user is considered
  // authenticated and we fetch their profile from the backend on mount.
  const [isAuthenticated, setIsAuthenticated] = useState(() => !!getToken());
  const [isLoading,       setIsLoading]       = useState(() => !!getToken()); // loading while we fetch data
  const [activePage, setActivePage]           = useState(() => getToken() ? 'dashboard' : 'login');
  const [user, setUser] = useState<User>({
    id: getUserId() ?? '', name: '', email: '',
    avatar: 'U', role: undefined, surveyComplete: undefined,
  });

  // ── Settings ─────────────────────────────────────────────────────────────────
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const compactMode    = settings.compactMode;
  const setCompactMode = useCallback((v: boolean) => {
    setSettings(prev => {
      const next = { ...prev, compactMode: v };
      settingsApi.update({ compactMode: v }).catch(() => {});
      return next;
    });
  }, []);

  // ── Devices & Sim ────────────────────────────────────────────────────────────
  const [devices, setDevices]               = useState<Device[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>('');
  const simRef = useRef<Record<string, DeviceSimState>>({});

  const [selectedSim, setSelectedSim] = useState<DeviceSimState>({
    currentTemperature: 8, currentHumidity: 80,
    systemStatus: 'cooling', targetTemperature: 8, targetHumidity: 85,
    autoMode: true, sensorHistory: [],
  });

  // ── Alerts ───────────────────────────────────────────────────────────────────
  const [alerts, setAlerts] = useState<Alert[]>([]);

  // ── Toasts ───────────────────────────────────────────────────────────────────
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const addToast = useCallback((toast: ToastMessage) => {
    setToasts(prev => [...prev, toast]);
    if (toast.duration !== Infinity) {
      setTimeout(() => setToasts(prev => prev.filter(t => t.id !== toast.id)), toast.duration ?? 4000);
    }
  }, []);
  const dismissToast = useCallback((id: string) => setToasts(prev => prev.filter(t => t.id !== id)), []);

  // ── Online detection ─────────────────────────────────────────────────────────
  const [isOnline, setIsOnline] = useState(() => navigator.onLine);
  useEffect(() => {
    const on  = () => setIsOnline(true);
    const off = () => setIsOnline(false);
    window.addEventListener('online',  on);
    window.addEventListener('offline', off);
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off); };
  }, []);

  // ── Produce mode ─────────────────────────────────────────────────────────────
  const [produceMode, setProduceMode] = useState<ProduceMode>('mixed');

  const setProduceModeAndPersist = useCallback((mode: ProduceMode) => {
    setProduceMode(mode);
    try { localStorage.setItem('cw_produce_mode', mode); } catch { /* */ }
  }, []);

  const applyProduceProfile = useCallback((mode: ProduceMode) => {
    setProduceMode(mode);
    try { localStorage.setItem('cw_produce_mode', mode); } catch { /* */ }
    const thresholds = PRODUCE_THRESHOLDS[mode];
    setDevices(prev => prev.map(d => ({ ...d, ...thresholds })));
    const patch = { targetTemperature: thresholds.targetTemperature, targetHumidity: thresholds.targetHumidity };
    if (simRef.current[selectedDeviceId]) {
      simRef.current[selectedDeviceId] = { ...simRef.current[selectedDeviceId], ...patch };
    }
    setSelectedSim(prev => ({ ...prev, ...patch }));
  }, [selectedDeviceId]);

  // ── Sparkline data ───────────────────────────────────────────────────────────
  const deviceReadingsRef = useRef<Record<string, DeviceReading[]>>({});
  const [deviceReadings, setDeviceReadings] = useState<Record<string, DeviceReading[]>>({});
  const [deviceHistories, setDeviceHistories] = useState<Record<string, SensorReading[]>>({});

  // ── WebSocket connections — one per online device ────────────────────────────
  const wsRefs = useRef<Record<string, WebSocket | null>>({});

  const openWebSocket = useCallback((deviceId: string) => {
    // Don't open if already connected
    const existing = wsRefs.current[deviceId];
    if (existing && existing.readyState <= WebSocket.OPEN) return;

    const ws = connectWebSocket(
      deviceId,
      (data) => {
        if (data.type === 'reading') {
          const { temperature, humidity } = data.data;
          const now = new Date();
          const reading: SensorReading = { timestamp: now, temperature, humidity };

          simRef.current[deviceId] = {
            ...simRef.current[deviceId],
            currentTemperature: temperature,
            currentHumidity:    humidity,
            sensorHistory: [
              ...(simRef.current[deviceId]?.sensorHistory ?? []).slice(-59),
              reading,
            ],
          };

          if (deviceId === selectedDeviceId) {
            setSelectedSim(prev => ({ ...prev, currentTemperature: temperature, currentHumidity: humidity }));
          }

          setDeviceHistories(prev => ({
            ...prev,
            [deviceId]: [...(simRef.current[deviceId]?.sensorHistory ?? [])],
          }));

          // Keep sparkline data in sync
          const timeStr = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
          deviceReadingsRef.current[deviceId] = [
            ...(deviceReadingsRef.current[deviceId] ?? []).slice(-23),
            { time: timeStr, temperature },
          ];
          setDeviceReadings(prev => ({ ...prev, [deviceId]: deviceReadingsRef.current[deviceId] }));
        }

        if (data.type === 'alert') {
          const newAlert = mapAlert(data.data);
          setAlerts(prev => {
            if (prev.some(a => a.id === newAlert.id)) return prev;
            return [newAlert, ...prev];
          });
        }
      },
      () => {
        // On error: mark device offline in state
        setDevices(prev => prev.map(d => d.id === deviceId ? { ...d, status: 'offline' } : d));
      },
      () => {
        // On close: attempt reconnect after 5s
        wsRefs.current[deviceId] = null;
        setTimeout(() => { if (getToken()) openWebSocket(deviceId); }, 5000);
      }
    );
    wsRefs.current[deviceId] = ws;
  }, [selectedDeviceId]); // eslint-disable-line

  // Called by App.tsx when app returns to foreground.
  // Must be declared AFTER openWebSocket — useCallback refs are not hoisted.
  const reconnectWebSockets = useCallback(() => {
    setDevices(current => {
      for (const device of current) {
        if (device.status === 'online') {
          const existing = wsRefs.current[device.id];
          if (!existing || existing.readyState === WebSocket.CLOSED) {
            openWebSocket(device.id);
          }
        }
      }
      return current;
    });
  }, [openWebSocket]);

  // ── Bootstrap — fetch everything from backend on auth ────────────────────────
  useEffect(() => {
    if (!isAuthenticated) return;

    let cancelled = false;

    async function bootstrap() {
      setIsLoading(true);
      try {
        const [profileRes, devicesRes, alertsRes, settingsRes] = await Promise.all([
          usersApi.me(),
          devicesApi.list(),
          alertsApi.list({ limit: 100 }),
          settingsApi.get(),
        ]);

        if (cancelled) return;

        // User
        const u = profileRes.user;
        setUser({
          id:                u.id,
          name:              u.name,
          email:             u.email ?? '',
          avatar:            avatarFromName(u.name),
          role:              u.role as UserRole,
          surveyComplete:    u.surveyComplete ?? false,
          notificationEmail: u.notificationEmail ?? '',
        });

        // Settings
        if (settingsRes.settings) {
          setSettings(mapSettings(settingsRes.settings));
        }

        // Produce mode from localStorage (preference, not server-stored yet)
        try {
          const savedMode = localStorage.getItem('cw_produce_mode') as ProduceMode | null;
          if (savedMode) setProduceMode(savedMode);
        } catch { /* */ }

        // Devices
        const mappedDevices = (devicesRes.devices ?? []).map(mapDevice);
        setDevices(mappedDevices);

        // Initialise sim state for every device
        for (const device of mappedDevices) {
          if (!simRef.current[device.id]) {
            simRef.current[device.id] = buildInitialSimState(device);
          }
          // Seed sparkline data
          const tgt = PRODUCE_THRESHOLDS[device.produceMode ?? 'mixed']?.targetTemperature ?? 8;
          deviceReadingsRef.current[device.id] = Array.from({ length: 24 }, (_, i) => ({
            time: new Date(Date.now() - (23 - i) * 3_600_000)
              .toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true }),
            temperature: parseFloat((tgt + (Math.random() - 0.5) * 2).toFixed(1)),
          }));
        }
        setDeviceReadings({ ...deviceReadingsRef.current });
        setDeviceHistories(Object.fromEntries(
          mappedDevices.map(d => [d.id, simRef.current[d.id]?.sensorHistory ?? []])
        ));

        // Select first online device, or first device overall
        const firstOnline = mappedDevices.find(d => d.status === 'online');
        const first = firstOnline ?? mappedDevices[0];
        if (first) {
          setSelectedDeviceId(first.id);
          setSelectedSim(simRef.current[first.id] ?? buildInitialSimState(first));
        }

        // Alerts — map backend shape to frontend shape
        setAlerts((alertsRes.alerts ?? []).map(mapAlert));

        // Open WebSocket for each online device
        for (const device of mappedDevices) {
          if (device.status === 'online') openWebSocket(device.id);
        }

      } catch (err) {
        if (!cancelled) {
          console.error('[AppContext] Bootstrap failed:', err);
          // If 401 (token expired), force logout
          if ((err as any)?.status === 401) {
            clearTokens();
            setIsAuthenticated(false);
            setActivePage('login');
          }
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    bootstrap();
    return () => { cancelled = true; };
  }, [isAuthenticated]); // eslint-disable-line

  // ── Sync selectedDeviceId → selectedSim ─────────────────────────────────────
  useEffect(() => {
    const sim = simRef.current[selectedDeviceId];
    if (sim) setSelectedSim({ ...sim });
  }, [selectedDeviceId]);

  // ── Periodic alerts refresh (every 30s) ──────────────────────────────────────
  // Keeps alerts in sync even if the WebSocket for a device isn't connected.
  useEffect(() => {
    if (!isAuthenticated) return;
    const interval = setInterval(async () => {
      try {
        const res = await alertsApi.list({ limit: 100 });
        setAlerts((res.alerts ?? []).map(mapAlert));
      } catch { /* silently ignore */ }
    }, 30_000);
    return () => clearInterval(interval);
  }, [isAuthenticated]);

  // ── Mutate sim for selected device ───────────────────────────────────────────
  const mutateSim = useCallback((patch: Partial<DeviceSimState>) => {
    simRef.current[selectedDeviceId] = { ...simRef.current[selectedDeviceId], ...patch };
    setSelectedSim(prev => ({ ...prev, ...patch }));
  }, [selectedDeviceId]);

  // ── Alert actions ────────────────────────────────────────────────────────────

  const acknowledgeAlert = useCallback((id: string) => {
    setAlerts(prev => prev.map(a => a.id === id ? { ...a, status: 'acknowledged' as const } : a));
    alertsApi.acknowledge(id).catch(() => {
      enqueueAction({ type: 'ACKNOWLEDGE_ALERT', payload: { id } });
    });
  }, []);

  const resolveAlert = useCallback((id: string) => {
    setAlerts(prev => prev.map(a => a.id === id ? { ...a, status: 'resolved' as const } : a));
    alertsApi.resolve(id).catch(() => {
      enqueueAction({ type: 'RESOLVE_ALERT', payload: { id } });
    });
  }, []);

  const acknowledgeAllAlerts = useCallback(() => {
    setAlerts(prev => prev.map(a =>
      (a.status === 'new' || a.status === 'auto_resolved')
        ? { ...a, status: 'acknowledged' as const }
        : a
    ));
    alertsApi.acknowledgeAll().catch(() => {
      enqueueAction({ type: 'ACKNOWLEDGE_ALL_ALERTS', payload: {} });
    });
  }, []);

  // ── Settings ─────────────────────────────────────────────────────────────────

  const updateSettings = useCallback((patch: Partial<Settings>) => {
    setSettings(prev => ({ ...prev, ...patch }));
    settingsApi.update(patch as Record<string, any>).catch(() => {
      enqueueAction({ type: 'UPDATE_SETTINGS', payload: patch as Record<string, unknown> });
    });
  }, []);

  // ── Devices ──────────────────────────────────────────────────────────────────

  const updateDevice = useCallback((id: string, patch: Partial<Device>) => {
    setDevices(prev => prev.map(d => d.id === id ? { ...d, ...patch } : d));
    // Map frontend Device patch to backend fields
    const backendPatch: Record<string, any> = { ...patch };
    if (patch.name)     backendPatch.unitName  = patch.name;
    devicesApi.update(id, backendPatch).catch(() => {
      enqueueAction({ type: 'UPDATE_DEVICE', payload: { id, patch: patch as Record<string, unknown> } });
    });
  }, []);
  const updateDeviceConfig = updateDevice;

  const addDevice = useCallback((
    name: string,
    location: string,
    produceInfo?: { produceMode: ProduceMode; produceState: ProduceState; facilitySize: 'small' | 'medium' | 'large'; transportHours: number },
    deviceCode?: string,
    unitName?: string,
  ) => {
    const thresholds = produceInfo ? PRODUCE_THRESHOLDS[produceInfo.produceMode] : null;
    devicesApi.create({
      name,
      location,
      type:                'fridge',
      deviceCode,
      unitName:            unitName ?? name,
      useCustomThresholds: !!produceInfo,
      warningTemperature:  thresholds?.warningTemperature  ?? DEFAULT_SETTINGS.warningTemperature,
      criticalTemperature: thresholds?.criticalTemperature ?? DEFAULT_SETTINGS.criticalTemperature,
      warningHumidity:     thresholds?.warningHumidity     ?? DEFAULT_SETTINGS.warningHumidity,
      criticalHumidity:    thresholds?.criticalHumidity    ?? DEFAULT_SETTINGS.criticalHumidity,
      humidAlertHigh:      thresholds?.humidAlertHigh,
      produceMode:         produceInfo?.produceMode,
      produceState:        produceInfo?.produceState,
      facilitySize:        produceInfo?.facilitySize,
      transportHours:      produceInfo?.transportHours,
      hasActuator:         false,
    })
      .then(({ device }) => {
        const mapped = mapDevice(device);
        simRef.current[mapped.id]        = buildInitialSimState(mapped);
        alertStateRef.current[mapped.id] = { temp: 'safe', humid: 'safe' };
        deviceReadingsRef.current[mapped.id] = Array.from({ length: 24 }, (_, i) => ({
          time: new Date(Date.now() - (23 - i) * 3_600_000)
            .toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true }),
          temperature: parseFloat(((thresholds?.targetTemperature ?? 8) + (Math.random() - 0.5)).toFixed(1)),
        }));
        setDevices(prev => [...prev, mapped]);
        setDeviceReadings(prev => ({ ...prev, [mapped.id]: deviceReadingsRef.current[mapped.id] }));
        setDeviceHistories(prev => ({ ...prev, [mapped.id]: simRef.current[mapped.id]?.sensorHistory ?? [] }));
        addToast({ id: `add-${mapped.id}`, type: 'success', message: `Device ${mapped.name} added.` });
      })
      .catch(err => {
        addToast({ id: `add-err-${Date.now()}`, type: 'error', message: err?.message ?? 'Failed to add device.' });
        enqueueAction({ type: 'ADD_DEVICE', payload: { name, location } });
      });
  }, [addToast]); // eslint-disable-line

  const updateProduceSetup = useCallback((
    deviceId: string,
    produceInfo: { produceMode: ProduceMode; produceState: ProduceState; facilitySize?: Device['facilitySize']; transportHours?: number }
  ) => {
    const thresholds = PRODUCE_THRESHOLDS[produceInfo.produceMode];
    const adjusted   = getStateAdjustedTargets(produceInfo.produceMode, produceInfo.produceState);
    setDevices(prev => prev.map(d => d.id === deviceId ? {
      ...d, ...produceInfo, ...thresholds,
      produceSetupComplete: true, useCustomThresholds: true,
    } : d));
    devicesApi.update(deviceId, { ...produceInfo, ...thresholds, produceSetupComplete: true, useCustomThresholds: true })
      .catch(() => {});
    if (simRef.current[deviceId]) {
      simRef.current[deviceId] = { ...simRef.current[deviceId], ...adjusted };
    }
    if (deviceId === selectedDeviceId) setSelectedSim(prev => ({ ...prev, ...adjusted }));
  }, [selectedDeviceId]);

  const deleteDevice = useCallback((id: string) => {
    // Close WebSocket if open
    wsRefs.current[id]?.close();
    delete wsRefs.current[id];

    setDevices(prev => {
      const remaining = prev.filter(d => d.id !== id);
      setSelectedDeviceId(cur => (cur !== id ? cur : (remaining[0]?.id ?? '')));
      return remaining;
    });

    delete simRef.current[id];
    delete alertStateRef.current[id];
    delete deviceReadingsRef.current[id];
    setDeviceReadings(prev => { const n = { ...prev }; delete n[id]; return n; });
    setDeviceHistories(prev => { const n = { ...prev }; delete n[id]; return n; });

    devicesApi.delete(id).catch(() => {
      enqueueAction({ type: 'DELETE_DEVICE', payload: { id } });
    });
  }, []);

  // ── User ─────────────────────────────────────────────────────────────────────

  const updateUser = useCallback((patch: Partial<User>) => {
    setUser(prev => {
      const computedAvatar = patch.name && !patch.avatar
        ? avatarFromName(patch.name)
        : patch.avatar;
      return { ...prev, ...patch, ...(computedAvatar ? { avatar: computedAvatar } : {}) };
    });
    usersApi.updateProfile({
      name:              patch.name,
      email:             patch.email,
      notificationEmail: patch.notificationEmail,
      role:              patch.role,
    }).catch(() => {
      enqueueAction({ type: 'UPDATE_USER', payload: patch as Record<string, unknown> });
    });
  }, []);

  const completeSurvey = useCallback((role: UserRole, notifPrefs: Partial<Settings>, notificationEmail?: string) => {
    setUser(prev => ({ ...prev, role, surveyComplete: true, ...(notificationEmail ? { notificationEmail } : {}) }));
    setSettings(prev => ({ ...prev, ...notifPrefs }));
    usersApi.updateProfile({ role, surveyComplete: true, notificationEmail }).catch(() => {});
    settingsApi.update(notifPrefs as Record<string, any>).catch(() => {});
  }, []);

  // ── Auth ─────────────────────────────────────────────────────────────────────

  const login = useCallback((
    email: string, name: string, id: string, avatar: string,
    role?: UserRole, surveyComplete?: boolean
  ) => {
    setUser({ id, name, email, avatar, role, surveyComplete: surveyComplete ?? false });
    setIsAuthenticated(true);
    setActivePage('dashboard');
  }, []);

  const logout = useCallback(() => {
    // Close all WebSockets
    Object.values(wsRefs.current).forEach(ws => ws?.close());
    wsRefs.current = {};

    authApi.logout().catch(() => {});
    clearTokens();
    clearQueue().catch(() => {});
    setIsAuthenticated(false);
    setActivePage('login');
    // Reset state
    setDevices([]);
    setAlerts([]);
    setSettings(DEFAULT_SETTINGS);
    simRef.current = {};
  }, []);

  const deleteAccount = useCallback(async () => {
    // Delete the account on the backend first, then clear local state.
    // If the API call fails we still clear locally so the user isn't stuck.
    try {
      await usersApi.deleteAccount();
    } catch { /* account may already be gone */ }
    Object.values(wsRefs.current).forEach(ws => ws?.close());
    wsRefs.current = {};
    clearTokens();
    try {
      localStorage.removeItem('cw_produce_mode');
      localStorage.removeItem('cw_onboarding_complete');
    } catch { /* */ }
    setIsAuthenticated(false);
    setActivePage('login');
    setDevices([]);
    setAlerts([]);
    setSettings(DEFAULT_SETTINGS);
    simRef.current = {};
  }, []);

  // ── Auto-logout ───────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!isAuthenticated || settings.autoLogoutMinutes === 0) return;
    let timer: ReturnType<typeof setTimeout>;
    const reset = () => {
      clearTimeout(timer);
      timer = setTimeout(() => { clearTokens(); setIsAuthenticated(false); setActivePage('login'); },
        settings.autoLogoutMinutes * 60 * 1000);
    };
    const events = ['mousedown', 'keydown', 'touchstart', 'scroll', 'pointermove'] as const;
    events.forEach(e => window.addEventListener(e, reset, { passive: true }));
    reset();
    return () => { clearTimeout(timer); events.forEach(e => window.removeEventListener(e, reset)); };
  }, [isAuthenticated, settings.autoLogoutMinutes]);

  // ── Control helpers ───────────────────────────────────────────────────────────
  const setTargetTemperature = useCallback((t: number)  => mutateSim({ targetTemperature: t }), [mutateSim]);
  const setTargetHumidity    = useCallback((h: number)  => mutateSim({ targetHumidity: h }),    [mutateSim]);
  const setAutoMode          = useCallback((a: boolean) => mutateSim({ autoMode: a }),           [mutateSim]);
  const startCooling         = useCallback(() => mutateSim({ systemStatus: 'cooling' }),         [mutateSim]);
  const stopCooling          = useCallback(() => mutateSim({ systemStatus: 'idle' }),            [mutateSim]);

  const selectedDevice  = devices.find(d => d.id === selectedDeviceId);
  const deviceStatus    = selectedDevice?.status ?? 'offline';
  const unreadAlertCount = alerts.filter(a => a.status === 'new' || a.status === 'auto_resolved').length;

  // Keep alert-state refs in sync with devices list
  const alertStateRef = useRef<Record<string, { temp: string; humid: string }>>({});
  for (const d of devices) {
    if (!alertStateRef.current[d.id]) alertStateRef.current[d.id] = { temp: 'safe', humid: 'safe' };
  }

  return (
    <AppContext.Provider value={{
      currentTemperature: selectedSim.currentTemperature,
      currentHumidity:    selectedSim.currentHumidity,
      deviceStatus,
      systemStatus:       selectedSim.systemStatus,
      targetTemperature:  selectedSim.targetTemperature,
      targetHumidity:     selectedSim.targetHumidity,
      autoMode:           selectedSim.autoMode,
      sensorHistory:      selectedSim.sensorHistory,
      selectedDeviceId,
      setSelectedDeviceId,
      alerts,
      unreadAlertCount,
      deviceReadings,
      deviceHistories,
      devices,
      deviceConfigs: devices,
      settings,
      user,
      isAuthenticated,
      activePage,
      compactMode,
      setCompactMode,
      produceMode,
      setProduceMode: setProduceModeAndPersist,
      applyProduceProfile,
      setActivePage,
      setTargetTemperature,
      setTargetHumidity,
      setAutoMode,
      startCooling,
      stopCooling,
      acknowledgeAlert,
      resolveAlert,
      acknowledgeAllAlerts,
      updateSettings,
      updateDevice,
      updateDeviceConfig,
      updateUser,
      completeSurvey,
      addDevice,
      updateProduceSetup,
      deleteDevice,
      login,
      logout,
      deleteAccount,
    reconnectWebSockets,
      addToast,
      toasts,
      dismissToast,
      isOnline,
      isAdvancedUser: user.role === 'warehouse_manager',
      isLoading,
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