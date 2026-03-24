import { createContext, useContext, useState, useEffect, useCallback, useRef, type ReactNode } from 'react';

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
  deviceName: string;     // snapshot at alert time — accurate even after renames
  timestamp: Date;
  status: 'new' | 'acknowledged' | 'resolved' | 'auto_resolved';
  tempC?: number;         // raw °C at time of alert for unit-aware display
  humidityPct?: number;   // raw %RH at time of alert
  // Timeline fields — populated when alert closes
  peakTempC?: number;          // highest temperature recorded during the event
  peakHumidityPct?: number;    // highest humidity recorded during the event
  resolvedAt?: Date;           // when it returned to safe
  durationMinutes?: number;    // how long the breach lasted
  systemAction?: string;       // what auto mode did (e.g. "Auto cooling engaged")
  autoResolved?: boolean;      // true when system resolved without user input
}

// Unified Device interface
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
  // true  = alert when humidity is TOO HIGH (legumes, tubers — prevent mould)
  // false = alert when humidity is TOO LOW  (leafy, fruits — prevent wilting)
  // undefined = defaults to true (matches original behaviour for global settings)
  humidAlertHigh?: boolean;
}

// Backward-compat alias so Settings.tsx import stays unchanged
export type DeviceConfig = Device;

// Per-device simulation state
interface DeviceSimState {
  currentTemperature: number;
  currentHumidity: number;
  systemStatus: 'cooling' | 'idle' | 'override';
  targetTemperature: number;
  targetHumidity: number;
  autoMode: boolean;
  sensorHistory: SensorReading[];
}

//  Settings 
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

export type ProduceMode = 'mixed' | 'tubers' | 'fruits' | 'leafy' | 'legumes';

// Mirrors PRODUCE_PROFILES in ProduceModeSelector — module-level so it's stable
// across renders and can be used in useEffect/useCallback without stale closures.
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
};

export interface ToastMessage {
  id: string;
  type: 'success' | 'error' | 'warning' | 'info';
  message: string;
  duration?: number;
}

//  Defaults and localStorage helpers
const DEFAULT_SETTINGS: Settings = {
  warningTemperature: 10,
  criticalTemperature: 15,
  warningHumidity: 80,
  criticalHumidity: 90,
  inAppNotifications: true,
  emailAlerts: true,
  smsAlerts: false,
  alertRepeatInterval: '15min',
  userPhone: '+233 20 123 4567',
  escalationContact: '',
  compactMode: false,
  tempUnit: 'C',
  samplingInterval: '10s',
  dataRetention: '30d',
  autoLogoutMinutes: 0,
};

const DEFAULT_DEVICES: Device[] = [
  {
    id: 'device-001', name: 'Storage Unit A', location: 'Kumasi Central Market',
    status: 'online', lastSeen: new Date(), firmwareVersion: '2.1.3', batteryLevel: 87,
    tempOffset: 0, humidOffset: 0, useCustomThresholds: false,
    warningTemperature: 10, criticalTemperature: 15, warningHumidity: 80, criticalHumidity: 90,
  },
  {
    id: 'device-002', name: 'Storage Unit B', location: 'Accra Wholesale Hub',
    status: 'online', lastSeen: new Date(Date.now() - 60000), firmwareVersion: '2.1.2', batteryLevel: 64,
    tempOffset: -0.5, humidOffset: 0, useCustomThresholds: false,
    warningTemperature: 10, criticalTemperature: 15, warningHumidity: 80, criticalHumidity: 90,
  },
  {
    id: 'device-003', name: 'Transport Unit C', location: 'Tamale Distribution Center',
    status: 'offline', lastSeen: new Date(Date.now() - 3600000), firmwareVersion: '2.0.9', batteryLevel: 12,
    tempOffset: 0, humidOffset: 0, useCustomThresholds: false,
    warningTemperature: 10, criticalTemperature: 15, warningHumidity: 80, criticalHumidity: 90,
  },
];

