import { describe, it, expect } from 'vitest';
import { deriveTargetsForCrops, getCrop } from './produce';

describe('deriveTargetsForCrops', () => {
  it('returns a safe neutral default for an empty crop list', () => {
    const result = deriveTargetsForCrops([]);
    expect(result).toEqual({
      targetTemperature: 8, targetHumidity: 85,
      warningTemperature: 10, criticalTemperature: 13,
      warningHumidity: 90, criticalHumidity: 95,
      chillingFloor: null, humidAlertHigh: false, hasConflict: false,
    });
  });

  it('single crop: returns that crop\'s own numbers unchanged, no conflict', () => {
    const result = deriveTargetsForCrops(['yam']);
    const yam = getCrop('yam');
    expect(result).toEqual({
      targetTemperature: yam.targetTemperature,
      targetHumidity: yam.targetHumidity,
      warningTemperature: yam.warningTemperature,
      criticalTemperature: yam.criticalTemperature,
      warningHumidity: yam.warningHumidity,
      criticalHumidity: yam.criticalHumidity,
      chillingFloor: yam.chillingFloor,
      humidAlertHigh: yam.humidAlertHigh,
      hasConflict: false,
    });
    // Matches the gap analysis doc's own worked example (14°C target,
    // 75% humidity) — regression guard against that number silently drifting.
    expect(result.targetTemperature).toBe(14);
    expect(result.targetHumidity).toBe(75);
  });

  it('multi-crop, compatible set: picks a target inside every crop\'s own tempRange overlap', () => {
    // yam [13,17] and cocoyam [12,16] overlap at [13,16] — both are tubers,
    // known-compatible per the compatibility engine.
    const result = deriveTargetsForCrops(['yam', 'cocoyam']);
    expect(result.hasConflict).toBe(false);
    expect(result.targetTemperature).toBeGreaterThanOrEqual(13);
    expect(result.targetTemperature).toBeLessThanOrEqual(16);
  });

  it('multi-crop: never sets a target below the most chilling-sensitive crop\'s floor', () => {
    // yam's chillingFloor is 13 — a combined target below that would be the
    // exact bug the doc's roadmap flagged this function for previously.
    const result = deriveTargetsForCrops(['yam', 'cocoyam']);
    expect(result.chillingFloor).toBe(13); // max(13, 12) — protects the stricter one
    expect(result.targetTemperature).toBeGreaterThanOrEqual(result.chillingFloor!);
  });

  it('multi-crop: never sets a target at/above the tightest critical ceiling', () => {
    const result = deriveTargetsForCrops(['yam', 'cocoyam']);
    expect(result.targetTemperature).toBeLessThan(result.criticalTemperature);
  });

  it('multi-crop, incompatible set (meat mixed with produce): flags hasConflict', () => {
    // The gap analysis and the compatibility engine both treat meat/fish
    // mixed with produce as a hard block, food-safety not just quality.
    const result = deriveTargetsForCrops(['beef', 'yam']);
    expect(result.hasConflict).toBe(true);
  });

  it('warningTemperature and criticalTemperature are the strictest (lowest) among the crop set', () => {
    const result = deriveTargetsForCrops(['yam', 'cocoyam']);
    const yam = getCrop('yam');
    const cocoyam = getCrop('cocoyam');
    expect(result.criticalTemperature).toBe(Math.min(yam.criticalTemperature, cocoyam.criticalTemperature));
    expect(result.warningTemperature).toBe(Math.min(yam.warningTemperature, cocoyam.warningTemperature));
  });

  it('is deterministic — same crop list produces the same result on repeated calls', () => {
    const a = deriveTargetsForCrops(['maize', 'rice']);
    const b = deriveTargetsForCrops(['maize', 'rice']);
    expect(a).toEqual(b);
  });
});
