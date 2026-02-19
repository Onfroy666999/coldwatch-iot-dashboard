import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';

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
  timestamp: Date;
  status: 'new' | 'acknowledged' | 'resolved';
}

export interface Device {
  id: string;
  name: string;
  location: string;
  status: 'online' | 'offline';
  lastSeen: Date;
  firmwareVersion: string;
  batteryLevel: number;
}

// Per-device configurable settings (name, location, calibration offsets, individual thresholds)
export interface DeviceConfig {
  id: string;
  name: string;
  location: string;
  tempOffset: number;       // calibration offset in °C, e.g. -0.5 or +1.2
  humidOffset: number;      // calibration offset in %, e.g. -2 or +3
  useCustomThresholds: boolean;
  warningTemperature: number;
  criticalTemperature: number;
  warningHumidity: number;
  criticalHumidity: number;
}

export interface Settings {
  // Alert thresholds (global defaults)
  warningTemperature: number;
  criticalTemperature: number;
  warningHumidity: number;
  criticalHumidity: number;
  // Notifications
  inAppNotifications: boolean;
  emailAlerts: boolean;
  smsAlerts: boolean;
  alertRepeatInterval: string;
  userPhone: string;
  escalationContact: string;   // backup contact name/number
  // Display
  tempUnit: 'C' | 'F';
  compactMode: boolean;
  // Data & History
  samplingInterval: string;   // '3s' | '10s' | '30s' | '1min'
  dataRetention: string;      // '7d' | '30d' | '90d'
  // Security
  autoLogoutMinutes: number;  // 0 = never
}

export interface User {
  name: string;
  email: string;
  avatar: string;
}

export interface DeviceReading {
  time: string;
  temperature: number;
}

interface AppContextType {
  currentTemperature: number;
  currentHumidity: number;
  deviceStatus: 'online' | 'offline';
  systemStatus: 'cooling' | 'idle' | 'override';
  targetTemperature: number;
  autoMode: boolean;
  alerts: Alert[];
  unreadAlertCount: number;
  sensorHistory: SensorReading[];
  deviceReadings: Record<string, DeviceReading[]>;
  devices: Device[];
  deviceConfigs: DeviceConfig[];
  settings: Settings;
  user: User;
  isAuthenticated: boolean;
  activePage: string;
  setActivePage: (page: string) => void;
  setTargetTemperature: (temp: number) => void;
  setAutoMode: (auto: boolean) => void;
  startCooling: () => void;
  stopCooling: () => void;
  acknowledgeAlert: (id: string) => void;
  resolveAlert: (id: string) => void;
  acknowledgeAllAlerts: () => void;
  updateSettings: (settings: Partial<Settings>) => void;
  updateDeviceConfig: (id: string, config: Partial<DeviceConfig>) => void;
  login: (email: string, password: string) => boolean;
  logout: () => void;
  addToast: (toast: ToastMessage) => void;
  toasts: ToastMessage[];
  dismissToast: (id: string) => void;
}