// Distinct baselines per device so they all feel independent
const DEVICE_BASELINES: Record<string, { temp: number; humid: number }> = {
  'device-001': { temp: 6.5,  humid: 72 },
  'device-002': { temp: 11.2, humid: 68 },
  'device-003': { temp: 18.4, humid: 55 },
};

function buildInitialSimState(deviceId: string, isOnline: boolean): DeviceSimState {
  const b = DEVICE_BASELINES[deviceId] ?? { temp: 8, humid: 70 };
  const now = new Date();
  const sensorHistory: SensorReading[] = [];
  for (let i = 60; i >= 0; i--) {
    sensorHistory.push({
      timestamp: new Date(now.getTime() - i * 60000),
      temperature: b.temp + Math.random() * 3 + (i > 30 ? Math.sin(i / 10) * 1.5 : 0),
      humidity:    b.humid + Math.random() * 8,
    });
  }
  return {
    currentTemperature: b.temp,
    currentHumidity:    b.humid,
    systemStatus:       isOnline ? 'cooling' : 'idle',
    targetTemperature:  8,
    targetHumidity:     85,
    autoMode:           true,
    sensorHistory,
  };
}

//  localStorage helpers 
function loadSettings(): Settings {
  try { const s = localStorage.getItem('cw_settings'); if (s) return { ...DEFAULT_SETTINGS, ...JSON.parse(s) }; } catch { /* */ }
  return DEFAULT_SETTINGS;
}
function saveSettings(s: Settings) { try { localStorage.setItem('cw_settings', JSON.stringify(s)); } catch { /* */ } }

function loadDevices(): Device[] {
  try {
    const s = localStorage.getItem('cw_devices');
    if (s) return JSON.parse(s).map((d: Device) => ({ ...d, lastSeen: new Date(d.lastSeen) }));
  } catch { /* */ }
  return DEFAULT_DEVICES;
}
function saveDevices(d: Device[]) { try { localStorage.setItem('cw_devices', JSON.stringify(d)); } catch { /* */ } }

// Context type and provider
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
  completeSurvey: (role: UserRole, produceMode: ProduceMode, notifPrefs: Partial<Settings>, notificationEmail?: string) => void;
  addDevice: (name: string, location: string) => void;
  deleteDevice: (id: string) => void;
  login: (email: string, name: string, id: string, avatar: string) => void;
  logout: () => void;
  deleteAccount: () => void;
  addToast: (toast: ToastMessage) => void;
  toasts: ToastMessage[];
  dismissToast: (id: string) => void;
  isOnline: boolean;
  isAdvancedUser: boolean;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

