import { describe, it, expect } from 'vitest';
import {
  isValidProduceMode,
  getStateAdjustedTargets,
  getStateAdjustedTargetsForCrops,
  buildInitialSimState,
  PRODUCE_THRESHOLDS,
  STATE_ADJUSTMENTS,
  type Device,
} from './types';
import { deriveTargetsForCrops } from '../data/produce';

describe('isValidProduceMode', () => {
  it('accepts every real ProduceMode value', () => {
    for (const mode of ['mixed', 'tubers', 'fruits', 'leafy', 'legumes', 'meat']) {
      expect(isValidProduceMode(mode)).toBe(true);
    }
  });

  it('rejects the specific stale value this function exists to catch', () => {
    // types.ts's own comment: a pre-Chunk-1-split "vegetables" mode used to
    // sneak through an unsafe `as` cast and crash PRODUCE_PROFILES lookups.
    expect(isValidProduceMode('vegetables')).toBe(false);
  });

  it('rejects other invalid strings, empty string, and non-string values', () => {
    expect(isValidProduceMode('bogus')).toBe(false);
    expect(isValidProduceMode('')).toBe(false);
    expect(isValidProduceMode(null)).toBe(false);
    expect(isValidProduceMode(undefined)).toBe(false);
    expect(isValidProduceMode(42)).toBe(false);
    expect(isValidProduceMode({})).toBe(false);
  });
});

describe('getStateAdjustedTargets (deprecated category-based path)', () => {
  it('fresh state applies zero offset — returns the base thresholds unchanged', () => {
    const result = getStateAdjustedTargets('tubers', 'fresh');
    const base = PRODUCE_THRESHOLDS.tubers;
    expect(result.targetTemperature).toBe(base.targetTemperature);
    expect(result.targetHumidity).toBe(base.targetHumidity);
  });

  it('dried state applies the documented +4°C / -12% offset, clamped sanely', () => {
    const result = getStateAdjustedTargets('tubers', 'dried');
    const base = PRODUCE_THRESHOLDS.tubers;
    const adj = STATE_ADJUSTMENTS.dried;
    // Below the critical-1 ceiling and above 0, per the function's own clamp.
    expect(result.targetTemperature).toBeLessThanOrEqual(base.criticalTemperature - 1);
    expect(result.targetTemperature).toBeGreaterThanOrEqual(0);
    expect(result.targetTemperature).toBe(
      parseFloat(Math.min(base.criticalTemperature - 1, base.targetTemperature + adj.tempOffset).toFixed(1))
    );
  });

  it('never returns a targetTemperature at or above criticalTemperature - 1, for every mode/state combo', () => {
    // This is the actual safety invariant the function exists to guarantee —
    // an adjusted target landing at or past the critical ceiling would mean
    // "fresh" storage advice pushes a device into its own alert zone.
    const modes = ['mixed', 'tubers', 'fruits', 'leafy', 'legumes', 'meat'] as const;
    const states = ['fresh', 'dried', 'in-between', 'almost-damaged'] as const;
    for (const mode of modes) {
      for (const state of states) {
        const result = getStateAdjustedTargets(mode, state);
        const base = PRODUCE_THRESHOLDS[mode];
        expect(result.targetTemperature).toBeLessThanOrEqual(base.criticalTemperature - 1);
      }
    }
  });

  it('never returns a targetHumidity outside the [30, 98] clamp, for every mode/state combo', () => {
    const modes = ['mixed', 'tubers', 'fruits', 'leafy', 'legumes', 'meat'] as const;
    const states = ['fresh', 'dried', 'in-between', 'almost-damaged'] as const;
    for (const mode of modes) {
      for (const state of states) {
        const result = getStateAdjustedTargets(mode, state);
        expect(result.targetHumidity).toBeGreaterThanOrEqual(30);
        expect(result.targetHumidity).toBeLessThanOrEqual(98);
      }
    }
  });

  it('almost-damaged lowers temperature and raises humidity relative to fresh', () => {
    // Sanity check on direction, not just magnitude: an almost-spoiling
    // item should get colder + more humid advice, not the reverse.
    const fresh = getStateAdjustedTargets('fruits', 'fresh');
    const almostDamaged = getStateAdjustedTargets('fruits', 'almost-damaged');
    expect(almostDamaged.targetTemperature).toBeLessThanOrEqual(fresh.targetTemperature);
    expect(almostDamaged.targetHumidity).toBeGreaterThanOrEqual(fresh.targetHumidity);
  });
});