export interface ToastMessage {
  id: string;
  type: 'success' | 'error' | 'warning' | 'info';
  message: string;
  duration?: number;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

export function AppProvider({ children }: { children: ReactNode }) {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [activePage, setActivePage] = useState('login');
  const [currentTemperature, setCurrentTemperature] = useState(6.5);
  const [currentHumidity, setCurrentHumidity] = useState(72);
  const [deviceStatus] = useState<'online' | 'offline'>('online');
  const [systemStatus, setSystemStatus] = useState<'cooling' | 'idle' | 'override'>('cooling');
  const [targetTemperature, setTargetTemperature] = useState(8);
  const [autoMode, setAutoMode] = useState(true);

  const [alerts, setAlerts] = useState<Alert[]>([
    {
      id: 'alert-init-1',
      severity: 'warning',
      message: 'Warning: Temperature reached 10.2°C at Storage Unit A',
      deviceId: 'device-001',
      timestamp: new Date(Date.now() - 1800000),
      status: 'new',
    },
    {
      id: 'alert-init-2',
      severity: 'critical',
      message: 'Critical: Temperature spike to 15.8°C — check cooling system',
      deviceId: 'device-001',
      timestamp: new Date(Date.now() - 3600000),
      status: 'acknowledged',
    },
    {
      id: 'alert-init-3',
      severity: 'info',
      message: 'Device firmware updated to v2.1.3 successfully',
      deviceId: 'device-001',
      timestamp: new Date(Date.now() - 7200000),
      status: 'resolved',
    },
  ]);

  const [sensorHistory, setSensorHistory] = useState<SensorReading[]>([]);
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const generateDeviceReadings = (baseTemp: number, seed: number): DeviceReading[] => {
    const readings: DeviceReading[] = [];
    for (let i = 23; i >= 0; i--) {
      const hour = new Date(Date.now() - i * 3600000);
      const noise = Math.sin((i + seed) * 0.7) * 1.5 + (Math.random() - 0.5) * 0.8;
      readings.push({
        time: hour.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }),
        temperature: parseFloat((baseTemp + noise).toFixed(1)),
      });
    }
    return readings;
  };

  const [deviceReadings] = useState<Record<string, DeviceReading[]>>({
    'device-001': generateDeviceReadings(7.2, 1),
    'device-002': generateDeviceReadings(11.5, 3),
    'device-003': generateDeviceReadings(16.8, 5),
  });

  const [user] = useState<User>({
    name: 'Kwame Mensah',
    email: 'kwame@coldwatch.gh',
    avatar: 'KM',
  });

  const [devices] = useState<Device[]>([
    {
      id: 'device-001',
      name: 'Storage Unit A',
      location: 'Kumasi Central Market',
      status: 'online',
      lastSeen: new Date(),
      firmwareVersion: '2.1.3',
      batteryLevel: 87,
    },
    {
      id: 'device-002',
      name: 'Storage Unit B',
      location: 'Accra Wholesale Hub',
      status: 'online',
      lastSeen: new Date(Date.now() - 60000),
      firmwareVersion: '2.1.2',
      batteryLevel: 64,
    },
    {
      id: 'device-003',
      name: 'Transport Unit C',
      location: 'Tamale Distribution Center',
      status: 'offline',
      lastSeen: new Date(Date.now() - 3600000),
      firmwareVersion: '2.0.9',
      batteryLevel: 12,
    },
  ]);

  // Per-device configs — mirroring devices but editable
  const [deviceConfigs, setDeviceConfigs] = useState<DeviceConfig[]>([
    {
      id: 'device-001',
      name: 'Storage Unit A',
      location: 'Kumasi Central Market',
      tempOffset: 0,
      humidOffset: 0,
      useCustomThresholds: false,
      warningTemperature: 10,
      criticalTemperature: 15,
      warningHumidity: 80,
      criticalHumidity: 90,
    },
    {
      id: 'device-002',
      name: 'Storage Unit B',
      location: 'Accra Wholesale Hub',
      tempOffset: 0,
      humidOffset: 0,
      useCustomThresholds: false,
      warningTemperature: 10,
      criticalTemperature: 15,
      warningHumidity: 80,
      criticalHumidity: 90,
    },
    {
      id: 'device-003',
      name: 'Transport Unit C',
      location: 'Tamale Distribution Center',
      tempOffset: 0,
      humidOffset: 0,
      useCustomThresholds: false,
      warningTemperature: 10,
      criticalTemperature: 15,
      warningHumidity: 80,
      criticalHumidity: 90,
    },
  ]);

  const [settings, setSettings] = useState<Settings>({
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
    tempUnit: 'C',
    compactMode: false,
    samplingInterval: '3s',
    dataRetention: '30d',
    autoLogoutMinutes: 30,
  });

  const addToast = useCallback((toast: ToastMessage) => {
    setToasts(prev => [...prev, toast]);
    if (toast.duration !== Infinity) {
      setTimeout(() => {
        setToasts(prev => prev.filter(t => t.id !== toast.id));
      }, toast.duration || 4000);
    }
  }, []);

  const dismissToast = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  // Compact mode effect — writes to html element
  useEffect(() => {
    document.documentElement.setAttribute('data-compact', settings.compactMode ? 'true' : 'false');
  }, [settings.compactMode]);

  // Initialize historical data
  useEffect(() => {
    const now = new Date();
    const history: SensorReading[] = [];
    for (let i = 60; i >= 0; i--) {
      const timestamp = new Date(now.getTime() - i * 60000);
      history.push({
        timestamp,
        temperature: 6 + Math.random() * 4 + (i > 30 ? Math.sin(i / 10) * 2 : 0),
        humidity: 70 + Math.random() * 10,
      });
    }
    setSensorHistory(history);
  }, []);

  // Simulate real-time data updates
  useEffect(() => {
    if (!isAuthenticated) return;
    const interval = setInterval(() => {
      if (deviceStatus === 'offline') return;

      setCurrentTemperature(prev => {
        let newTemp = prev + (Math.random() - 0.5) * 0.5;
        if (systemStatus === 'cooling') {
          if (newTemp > targetTemperature) newTemp -= 0.2;
        } else {
          newTemp += 0.1;
        }
        return Math.max(0, Math.min(30, newTemp));
      });

      setCurrentHumidity(prev => {
        const newHumidity = prev + (Math.random() - 0.5) * 2;
        return Math.max(0, Math.min(100, newHumidity));
      });

      setSensorHistory(prev => [
        ...prev.slice(-59),
        { timestamp: new Date(), temperature: currentTemperature, humidity: currentHumidity },
      ]);
    }, 3000);

    return () => clearInterval(interval);
  }, [currentTemperature, currentHumidity, deviceStatus, systemStatus, targetTemperature, isAuthenticated]);

  const unreadAlertCount = alerts.filter(a => a.status === 'new').length;
  const startCooling = () => setSystemStatus('cooling');
  const stopCooling = () => setSystemStatus('idle');

  const acknowledgeAlert = (id: string) =>
    setAlerts(prev => prev.map(a => (a.id === id ? { ...a, status: 'acknowledged' as const } : a)));

  const resolveAlert = (id: string) =>
    setAlerts(prev => prev.map(a => (a.id === id ? { ...a, status: 'resolved' as const } : a)));

  const acknowledgeAllAlerts = () =>
    setAlerts(prev => prev.map(a => (a.status === 'new' ? { ...a, status: 'acknowledged' as const } : a)));

  const updateSettings = (newSettings: Partial<Settings>) =>
    setSettings(prev => ({ ...prev, ...newSettings }));

  const updateDeviceConfig = (id: string, config: Partial<DeviceConfig>) =>
    setDeviceConfigs(prev => prev.map(d => (d.id === id ? { ...d, ...config } : d)));

  const login = (email: string, password: string) => {
    if (email && password) {
      setIsAuthenticated(true);
      setActivePage('dashboard');
      return true;
    }
    return false;
  };

  const logout = () => {
    setIsAuthenticated(false);
    setActivePage('login');
  };

  return (
    <AppContext.Provider
      value={{
        currentTemperature,
        currentHumidity,
        deviceStatus,
        systemStatus,
        targetTemperature,
        autoMode,
        alerts,
        unreadAlertCount,
        sensorHistory,
        deviceReadings,
        devices,
        deviceConfigs,
        settings,
        user,
        isAuthenticated,
        activePage,
        setActivePage,
        setTargetTemperature,
        setAutoMode,
        startCooling,
        stopCooling,
        acknowledgeAlert,
        resolveAlert,
        acknowledgeAllAlerts,
        updateSettings,
        updateDeviceConfig,
        login,
        logout,
        addToast,
        toasts,
        dismissToast,
      }}
    >
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const context = useContext(AppContext);
  if (context === undefined) {
    throw new Error('useApp must be used within an AppProvider');
  }
  return context;
}