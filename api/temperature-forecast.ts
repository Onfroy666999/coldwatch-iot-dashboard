// api/temperature-forecast.ts
// ─────────────────────────────────────────────────────────────────────────────
// Vercel Serverless Function — ColdWatch AI Temperature Forecaster (Level 3)
//
// Implements Holt's Double Exponential Smoothing for deterministic temperature
// prediction without consuming any AI tokens. Deployed automatically to:
//   https://coldwatch-iot-dashboard.vercel.app/api/temperature-forecast
//
// Algorithm: Holt (1957) — handles linear trend in sensor data with no
// assumed seasonality. Appropriate for cold storage: temperatures drift
// linearly when cooling is on or off, without daily or weekly cycles.
//
// Security: CORS restricted to the ColdWatch domain + localhost dev.
//           POST only. Validates all inputs before computation.
// ─────────────────────────────────────────────────────────────────────────────

// ─── Request / Response types ──────────────────────────────────────────────

interface ForecastRequest {
  readings:          number[];   // temperature readings in order (°C)
  intervalSeconds:   number;     // seconds between readings (typically 3)
  targetTemperature: number;     // current target (°C)
  warningThreshold:  number;     // warning alert threshold (°C)
  criticalThreshold: number;     // critical alert threshold (°C)
  produceMode:       string;     // produce category for safe-minimum lookup
  minSafeTarget:     number;     // caller-computed safe minimum target (°C)
}

interface ForecastResponse {
  predictedTemp30min: number;           // predicted °C in 30 minutes
  predictedTemp60min: number;           // predicted °C in 60 minutes
  trend:              'rising' | 'falling' | 'stable';
  slopePerMin:        number;           // degrees per minute (positive = rising)
  anomalyScore:       number;           // 0–1: how unusual recent readings are
  shouldAdjust:       boolean;          // true if a target change is recommended
  recommendedTarget:  number;           // suggested new target (°C)
  confidence:         'high' | 'medium' | 'low';
  reason:             string;           // plain-English explanation
}

// ─── Holt's Double Exponential Smoothing ─────────────────────────────────

// Smoothing parameters tuned for 3-second cold-storage sensor data:
//   alpha 0.25 — level responds to real temperature shifts but ignores noise
//   beta  0.08 — trend adapts slowly; prevents overreacting to brief spikes
const ALPHA = 0.25;
const BETA  = 0.08;

interface HoltState { level: number; trend: number }

function holtSmooth(values: number[]): HoltState {
  if (values.length === 0) return { level: 0, trend: 0 };
  if (values.length === 1) return { level: values[0], trend: 0 };

  // Initialise level at first value; trend as mean of first 4 differences
  // (using multiple differences gives a more stable initial estimate than
  //  just values[1] - values[0] which can be noise-dominated)
  const initWindow = Math.min(4, values.length - 1);
  let trend = 0;
  for (let i = 0; i < initWindow; i++) trend += (values[i + 1] - values[i]);
  trend /= initWindow;

  let level = values[0];

  for (let i = 1; i < values.length; i++) {
    const prevLevel = level;
    level = ALPHA * values[i] + (1 - ALPHA) * (prevLevel + trend);
    trend = BETA  * (level - prevLevel) + (1 - BETA) * trend;
  }

  return { level, trend };
}

// Predict h steps forward from current state
function holtForecast(state: HoltState, steps: number): number {
  return parseFloat((state.level + state.trend * steps).toFixed(1));
}

// ─── Anomaly detection (Modified Z-Score using MAD) ──────────────────────
// Median Absolute Deviation is robust against outliers — better than standard
// Z-score for sensor data which can have occasional hardware spikes.
// Returns a 0–1 score; values > 0.7 indicate unusually high variation.

function medianAbsoluteDeviation(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid    = Math.floor(sorted.length / 2);
  const median = sorted.length % 2 !== 0
    ? sorted[mid]
    : (sorted[mid - 1] + sorted[mid]) / 2;
  const deviations = values.map(v => Math.abs(v - median));
  const madSorted  = [...deviations].sort((a, b) => a - b);
  const madMid     = Math.floor(madSorted.length / 2);
  return madSorted.length % 2 !== 0
    ? madSorted[madMid]
    : (madSorted[madMid - 1] + madSorted[madMid]) / 2;
}

