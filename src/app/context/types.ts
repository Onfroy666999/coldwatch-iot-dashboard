// ── types.ts ──────────────────────────────────────────────────────────────────
//
// Shared interfaces, constants, and pure utility functions.
//
// GOLDEN RULE: This file has ZERO imports from any hook, context, or React.
// Everything here is a plain TypeScript type, constant, or pure function.
// This is what breaks the circular dependency:
//
//   Before:  hooks → AppContext → hooks  (circular)
//   After:   hooks → types.ts (no circular possible)
//             AppContext → types.ts (same, no circular)
//
// If you add something here and it needs a React import, it belongs in a hook
// or a component instead.

import type { CropId, CategoryId } from '../data/produce';
import { deriveTargetsForCrops, getCategoryOfCrop } from '../data/produce';

// ── Sensor & alert types ──────────────────────────────────────────────────────

export interface SensorReading {
  timestamp: Date;
  temperature: number;
  humidity: number;
}

export interface Alert {
  id: string;
  severity: 'critical' | 'warning' | 'info';
  message: string;       // short label: "Temperature too high"
  report?: string;       // full narrative: what ColdWatch did while the user was away
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
  autoActionAttemptedAt?: Date;  // set when Stage 2a command was sent — alert still open
  autoActionCommand?: 'ON' | 'OFF'; // what the system commanded
}

// ── Device types ──────────────────────────────────────────────────────────────

export type ProduceMode  = 'mixed' | 'tubers' | 'fruits' | 'leafy' | 'legumes' | 'meat';

// ── Legacy-mode safety net ──────────────────────────────────────────────────
// Bug found while scoping Chunk 5: CategoryId (data/produce.ts) gained a
// 'vegetables' member in Chunk 1 when tomato/pepper/bell-pepper were split
// out of the old 'fruits' bucket — but ProduceMode above was never updated
// to match, since it's the legacy system Chunk 5/6 are deprecating, not
// actively maintained. Anywhere a category got silently cast `as
// ProduceMode` (addDevice's derivedProduceMode, and a few places in
// Devices.tsx that read a stored/legacy value the same unsafe way), a
// vegetables-only device would produce the literal string "vegetables" —
// not a compile error (the cast lies to TypeScript), but a runtime crash
// the moment anything does PRODUCE_PROFILES[produceMode].whatever, since
// PRODUCE_PROFILES has no such key. ControlPanel.tsx hit this every time
// the panel opened for such a device.
//
// isValidProduceMode is a real runtime check (unlike an `as` cast, which is
// compile-time only and enforces nothing once the value leaves the type
// checker's sight) — every ProduceMode consumer should route a raw/stored
// value through this before trusting it, since existing devices may
// already have "vegetables" sitting in the database from before this fix.
const VALID_PRODUCE_MODES: ReadonlySet<string> = new Set<ProduceMode>(
  ['mixed', 'tubers', 'fruits', 'leafy', 'legumes', 'meat']
);

export function isValidProduceMode(value: unknown): value is ProduceMode {
  return typeof value === 'string' && VALID_PRODUCE_MODES.has(value);
}

// For NEW writes (deriving a display-only legacy mode from a device's real
// crops) — maps every CategoryId onto a valid ProduceMode instead of an
// unsafe cast. 'vegetables' → 'fruits' since that's literally where those
// crops lived before the Chunk 1 split, so it's the closest legacy match.
// This function (and the whole legacy system it patches around) goes away
// once Chunk 5/6 finish the migration and PRODUCE_PROFILES is deleted.
export function categoryToLegacyMode(category: CategoryId): ProduceMode {
  return category === 'vegetables' ? 'fruits' : category;
}

/** Shared compatibility helper for older UI that still expects a single legacy produce mode. */
export function deriveLegacyProduceModeFromCrops(cropIds: CropId[]): ProduceMode | undefined {
  if (!cropIds.length) return undefined;
  const categories = new Set(cropIds.map(getCategoryOfCrop));
  if (categories.size > 1) return 'mixed';
  const only = getCategoryOfCrop(cropIds[0]);
  return only === 'vegetables' ? 'mixed' : (only as ProduceMode);
}

export type ProduceState = 'fresh' | 'dried' | 'in-between' | 'almost-damaged';

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
  /**
   * Go-forward source of truth for what's stored in this device: one or
   * more specific crops. Category (tubers/fruits/...) is derived from this,
   * never stored separately — see data/produce.ts.
   */
  cropIds?: CropId[];
  /** @deprecated legacy category field — still populated for devices set up
   * before Chunk 6 (wizard integration) migrates every device onto cropIds.
   * Kept only so existing devices keep displaying correctly in the interim. */
  produceMode?: ProduceMode;
  produceState?: ProduceState;
  facilitySize?: 'small' | 'medium' | 'large';
  transportHours?: number;
  produceSetupComplete?: boolean;
  deviceCode?: string;
  unitName?: string;
  storedSince?: Date;
  hasActuator?: boolean;
  /** Per-device override, in minutes, that scales the whole auto-resolve
   * escalation pipeline (escalate/auto-engage/confirm) proportionally.
   * Null/undefined = use production defaults (60min base). Meant for testing
   * — see the Configure sheet's Offsets tab. */
  autoResolveMinutes?: number | null;
}

