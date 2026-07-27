import { describe, it, expect } from 'vitest';
import {
  isValidProduceMode,
  getStateAdjustedTargets,
  PRODUCE_THRESHOLDS,
  STATE_ADJUSTMENTS,
} from './types';

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