function anomalyScore(values: number[], currentValue: number): number {
  if (values.length < 5) return 0; // not enough data
  const sorted = [...values].sort((a, b) => a - b);
  const mid    = Math.floor(sorted.length / 2);
  const median = sorted.length % 2 !== 0
    ? sorted[mid]
    : (sorted[mid - 1] + sorted[mid]) / 2;
  const mad    = medianAbsoluteDeviation(values);
  if (mad === 0) return 0; // perfectly stable — no anomaly possible

  // Modified Z-score: 0.6745 scales MAD to match std dev for normal distribution
  const modZScore = Math.abs(0.6745 * (currentValue - median) / mad);

  // Sigmoid normalisation: score of 1 at modZScore ≈ 5 (extreme outlier)
  return parseFloat(Math.min(1, modZScore / 5).toFixed(2));
}

// ─── Confidence classification ────────────────────────────────────────────
// Based on: number of readings (more = better), how consistent the trend is
// (low variance = better), and whether the anomaly score is disruptive.

function classifyConfidence(
  readingCount: number,
  slopeConsistency: number,  // std dev of per-step slopes (lower = better)
  anomaly: number,
): 'high' | 'medium' | 'low' {
  // Not enough readings for a reliable estimate
  if (readingCount < 10) return 'low';

  // High anomaly score means recent readings are erratic — can't predict well
  if (anomaly > 0.75) return 'low';

  // Consistent slope and enough data → high confidence
  if (readingCount >= 30 && slopeConsistency < 0.3 && anomaly < 0.3) return 'high';

  // Moderate conditions
  if (readingCount >= 20 && slopeConsistency < 0.6) return 'medium';

  return 'low';
}

// ─── Slope consistency (used for confidence) ──────────────────────────────
// Computes the standard deviation of per-step temperature differences.
// A stable cooling/heating curve has consistent step differences; noisy
// sensor data has high variance in steps.

function slopeStdDev(values: number[]): number {
  if (values.length < 3) return 999;
  const steps = values.slice(1).map((v, i) => v - values[i]);
  const mean  = steps.reduce((s, v) => s + v, 0) / steps.length;
  const variance = steps.reduce((s, v) => s + (v - mean) ** 2, 0) / steps.length;
  return Math.sqrt(variance);
}

// ─── Main handler ─────────────────────────────────────────────────────────