// Alias kept for backward compat — DeviceConfig is Device
export type DeviceConfig = Device;

export interface DeviceSimState {
  currentTemperature: number;
  currentHumidity: number;
  systemStatus: 'cooling' | 'idle' | 'override';
  targetTemperature: number;
  targetHumidity: number;
  autoMode: boolean;
  sensorHistory: SensorReading[];
  /** Unix ms timestamp of the most recent live reading. Used by the offline banner. */
  lastReadingAt?: number;
}

export interface DeviceReading {
  time: string;
  temperature: number;
}

// ── Settings types ────────────────────────────────────────────────────────────

export interface Settings {
  warningTemperature: number;
  criticalTemperature: number;
  warningHumidity: number;
  criticalHumidity: number;
  inAppNotifications: boolean;
  emailAlerts: boolean;
  smsAlerts: boolean;
  alertRepeatInterval: string;
  escalationContact: string;
  compactMode: boolean;
  tempUnit: 'C' | 'F';
  samplingInterval: string;
  dataRetention: string;
  autoLogoutMinutes: number;
}

// ── User types ────────────────────────────────────────────────────────────────

export type UserRole = 'farmer' | 'warehouse_manager' | 'transporter' | 'other';

export interface User {
  id: string;
  name: string;
  email: string;
  avatar: string;
  profilePicture?: string;
  role?: UserRole;
  surveyComplete?: boolean;
  phone?: string;
  notificationEmail?: string;
  notificationPhone?: string;
}

// ── Toast types ───────────────────────────────────────────────────────────────

export interface ToastMessage {
  id: string;
  type: 'success' | 'error' | 'warning' | 'info';
  message: string;
  duration?: number;
}

// ── Produce thresholds ────────────────────────────────────────────────────────

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

// ── Settings defaults ─────────────────────────────────────────────────────────

export const DEFAULT_SETTINGS: Settings = {
  warningTemperature: 10, criticalTemperature: 15,
  warningHumidity: 80,    criticalHumidity: 90,
  inAppNotifications: true, emailAlerts: true, smsAlerts: false,
  alertRepeatInterval: '15min',
  escalationContact: '',
  compactMode: false, tempUnit: 'C',
  samplingInterval: '15s', dataRetention: '30d', autoLogoutMinutes: 0,
};

// ── Pure utility functions ────────────────────────────────────────────────────
// These are pure functions with no side effects and no React.
// Safe to import in any hook, component, or context.

export function avatarFromName(name: string): string {
  return name.trim().split(/\s+/).map(n => n[0]).join('').toUpperCase().slice(0, 2) || 'U';
}

/** @deprecated category-based path — kept for devices not yet migrated to cropIds. */
export function getStateAdjustedTargets(mode: ProduceMode, state: ProduceState) {
  const base = PRODUCE_THRESHOLDS[mode];
  const adj  = STATE_ADJUSTMENTS[state];
  return {
    targetTemperature: parseFloat(
      Math.min(base.criticalTemperature - 1, Math.max(base.targetTemperature + adj.tempOffset, 0)).toFixed(1)
    ),
    targetHumidity: parseFloat(
      Math.min(98, Math.max(30, base.targetHumidity + adj.humidOffset)).toFixed(0)
    ),
  };
}

/** Go-forward version: derives base targets from the device's actual crop(s). */
export function getStateAdjustedTargetsForCrops(cropIds: CropId[], state: ProduceState) {
  const base = deriveTargetsForCrops(cropIds);
  const adj  = STATE_ADJUSTMENTS[state];
  return {
    targetTemperature: parseFloat(
      Math.min(base.criticalTemperature - 1, Math.max(base.targetTemperature + adj.tempOffset, 0)).toFixed(1)
    ),
    targetHumidity: parseFloat(
      Math.min(98, Math.max(30, base.targetHumidity + adj.humidOffset)).toFixed(0)
    ),
  };
}