describe('getStateAdjustedTargetsForCrops (crop-based path)', () => {
  it('fresh state applies zero offset — returns the crop-derived base unchanged', () => {
    const base = deriveTargetsForCrops(['yam']);
    const result = getStateAdjustedTargetsForCrops(['yam'], 'fresh');
    expect(result.targetTemperature).toBe(base.targetTemperature);
    expect(result.targetHumidity).toBe(base.targetHumidity);
  });

  it('dried state applies the documented +4°C / -12% offset, clamped sanely', () => {
    const base = deriveTargetsForCrops(['yam']);
    const result = getStateAdjustedTargetsForCrops(['yam'], 'dried');
    const expectedTemp = Math.min(base.criticalTemperature - 1, base.targetTemperature + 4);
    const expectedHumid = Math.max(30, base.targetHumidity - 12);
    expect(result.targetTemperature).toBeCloseTo(expectedTemp, 1);
    expect(result.targetHumidity).toBeCloseTo(expectedHumid, 0);
  });

  it('never returns a targetTemperature at or above criticalTemperature - 1, across single-crop, multi-crop, and empty-list cases', () => {
    const states = ['fresh', 'dried', 'in-between', 'almost-damaged'] as const;
    const cropSets: (import('../data/produce').CropId)[][] = [['yam'], ['yam', 'cocoyam'], []];
    for (const crops of cropSets) {
      const base = deriveTargetsForCrops(crops);
      for (const state of states) {
        const result = getStateAdjustedTargetsForCrops(crops, state);
        expect(result.targetTemperature).toBeLessThan(base.criticalTemperature);
      }
    }
  });

  it('never returns a targetHumidity outside the [30, 98] clamp, across single-crop, multi-crop, and empty-list cases', () => {
    const states = ['fresh', 'dried', 'in-between', 'almost-damaged'] as const;
    const cropSets: (import('../data/produce').CropId)[][] = [['yam'], ['yam', 'cocoyam'], []];
    for (const crops of cropSets) {
      for (const state of states) {
        const result = getStateAdjustedTargetsForCrops(crops, state);
        expect(result.targetHumidity).toBeGreaterThanOrEqual(30);
        expect(result.targetHumidity).toBeLessThanOrEqual(98);
      }
    }
  });

  it('almost-damaged lowers temperature and raises humidity relative to fresh', () => {
    const fresh = getStateAdjustedTargetsForCrops(['yam'], 'fresh');
    const almostDamaged = getStateAdjustedTargetsForCrops(['yam'], 'almost-damaged');
    expect(almostDamaged.targetTemperature).toBeLessThanOrEqual(fresh.targetTemperature);
    expect(almostDamaged.targetHumidity).toBeGreaterThanOrEqual(fresh.targetHumidity);
  });

  it('empty crop list falls back to the neutral default base, still state-adjusted', () => {
    const base = deriveTargetsForCrops([]);
    const result = getStateAdjustedTargetsForCrops([], 'fresh');
    expect(result.targetTemperature).toBe(base.targetTemperature);
    expect(result.targetHumidity).toBe(base.targetHumidity);
  });
});

describe('buildInitialSimState', () => {
  const baseDevice: Device = {
    id: 'dev-1',
    name: 'Cold Room A',
    location: 'Kumasi',
    status: 'online',
    lastSeen: new Date(),
    firmwareVersion: '1.0.0',
    tempOffset: 0,
    humidOffset: 0,
    useCustomThresholds: true,
    warningTemperature: 10,
    criticalTemperature: 15,
    warningHumidity: 80,
    criticalHumidity: 90,
  };

  it('crop-based device with no produceState defaults to fresh (no-op) — matches raw deriveTargetsForCrops', () => {
    const device: Device = { ...baseDevice, cropIds: ['yam'] };
    const base = deriveTargetsForCrops(['yam']);
    const sim = buildInitialSimState(device);
    expect(sim.targetTemperature).toBe(base.targetTemperature);
    expect(sim.targetHumidity).toBe(base.targetHumidity);
  });

  it('crop-based device applies the state adjustment — the gap this closes: picking "Almost Damaged" actually changes the sim target', () => {
    const freshDevice: Device = { ...baseDevice, cropIds: ['yam'], produceState: 'fresh' };
    const damagedDevice: Device = { ...baseDevice, cropIds: ['yam'], produceState: 'almost-damaged' };
    const freshSim = buildInitialSimState(freshDevice);
    const damagedSim = buildInitialSimState(damagedDevice);
    expect(damagedSim.targetTemperature).toBeLessThan(freshSim.targetTemperature);
    expect(damagedSim.targetHumidity).toBeGreaterThan(freshSim.targetHumidity);
  });

  it('crop-based device, dried state — target matches getStateAdjustedTargetsForCrops exactly (survives reload/re-derivation)', () => {
    const device: Device = { ...baseDevice, cropIds: ['yam', 'cocoyam'], produceState: 'dried' };
    const expected = getStateAdjustedTargetsForCrops(['yam', 'cocoyam'], 'dried');
    const sim = buildInitialSimState(device);
    expect(sim.targetTemperature).toBe(expected.targetTemperature);
    expect(sim.targetHumidity).toBe(expected.targetHumidity);
  });

  it('legacy produceMode-only device (no cropIds) still applies the state adjustment', () => {
    const freshDevice: Device = { ...baseDevice, produceMode: 'fruits', produceState: 'fresh' };
    const damagedDevice: Device = { ...baseDevice, produceMode: 'fruits', produceState: 'almost-damaged' };
    const freshSim = buildInitialSimState(freshDevice);
    const damagedSim = buildInitialSimState(damagedDevice);
    expect(damagedSim.targetTemperature).toBeLessThan(freshSim.targetTemperature);
    expect(damagedSim.targetHumidity).toBeGreaterThan(freshSim.targetHumidity);
  });

  it('device with neither cropIds nor produceMode falls back to the 8°C/85% neutral default, regardless of produceState', () => {
    const device: Device = { ...baseDevice, produceState: 'almost-damaged' };
    const sim = buildInitialSimState(device);
    expect(sim.targetTemperature).toBe(8);
    expect(sim.targetHumidity).toBe(85);
  });
});