export default function handler(req: any, res: any): void {
  // ── CORS ───────────────────────────────────────────────────────────────────
  // Allow the deployed Vercel domain, localhost dev, and preview deployments.
  const origin = req.headers['origin'] ?? '';
  const allowed =
    origin === 'https://coldwatch-iot-dashboard.vercel.app' ||
    /^https:\/\/coldwatch-iot-dashboard-.*\.vercel\.app$/.test(origin) ||
    origin.startsWith('http://localhost') ||
    origin.startsWith('http://127.0.0.1');

  if (allowed) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
  }
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Cache-Control', 'no-store');

  if (req.method === 'OPTIONS') { res.status(200).end(); return; }
  if (req.method !== 'POST')    { res.status(405).json({ error: 'Method not allowed' }); return; }

  // ── Input validation ───────────────────────────────────────────────────────
  const body = req.body as Partial<ForecastRequest>;

  if (!Array.isArray(body.readings) || body.readings.length < 5) {
    res.status(400).json({ error: 'Need at least 5 readings' });
    return;
  }
  if (body.readings.some(v => typeof v !== 'number' || !isFinite(v))) {
    res.status(400).json({ error: 'readings must be finite numbers' });
    return;
  }
  if (
    typeof body.intervalSeconds   !== 'number' || body.intervalSeconds   <= 0 ||
    typeof body.targetTemperature !== 'number' ||
    typeof body.warningThreshold  !== 'number' ||
    typeof body.criticalThreshold !== 'number' ||
    typeof body.minSafeTarget     !== 'number'
  ) {
    res.status(400).json({ error: 'Missing or invalid numeric parameters' });
    return;
  }

  // Clamp to last 60 readings — anything beyond that adds noise, not signal
  const values            = body.readings.slice(-60);
  const intervalSeconds   = body.intervalSeconds;
  const targetTemperature = body.targetTemperature;
  const warningThreshold  = body.warningThreshold;
  const criticalThreshold = body.criticalThreshold;
  const minSafeTarget     = body.minSafeTarget;

  // ── Forecast ───────────────────────────────────────────────────────────────
  const state = holtSmooth(values);

  // Steps from current position to 30 and 60 minutes
  const stepsPerMinute = 60 / intervalSeconds;
  const steps30        = Math.round(30 * stepsPerMinute);
  const steps60        = Math.round(60 * stepsPerMinute);

  const predicted30 = holtForecast(state, steps30);
  const predicted60 = holtForecast(state, steps60);

  // Degrees per minute from smoothed trend
  const slopePerMin = parseFloat((state.trend * stepsPerMinute).toFixed(3));

  // Trend classification
  const trend: 'rising' | 'falling' | 'stable' =
    slopePerMin > 0.05 ? 'rising' :
    slopePerMin < -0.05 ? 'falling' : 'stable';

  // ── Anomaly and confidence ─────────────────────────────────────────────────
  const currentTemp  = values[values.length - 1];
  const anomaly      = anomalyScore(values, currentTemp);
  const consistency  = slopeStdDev(values);
  const confidence   = classifyConfidence(values.length, consistency, anomaly);

  // ── Recommendation logic ───────────────────────────────────────────────────
  // Recommend an adjustment when the predicted temperature in 30 minutes will
  // exceed the warning threshold — giving time to act before a breach occurs.
  const willBreachWarningIn30   = predicted30 > warningThreshold && currentTemp <= warningThreshold;
  const willBreachCriticalIn30  = predicted30 > criticalThreshold;
  const isAlreadyAboveWarning   = currentTemp > warningThreshold;
  const shouldAdjust =
    (willBreachWarningIn30 || willBreachCriticalIn30 || isAlreadyAboveWarning) &&
    trend === 'rising' &&
    confidence !== 'low';

  // Recommended target: lower by enough to intercept the predicted breach,
  // capped at 3°C reduction per cycle, never below the produce safe minimum.
  let recommendedTarget = targetTemperature;
  if (shouldAdjust) {
    // How much do we need to bring the predicted temperature down?
    const excess  = Math.max(0, predicted30 - warningThreshold);
    // Reduce target by at least 1°C and at most the excess or 3°C
    const stepDown = Math.min(3, Math.max(1, Math.ceil(excess)));
    recommendedTarget = Math.max(minSafeTarget, targetTemperature - stepDown);
  }

  // ── Plain-English reason ───────────────────────────────────────────────────
  let reason: string;
  if (!shouldAdjust && trend === 'stable') {
    reason = 'Temperature is stable — no adjustment required.';
  } else if (!shouldAdjust && trend === 'falling') {
    reason = `Temperature is falling at ${Math.abs(slopePerMin).toFixed(2)}°/min — cooling is working well.`;
  } else if (!shouldAdjust && confidence === 'low') {
    reason = 'Sensor readings are too variable for a confident recommendation right now.';
  } else if (willBreachCriticalIn30) {
    reason = `Temperature is rising at ${slopePerMin.toFixed(2)}°/min and is projected to hit the critical threshold (${criticalThreshold}°C) within 30 minutes — lowering target to intercept before the breach.`;
  } else if (willBreachWarningIn30) {
    reason = `Temperature is rising at ${slopePerMin.toFixed(2)}°/min and is on track to breach the warning threshold (${warningThreshold}°C) within 30 minutes — a preemptive target reduction will prevent the alert.`;
  } else if (isAlreadyAboveWarning) {
    reason = `Temperature is already above the warning threshold and continuing to rise — lowering target to bring it back into range faster.`;
  } else {
    reason = `Temperature trending ${trend} at ${Math.abs(slopePerMin).toFixed(2)}°/min. Projected: ${predicted30}°C in 30 min.`;
  }

  // ── Response ───────────────────────────────────────────────────────────────
  const response: ForecastResponse = {
    predictedTemp30min: predicted30,
    predictedTemp60min: predicted60,
    trend,
    slopePerMin,
    anomalyScore:       anomaly,
    shouldAdjust,
    recommendedTarget:  parseFloat(recommendedTarget.toFixed(1)),
    confidence,
    reason,
  };

  res.status(200).json(response);
}