/** Map a raw backend alert payload to the frontend Alert shape. */
export function mapAlert(a: any): Alert {
  const TYPE_TO_MESSAGE: Record<string, string> = {
    TEMP_HIGH:      'Temperature too high',
    TEMP_LOW:       'Temperature too low',
    HUMIDITY_HIGH:  'Humidity too high',
    HUMIDITY_LOW:   'Humidity too low',
    DEVICE_OFFLINE: 'Device went offline',
  };
  const STATUS_MAP: Record<string, Alert['status']> = {
    open:          'new',
    acknowledged:  'acknowledged',
    resolved:      'resolved',
    auto_resolved: 'auto_resolved',
  };

  const isAutoResolved = a.status === 'auto_resolved';

  let systemAction: string | undefined;
  if (isAutoResolved && a.report) {
    if (a.report.includes('turned cooling ON')) {
      systemAction = 'ColdWatch engaged cooling automatically';
    } else if (a.report.includes('turned cooling OFF')) {
      systemAction = 'ColdWatch stopped cooling automatically';
    } else {
      systemAction = 'ColdWatch took automatic action';
    }
  }

  return {
    id:          a.id,
    severity:    a.severity as Alert['severity'],
    message:     TYPE_TO_MESSAGE[a.type] ?? a.type,
    report:      a.report ?? undefined,
    systemAction,
    deviceId:    a.deviceId,
    deviceName:  a.deviceName,
    timestamp:   new Date(a.createdAt),
    status:      STATUS_MAP[a.status] ?? 'new',
    tempC:       a.type?.includes('TEMP')     ? a.triggerValue : undefined,
    humidityPct: a.type?.includes('HUMIDITY') ? a.triggerValue : undefined,
    resolvedAt:  a.resolvedAt ? new Date(a.resolvedAt) : undefined,
    autoResolved: isAutoResolved,
    autoActionAttemptedAt: a.autoActionAttemptedAt ? new Date(a.autoActionAttemptedAt) : undefined,
    autoActionCommand:     a.autoActionCommand ?? undefined,
  };
}

/** Map a raw backend device payload to the frontend Device shape. */
export function mapDevice(d: any): Device {
  const cropIds = Array.isArray(d.crops) && d.crops.length ? d.crops as CropId[] : undefined;
  const derivedProduceMode = cropIds
    ? deriveLegacyProduceModeFromCrops(cropIds)
    : isValidProduceMode(d.produceMode) ? d.produceMode : undefined;

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
    cropIds,
    produceMode:         derivedProduceMode,
    produceState:        d.produceState as ProduceState | undefined,
    facilitySize:        d.facilitySize as Device['facilitySize'],
    transportHours:      d.transportHours,
    produceSetupComplete: d.produceSetupComplete ?? false,
    deviceCode:          d.deviceCode,
    unitName:            d.unitName,
    storedSince:         d.storedSince ? new Date(d.storedSince) : undefined,
    hasActuator:         d.hasActuator ?? false,
    autoResolveMinutes:  d.autoResolveMinutes ?? null,
  };
}

/** Map raw backend settings to the frontend Settings shape, filling defaults. */
export function mapSettings(s: any): Settings {
  return {
    warningTemperature:  s.warningTemperature  ?? DEFAULT_SETTINGS.warningTemperature,
    criticalTemperature: s.criticalTemperature ?? DEFAULT_SETTINGS.criticalTemperature,
    warningHumidity:     s.warningHumidity     ?? DEFAULT_SETTINGS.warningHumidity,
    criticalHumidity:    s.criticalHumidity    ?? DEFAULT_SETTINGS.criticalHumidity,
    inAppNotifications:  s.inAppNotifications  ?? DEFAULT_SETTINGS.inAppNotifications,
    emailAlerts:         s.emailAlerts         ?? DEFAULT_SETTINGS.emailAlerts,
    smsAlerts:           s.smsAlerts           ?? DEFAULT_SETTINGS.smsAlerts,
    alertRepeatInterval: s.alertRepeatInterval ?? DEFAULT_SETTINGS.alertRepeatInterval,
    escalationContact:   s.escalationContact   ?? DEFAULT_SETTINGS.escalationContact,
    compactMode:         s.compactMode         ?? DEFAULT_SETTINGS.compactMode,
    tempUnit:            (s.tempUnit as 'C' | 'F') ?? DEFAULT_SETTINGS.tempUnit,
    samplingInterval:    s.samplingInterval    ?? DEFAULT_SETTINGS.samplingInterval,
    dataRetention:       s.dataRetention       ?? DEFAULT_SETTINGS.dataRetention,
    autoLogoutMinutes:   s.autoLogoutMinutes   ?? DEFAULT_SETTINGS.autoLogoutMinutes,
  };
}

/** Build an initial simulation state for a device. */
export function buildInitialSimState(device: Device): DeviceSimState {
  const cropTargets = device.cropIds?.length ? deriveTargetsForCrops(device.cropIds) : null;
  const targetTemp  = cropTargets
    ? cropTargets.targetTemperature
    : device.produceMode ? PRODUCE_THRESHOLDS[device.produceMode].targetTemperature : 8;
  const targetHumid = cropTargets
    ? cropTargets.targetHumidity
    : device.produceMode ? PRODUCE_THRESHOLDS[device.produceMode].targetHumidity : 85;
  const now = new Date();
  const sensorHistory: SensorReading[] = Array.from({ length: 60 }, (_, i) => ({
    timestamp:   new Date(now.getTime() - (60 - i) * 60000),
    temperature: targetTemp  + Math.random() * 2,
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
