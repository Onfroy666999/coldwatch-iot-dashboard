// ── useDevices ────────────────────────────────────────────────────────────────
//
// Owns everything related to devices, sim state, and WebSocket connections:
//   - devices, selectedDeviceId, selectedSim, deviceReadings, deviceHistories
//   - openWebSocket / reconnectWebSockets — one WS per online device
//   - addDevice / updateDevice / deleteDevice
//   - applyProduceProfile / updateProduceSetup
//   - mutateSim and the five sim-control shortcuts
//   - seedDevices — for AppProvider bootstrap seeding
//
// Coupling notes:
//   - Receives `addAlert` from useAlerts — called when a WebSocket message
//     arrives with type 'alert'. One-directional: useDevices knows about
//     useAlerts, but useAlerts knows nothing about useDevices.
//   - Receives `addToast` from the provider — addDevice shows success/error
//     toasts but toast state doesn't belong here.
//   - WebSocket reconnection inside openWebSocket's onClose callback calls
//     openWebSocket itself via setTimeout. Because selectedDeviceId is a dep
//     of openWebSocket, the reconnected WS uses the freshest version of that
//     check. This is intentional and matches the original AppContext behaviour
//     (see eslint-disable-line below).

import { useState, useCallback, useEffect, useRef, MutableRefObject } from 'react';
import { devicesApi } from '../Lib/api';
import { enqueueAction } from '../Lib/ActionQueue';
import { getToken } from '../Lib/tokenStorage';
import {
  PRODUCE_THRESHOLDS, DEFAULT_SETTINGS, getStateAdjustedTargets,
  mapDevice, buildInitialSimState,
} from './types';
import { saveLastReading, loadLastReading, saveBootstrapCache, loadBootstrapCache } from './offlineCache';
import type {
  Device, DeviceSimState, SensorReading, DeviceReading,
  ProduceMode, ProduceState, ToastMessage,
} from './types';
import { connectWebSocket } from '../Lib/api';

// ── Retry classification ─────────────────────────────────────────────────────
// An action should only be queued for offline retry when the failure was
// transient (no connection, or the server itself errored). A 4xx response
// means the request was actively rejected — invalid device code, already
// claimed, failed validation, etc. — and will *never* succeed by retrying,
// so it must not be queued. Queuing 4xx failures is what caused devices with
// codes that don't exist in DeviceRegistry to "come back" later once that
// code was eventually claimed by someone else.
function isRetryableError(err: any): boolean {
  const status = err?.status;
  return status === 0 || status === undefined || status >= 500;
}

// ── Types ─────────────────────────────────────────────────────────────────────

export interface UseDevicesOptions {
  /** Called when a WebSocket alert message arrives. Owned by useAlerts. */
  addAlert: (raw: any) => void;
  /** Called after addDevice succeeds or fails. Owned by AppProvider. */
  addToast: (toast: ToastMessage) => void;
}