export function AppProvider({ children }: { children: ReactNode }) {

  // Authentication State
  const getInitialAuth = () => {
    try {
      const session = JSON.parse(localStorage.getItem('cw_session') || 'null');
      const users   = JSON.parse(localStorage.getItem('cw_users')   || '[]');
      if (session?.remember && session?.userId) {
        const stored = users.find((u: any) => u.id === session.userId);
        if (stored) return {
          authed: true,
          user: { id: stored.id, name: stored.name, email: stored.email || '', avatar: stored.avatar, profilePicture: stored.profilePicture || '', role: stored.role, surveyComplete: stored.surveyComplete ?? false, notificationEmail: stored.notificationEmail || '' },
        };
      }
    } catch { /* */ }
    return { authed: false, user: { id: '', name: 'User', email: '', avatar: 'U' } };
  };

  const initAuth = getInitialAuth();
  const [isAuthenticated, setIsAuthenticated] = useState(initAuth.authed);
  const [activePage, setActivePage]           = useState(initAuth.authed ? 'dashboard' : 'login');
  const [user, setUser]                       = useState<User>(initAuth.user);

  //  Settings 
  const [settings, setSettings] = useState<Settings>(loadSettings);
  const compactMode = settings.compactMode;
  const setCompactMode = useCallback((v: boolean) => {
    setSettings(prev => { const next = { ...prev, compactMode: v }; saveSettings(next); return next; });
  }, []);

  //  Devices 
  const [devices, setDevices] = useState<Device[]>(loadDevices);

  //  Selected device ID 
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>(() => {
    const list = loadDevices();
    return list.find(d => d.status === 'online')?.id ?? list[0]?.id ?? 'device-001';
  });

  //  Per-device simulation — lives in a ref to avoid re-render on every tick
  const simRef = useRef<Record<string, DeviceSimState>>({});
  if (Object.keys(simRef.current).length === 0) {
    for (const d of loadDevices()) {
      simRef.current[d.id] = buildInitialSimState(d.id, d.status === 'online');
    }
  }

  // Tracks last alert severity per device so we only fire on transitions
  type AlertLevel = 'safe' | 'warning' | 'critical';
  const alertStateRef = useRef<Record<string, { temp: AlertLevel; humid: AlertLevel }>>({});
  // Tracks when each breach started and the peak reading seen during it
  const alertBreachRef = useRef<Record<string, {
    tempStart?: Date; tempPeak?: number; tempAlertIds?: string[];
    humidStart?: Date; humidPeak?: number; humidAlertIds?: string[];
  }>>({});
  for (const d of devices) {
    if (!alertStateRef.current[d.id]) {
      alertStateRef.current[d.id] = { temp: 'safe', humid: 'safe' };
    }
    if (!alertBreachRef.current[d.id]) {
      alertBreachRef.current[d.id] = {};
    }
  }

  // React state for the selected device — triggers re-renders for the UI
  const [selectedSim, setSelectedSim] = useState<DeviceSimState>(
    () => simRef.current[selectedDeviceId] ?? buildInitialSimState(selectedDeviceId, true)
  );

  // Sync when user switches devices
  useEffect(() => {
    const sim = simRef.current[selectedDeviceId];
    if (sim) setSelectedSim({ ...sim });
  }, [selectedDeviceId]);

  // Produce mode 
  const [produceMode, setProduceMode] = useState<ProduceMode>(() => {
    try { return (localStorage.getItem('cw_produce_mode') as ProduceMode) || 'mixed'; } catch { return 'mixed'; }
  });

  // FIX: was misspelled as "setProdcueModeAndPersist"
  const setProduceModeAndPersist = useCallback((mode: ProduceMode) => {
    setProduceMode(mode);
    try { localStorage.setItem('cw_produce_mode', mode); } catch { /* */ }
  }, []);

  // Produce profile thresholds 
  // applyProduceProfile: sets produceMode AND updates all devices' targets + thresholds
  const applyProduceProfile = useCallback((mode: ProduceMode) => {
    setProduceMode(mode);
    try { localStorage.setItem('cw_produce_mode', mode); } catch { /* */ }

    const thresholds = PRODUCE_THRESHOLDS[mode];

    // Update device alert thresholds
    setDevices(prev => {
      const updated = prev.map(d => ({ ...d, ...thresholds }));
      saveDevices(updated);
      return updated;
    });

  
    // gauge, stepper, and presets all reflect the produce profile immediately.
    // simRef and setSelectedSim are in scope here — same pattern as mutateSim.
    const simPatch = {
      targetTemperature: thresholds.targetTemperature,
      targetHumidity:    thresholds.targetHumidity,
    };
    if (simRef.current[selectedDeviceId]) {
      simRef.current[selectedDeviceId] = { ...simRef.current[selectedDeviceId], ...simPatch };
    }
    setSelectedSim(prev => ({ ...prev, ...simPatch }));
  }, [selectedDeviceId]);

  // Apply saved produce mode to sim targets on mount — buildInitialSimState
  // always starts at 8°C regardless of produce type. This ensures returning
  // users see the correct targets immediately without having to re-select.
  useEffect(() => {
    if (!isAuthenticated) return;
    const thresholds = PRODUCE_THRESHOLDS[produceMode];
    const simPatch = {
      targetTemperature: thresholds.targetTemperature,
      targetHumidity:    thresholds.targetHumidity,
    };
    Object.keys(simRef.current).forEach(id => {
      simRef.current[id] = { ...simRef.current[id], ...simPatch };
    });
    setSelectedSim(prev => ({ ...prev, ...simPatch }));
  }, [isAuthenticated]);

  // Alerts  
 // Seed alerts — use device names from the loaded list so renames are reflected
  const [alerts, setAlerts] = useState<Alert[]>(() => {
    const list = loadDevices();
    const name = (id: string) => list.find(d => d.id === id)?.name ?? id;
    return [
      { id: 'a1', severity: 'warning',  deviceId: 'device-001', deviceName: name('device-001'), tempC: 10.2,  timestamp: new Date(Date.now() - 1800000),  status: 'new',          message: `Temperature reached 10.2°C at ${name('device-001')}` },
      { id: 'a2', severity: 'critical', deviceId: 'device-002', deviceName: name('device-002'), tempC: 15.8,  timestamp: new Date(Date.now() - 3600000),  status: 'acknowledged', message: `Temperature spike to 15.8°C at ${name('device-002')} — check cooling` },
      { id: 'a3', severity: 'info',     deviceId: 'device-001', deviceName: name('device-001'),              timestamp: new Date(Date.now() - 7200000),  status: 'resolved',     message: `Firmware updated to v2.1.3 on ${name('device-001')}` },
    ];
  });

  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  // Online/offline detection
  const [isOnline, setIsOnline] = useState(() => navigator.onLine);
  useEffect(() => {
    const handleOnline  = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online',  handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online',  handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  //  Per-device sparkline data
  const generateDeviceReadings = (baseTemp: number, seed: number): DeviceReading[] => {
    const r: DeviceReading[] = [];
    for (let i = 23; i >= 0; i--) {
      const h = new Date(Date.now() - i * 3600000);
      const n = Math.sin((i + seed) * 0.7) * 1.5 + (Math.random() - 0.5) * 0.8;
      r.push({ time: h.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }), temperature: parseFloat((baseTemp + n).toFixed(1)) });
    }
    return r;
  };

  //  Per-device sparkline data — useRef so addDevice can inject entries
  const deviceReadingsRef = useRef<Record<string, DeviceReading[]>>({
    'device-001': generateDeviceReadings(7.2,  1),
    'device-002': generateDeviceReadings(11.5, 3),
    'device-003': generateDeviceReadings(16.8, 5),
  });
  // Expose as state so consumers re-render when new devices are added
  const [deviceReadings, setDeviceReadings] = useState(deviceReadingsRef.current);
  const [deviceHistories, setDeviceHistories] = useState<Record<string, SensorReading[]>>(
    () => Object.fromEntries(Object.entries(simRef.current).map(([id, sim]) => [id, sim.sensorHistory]))
  );

  // Simulation — runs for all online devices every 3 seconds 
  useEffect(() => {
    if (!isAuthenticated) return;
    const interval = setInterval(() => {
      let selectedChanged = false;

      for (const device of devices) {
        const sim = simRef.current[device.id];
        if (!sim || device.status === 'offline') continue;

        const newTemp = (() => {
          let t = sim.currentTemperature + (Math.random() - 0.5) * 0.5;
          const fresh = simRef.current[device.id];
          if (fresh.systemStatus === 'cooling' && t > fresh.targetTemperature) t -= 0.2;
          else if (fresh.systemStatus !== 'cooling') t += 0.1;
          return Math.max(0, Math.min(30, t));
        })();
        const newHumid = (() => {
          let h = sim.currentHumidity + (Math.random() - 0.5) * 1.5;
          const fresh = simRef.current[device.id];
          if (h < fresh.targetHumidity) h += 0.3;
          else if (h > fresh.targetHumidity) h -= 0.3;
          return Math.max(0, Math.min(100, h));
        })();

        simRef.current[device.id] = {
          ...simRef.current[device.id],   // read fresh — not the stale `sim` snapshot
          currentTemperature: newTemp,
          currentHumidity:    newHumid,
          sensorHistory: [
            ...sim.sensorHistory.slice(-59),
            { timestamp: new Date(), temperature: newTemp, humidity: newHumid },
          ],
        };

        if (device.id === selectedDeviceId) selectedChanged = true;

        //  Alert threshold detection 
        // changes in Settings page take effect immediately for new alerts.
        const warnTemp  = device.useCustomThresholds ? device.warningTemperature  : settings.warningTemperature;
        const critTemp  = device.useCustomThresholds ? device.criticalTemperature  : settings.criticalTemperature;
        const warnHumid = device.useCustomThresholds ? device.warningHumidity      : settings.warningHumidity;
        const critHumid = device.useCustomThresholds ? device.criticalHumidity     : settings.criticalHumidity;

        const newTempLevel: AlertLevel  = newTemp  >= critTemp  ? 'critical' : newTemp  >= warnTemp  ? 'warning' : 'safe';

        // Humidity alert direction: most crops alert on HIGH humidity (mould risk).
        // High-humidity crops (leafy, fruits) alert on LOW humidity (wilting risk).
        // humidAlertHigh defaults to true when not set (preserves original behaviour).
        const humidAlertHigh = device.humidAlertHigh !== false;
        const newHumidLevel: AlertLevel = humidAlertHigh
          ? (newHumid >= critHumid ? 'critical' : newHumid >= warnHumid ? 'warning' : 'safe')
          : (newHumid <= critHumid ? 'critical' : newHumid <= warnHumid ? 'warning' : 'safe');

        const prevLevels = alertStateRef.current[device.id] ?? { temp: 'safe', humid: 'safe' };
        const breach     = alertBreachRef.current[device.id] ?? {};
        const newAlerts: Alert[] = [];
        const now = new Date();

        // Temperature: breach opened 
        if (newTempLevel !== 'safe' && prevLevels.temp === 'safe') {
          const alertId = `alert-${Date.now()}-t-${device.id}`;
          breach.tempStart    = now;
          breach.tempPeak     = newTemp;
          breach.tempAlertIds = [alertId];
          newAlerts.push({
            id: alertId,
            severity: newTempLevel,
            deviceId: device.id,
            deviceName: device.name,
            timestamp: now,
            status: 'new',
            tempC: parseFloat(newTemp.toFixed(1)),
            message: `${newTempLevel === 'critical' ? 'Critical' : 'Warning'}: Temperature ${newTemp.toFixed(1)}°C at ${device.name}`,
          });
        }

        //  Temperature: breach escalated (warn → critical)
        if (newTempLevel === 'critical' && prevLevels.temp === 'warning') {
          const alertId = `alert-${Date.now()}-tc-${device.id}`;
          breach.tempAlertIds = [...(breach.tempAlertIds ?? []), alertId]; // keep original warning ID too
          newAlerts.push({
            id: alertId,
            severity: 'critical',
            deviceId: device.id,
            deviceName: device.name,
            timestamp: now,
            status: 'new',
            tempC: parseFloat(newTemp.toFixed(1)),
            message: `Critical: Temperature escalated to ${newTemp.toFixed(1)}°C at ${device.name}`,
          });
        }

        //  Temperature: track peak during breach
        if (newTempLevel !== 'safe' && breach.tempPeak !== undefined) {
          breach.tempPeak = Math.max(breach.tempPeak, newTemp);
        }

        //  Temperature: breach closed → auto-resolve if auto mode on 
        if (newTempLevel === 'safe' && prevLevels.temp !== 'safe') {
          const sim = simRef.current[device.id];
          if (sim?.autoMode && breach.tempAlertIds?.length) {
            const duration  = breach.tempStart
              ? Math.round((now.getTime() - breach.tempStart.getTime()) / 60000)
              : undefined;
            const peak      = breach.tempPeak;
            const alertIds  = breach.tempAlertIds;
            setAlerts(prev => prev.map(a => {
              if (!alertIds.includes(a.id)) return a;
              return {
                ...a,
                status:          'auto_resolved',
                autoResolved:    true,
                resolvedAt:      now,
                durationMinutes: duration,
                peakTempC:       peak != null ? parseFloat(peak.toFixed(1)) : undefined,
                systemAction:    'Auto cooling engaged — temperature returned to safe range',
              };
            }));
          }
          breach.tempStart    = undefined;
          breach.tempPeak     = undefined;
          breach.tempAlertIds = undefined;
        }

        //  Humidity: breach opened
          if (newHumidLevel !== 'safe' && prevLevels.humid === 'safe') {
          const alertId = `alert-${Date.now()}-h-${device.id}`;
          breach.humidStart    = now;
          breach.humidPeak     = newHumid;
          breach.humidAlertIds = [alertId];
          newAlerts.push({
            id: alertId,
            severity: newHumidLevel,
            deviceId: device.id,
            deviceName: device.name,
            timestamp: now,
            status: 'new',
            humidityPct: parseFloat(newHumid.toFixed(1)),
            message: `${newHumidLevel === 'critical' ? 'Critical' : 'Warning'}: Humidity ${newHumid.toFixed(0)}% at ${device.name}`,
          });
        }

        //  Humidity: track peak 
        if (newHumidLevel !== 'safe' && breach.humidPeak !== undefined) {
          breach.humidPeak = Math.max(breach.humidPeak, newHumid);
        }

        //  Humidity: breach closed → auto-resolve if auto mode on
          if (newHumidLevel === 'safe' && prevLevels.humid !== 'safe') {
          const sim = simRef.current[device.id];
          if (sim?.autoMode && breach.humidAlertIds?.length) {
            const duration  = breach.humidStart
              ? Math.round((now.getTime() - breach.humidStart.getTime()) / 60000)
              : undefined;
            const peak      = breach.humidPeak;
            const alertIds  = breach.humidAlertIds;
            setAlerts(prev => prev.map(a => {
              if (!alertIds.includes(a.id)) return a;
              return {
                ...a,
                status:          'auto_resolved',
                autoResolved:    true,
                resolvedAt:      now,
                durationMinutes: duration,
                peakHumidityPct: peak != null ? parseFloat(peak.toFixed(1)) : undefined,
                systemAction:    'Auto mode corrected humidity levels',
              };
            }));
          }
          breach.humidStart    = undefined;
          breach.humidPeak     = undefined;
          breach.humidAlertIds = undefined;
        }

        alertStateRef.current[device.id]  = { temp: newTempLevel, humid: newHumidLevel };
        alertBreachRef.current[device.id] = breach;
        if (newAlerts.length > 0) {
          setAlerts(prev => [...newAlerts, ...prev]);
        }
      }

      if (selectedChanged) setSelectedSim({ ...simRef.current[selectedDeviceId] });
      // Update all per-device histories so History page can switch devices independently
      setDeviceHistories(Object.fromEntries(
        devices.map(d => [d.id, simRef.current[d.id]?.sensorHistory ?? []])
      ));
    }, 3000);

    return () => clearInterval(interval);
  // FIX: added `settings` to dependency array so alert thresholds stay in sync
  }, [isAuthenticated, devices, selectedDeviceId, settings]);

  // Mutate sim for selected device (controls, mode changes) 
  const mutateSim = useCallback((patch: Partial<DeviceSimState>) => {
    simRef.current[selectedDeviceId] = { ...simRef.current[selectedDeviceId], ...patch };
    setSelectedSim(prev => ({ ...prev, ...patch }));
  }, [selectedDeviceId]);

  // Toasts
  const addToast = useCallback((toast: ToastMessage) => {
    setToasts(prev => [...prev, toast]);
    if (toast.duration !== Infinity) setTimeout(() => setToasts(prev => prev.filter(t => t.id !== toast.id)), toast.duration || 4000);
  }, []);
  const dismissToast = useCallback((id: string) => setToasts(prev => prev.filter(t => t.id !== id)), []);

  //  Alert helpers
  const unreadAlertCount = alerts.filter(a => a.status === 'new' || a.status === 'auto_resolved').length;
  const acknowledgeAlert     = (id: string) => setAlerts(prev => prev.map(a => a.id === id ? { ...a, status: 'acknowledged' as const } : a));
  const resolveAlert         = (id: string) => setAlerts(prev => prev.map(a => a.id === id ? { ...a, status: 'resolved'     as const } : a));
  const acknowledgeAllAlerts = () => setAlerts(prev => prev.map(a =>
    (a.status === 'new' || a.status === 'auto_resolved') ? { ...a, status: 'acknowledged' as const } : a
  ));

  //  Settings 
  const updateSettings = useCallback((patch: Partial<Settings>) => {
    setSettings(prev => { const next = { ...prev, ...patch }; saveSettings(next); return next; });
  }, []);

  // Devices
  const updateDevice = useCallback((id: string, patch: Partial<Device>) => {
    setDevices(prev => { const next = prev.map(d => d.id === id ? { ...d, ...patch } : d); saveDevices(next); return next; });
  }, []);
  const updateDeviceConfig = updateDevice;

  // User profile 
  const updateUser = useCallback((patch: Partial<User>) => {
    setUser(prev => {
      const next = { ...prev, ...patch };
      try {
        const users = JSON.parse(localStorage.getItem('cw_users') || '[]');
        const updated = users.map((u: any) => u.id === next.id ? { ...u, ...patch } : u);
        localStorage.setItem('cw_users', JSON.stringify(updated));
      } catch { /* */ }
      return next;
    });
  }, []);

  // ── Survey completion — sets role, produce mode, and notification prefs ──
  const completeSurvey = useCallback((role: UserRole, pm: ProduceMode, notifPrefs: Partial<Settings>, notificationEmail?: string) => {
    // Update user role, surveyComplete, and optional notificationEmail
    setUser(prev => {
      const next = { ...prev, role, surveyComplete: true, ...(notificationEmail ? { notificationEmail } : {}) };
      try {
        const users = JSON.parse(localStorage.getItem('cw_users') || '[]');
        const updated = users.map((u: any) => u.id === next.id
          ? { ...u, role, surveyComplete: true, ...(notificationEmail ? { notificationEmail } : {}) }
          : u
        );
        localStorage.setItem('cw_users', JSON.stringify(updated));
      } catch { /* */ }
      return next;
    });
    // FIX: call applyProduceProfile instead of setProduceMode directly —
    // this ensures device alert thresholds AND sim targets are both updated
    // to match the produce type the user selected in the survey.
    applyProduceProfile(pm);

    // Apply notification preferences
    setSettings(prev => {
      const next = { ...prev, ...notifPrefs };
      saveSettings(next);
      return next;
    });
  }, [applyProduceProfile]);

  const addDevice = useCallback((name: string, location: string) => {
    const newId = `device-${Date.now()}`;
    const newDevice: Device = {
      id: newId, name, location, status: 'offline', lastSeen: new Date(),
      firmwareVersion: '2.1.3', batteryLevel: 100,
      tempOffset: 0, humidOffset: 0, useCustomThresholds: false,
      // Inherit live global thresholds at creation time
      warningTemperature: settings.warningTemperature,
      criticalTemperature: settings.criticalTemperature,
      warningHumidity: settings.warningHumidity,
      criticalHumidity: settings.criticalHumidity,
    };
    setDevices(prev => { const next = [...prev, newDevice]; saveDevices(next); return next; });
    simRef.current[newId]          = buildInitialSimState(newId, false);
    alertStateRef.current[newId]   = { temp: 'safe', humid: 'safe' };
    alertBreachRef.current[newId]  = {};
    // Seed sparkline data for the new device so it has readings from the start
    const baseline = DEVICE_BASELINES[newId] ?? { temp: 8, humid: 70 };
    deviceReadingsRef.current[newId] = generateDeviceReadings(baseline.temp, Math.random() * 10);
    setDeviceReadings({ ...deviceReadingsRef.current });
  }, [settings]);

  const deleteDevice = useCallback((id: string) => {
    let remaining: Device[] = [];
    setDevices(prev => {
      remaining = prev.filter(d => d.id !== id);
      saveDevices(remaining);
      return remaining;
    });
    // Clean up all per-device refs so the simulation loop doesn't process a ghost device
    delete simRef.current[id];
    delete alertStateRef.current[id];
    delete alertBreachRef.current[id];
    delete deviceReadingsRef.current[id];
    setDeviceReadings(prev => { const next = { ...prev }; delete next[id]; return next; });
    // If the deleted device was selected, fall back to the first remaining device
    setSelectedDeviceId(prev => {
      if (prev !== id) return prev;
      return remaining[0]?.id ?? '';
    });
  }, []);

  // Auth
  const login = (email: string, name: string, id: string, avatar: string) => {
    // Restore full profile from localStorage so role and profilePicture survive sign-in
    try {
      const users  = JSON.parse(localStorage.getItem('cw_users') || '[]');
      const stored = users.find((u: any) => u.id === id);
      if (stored) {
        setUser({
          id, name, email, avatar,
          profilePicture:    stored.profilePicture || '',
          role:              stored.role,
          surveyComplete:    stored.surveyComplete ?? false,
          notificationEmail: stored.notificationEmail || '',
        });
      } else {
        setUser({ id, name, email, avatar });
      }
    } catch {
      setUser({ id, name, email, avatar });
    }
    setIsAuthenticated(true);
    setActivePage('dashboard');
  };

  const logout = () => {
    localStorage.removeItem('cw_session');
    setIsAuthenticated(false);
    setActivePage('login');
  };

  const deleteAccount = () => {
    try {
      // Remove this user from the users list
      const users   = JSON.parse(localStorage.getItem('cw_users') || '[]');
      const session = JSON.parse(localStorage.getItem('cw_session') || 'null');
      if (session?.userId) {
        const updated = users.filter((u: any) => u.id !== session.userId);
        localStorage.setItem('cw_users', JSON.stringify(updated));
      }
      // Clear all session and app data for this user
      localStorage.removeItem('cw_session');
      localStorage.removeItem('cw_settings');
      localStorage.removeItem('cw_devices');
      localStorage.removeItem('cw_produce_mode');
      localStorage.removeItem('cw_onboarding_complete');
    } catch { /* */ }
    setIsAuthenticated(false);
    setActivePage('login');
  };

  // Auto-logout on inactivity
  useEffect(() => {
    if (!isAuthenticated || settings.autoLogoutMinutes === 0) return;
    let timer: ReturnType<typeof setTimeout>;
    const reset = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        localStorage.removeItem('cw_session');
        setIsAuthenticated(false);
        setActivePage('login');
      }, settings.autoLogoutMinutes * 60 * 1000);
    };
    const events = ['mousedown', 'keydown', 'touchstart', 'scroll', 'pointermove'] as const;
    events.forEach(e => window.addEventListener(e, reset, { passive: true }));
    reset(); // start the timer immediately
    return () => {
      clearTimeout(timer);
      events.forEach(e => window.removeEventListener(e, reset));
    };
  }, [isAuthenticated, settings.autoLogoutMinutes]);

  //  Control helpers (all target the selected device) 
  const setTargetTemperature = useCallback((t: number)  => mutateSim({ targetTemperature: t }), [mutateSim]);
  const setTargetHumidity    = useCallback((h: number)  => mutateSim({ targetHumidity: h }),    [mutateSim]);
  const setAutoMode          = useCallback((a: boolean) => mutateSim({ autoMode: a }),           [mutateSim]);
  const startCooling         = useCallback(() => mutateSim({ systemStatus: 'cooling' }),         [mutateSim]);
  const stopCooling          = useCallback(() => mutateSim({ systemStatus: 'idle' }),            [mutateSim]);

  const selectedDevice = devices.find(d => d.id === selectedDeviceId);
  const deviceStatus   = selectedDevice?.status ?? 'offline';

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
      deleteDevice,
      login,
      logout,
      deleteAccount,
      addToast,
      toasts,
      dismissToast,
      isOnline,
      isAdvancedUser: user.role === 'warehouse_manager',
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