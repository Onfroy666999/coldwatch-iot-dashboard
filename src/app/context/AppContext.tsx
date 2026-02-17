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
}

export interface User {
  name: string;
  email: string;
  avatar: string;
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
  devices: Device[];
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
      message: 'Critical: Temperature spike to 15.8°C detected — check cooling system',
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

  const acknowledgeAlert = (id: string) => {
    setAlerts(prev => prev.map(a => (a.id === id ? { ...a, status: 'acknowledged' as const } : a)));
  };

  const resolveAlert = (id: string) => {
    setAlerts(prev => prev.map(a => (a.id === id ? { ...a, status: 'resolved' as const } : a)));
  };

  const acknowledgeAllAlerts = () => {
    setAlerts(prev => prev.map(a => (a.status === 'new' ? { ...a, status: 'acknowledged' as const } : a)));
  };

  const updateSettings = (newSettings: Partial<Settings>) => {
    setSettings(prev => ({ ...prev, ...newSettings }));
  };

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
        devices,
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