export interface UseDevicesReturn {
  devices: Device[];
  selectedDeviceId: string;
  selectedSim: DeviceSimState;
  deviceReadings: Record<string, DeviceReading[]>;
  deviceHistories: Record<string, SensorReading[]>;
  produceMode: ProduceMode;
  openWebSocket: (deviceId: string) => void;
  reconnectWebSockets: () => void;
  setSelectedDeviceId: (id: string) => void;
  setProduceMode: (mode: ProduceMode) => void;
  mutateSim: (patch: Partial<DeviceSimState>) => void;
  setTargetTemperature: (t: number)  => void;
  setTargetHumidity:    (h: number)  => void;
  setAutoMode:          (a: boolean) => void;
  startCooling:         () => void;
  stopCooling:          () => void;
  applyProduceProfile: (deviceId: string, mode: ProduceMode) => void;
  addDevice: (
    name: string,
    location: string,
    produceInfo?: { produceMode: ProduceMode; produceState: ProduceState; facilitySize: 'small' | 'medium' | 'large'; transportHours: number },
    deviceCode?: string,
    unitName?: string,
  ) => Promise<Device>;
  updateDevice: (id: string, patch: Partial<Device>) => void;
  updateProduceSetup: (
    deviceId: string,
    produceInfo: { produceMode: ProduceMode; produceState: ProduceState; facilitySize?: Device['facilitySize']; transportHours?: number }
  ) => void;
  deleteDevice: (id: string) => void;
  /** Seed device state from bootstrap — not for arbitrary mutation. */
  seedDevices: (rawDevices: any[], options?: { selectedDeviceId?: string }) => void;
  refreshDevices: () => Promise<void>;
  /** Expose wsRefs so AppProvider can close all sockets on logout. */
  wsRefs: MutableRefObject<Record<string, WebSocket | null>>;
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useDevices({ addAlert, addToast }: UseDevicesOptions): UseDevicesReturn {

  // ── State ─────────────────────────────────────────────────────────────────

  const [devices,          setDevices]          = useState<Device[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>('');
  const [selectedSim,      setSelectedSim]      = useState<DeviceSimState>({
    currentTemperature: 8, currentHumidity: 80,
    systemStatus: 'cooling', targetTemperature: 8, targetHumidity: 85,
    autoMode: true, sensorHistory: [],
  });
  const [deviceReadings,  setDeviceReadings]  = useState<Record<string, DeviceReading[]>>({});
  const [deviceHistories, setDeviceHistories] = useState<Record<string, SensorReading[]>>({});
  const [produceMode,     setProduceMode]     = useState<ProduceMode>('mixed');

  // ── Refs ──────────────────────────────────────────────────────────────────

  const simRef            = useRef<Record<string, DeviceSimState>>({});
  const wsRefs            = useRef<Record<string, WebSocket | null>>({});
  const deviceReadingsRef = useRef<Record<string, DeviceReading[]>>({});
  const alertStateRef     = useRef<Record<string, { temp: string; humid: string }>>({});

  // ── Sync selectedDeviceId → selectedSim ──────────────────────────────────
  // When the user switches devices, snap the displayed sim to the stored state
  // for that device without waiting for the next WebSocket reading.

  useEffect(() => {
    const sim = simRef.current[selectedDeviceId];
    if (sim) setSelectedSim({ ...sim });
  }, [selectedDeviceId]);

  // Keep alertStateRef in sync as devices are added/removed
  useEffect(() => {
    for (const d of devices) {
      if (!alertStateRef.current[d.id]) {
        alertStateRef.current[d.id] = { temp: 'safe', humid: 'safe' };
      }
    }
  }, [devices]);

  // ── openWebSocket ─────────────────────────────────────────────────────────
  // Opens one WebSocket per device. The onClose callback reconnects after 5s
  // — it calls openWebSocket recursively via setTimeout, which is why
  // selectedDeviceId is in the dependency array (the reading handler reads it
  // to decide whether to update selectedSim). eslint-disable-line is intentional.

  const openWebSocket = useCallback((deviceId: string) => {
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
            lastReadingAt:      now.getTime(),
            sensorHistory: [
              ...(simRef.current[deviceId]?.sensorHistory ?? []).slice(-59),
              reading,
            ],
          };

          saveLastReading(deviceId, temperature, humidity);

          if (deviceId === selectedDeviceId) {
            setSelectedSim(prev => ({ ...prev, currentTemperature: temperature, currentHumidity: humidity, lastReadingAt: now.getTime() }));
          }

          setDeviceHistories(prev => ({
            ...prev,
            [deviceId]: [...(simRef.current[deviceId]?.sensorHistory ?? [])],
          }));

          const timeStr = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
          deviceReadingsRef.current[deviceId] = [
            ...(deviceReadingsRef.current[deviceId] ?? []).slice(-23),
            { time: timeStr, temperature },
          ];
          setDeviceReadings(prev => ({ ...prev, [deviceId]: deviceReadingsRef.current[deviceId] }));
        }

        if (data.type === 'alert') {
          // Delegate to useAlerts — it deduplicates and manages alert state
          addAlert(data.data);
        }
      },
      () => {
        // On error: mark device offline in state
        setDevices(prev => prev.map(d => d.id === deviceId ? { ...d, status: 'offline' } : d));
      },
      () => {
        // On close: attempt reconnect after 5s, only if the user is still authenticated
        wsRefs.current[deviceId] = null;
        setTimeout(() => { if (getToken()) openWebSocket(deviceId); }, 5000);
      }
    );

