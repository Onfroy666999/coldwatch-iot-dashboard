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
import { enqueueAction, isRetryableError } from '../Lib/ActionQueue';
import { getToken } from '../Lib/tokenStorage';
import {
  PRODUCE_THRESHOLDS, DEFAULT_SETTINGS, getStateAdjustedTargets,
  mapDevice, buildInitialSimState, deriveLegacyProduceModeFromCrops,
} from './types';
import { deriveTargetsForCrops, getCategoryOfCrop, type CropId } from '../data/produce';
import { saveLastReading, loadLastReading, saveBootstrapCache, loadBootstrapCache } from './offlineCache';
import type {
  Device, DeviceSimState, SensorReading, DeviceReading,
  ProduceMode, ProduceState, ToastMessage,
} from './types';
import { connectWebSocket, refreshAccessToken } from '../Lib/api';

// isRetryableError now lives in ActionQueue.ts (imported below) so every
// hook that enqueues offline actions shares the same classification.

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
  /** Opens the single multiplexed WebSocket (all owned devices, one connection). Safe to call if already open. */
  openWebSocket: () => void;
  reconnectWebSockets: () => void;
  setSelectedDeviceId: (id: string) => void;
  setProduceMode: (mode: ProduceMode) => void;
  mutateSim: (patch: Partial<DeviceSimState>) => void;
  setTargetTemperature: (t: number)  => void;
  setTargetHumidity:    (h: number)  => void;
  setAutoMode:          (a: boolean) => void;
  /** Never queues — resolves once the command is actually sent, or throws immediately if it can't be. */
  startCooling:         () => Promise<void>;
  /** Never queues — resolves once the command is actually sent, or throws immediately if it can't be. */
  stopCooling:          () => Promise<void>;
  applyProduceProfile: (deviceId: string, mode: ProduceMode) => void;
  addDevice: (
    name: string,
    location: string,
    produceInfo?: { cropIds: CropId[]; produceState: ProduceState; transportHours: number },
    deviceCode?: string,
    unitName?: string,
    autoResolveMinutes?: number | null,
  ) => Promise<Device>;
  updateDevice: (id: string, patch: Partial<Device>) => void;
  updateProduceSetup: (
    deviceId: string,
    produceInfo: { cropIds: CropId[]; produceState: ProduceState; transportHours?: number }
  ) => void;
  deleteDevice: (id: string) => void;
  /** Seed device state from bootstrap — not for arbitrary mutation. */
  seedDevices: (rawDevices: any[], options?: { selectedDeviceId?: string }) => void;
  refreshDevices: () => Promise<void>;
  /** Expose the socket ref so AppProvider can close it on logout. */
  wsRef: MutableRefObject<WebSocket | null>;
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
  const wsRef              = useRef<WebSocket | null>(null);
  const deviceReadingsRef = useRef<Record<string, DeviceReading[]>>({});
  const alertStateRef     = useRef<Record<string, { temp: string; humid: string }>>({});

  // Live pointer to selectedDeviceId. openWebSocket's message handler must read
  // this instead of the closed-over selectedDeviceId value — a WebSocket, once
  // opened, keeps its onmessage closure forever, so comparing against the plain
  // variable would freeze the comparison at whatever selectedDeviceId was the
  // instant that particular socket was opened (often the pre-bootstrap ''
  // value, since seedDevices calls setSelectedDeviceId and openWebSocket in the
  // same tick, before the new selectedDeviceId is committed). That silently
  // dropped every live reading update — the Dashboard only ever looked correct
  // right after a fresh mount, when the one-time simRef→selectedSim sync ran.
  const selectedDeviceIdRef = useRef(selectedDeviceId);
  useEffect(() => { selectedDeviceIdRef.current = selectedDeviceId; }, [selectedDeviceId]);

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
  // ONE multiplexed connection for every device this user owns, not one per
  // device (see the backend's websocket.ts — it now registers each connected
  // client by userId, and every message carries a deviceId field so this
  // side can route it). The onClose callback reconnects after 5s by calling
  // openWebSocket recursively via setTimeout.

  const openWebSocket = useCallback(() => {
    const existing = wsRef.current;
    if (existing && existing.readyState <= WebSocket.OPEN) return;

    const ws = connectWebSocket(
      (data) => {
        const deviceId = data.deviceId as string | undefined;
        // The initial `{ type: 'connected' }` handshake message has no
        // deviceId — nothing to route it to, so just ignore it.
        if (!deviceId) return;

        if (data.type === 'reading') {
          const { temperature, humidity, coolerOn } = data.data;
          const now = new Date();
          const reading: SensorReading = { timestamp: now, temperature, humidity };

          // coolerOn is the ESP32's own relay state, reported on every reading —
          // ground truth for whether the Peltier is actually running. Previously
          // discarded entirely, leaving systemStatus as a purely local guess that
          // never corrected itself if a command was missed, auto-escalation
          // toggled it, or the relay failed silently.
          const realStatus: DeviceSimState['systemStatus'] | undefined =
            typeof coolerOn === 'boolean' ? (coolerOn ? 'cooling' : 'idle') : undefined;

          simRef.current[deviceId] = {
            ...simRef.current[deviceId],
            currentTemperature: temperature,
            currentHumidity:    humidity,
            ...(realStatus ? { systemStatus: realStatus } : {}),
            lastReadingAt:      now.getTime(),
            sensorHistory: [
              ...(simRef.current[deviceId]?.sensorHistory ?? []).slice(-59),
              reading,
            ],
          };

          saveLastReading(deviceId, temperature, humidity);

          if (deviceId === selectedDeviceIdRef.current) {
            setSelectedSim(prev => ({
              ...prev,
              currentTemperature: temperature,
              currentHumidity:    humidity,
              ...(realStatus ? { systemStatus: realStatus } : {}),
              lastReadingAt:      now.getTime(),
            }));
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

        // Backend broadcasts this whenever a device's online/offline status
        // actually changes — both from the MQTT LWT handler (near-instant on
        // a clean disconnect) and from the heartbeat fallback job (catches a
        // device that just lost power, up to ~5min later).
        // deviceStatus/isSimulated/badges on Dashboard.tsx all derive from
        // this same `devices` array, so patching it here is enough — no
        // separate selectedSim update needed.
        if (data.type === 'device_status') {
          const { status } = data.data as { status: 'online' | 'offline' };
          setDevices(prev => prev.map(d => d.id === deviceId ? { ...d, status } : d));
        }
      },
      () => {
        // This error means OUR connection to the backend hiccuped — it says
        // nothing about whether any physical device is actually online or
        // offline. That truth only ever comes from the backend's explicit
        // device_status/reading broadcasts (or the initial device fetch).
        //
        // The app's own connectivity already has a correct, single source of
        // truth — `isOnline` in AppContext (driven by the browser's
        // online/offline events), the same signal SyncBanner and the
        // never-queue-commands-when-offline logic in startCooling/stopCooling
        // already use. onClose below already handles reconnecting.
      },
      () => {
        // On close: attempt reconnect after 5s, only if the user is still
        // authenticated. If the access token happens to have expired while
        // the socket was open (its TTL is only ~15min), try a refresh
        // first rather than silently giving up — otherwise the WS could
        // stay dead for however long it takes some unrelated HTTP request
        // to happen to trigger fetchAPI's own refresh path.
        wsRef.current = null;
        setTimeout(async () => {
          if (getToken()) { openWebSocket(); return; }
          if (await refreshAccessToken()) openWebSocket();
        }, 5000);
      }
    );

    wsRef.current = ws;
  }, [addAlert]);

  // ── reconnectWebSockets ───────────────────────────────────────────────────
  // Called by App.tsx when the app returns to foreground.
  // Must be declared AFTER openWebSocket.

  const reconnectWebSockets = useCallback(() => {
    if (!wsRef.current || wsRef.current.readyState === WebSocket.CLOSED) {
      openWebSocket();
    }
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
  // startCooling/stopCooling: optimistic local update for instant UI feedback
  // (corrected by real coolerOn telemetry on the next reading regardless),
  // then the actual command — this used to be pure local state with no
  // backend call at all, so the Peltier never received anything.
  //
  // Actuator commands are deliberately never queued for later retry, unlike
  // every other action here. A queued ON/OFF that only fires once the device
  // or the app reconnects — possibly minutes or hours later — can be actively
  // wrong by then (the farmer may have moved the produce, conditions may have
  // changed, or they may have just tapped the opposite command themselves),
  // and repeatedly toggling the Peltier module on reconnect is bad for its
  // longevity anyway. So both known-offline cases below are checked up front
  // and fail immediately — no network call, no queue entry — and any failure
  // from the request itself is treated as non-retryable too.
  const startCooling = useCallback(async (): Promise<void> => {
    const deviceId = selectedDeviceId;
    const device   = devices.find(d => d.id === deviceId);

    if (!navigator.onLine) {
      throw new Error("You're offline — the command wasn't sent.");
    }
    if (device && device.status !== 'online') {
      throw new Error("This device is offline — the command wasn't sent.");
    }

    mutateSim({ systemStatus: 'cooling' });
    try {
      await devicesApi.sendCommand(deviceId, 'ON');
    } catch (err) {
      mutateSim({ systemStatus: 'idle' }); // revert the optimistic guess
      const apiErr = err as { offline?: true };
      if (apiErr?.offline) {
        throw new Error("You're offline — the command wasn't sent.");
      }
      throw err;
    }
  }, [mutateSim, selectedDeviceId, devices]);

  const stopCooling = useCallback(async (): Promise<void> => {
    const deviceId = selectedDeviceId;
    const device   = devices.find(d => d.id === deviceId);

    if (!navigator.onLine) {
      throw new Error("You're offline — the command wasn't sent.");
    }
    if (device && device.status !== 'online') {
      throw new Error("This device is offline — the command wasn't sent.");
    }

    mutateSim({ systemStatus: 'idle' });
    try {
      await devicesApi.sendCommand(deviceId, 'OFF');
    } catch (err) {
      mutateSim({ systemStatus: 'cooling' }); // revert the optimistic guess
      const apiErr = err as { offline?: true };
      if (apiErr?.offline) {
        throw new Error("You're offline — the command wasn't sent.");
      }
      throw err;
    }
  }, [mutateSim, selectedDeviceId, devices]);

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
  // Crop-based, matching addDevice — this is Chunk 5's unification: editing
  // an existing device's produce now goes through the same CropId[]-driven
  // threshold derivation as creating one, instead of the old single-category
  // ProduceMode path. produceMode is still written alongside (derived from
  // the crop set) purely for older UI/display that hasn't migrated off it —
  // it's never the source of truth here.

  // Shared compatibility mapping for older display/UI consumers that still
  // read a single legacy produce mode from a device's crop set.
  const deriveLegacyProduceMode = (cropIds: CropId[]): ProduceMode | undefined => {
    return deriveLegacyProduceModeFromCrops(cropIds);
  };

  const updateProduceSetup = useCallback((
    deviceId: string,
    produceInfo: { cropIds: CropId[]; produceState: ProduceState; transportHours?: number }
  ) => {
    const thresholds = deriveTargetsForCrops(produceInfo.cropIds);
    const derivedProduceMode = deriveLegacyProduceMode(produceInfo.cropIds);

    setDevices(prev => prev.map(d => d.id === deviceId ? {
      ...d,
      cropIds: produceInfo.cropIds,
      produceMode: derivedProduceMode,
      produceState: produceInfo.produceState,
      transportHours: produceInfo.transportHours,
      ...thresholds,
      produceSetupComplete: true, useCustomThresholds: true,
    } : d));

    const backendPatch = {
      crops:                produceInfo.cropIds,
      produceState:         produceInfo.produceState,
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
      simRef.current[deviceId] = { ...simRef.current[deviceId], ...thresholds };
    }
    if (deviceId === selectedDeviceId) setSelectedSim(prev => ({ ...prev, ...thresholds }));
  }, [selectedDeviceId]);

  // ── addDevice ─────────────────────────────────────────────────────────────

  const addDevice = useCallback((
    name: string,
    location: string,
    produceInfo?: { cropIds: CropId[]; produceState: ProduceState; transportHours: number },
    deviceCode?: string,
    unitName?: string,
    autoResolveMinutes?: number | null,
  ): Promise<Device> => {
    const thresholds = produceInfo ? deriveTargetsForCrops(produceInfo.cropIds) : null;

    // Backward-compat display field — ControlPanel and other older UI still
    // read device.produceMode (single broad category) rather than cropIds.
    // See deriveLegacyProduceMode above for why this can't be a naive cast.
    const derivedProduceMode = produceInfo ? deriveLegacyProduceMode(produceInfo.cropIds) : undefined;

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
      crops:               produceInfo?.cropIds,
      produceState:        produceInfo?.produceState,
      transportHours:      produceInfo?.transportHours,
      hasActuator:         true, // every ColdWatch unit ships with a Peltier module
      autoResolveMinutes:  autoResolveMinutes ?? undefined,
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
              crops:               produceInfo?.cropIds,
              produceState:        produceInfo?.produceState,
              transportHours:      produceInfo?.transportHours,
              useCustomThresholds: !!thresholds,
              warningTemperature:  thresholds?.warningTemperature  ?? DEFAULT_SETTINGS.warningTemperature,
              criticalTemperature: thresholds?.criticalTemperature ?? DEFAULT_SETTINGS.criticalTemperature,
              warningHumidity:     thresholds?.warningHumidity     ?? DEFAULT_SETTINGS.warningHumidity,
              criticalHumidity:    thresholds?.criticalHumidity    ?? DEFAULT_SETTINGS.criticalHumidity,
              humidAlertHigh:      thresholds?.humidAlertHigh,
              autoResolveMinutes:  autoResolveMinutes ?? undefined,
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

    // One multiplexed socket covers every device this user owns — open it
    // once here rather than looping per device.
    openWebSocket();
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
      }
      // A newly-added device's messages arrive on the already-open shared
      // socket automatically — no per-device connection to open. Just make
      // sure the shared socket itself is actually up (e.g. this refresh was
      // triggered right after a fresh login).
      openWebSocket();
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
    wsRef,
  };
}