    wsRefs.current[deviceId] = ws;
  }, [selectedDeviceId, addAlert]); // eslint-disable-line

  // ── reconnectWebSockets ───────────────────────────────────────────────────
  // Called by App.tsx when the app returns to foreground.
  // Must be declared AFTER openWebSocket.

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

  // ── mutateSim ─────────────────────────────────────────────────────────────

  const mutateSim = useCallback((patch: Partial<DeviceSimState>) => {
    simRef.current[selectedDeviceId] = { ...simRef.current[selectedDeviceId], ...patch };
    setSelectedSim(prev => ({ ...prev, ...patch }));
  }, [selectedDeviceId]);

  // ── Sim control shortcuts ─────────────────────────────────────────────────

  const setTargetTemperature = useCallback((t: number)  => mutateSim({ targetTemperature: t }), [mutateSim]);
  const setTargetHumidity    = useCallback((h: number)  => mutateSim({ targetHumidity: h }),    [mutateSim]);
  const setAutoMode          = useCallback((a: boolean) => mutateSim({ autoMode: a }),           [mutateSim]);
  const startCooling         = useCallback(() => mutateSim({ systemStatus: 'cooling' }),         [mutateSim]);
  const stopCooling          = useCallback(() => mutateSim({ systemStatus: 'idle' }),            [mutateSim]);

  // ── applyProduceProfile ───────────────────────────────────────────────────

  const applyProduceProfile = useCallback((deviceId: string, mode: ProduceMode) => {
    const thresholds = PRODUCE_THRESHOLDS[mode];
    const patch = {
      produceMode:         mode,
      targetTemperature:   thresholds.targetTemperature,
      targetHumidity:      thresholds.targetHumidity,
      warningTemperature:  thresholds.warningTemperature,
      criticalTemperature: thresholds.criticalTemperature,
      warningHumidity:     thresholds.warningHumidity,
      criticalHumidity:    thresholds.criticalHumidity,
    };

    setDevices(prev => prev.map(d => d.id === deviceId ? { ...d, ...patch } : d));

    if (simRef.current[deviceId]) {
      simRef.current[deviceId] = {
        ...simRef.current[deviceId],
        currentTemperature: thresholds.targetTemperature,
        currentHumidity:    thresholds.targetHumidity,
      };
    }
    if (deviceId === selectedDeviceId) {
      setSelectedSim(prev => ({
        ...prev,
        currentTemperature: thresholds.targetTemperature,
        currentHumidity:    thresholds.targetHumidity,
      }));
    }

    const backendPatch = {
      produceMode:         patch.produceMode,
      warningTemperature:  patch.warningTemperature,
      criticalTemperature: patch.criticalTemperature,
      warningHumidity:     patch.warningHumidity,
      criticalHumidity:    patch.criticalHumidity,
    };
    devicesApi.update(deviceId, backendPatch).catch(err => {
      if (isRetryableError(err)) {
        enqueueAction({ type: 'UPDATE_DEVICE', payload: { id: deviceId, patch: backendPatch } });
      }
    });
  }, [selectedDeviceId]);

  // ── updateProduceSetup ────────────────────────────────────────────────────

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

    const backendPatch = {
      produceMode:          produceInfo.produceMode,
      produceState:         produceInfo.produceState,
      facilitySize:         produceInfo.facilitySize,
      transportHours:       produceInfo.transportHours,
      warningTemperature:   thresholds.warningTemperature,
      criticalTemperature:  thresholds.criticalTemperature,
      warningHumidity:      thresholds.warningHumidity,
      criticalHumidity:     thresholds.criticalHumidity,
      humidAlertHigh:       thresholds.humidAlertHigh,
      produceSetupComplete: true,
      useCustomThresholds:  true,
    };
    devicesApi.update(deviceId, backendPatch).catch(err => {
      if (isRetryableError(err)) {
        enqueueAction({ type: 'UPDATE_DEVICE', payload: { id: deviceId, patch: backendPatch } });
      }
    });

    if (simRef.current[deviceId]) {
      simRef.current[deviceId] = { ...simRef.current[deviceId], ...adjusted };
    }
    if (deviceId === selectedDeviceId) setSelectedSim(prev => ({ ...prev, ...adjusted }));
  }, [selectedDeviceId]);

  // ── addDevice ─────────────────────────────────────────────────────────────

  const addDevice = useCallback((
    name: string,
    location: string,
    produceInfo?: { produceMode: ProduceMode; produceState: ProduceState; facilitySize: 'small' | 'medium' | 'large'; transportHours: number },
    deviceCode?: string,
    unitName?: string,
  ): Promise<Device> => {
    const thresholds = produceInfo ? PRODUCE_THRESHOLDS[produceInfo.produceMode] : null;

    return devicesApi.create({
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

        // Initialise all per-device refs
        simRef.current[mapped.id]            = buildInitialSimState(mapped);
        alertStateRef.current[mapped.id]     = { temp: 'safe', humid: 'safe' };
        deviceReadingsRef.current[mapped.id] = Array.from({ length: 24 }, (_, i) => ({
          time: new Date(Date.now() - (23 - i) * 3_600_000)
            .toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true }),
          temperature: parseFloat(((thresholds?.targetTemperature ?? 8) + (Math.random() - 0.5)).toFixed(1)),
        }));

        setDevices(prev => [...prev, mapped]);
        setDeviceReadings(prev => ({ ...prev, [mapped.id]: deviceReadingsRef.current[mapped.id] }));
        setDeviceHistories(prev => ({ ...prev, [mapped.id]: simRef.current[mapped.id]?.sensorHistory ?? [] }));

        // Keep the bootstrap cache in sync so the device survives offline reload
        const existing = loadBootstrapCache();
        if (existing) {
          saveBootstrapCache({ ...existing, devices: [...existing.devices, device], savedAt: Date.now() });
        }

        addToast({ id: `add-${mapped.id}`, type: 'success', message: `Device ${mapped.name} added.` });
        return mapped;
      })
      .catch(err => {
        addToast({ id: `add-err-${Date.now()}`, type: 'error', message: err?.message ?? 'Failed to add device.' });

        // Only queue for offline retry when the failure was transient (no
        // connection / server error). A rejected device code, an
        // already-claimed code, or a validation error is a permanent
        // rejection of this exact request — retrying it later can never
        // succeed on its own merits, and if the code is later claimed by
        // someone else it would silently "add" a device the user never
        // actually confirmed. See isRetryableError above.
        if (isRetryableError(err)) {
          enqueueAction({
            type: 'ADD_DEVICE',
            payload: {
              name, location, deviceCode, unitName,
              produceMode:         produceInfo?.produceMode,
              produceState:        produceInfo?.produceState,
              facilitySize:        produceInfo?.facilitySize,
              transportHours:      produceInfo?.transportHours,
              useCustomThresholds: !!thresholds,
              warningTemperature:  thresholds?.warningTemperature  ?? DEFAULT_SETTINGS.warningTemperature,
              criticalTemperature: thresholds?.criticalTemperature ?? DEFAULT_SETTINGS.criticalTemperature,
              warningHumidity:     thresholds?.warningHumidity     ?? DEFAULT_SETTINGS.warningHumidity,
              criticalHumidity:    thresholds?.criticalHumidity    ?? DEFAULT_SETTINGS.criticalHumidity,
              humidAlertHigh:      thresholds?.humidAlertHigh,
            },
          });
        }
        throw err; // re-throw so the wizard stays on step 2 on failure
      });
  }, [addToast]); // eslint-disable-line

  // ── updateDevice ──────────────────────────────────────────────────────────

  const updateDevice = useCallback((id: string, patch: Partial<Device>) => {
    setDevices(prev => prev.map(d => d.id === id ? { ...d, ...patch } : d));
    const backendPatch: Record<string, any> = { ...patch };
    if (patch.name) backendPatch.unitName = patch.name;
    devicesApi.update(id, backendPatch).catch(err => {
      if (isRetryableError(err)) {
        enqueueAction({ type: 'UPDATE_DEVICE', payload: { id, patch: patch as Record<string, unknown> } });
      }
    });
  }, []);

  // ── deleteDevice ──────────────────────────────────────────────────────────

  const deleteDevice = useCallback((id: string) => {
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

    devicesApi.delete(id).catch(err => {
      if (isRetryableError(err)) {
        enqueueAction({ type: 'DELETE_DEVICE', payload: { id } });
      }
    });
  }, []);

  // ── setProduceModeAndPersist ──────────────────────────────────────────────

  const setProduceModeAndPersist = useCallback((mode: ProduceMode) => {
    setProduceMode(mode);
    // produce mode is per-device — stored on Device.produceMode in the backend
  }, []);

  // ── seedDevices ───────────────────────────────────────────────────────────
  // Called by AppProvider after bootstrap to populate device state from the
  // API response. Initialises sim state from last-known reading in localStorage.
  // Also opens WebSocket connections for all online devices.

  const seedDevices = useCallback((rawDevices: any[], options?: { selectedDeviceId?: string }) => {
    const mappedDevices = (rawDevices ?? []).map(mapDevice);
    setDevices(mappedDevices);

    for (const device of mappedDevices) {
      if (!simRef.current[device.id]) {
        const lastReading = loadLastReading(device.id);
        const base = buildInitialSimState(device);
        simRef.current[device.id] = lastReading
          ? { ...base, currentTemperature: lastReading.temperature, currentHumidity: lastReading.humidity, lastReadingAt: lastReading.savedAt }
          : base;
      }
    }

    setDeviceHistories(Object.fromEntries(
      mappedDevices.map((d: Device) => [d.id, simRef.current[d.id]?.sensorHistory ?? []])
    ));

    // Select provided device, or first online device, or first device overall
    const toSelect = options?.selectedDeviceId
      ?? mappedDevices.find(d => d.status === 'online')?.id
      ?? mappedDevices[0]?.id;

    if (toSelect) {
      setSelectedDeviceId(toSelect);
      setSelectedSim(simRef.current[toSelect] ?? buildInitialSimState(mappedDevices.find(d => d.id === toSelect)!));
    }

    // Open WebSocket for each online device
    for (const device of mappedDevices) {
      if (device.status === 'online') openWebSocket(device.id);
    }
  }, [openWebSocket]);

  // ── refreshDevices ────────────────────────────────────────────────────────
  // Re-fetches the device list from the server and merges it into local
  // state. Used after the offline action queue drains — a queued ADD_DEVICE
  // (or DELETE_DEVICE) can succeed in the background, and without this the
  // new/removed device wouldn't show up until the next full login/bootstrap.
  // Unlike seedDevices (bootstrap-only), this preserves existing local state
  // for devices that were already present rather than replacing everything.
  const refreshDevices = useCallback(async () => {
    try {
      const { devices: rawDevices } = await devicesApi.list();
      const mappedDevices = (rawDevices ?? []).map(mapDevice);
      const serverIds = new Set(mappedDevices.map(d => d.id));

      setDevices(prev => {
        const existingIds = new Set(prev.map(d => d.id));
        const kept  = prev.filter(d => serverIds.has(d.id));
        const added = mappedDevices.filter(d => !existingIds.has(d.id));
        return [...kept, ...added];
      });

      for (const device of mappedDevices) {
        if (!simRef.current[device.id]) {
          const lastReading = loadLastReading(device.id);
          const base = buildInitialSimState(device);
          simRef.current[device.id] = lastReading
            ? { ...base, currentTemperature: lastReading.temperature, currentHumidity: lastReading.humidity, lastReadingAt: lastReading.savedAt }
            : base;
          setDeviceReadings(prev => ({ ...prev, [device.id]: [] }));
          setDeviceHistories(prev => ({ ...prev, [device.id]: simRef.current[device.id]?.sensorHistory ?? [] }));
        }
        if (device.status === 'online' && !wsRefs.current[device.id]) {
          openWebSocket(device.id);
        }
      }
    } catch {
      // Best-effort — the next sync tick or login will pick it up.
    }
  }, [openWebSocket]);

  return {
    devices,
    selectedDeviceId,
    selectedSim,
    deviceReadings,
    deviceHistories,
    produceMode,
    openWebSocket,
    reconnectWebSockets,
    setSelectedDeviceId,
    setProduceMode: setProduceModeAndPersist,
    mutateSim,
    setTargetTemperature,
    setTargetHumidity,
    setAutoMode,
    startCooling,
    stopCooling,
    applyProduceProfile,
    addDevice,
    updateDevice,
    updateProduceSetup,
    deleteDevice,
    seedDevices,
    refreshDevices,
    wsRefs,
  };
}
