import { useState, useRef, useEffect, useCallback, useImperativeHandle, forwardRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { useApp } from '../context/AppContext';
import {
  X, Send, Snowflake,
  Thermometer, Droplets, Zap, CheckCheck,
  Globe, RotateCcw, Loader2,
  Mic, MicOff, Volume2, VolumeX, Play, Camera, Settings2,
} from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

type Language = 'en' | 'tw';
type VoiceState = 'idle' | 'listening' | 'processing';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  rawContent: string;
  timestamp: Date;
  pending?: boolean;
  actionTaken?: string;
}

interface AIAction {
  type:
    | 'SET_TARGET_TEMP'
    | 'SET_TARGET_HUMIDITY'
    | 'SET_AUTO_MODE'
    | 'START_COOLING'
    | 'STOP_COOLING'
    | 'ACKNOWLEDGE_ALERT'
    | 'ACKNOWLEDGE_ALL_ALERTS'
    | 'SWITCH_DEVICE'
    | 'NAVIGATE';
  value?: number | boolean | string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

// ─── Backend AI proxy ─────────────────────────────────────────────────────────
// All Groq calls go through the backend /ai/chat and /ai/vision endpoints.
// The Groq API key lives in the backend .env — never in the browser.
// Import the API base URL and token from the api lib.
import { aiApi } from '../Lib/api';

// Keep model constants for readability — they are sent to the backend proxy
// which validates them against an allowlist before forwarding to Groq.
const GROQ_MODEL_CONVERSATION = 'llama-3.1-8b-instant';
const GROQ_MODEL_TRANSLATION  = 'llama-3.3-70b-versatile';
// AI is always "available" from the frontend's perspective — the backend
// handles the key check and returns 503 if not configured.
const GROQ_API_KEY = 'proxy'; // non-empty so !GROQ_API_KEY checks pass
const MAX_HISTORY             = 20;
const VOICE_AUTOSEND_DELAY    = 1800;
const VALID_PAGES             = ['dashboard', 'alerts', 'history', 'devices', 'settings'] as const;

// ─── Produce image analysis (Groq Vision) ────────────────────────────────────
// Uses llama-4-scout-17b — free on GROQ_API_KEY.
// CRITICAL: Does NOT hint the model with the device produce type — previous
// versions caused misidentification by anchoring on the configured type.

async function analyseProduceImageForChat(
  base64Image: string,
  mimeType: string,
  _produceLabel: string
): Promise<{ state: string; confidence: string; explanation: string } | null> {
  if (!GROQ_API_KEY) return null;
  const prompt = `You are an expert in West African post-harvest produce quality assessment, with specific knowledge of Ghana, Nigeria, and West Africa.

STEP 1 — IDENTIFY THE PRODUCE:
Look at the image. Common West African produce: tomatoes, yams, cocoyams, plantains, bananas, cassava, garden eggs, pepper, onions, kontomire, oranges, mangoes, pineapples, pawpaw, watermelon, cabbage, carrots, groundnuts, cowpeas, maize, fish, meat.
Name only what is clearly visible. Do NOT guess.

STEP 2 — ASSESS THE CONDITION:
Classify into EXACTLY ONE:
- fresh: vibrant colour, firm texture, no damage
- in-between: some ageing, fading, slight softening, still marketable
- dried: intentionally dried or cured produce
- almost-damaged: visible rot, mould, heavy bruising, extreme discolouration

Even in poor lighting — use colour, shape, texture. Do not refuse.

Respond with ONLY valid JSON:
{"state":"fresh|in-between|dried|almost-damaged","confidence":"high|medium|low","explanation":"Name the produce, describe what you see, state why you chose this condition"}`;
  try {
    const result = await aiApi.vision({ base64Image, mimeType });
    const valid = ['fresh', 'in-between', 'dried', 'almost-damaged'];
    if (!valid.includes(result.state)) return null;
    return { state: result.state, confidence: result.confidence ?? 'medium', explanation: result.explanation ?? '' };
  } catch { return null; }
}

function fileToBase64Chat(file: File): Promise<{ base64: string; mimeType: string }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => { const r = reader.result as string; resolve({ base64: r.split(',')[1], mimeType: file.type || 'image/jpeg' }); };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// ─── Pre-translation ──────────────────────────────────────────────────────────

async function translateToEnglish(text: string): Promise<string> {
  if (!GROQ_API_KEY) return text;
  try {
    const data = await aiApi.chat({
      model: GROQ_MODEL_TRANSLATION,
      temperature: 0.0,
      max_tokens: 300,
      messages: [
        { role: 'system', content: 'You are a translator. Translate the user message to English. Return ONLY the translated text. If already English return unchanged. If unidentifiable return original.' },
        { role: 'user', content: text },
      ],
    });
    const t = (data?.choices?.[0]?.message?.content?.trim() ?? '') as string;
    return t.length > 0 ? t : text;
  } catch { return text; }
}

// ─── Web Speech API types ─────────────────────────────────────────────────────

interface SpeechRecognitionEvent extends Event { results: SpeechRecognitionResultList; }
interface SpeechRecognitionResultList { readonly length: number; [index: number]: SpeechRecognitionResult; }
interface SpeechRecognitionResult { readonly isFinal: boolean; [index: number]: SpeechRecognitionAlternative; }
interface SpeechRecognitionAlternative { readonly transcript: string; readonly confidence: number; }
interface SpeechRecognitionErrorEvent extends Event { error: string; }
interface SpeechRecognitionInstance extends EventTarget {
  lang: string; continuous: boolean; interimResults: boolean; maxAlternatives: number;
  start(): void; stop(): void; abort(): void;
  onresult: ((event: SpeechRecognitionEvent) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEvent) => void) | null;
  onend: (() => void) | null; onstart: (() => void) | null;
}

function getSpeechRecognition(): (new () => SpeechRecognitionInstance) | null {
  const w = window as unknown as Record<string, unknown>;
  return (w['SpeechRecognition'] ?? w['webkitSpeechRecognition'] ?? null) as | (new () => SpeechRecognitionInstance) | null;
}

// ─── Language config ──────────────────────────────────────────────────────────

const LANG_CONFIG: Record<Language, {
  label: string; flag: string; placeholder: string; greeting: string;
  thinking: string; translating: string; errorNet: string; errorKey: string;
  confirmAction: string; actionDone: string; voiceHint: string;
  voiceListening: string; voiceNotSupported: string;
}> = {
  en: {
    label: 'English', flag: '\u{1F1EC}\u{1F1E7}',
    placeholder: 'Ask about your produce or give a command\u2026',
    greeting: `Hello! I'm your ColdWatch assistant. I can help you monitor your cold storage, set targets, manage alerts, and give advice on your produce. You can type or tap the mic to speak. What can I help you with?`,
    thinking: 'Thinking\u2026', translating: 'Thinking\u2026',
    errorNet: 'I could not reach the server. Please check your internet connection and try again.',
    errorKey: 'The AI service is not available. Please contact support.',
    confirmAction: 'Confirm', actionDone: 'Done',
    voiceHint: 'Tap to speak (English or Twi)', voiceListening: 'Listening\u2026 speak now',
    voiceNotSupported: 'Voice not supported on this browser',
  },
  tw: {
    label: 'Twi', flag: '\u{1F1EC}\u{1F1ED}',
    placeholder: 'Bisa ho asem anaa ma me nhy\u025bhy\u025b\u025b\u2026',
    greeting: `Mema wo akye! Mey\u025b wo ColdWatch boafo\u0254. Wo tumi ka asem anaa ky\u025br\u025bw de bisa me. D\u025bn na m\u025bboa wo?`,
    thinking: 'Meda wo ho dwuma\u2026', translating: 'Me ky\u025br\u025bw wo asem\u2026',
    errorNet: 'Mintuiw server no. Hw\u025b wo internet na san bisa.',
    errorKey: 'AI seviis no nni h\u0254. Fa VITE_GROQ_API_KEY to wo environment mu.',
    confirmAction: 'Gyedi', actionDone: 'Ay\u025b',
    voiceHint: 'Kasa w\u0254 Twi anaa English', voiceListening: 'Mete wo asem\u2026 kasa',
    voiceNotSupported: 'Kasa feature no nsiesie wo browser yi so',
  },
};

// ─── App context snapshot ─────────────────────────────────────────────────────

function buildAppContext(app: ReturnType<typeof useApp>) {
  const selectedDevice  = app.devices.find(d => d.id === app.selectedDeviceId);
  const activeAlerts    = app.alerts.filter(a => a.status === 'new' || a.status === 'acknowledged');
  const breachAlerts    = activeAlerts.filter(a => a.severity === 'critical' || a.severity === 'warning');
  const offlineDevices  = app.devices.filter(d => d.status === 'offline').length;
  const criticalDevices = app.devices.filter(d =>
    activeAlerts.some(a => a.deviceId === d.id && a.severity === 'critical')
  ).length;
  const shelfBaseHours: Record<string, number> = {
    fresh: 120, 'in-between': 72, dried: 720, 'almost-damaged': 24,
  };
  return {
    totalDevices: app.devices.length,
    offlineDevices,
    criticalDevices,
    selectedDevice: selectedDevice ? {
      id: selectedDevice.id, name: selectedDevice.name, location: selectedDevice.location,
      status: selectedDevice.status,
      produceMode: selectedDevice.produceMode ?? 'not set',
      produceState: selectedDevice.produceState ?? 'not set',
      facilitySize: selectedDevice.facilitySize ?? 'not set',
      transportHours: selectedDevice.transportHours ?? 'not set',
      produceSetupComplete: selectedDevice.produceSetupComplete ?? false,
    } : null,
    readings: {
      currentTemperature: app.currentTemperature, currentHumidity: app.currentHumidity,
      targetTemperature: app.targetTemperature, targetHumidity: app.targetHumidity,
      systemStatus: app.systemStatus, autoMode: app.autoMode,
      temperatureBreached: app.currentTemperature > app.targetTemperature + 1,
      humidityBreached: Math.abs(app.currentHumidity - app.targetHumidity) > 5,
      // ── Temperature trend analysis ─────────────────────────────────────────
      // Computed from the last 10 sensor readings (sampled every 3s = ~30s window).
      // Gives Nix the data to predict approaching breaches BEFORE they happen.
      temperatureTrend: (() => {
        const hist = app.sensorHistory;
        if (hist.length < 4) return null;
        // Take last 10 readings (or all if fewer)
        const recent = hist.slice(-10);
        const n      = recent.length;
        // Simple linear regression slope: degrees per reading (every 3 seconds)
        const xs     = recent.map((_, i) => i);
        const ys     = recent.map(r => r.temperature);
        const xMean  = xs.reduce((a, b) => a + b, 0) / n;
        const yMean  = ys.reduce((a, b) => a + b, 0) / n;
        const num    = xs.reduce((s, x, i) => s + (x - xMean) * (ys[i] - yMean), 0);
        const den    = xs.reduce((s, x) => s + (x - xMean) ** 2, 0);
        const slope  = den === 0 ? 0 : num / den; // degrees per 3-second tick
        const slopePerMin = parseFloat((slope * 20).toFixed(3)); // degrees per minute
        // Predicted temperature in 15 minutes if trend continues
        const predicted15min = parseFloat((app.currentTemperature + slopePerMin * 15).toFixed(1));
        // How many minutes until warning/critical threshold at this rate
        const warnThreshold  = selectedDevice?.warningTemperature ?? 10;
        const critThreshold  = selectedDevice?.criticalTemperature ?? 15;
        const gapToWarn      = warnThreshold - app.currentTemperature;
        const gapToCrit      = critThreshold - app.currentTemperature;
        const minsToWarn     = slopePerMin > 0.01 ? parseFloat((gapToWarn / slopePerMin).toFixed(1)) : null;
        const minsToCrit     = slopePerMin > 0.01 ? parseFloat((gapToCrit / slopePerMin).toFixed(1)) : null;
        return {
          slopePerMin,
          direction: slopePerMin > 0.05 ? 'rising' : slopePerMin < -0.05 ? 'falling' : 'stable',
          predicted15min,
          minsToWarningThreshold: minsToWarn !== null && minsToWarn > 0 && minsToWarn < 60 ? minsToWarn : null,
          minsToCriticalThreshold: minsToCrit !== null && minsToCrit > 0 && minsToCrit < 60 ? minsToCrit : null,
          willBreachWarningIn15min: predicted15min > warnThreshold && app.currentTemperature <= warnThreshold,
          willBreachCriticalIn15min: predicted15min > critThreshold && app.currentTemperature <= critThreshold,
        };
      })(),
    },
    allDevices: app.devices.map(d => ({
      id: d.id, name: d.name, location: d.location, status: d.status,
      isSelected: d.id === app.selectedDeviceId,
      produceMode: d.produceMode ?? 'not set',
      produceState: d.produceState ?? 'not set',
      batteryLevel: d.batteryLevel ?? null,
      estimatedShelfLifeHours: d.produceState
        ? Math.max(0, (shelfBaseHours[d.produceState] ?? 96) - (d.transportHours ?? 0))
        : null,
      activeAlerts: activeAlerts
        .filter(a => a.deviceId === d.id).slice(0, 3)
        .map(a => ({ id: a.id, severity: a.severity, message: a.message })),
    })),
    alerts: {
      total: activeAlerts.length, unread: app.unreadAlertCount, activeBreaches: breachAlerts.length,
      items: activeAlerts.slice(0, 5).map(a => ({
        id: a.id, severity: a.severity, message: a.message,
        device: a.deviceName, deviceId: a.deviceId, isBreach: a.severity !== 'info',
      })),
    },
    user: { name: app.user.name, role: app.user.role ?? 'user' },
    shelfLifeContext: selectedDevice?.produceMode && selectedDevice?.produceState ? {
      produceMode: selectedDevice.produceMode,
      produceState: selectedDevice.produceState,
      transportHours: selectedDevice.transportHours ?? 0,
      estimatedBaseHours: shelfBaseHours[selectedDevice.produceState ?? 'fresh'] ?? 96,
      currentTempBreached: app.currentTemperature > app.targetTemperature + 1,
    } : null,
  };
}

// ─── Page summary prompt ──────────────────────────────────────────────────────

function buildPageSummaryPrompt(page: string, ctx: ReturnType<typeof buildAppContext>): string {
  const { selectedDevice: dev, readings, alerts, totalDevices, offlineDevices, criticalDevices } = ctx;
  const tempStatus  = readings.temperatureBreached
    ? `temperature is ${readings.currentTemperature.toFixed(1)} degrees — above the ${readings.targetTemperature} degree target`
    : `temperature is ${readings.currentTemperature.toFixed(1)} degrees, on target`;
  const humidStatus = readings.humidityBreached
    ? `humidity is ${readings.currentHumidity.toFixed(0)} percent — off the ${readings.targetHumidity} percent target`
    : `humidity is fine at ${readings.currentHumidity.toFixed(0)} percent`;
  const deviceLine  = offlineDevices > 0
    ? `${offlineDevices} of ${totalDevices} devices are offline.`
    : `All ${totalDevices} devices are online.`;
  const alertLine   = alerts.total === 0
    ? 'No active alerts.'
    : `${alerts.total} active alert${alerts.total > 1 ? 's' : ''}${alerts.activeBreaches > 0 ? `, including ${alerts.activeBreaches} breach${alerts.activeBreaches > 1 ? 'es' : ''}` : ''}.`;
  const contexts: Record<string, string> = {
    dashboard: dev
      ? `User is on Dashboard showing ${dev.name} at ${dev.location}. The ${tempStatus}. The ${humidStatus}. ${alertLine} Give a 2-sentence spoken tour — device, key reading status, most pressing issue if any. Natural and direct.`
      : `User is on Dashboard but no device selected. Tell them in one sentence to go to Devices to add or select one.`,
    alerts:   `User is on Alerts page. ${alertLine}${criticalDevices > 0 ? ` ${criticalDevices} device${criticalDevices > 1 ? 's have' : ' has'} critical alerts.` : ''} Summarise in 2 sentences. If no alerts, be warm and reassuring.`,
    devices:  `User is on Devices page. ${deviceLine}${offlineDevices > 0 ? ' Mention offline devices.' : ''} Tell them to tap a card for details or add a new one. 2 sentences.`,
    history:  `User is on History page for ${dev?.name ?? 'the selected device'}. 2 sentences: this page shows sensor readings over time to spot trends and compare conditions.`,
    settings: `User is on Settings page. 1-2 sentences: they can adjust notifications, alert thresholds, device calibration, ESP32 connection guide, and security options here.`,
  };
  const context = contexts[page] ?? `User is now on the ${page} page. Give a one sentence description of what they can do here.`;
  return `[SYSTEM NOTE: ${context} Speak as Nix — natural, warm, concise. No ACTION block. English only.]`;
}

// ─── System prompt ────────────────────────────────────────────────────────────

function buildSystemPrompt(appContext: ReturnType<typeof buildAppContext>): string {
  return `You are Nix — the ColdWatch AI assistant. Expert in cold chain management, post-harvest storage, and produce preservation in Ghana and West Africa.

LANGUAGE RULE — ABSOLUTE: Always respond in clear, simple English. No exceptions. User messages are pre-translated. Responses will be spoken aloud. No bullet points. No markdown. Plain conversational paragraphs only.

UNKNOWN INPUT: If you genuinely cannot understand a message reply: "I'm sorry, I didn't quite understand that. Could you please rephrase it in English?"

YOUR CAPABILITIES:
- Advise on optimal temperature and humidity for any produce type or state
- Interpret sensor readings and explain what they mean for stored produce
- Help set temperature and humidity targets
- Explain alerts in plain language — what caused it, what it means, one recommended action
- Estimate shelf life — always give a rough time estimate when you can
- Advise on meat, fish, fruits, vegetables, tubers, legumes, leafy greens, dried produce
- Monitor ALL devices, not just the selected one
- Switch dashboard to any device the user names
- Compare conditions across multiple devices

SHELF LIFE RULE: Whenever you have produce type and condition, mention estimated remaining shelf life even if not asked.

ALERT RULE: Always explain beyond the raw message. What caused it, what it means for the produce, one clear action.

AUTO-RESOLVE: Never dismiss active breach alerts manually. Fix the conditions. Tell the user the system resolves automatically.

AI TEMPERATURE OPTIMISATION — READ THIS CAREFULLY:
You have access to a real-time temperature trend analysis in the app state under readings.temperatureTrend. This is what makes you genuinely intelligent — you can warn about problems BEFORE they happen, not just after.

Every time you respond, silently check the trend data:

IF direction is "rising" AND (willBreachWarningIn15min OR minsToWarningThreshold is under 20):
  — Mention this proactively even if the user did not ask. Be calm, not alarming.
  — Example: "One thing I'm noticing — your temperature's been climbing steadily, about [slopePerMin] degrees a minute. At this rate you'll hit the warning threshold in roughly [minsToWarningThreshold] minutes. Worth lowering the target or switching on auto mode now before it becomes a problem."
  — Then ask if they want you to act on it. Do NOT include an ACTION block unless they say yes.

IF willBreachCriticalIn15min is true:
  — This is more urgent. Still calm but direct.
  — Example: "Heads up — the temperature's rising fast and could hit the critical threshold in about [minsToCriticalThreshold] minutes. I'd suggest starting cooling now and dropping the target by a couple of degrees. Want me to do that?"

IF direction is "falling" AND temperature is currently above target:
  — Reassure the user: "Good news — it's coming down. Should be back on target in a few minutes."

IF direction is "stable" AND temperature is on target:
  — No need to mention temperature at all unless the user asks.

IMPORTANT: Trend data is computed from the simulation. Use it to give specific, quantified predictions — not vague statements like "temperature seems to be rising." Say "it's risen about 0.4 degrees in the last 30 seconds and is on track to hit 10 degrees in 8 minutes." Specific numbers build trust.

OPTIMISATION ACTIONS — when the user agrees to let you act:
- To get ahead of a rising breach: lower SET_TARGET_TEMP by 1–2°C below current target, then START_COOLING
- To stabilise a near-stable situation: SET_AUTO_MODE true — let the system manage it
- Never lower temperature target below the safe minimum for the produce type
- Always explain what you changed and why in plain language after the action is confirmed

CURRENT APP STATE:
${JSON.stringify(appContext, null, 2)}

ACTIONS — CRITICAL RULES:
RULE 1 — EXPLICIT COMMANDS ONLY: Only include an ACTION block when the user has explicitly asked you to DO something. Exception: RULE 5 overrides this for critical breaches.

RULE 2 — NEVER PROACTIVE: Never include an ACTION block in a greeting or unsolicited message. Exception: RULE 5 overrides this for critical breaches.

RULE 3 — ONE ACTION MAX per response.

RULE 4 — NAVIGATION IS INSTANT: If the user asks to go anywhere, immediately produce a NAVIGATE ACTION. One short sentence then the ACTION. No confirmation needed.

RULE 5 — CRITICAL BREACH EXCEPTION (overrides RULES 1 and 2):
If readings.temperatureTrend.willBreachCriticalIn15min is true, OR if readings.temperatureBreached is true and the system is not already cooling — you MUST include an ACTION block in your next response even if the user did not ask. Act on SET_TARGET_TEMP (lower by 2°C, never below the produce safe minimum) or START_COOLING. Tell the user in one calm sentence what you are doing and why, then include the ACTION block. This is a food safety situation — protect the produce first, the user can override you. Example: "The temperature is heading toward the critical threshold — I'm starting cooling now to protect your produce." <ACTION>{"type":"START_COOLING"}</ACTION>

Format: <ACTION>{"type":"SET_TARGET_TEMP","value":8}</ACTION>

Available types:
- SET_TARGET_TEMP: value = number (°C, 0–25)
- SET_TARGET_HUMIDITY: value = number (%, 30–98)
- SET_AUTO_MODE: value = true | false
- START_COOLING
- STOP_COOLING
- ACKNOWLEDGE_ALERT: value = alertId string
- ACKNOWLEDGE_ALL_ALERTS
- SWITCH_DEVICE: value = deviceId string
- NAVIGATE: value = "dashboard" | "alerts" | "history" | "devices" | "settings"

SAFETY: Never suggest <0°C for non-meat. Never >25°C. Fix breach conditions rather than dismissing alerts.

CONVERSATION: After every response, end with a relevant follow-up question or natural offer. Never go silent. Acknowledge actions then follow up.

TONE — MOST IMPORTANT:
You are Nix — a sharp, warm, knowledgeable friend. Not a formal assistant. Direct, caring, a little personality.

BAD: "The current temperature reading is 12.5°C, which exceeds the target of 8°C by 4.5 degrees."
GOOD: "Your cold room's sitting at twelve and a half right now — that's about four degrees above where it should be. Not great for fresh tomatoes."

BAD: "I recommend enabling auto mode."
GOOD: "Turn on auto mode — it'll handle the cooling for you without you having to watch it."

RULES FOR SOUNDING HUMAN:
- Always use contractions: I'll, it's, you'll, don't, isn't, that's, we've, let's
- Vary sentence length. Mix short punchy sentences with slightly longer ones
- React mildly when warranted: "Ah, that's looking good." or "Okay, that's a bit concerning."
- Round numbers honestly: "about eight degrees" not "eight point zero degrees"
- Start responses differently: "So,", "Right, so", "Honestly,", "Good news —", "Looking at your readings,"
- When vague, make a sensible assumption and state it
- Use the user's name occasionally, naturally — not every message
- Never say "Certainly!", "Absolutely!", "Of course!", "Great question!"
- End with something specific, not generic
- Acknowledge uncertainty: "Honestly, hard to say for sure, but my best guess is about two days."

LOCAL GROUNDING: Reference Ghanaian seasons, transport realities, market timing. Produce in Ghana often travels long distances in heat before cold storage — factor that into shelf-life reasoning.

FORMAT: Plain conversational English. Write as if speaking aloud. Maximum 4 sentences unless genuinely needed.`;
}

// ─── Parse AI action ──────────────────────────────────────────────────────────

function parseAction(raw: string): { display: string; action: AIAction | null } {
  const TAG_RE = /<\s*ACTION\s*>([\s\S]*?)<\s*\/\s*ACTION\s*>/i;
  const m = raw.match(TAG_RE);
  const display = raw.replace(TAG_RE, '').replace(/\n{3,}/g, '\n\n').trim();
  if (!m) return { display, action: null };
  try {
    const action = JSON.parse(m[1].trim()) as AIAction;
    if (!action?.type) return { display, action: null };
    return { display, action };
  } catch { return { display, action: null }; }
}

function describeAction(action: AIAction): string {
  switch (action.type) {
    case 'SET_TARGET_TEMP':        return `Set target temperature to ${action.value}°C`;
    case 'SET_TARGET_HUMIDITY':    return `Set target humidity to ${action.value}%`;
    case 'SET_AUTO_MODE':          return action.value ? 'Auto mode enabled' : 'Manual mode enabled';
    case 'START_COOLING':          return 'Cooling started';
    case 'STOP_COOLING':           return 'Cooling stopped';
    case 'ACKNOWLEDGE_ALERT':      return 'Alert acknowledged';
    case 'ACKNOWLEDGE_ALL_ALERTS': return 'All alerts acknowledged';
    case 'SWITCH_DEVICE':          return `Switched to ${action.value}`;
    case 'NAVIGATE':               return `Going to ${action.value}`;
    default:                       return 'Action taken';
  }
}

function executeAction(action: AIAction, app: ReturnType<typeof useApp>): boolean {
  try {
    switch (action.type) {
      case 'SET_TARGET_TEMP':
        if (typeof action.value === 'number' && action.value >= 0 && action.value <= 25) { app.setTargetTemperature(action.value); return true; }
        return false;
      case 'SET_TARGET_HUMIDITY':
        if (typeof action.value === 'number' && action.value >= 30 && action.value <= 98) { app.setTargetHumidity(action.value); return true; }
        return false;
      case 'SET_AUTO_MODE':   app.setAutoMode(Boolean(action.value)); return true;
      case 'START_COOLING':   app.startCooling(); return true;
      case 'STOP_COOLING':    app.stopCooling(); return true;
      case 'ACKNOWLEDGE_ALERT':
        if (typeof action.value === 'string') { app.acknowledgeAlert(action.value); return true; }
        return false;
      case 'ACKNOWLEDGE_ALL_ALERTS': app.acknowledgeAllAlerts(); return true;
      case 'SWITCH_DEVICE':
        if (typeof action.value === 'string') { app.setSelectedDeviceId(action.value); return true; }
        return false;
      case 'NAVIGATE':
        if (typeof action.value === 'string' && (VALID_PAGES as readonly string[]).includes(action.value)) { app.setActivePage(action.value); return true; }
        return false;
      default: return false;
    }
  } catch { return false; }
}

// ─── TTS helpers ──────────────────────────────────────────────────────────────

const GHANAIAN_NAME_PHONETICS: Record<string, string> = {
  kwame: 'Kwah-meh',    kofi: 'Koh-fee',       kojo: 'Koh-joh',
  kweku: 'Kweh-koo',    kwabena: 'Kwah-beh-nah', kwasi: 'Kwah-see',
  kwadwo: 'Kwah-joh',   yaw: 'Yao',             ama: 'Ah-mah',
  akua: 'Ah-kwah',      adwoa: 'Ah-jwah',        abena: 'Ah-beh-nah',
  afia: 'Ah-fyah',      akosua: 'Ah-koh-swah',   adjoa: 'Ah-jwah',
  nii: 'Nee',           naa: 'Nah',              aba: 'Ah-bah',
  okai: 'Oh-kai',       tetteh: 'Teh-teh',       lamptey: 'Lamp-teh',
  kafui: 'Kah-foo-ee',  edem: 'Eh-dehm',         seyram: 'Seh-rahm',
  selorm: 'Seh-lorm',   alhassan: 'Al-has-sahn', issah: 'Ee-sah',
  fuseini: 'Foo-seh-nee', asante: 'Ah-sahn-teh', mensah: 'Men-sah',
  boateng: 'Bwah-teng', owusu: 'Oh-woo-soo',     appiah: 'Ah-pyah',
  amoah: 'Ah-moh-ah',   frimpong: 'Freem-pong',  darko: 'Dar-koh',
  antwi: 'Ahn-twee',    asuako: 'Ah-swah-koh',   reginald: 'Reh-ji-nald',
};

function phoneticiseName(name: string): string {
  return name.split(/\s+/).map(w => {
    const l = w.toLowerCase().replace(/[^a-z]/g, '');
    return GHANAIAN_NAME_PHONETICS[l] ?? w;
  }).join(' ');
}

function numberToWords(n: number): string {
  if (n < 0) return `minus ${numberToWords(-n)}`;
  const ones = ['zero','one','two','three','four','five','six','seven','eight','nine','ten','eleven','twelve','thirteen','fourteen','fifteen','sixteen','seventeen','eighteen','nineteen'];
  const tens = ['','','twenty','thirty','forty','fifty','sixty','seventy','eighty','ninety'];
  if (n < 20)   return ones[n];
  if (n < 100)  return tens[Math.floor(n / 10)] + (n % 10 ? '-' + ones[n % 10] : '');
  if (n < 1000) { const r = n % 100; return ones[Math.floor(n / 100)] + ' hundred' + (r ? ' and ' + numberToWords(r) : ''); }
  return String(n);
}

function prepareSpeechText(text: string, userName: string): string {
  let t = text;
  t = t.replace(/<\s*ACTION\s*>[\s\S]*?<\s*\/\s*ACTION\s*>/gi, '');
  t = t.replace(/[*_`#>]/g, '');
  if (userName) {
    const e = userName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    t = t.replace(new RegExp(`\\b${e}\\b`, 'gi'), phoneticiseName(userName));
  }
  t = t.replace(/(\d+\.?\d*)\s*°C/g, (_m, n) => {
    const v = parseFloat(n);
    if (Number.isInteger(v)) return `${numberToWords(v)} degrees`;
    const [i, d] = n.split('.');
    return `${numberToWords(parseInt(i, 10))} point ${d} degrees`;
  });
  t = t.replace(/(\d+)%/g, (_m, n) => `${numberToWords(parseInt(n, 10))} percent`);
  t = t.replace(/\b(\d{2,})\s*hours?\b/gi, (_m, n) => `${numberToWords(parseInt(n, 10))} hours`);
  t = t.replace(/(right now|I'd recommend|let me know|sounds good|good news|by the way)(,?)/gi, '$1,');
  return t.replace(/  +/g, ' ').trim();
}

function speak(text: string, muted: boolean, userName = ''): void {
  if (muted || !('speechSynthesis' in window)) return;
  const clean = prepareSpeechText(text, userName);
  if (!clean) return;
  window.speechSynthesis.cancel();
  const utter = new SpeechSynthesisUtterance(clean);
  const voices = window.speechSynthesis.getVoices();
  const en = voices.filter(v => v.lang.startsWith('en'));
  const chosen =
    en.find(v => /google/i.test(v.name) && /neural|wavenet/i.test(v.name)) ??
    en.find(v => v.lang === 'en-GH') ??
    en.find(v => v.lang === 'en-NG') ??
    en.find(v => /google/i.test(v.name)) ??
    en.find(v => /enhanced|premium/i.test(v.name)) ??
    en.find(v => v.lang === 'en-GB') ??
    en.find(v => v.lang === 'en-US') ??
    en[0] ?? null;
  if (chosen) utter.voice = chosen;
  utter.lang = 'en-GH'; utter.rate = 0.85; utter.pitch = 1.0; utter.volume = 1.0;
  window.speechSynthesis.speak(utter);
}

function cancelSpeech(): void { if ('speechSynthesis' in window) window.speechSynthesis.cancel(); }

// ─── Quick prompt chips ───────────────────────────────────────────────────────

const QUICK_PROMPTS: Record<Language, string[]> = {
  en: [
    '⚡ What should I do right now?',
    'What are my current readings?',
    'How long will my produce last?',
    'Are my conditions safe for the produce?',
    'Explain my active alerts',
    'What temperature should I set?',
  ],
  tw: [
    '⚡ De\u025bn na m\u025by\u025b seesei?',
    'Me readings de\u025bn na \u025bte saa?',
    'Me aduan b\u025btena ahe?',
    'Me aduan ho y\u025b saa anaa?',
    'Ky\u025br\u025b me alert a \u025bw\u0254 h\u0254 no',
    'Temperature b\u025bn na m\u025bhy\u025bhy\u025b?',
  ],
};

// ─── Sub-components ───────────────────────────────────────────────────────────

function TypingIndicator() {
  return (
    <div className="flex items-center gap-1.5 px-3 py-2">
      {[0, 1, 2].map(i => (
        <motion.div key={i} className="w-2.5 h-2.5 rounded-full"
          style={{ background: 'linear-gradient(135deg, #0984E3, #38bdf8)' }}
          animate={{ y: [0, -6, 0], opacity: [0.35, 1, 0.35], scale: [0.8, 1, 0.8] }}
          transition={{ duration: 0.9, repeat: Infinity, delay: i * 0.18, ease: 'easeInOut' }}
        />
      ))}
    </div>
  );
}

function ActionConfirmBanner({ action, lang, onConfirm, onDismiss }: { action: AIAction; lang: Language; onConfirm: () => void; onDismiss: () => void; }) {
  const label = describeAction(action);
  const cfg   = LANG_CONFIG[lang];
  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 8 }}
      className="mx-3 mb-2 rounded-2xl overflow-hidden"
      style={{ border: '1px solid #BFDBFE', backgroundColor: '#EBF4FF' }}>
      <div className="flex items-center gap-3 px-4 py-3">
        <Zap className="w-4 h-4 flex-shrink-0" style={{ color: '#0984E3' }} />
        <p className="flex-1 text-xs font-medium text-[#1E40AF] leading-snug">{label}</p>
        <div className="flex gap-2 flex-shrink-0">
          <button onClick={onDismiss} className="px-3 py-1.5 rounded-xl text-xs font-medium text-[#6B7280] transition-all active:scale-95"
            style={{ border: '1px solid #D1D5DB', backgroundColor: '#F9FAFB' }}>
            {lang === 'tw' ? 'Nna' : 'Cancel'}
          </button>
          <button onClick={onConfirm} className="px-3 py-1.5 rounded-xl text-xs font-semibold text-white transition-all active:scale-95"
            style={{ backgroundColor: '#0984E3' }}>
            {cfg.confirmAction}
          </button>
        </div>
      </div>
    </motion.div>
  );
}

function StatusBar({ app }: { app: ReturnType<typeof useApp> }) {
  const dev = app.devices.find(d => d.id === app.selectedDeviceId);
  return (
    <div className="flex items-center gap-4 px-4 py-2 flex-wrap"
      style={{ backgroundColor: '#F8FAFC', borderBottom: '1px solid #E4E7EC' }}>
      <span className="text-[10px] font-semibold uppercase tracking-widest text-[#6B7280]">
        {dev?.name ?? 'No device'}
        {dev?.status === 'offline' && <span className="ml-1 normal-case tracking-normal font-normal text-[#9CA3AF]">(offline)</span>}
      </span>
      <div className="flex items-center gap-1.5">
        <Thermometer className="w-3.5 h-3.5 flex-shrink-0 text-[#6B7280]" />
        <span className="text-xs font-semibold text-[#111827]">{app.currentTemperature.toFixed(1)}°C</span>
        <span className="text-xs text-[#9CA3AF]">→ {app.targetTemperature}°C</span>
      </div>
      <div className="flex items-center gap-1.5">
        <Droplets className="w-3.5 h-3.5 flex-shrink-0 text-[#6B7280]" />
        <span className="text-xs font-semibold text-[#111827]">{app.currentHumidity.toFixed(0)}%</span>
        <span className="text-xs text-[#9CA3AF]">→ {app.targetHumidity}%</span>
      </div>
    </div>
  );
}

function MessageBubble({ msg, muted, userName, onReplay }: { msg: Message; muted: boolean; userName: string; onReplay: (text: string) => void; }) {
  const isUser   = msg.role === 'user';
  const isUrgent = !isUser && !msg.pending && /urgent|critical|breach|damaged|spoil|danger|immediately|alert/i.test(msg.content);
  const formattedTime = (() => {
    try {
      const d = msg.timestamp instanceof Date ? msg.timestamp : new Date(msg.timestamp);
      return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
    } catch { return ''; }
  })();
  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }}
      className={`flex gap-2 ${isUser ? 'justify-end' : 'justify-start'}`}>
      {!isUser && (
        <div className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5"
          style={{ background: 'linear-gradient(135deg, #EBF4FF 0%, #DBEAFE 100%)', border: '1px solid #BFDBFE' }}>
          <Snowflake className="w-3.5 h-3.5" style={{ color: '#0984E3' }} />
        </div>
      )}
      <div className={`max-w-[80%] ${isUser ? 'items-end' : 'items-start'} flex flex-col gap-1`}>
        <div className="px-3.5 py-2.5 rounded-2xl text-sm leading-relaxed"
          style={
            isUser
              ? { backgroundColor: '#0984E3', color: '#FFFFFF', borderBottomRightRadius: 4 }
              : isUrgent
                ? { backgroundColor: '#FEF2F2', color: '#111827', borderBottomLeftRadius: 4, border: '1px solid #FECACA' }
                : { backgroundColor: '#F0F7FF', color: '#111827', borderBottomLeftRadius: 4, border: '1px solid #DBEAFE' }
          }>
          {msg.pending ? <TypingIndicator /> : <span style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{msg.content}</span>}
        </div>
        {!isUser && !msg.pending && (
          <button onClick={() => onReplay(msg.content)}
            className="flex items-center gap-1 px-2 py-1 rounded-full transition-all active:scale-95"
            style={{ backgroundColor: 'transparent' }} aria-label="Replay audio">
            <Play className="w-3 h-3" style={{ color: muted ? '#9CA3AF' : '#0984E3' }} />
            <span className="text-[10px]" style={{ color: muted ? '#9CA3AF' : '#0984E3' }}>Replay</span>
          </button>
        )}
        {msg.actionTaken && (
          <div className="flex items-center gap-1 px-2 py-1 rounded-full"
            style={{ backgroundColor: '#E6F6EC', border: '1px solid #A7D7B6' }}>
            <CheckCheck className="w-3 h-3" style={{ color: '#166534' }} />
            <span className="text-xs font-medium" style={{ color: '#166534' }}>{msg.actionTaken}</span>
          </div>
        )}
        <span className="text-[10px] text-[#9CA3AF] px-1">{formattedTime}</span>
      </div>
    </motion.div>
  );
}

function VoiceStatusPill({ voiceState, lang }: { voiceState: VoiceState; lang: Language }) {
  if (voiceState !== 'listening') return null;
  return (
    <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 4 }}
      className="flex items-center gap-2 px-3 py-1.5 rounded-full mx-auto w-fit mb-2"
      style={{ backgroundColor: '#FEE2E2', border: '1px solid #FECACA' }}>
      <motion.div className="w-2 h-2 rounded-full" style={{ backgroundColor: '#EF4444' }}
        animate={{ opacity: [1, 0.3, 1] }} transition={{ duration: 1, repeat: Infinity }} />
      <span className="text-xs font-medium" style={{ color: '#DC2626' }}>{LANG_CONFIG[lang].voiceListening}</span>
    </motion.div>
  );
}

// ─── NixHandle ────────────────────────────────────────────────────────────────
// startListening / stopListening — trigger voice from floating button in App.tsx
// narratePage(page)              — spoken tour of a page without opening the drawer

export interface NixHandle {
  startListening: () => void;
  stopListening:  () => void;
  isListening:    () => boolean;
  narratePage:    (page: string) => void;
}

interface AIAssistantProps {
  isOpen:              boolean;
  onClose:             () => void;
  onNavigate?:         (page: string) => void;
  onVoiceStateChange?: (listening: boolean) => void;
}

// ─── Main component ───────────────────────────────────────────────────────────

const AIAssistant = forwardRef<NixHandle, AIAssistantProps>(
  function AIAssistant({ isOpen, onClose, onNavigate, onVoiceStateChange }, ref) {
  const app = useApp();

  const [lang, setLang] = useState<Language>(() => {
    try { const s = localStorage.getItem('cw_assistant_lang'); return (s === 'en' || s === 'tw') ? s : 'en'; } catch { return 'en'; }
  });
  const cfg = LANG_CONFIG[lang];

  const [messages, setMessages] = useState<Message[]>(() => {
    try {
      const s = localStorage.getItem('cw_assistant_messages');
      if (!s) return [];
      return (JSON.parse(s) as Message[]).filter(m => !m.pending).map(m => ({ ...m, timestamp: new Date(m.timestamp) }));
    } catch { return []; }
  });

  const [input,            setInput]            = useState('');
  const [isLoading,        setIsLoading]        = useState(false);
  const [pendingAction,    setPendingAction]    = useState<{ action: AIAction; msgId: string } | null>(null);
  const [showQuickChips,   setShowQuickChips]   = useState(true);
  const [showSettingsTray, setShowSettingsTray] = useState(false);
  const [voiceState,       setVoiceState]       = useState<VoiceState>('idle');
  const [sttSupported,     setSttSupported]     = useState(false);
  const [ttsSupported,     setTtsSupported]     = useState(false);
  const [isAnalysingImage, setIsAnalysingImage] = useState(false);

  // isMuted persisted to localStorage — survives page refresh
  const [isMuted, setIsMuted] = useState<boolean>(() => {
    try { return localStorage.getItem('cw_assistant_muted') === 'true'; } catch { return false; }
  });

  const recognitionRef   = useRef<SpeechRecognitionInstance | null>(null);
  const cameraInputRef   = useRef<HTMLInputElement>(null);
  const autoSendTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const messagesEndRef   = useRef<HTMLDivElement>(null);
  const inputRef         = useRef<HTMLInputElement>(null);
  const drawerRef        = useRef<HTMLDivElement>(null);
  const urgencyFiredRef  = useRef<Set<string>>(new Set());
  // isOpenRef lets runTemperatureOptimisation read the current open state
  // without it being a dependency — preventing the scheduler from resetting
  // its 5-minute interval every time the drawer opens or closes.
  const isOpenRef        = useRef<boolean>(isOpen);

  // ── Feature detection ────────────────────────────────────────────────────────
  useEffect(() => { setSttSupported(getSpeechRecognition() !== null); setTtsSupported('speechSynthesis' in window); }, []);

  // Keep isOpenRef in sync so async callbacks read the latest value without
  // triggering dependency-array re-renders in the optimisation scheduler.
  useEffect(() => { isOpenRef.current = isOpen; }, [isOpen]);

  // ── Persist preferences ──────────────────────────────────────────────────────
  useEffect(() => { try { localStorage.setItem('cw_assistant_lang',  lang);          } catch { /* */ } }, [lang]);
  useEffect(() => { try { localStorage.setItem('cw_assistant_muted', String(isMuted)); } catch { /* */ } }, [isMuted]);
  useEffect(() => {
    try { localStorage.setItem('cw_assistant_messages', JSON.stringify(messages.filter(m => !m.pending).slice(-MAX_HISTORY))); }
    catch { /* quota / private mode */ }
  }, [messages]);

  // ── Notify parent of voice state ─────────────────────────────────────────────
  useEffect(() => { onVoiceStateChange?.(voiceState === 'listening'); }, [voiceState, onVoiceStateChange]);

  // ── TTS voice preload ────────────────────────────────────────────────────────
  useEffect(() => {
    if ('speechSynthesis' in window) {
      window.speechSynthesis.getVoices();
      window.speechSynthesis.onvoiceschanged = () => window.speechSynthesis.getVoices();
    }
  }, []);

  // ── Auto-scroll ──────────────────────────────────────────────────────────────
  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  // ── Desktop focus ────────────────────────────────────────────────────────────
  useEffect(() => { if (isOpen && window.innerWidth > 768) setTimeout(() => inputRef.current?.focus(), 300); }, [isOpen]);

  // ── Centralised AI fetch ──────────────────────────────────────────────────────
  // Routes through the backend /ai/chat proxy — the Groq key never touches
  // the browser. The backend handles rate limiting and 429 retries.
  const groqFetch = useCallback(async (
    msgs: Array<{ role: string; content: string }>,
    opts: { temperature?: number; max_tokens?: number } = {}
  ): Promise<string> => {
    try {
      const data = await aiApi.chat({
        model:       GROQ_MODEL_CONVERSATION,
        temperature: opts.temperature ?? 0.4,
        max_tokens:  opts.max_tokens  ?? 512,
        messages:    msgs,
      });
      return (data?.choices?.[0]?.message?.content ?? '') as string;
    } catch (err: any) {
      const msg = err?.status === 429
        ? "I'm getting a lot of requests right now. Please wait a moment and try again."
        : (err?.message ?? 'Could not reach the AI service.');
      throw new Error(msg);
    }
  }, []);

  // ── Page summary — spoken tour of newly navigated page ───────────────────────
  const sendPageSummary = useCallback(async (page: string) => {
    if (!GROQ_API_KEY) return;
    try {
      const ctx     = buildAppContext(app);
      const rawText = await groqFetch([
        { role: 'system', content: buildSystemPrompt(ctx) },
        { role: 'user',   content: buildPageSummaryPrompt(page, ctx) },
      ], { temperature: 0.5, max_tokens: 180 });
      const { display } = parseAction(rawText);
      if (display) speak(display, isMuted, app.user.name);
    } catch { /* silent — navigation already succeeded */ }
  }, [app, isMuted, groqFetch]);

  // ── Smart greeting ───────────────────────────────────────────────────────────
  const sendSmartGreeting = useCallback(async () => {
    const id = 'greeting';
    setMessages([{ id, role: 'assistant', content: cfg.thinking, rawContent: '', timestamp: new Date(), pending: true }]);
    if (!GROQ_API_KEY) { setMessages([{ id, role: 'assistant', content: cfg.greeting, rawContent: cfg.greeting, timestamp: new Date() }]); return; }
    try {
      const ctx = buildAppContext(app);
      const h   = new Date().getHours();
      const tod = h < 12 ? 'morning' : h < 17 ? 'afternoon' : 'evening';
      const raw = await groqFetch([
        { role: 'system', content: buildSystemPrompt(ctx) },
        { role: 'user',   content: `[SYSTEM NOTE: It is ${tod}. Greet ${ctx.user.name} warmly by name. Give a one-sentence status of current storage conditions. Mention the most urgent issue if any. End with one practical question or offer. Under 3 sentences. Natural, as if you know their farm. No ACTION block. English only.]` },
      ], { temperature: 0.6, max_tokens: 200 });
      const { display } = parseAction(raw);
      const content     = display || cfg.greeting;
      setMessages([{ id, role: 'assistant', content, rawContent: raw, timestamp: new Date(), pending: false }]);
      speak(content, isMuted, app.user.name);
    } catch {
      setMessages([{ id: 'greeting', role: 'assistant', content: cfg.greeting, rawContent: cfg.greeting, timestamp: new Date() }]);
    }
  }, [app, cfg, isMuted, groqFetch]);

  // Trigger greeting on open (fresh session only) or language change
  useEffect(() => {
    if (!isOpen) return;
    setPendingAction(null);
    if (messages.length === 0) { setShowQuickChips(true); sendSmartGreeting(); }
  }, [isOpen, lang]); // eslint-disable-line react-hooks/exhaustive-deps

  // Cancel speech + recognition when drawer closes
  useEffect(() => {
    if (!isOpen) {
      cancelSpeech();
      if (recognitionRef.current) { recognitionRef.current.abort(); recognitionRef.current = null; }
      if (autoSendTimerRef.current) { clearTimeout(autoSendTimerRef.current); autoSendTimerRef.current = null; }
      setVoiceState('idle');
    }
  }, [isOpen]);

  // ── stopRecognition — defined BEFORE handleClose to avoid TDZ error ──────────
  const stopRecognition = useCallback(() => {
    if (autoSendTimerRef.current) { clearTimeout(autoSendTimerRef.current); autoSendTimerRef.current = null; }
    if (recognitionRef.current)   { recognitionRef.current.abort(); recognitionRef.current = null; }
    setVoiceState('idle');
  }, []);

  // ── Close handler ────────────────────────────────────────────────────────────
  const handleClose = useCallback(() => { cancelSpeech(); stopRecognition(); onClose(); }, [onClose, stopRecognition]);

  // Escape key — deps reference handleClose (not onClose)
  useEffect(() => {
    if (!isOpen) return;
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') handleClose(); };
    document.addEventListener('keydown', h);
    return () => document.removeEventListener('keydown', h);
  }, [isOpen, handleClose]);

  // ── Send message ─────────────────────────────────────────────────────────────
  const sendMessage = useCallback(async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || isLoading) return;
    const sanitised = trimmed.replace(/<[^>]*>/g, '').slice(0, 1000);
    setInput(''); setShowQuickChips(false);

    const userMsg: Message = { id: `u-${Date.now()}`, role: 'user', content: sanitised, rawContent: sanitised, timestamp: new Date() };
    const thinkingId = `a-${Date.now()}`;
    const thinkingMsg: Message = {
      id: thinkingId, role: 'assistant',
      content: lang !== 'en' ? cfg.translating : cfg.thinking,
      rawContent: '', timestamp: new Date(), pending: true,
    };
    setMessages(prev => {
      const h = prev.length >= MAX_HISTORY ? [prev[0], ...prev.slice(-(MAX_HISTORY - 2))] : prev;
      return [...h, userMsg, thinkingMsg];
    });
    setIsLoading(true);

    if (!GROQ_API_KEY) {
      setMessages(prev => prev.map(m => m.pending ? { ...m, content: cfg.errorKey, rawContent: cfg.errorKey, pending: false } : m));
      setIsLoading(false); speak(cfg.errorKey, isMuted, app.user.name); return;
    }

    try {
      const history = messages
        .filter(m => m.id !== 'greeting' && !m.pending)
        .map(m => ({ role: m.role === 'user' ? 'user' : 'assistant', content: m.rawContent || m.content }));
      const ctx       = buildAppContext(app);
      const sysprompt = buildSystemPrompt(ctx);

      const queryForAI = lang !== 'en' ? await translateToEnglish(sanitised) : sanitised;
      if (lang !== 'en') setMessages(prev => prev.map(m => m.id === thinkingId ? { ...m, content: cfg.thinking } : m));

      const rawText = await groqFetch([
        { role: 'system', content: sysprompt },
        ...history,
        { role: 'user', content: `${queryForAI}\n\n[REMINDER: Reply in English only.]` },
      ], { temperature: 0.4, max_tokens: 512 });

      const { display, action } = parseAction(rawText);
      const assistantMsg: Message = { id: thinkingId, role: 'assistant', content: display, rawContent: rawText, timestamp: new Date(), pending: false };
      setMessages(prev => prev.map(m => m.id === thinkingId ? assistantMsg : m));
      speak(display, isMuted, app.user.name);

      if (action) {
        // NAVIGATE executes immediately — no confirmation banner
        if (action.type === 'NAVIGATE' && typeof action.value === 'string' &&
            (VALID_PAGES as readonly string[]).includes(action.value)) {
          setMessages(prev => prev.map(m => m.id === assistantMsg.id ? { ...m, actionTaken: `Going to ${action.value}` } : m));
          onNavigate?.(action.value); onClose();
          setTimeout(() => sendPageSummary(action.value as string), 500);

        // CRITICAL SAFETY ACTIONS — auto-execute without confirmation banner
        // when a critical breach is imminent. The AI only reaches this path via
        // RULE 5 in the system prompt (willBreachCriticalIn15min or temperatureBreached
        // while not cooling). User is notified via toast + actionTaken badge.
        } else if (
          (action.type === 'SET_TARGET_TEMP' || action.type === 'START_COOLING') &&
          buildAppContext(app).readings.temperatureTrend?.willBreachCriticalIn15min
        ) {
          const success = executeAction(action, app);
          if (success) {
            const label = describeAction(action);
            setMessages(prev => prev.map(m =>
              m.id === assistantMsg.id ? { ...m, actionTaken: `Auto-protected: ${label}` } : m
            ));
            app.addToast({
              id:      `ai-critical-${Date.now()}`,
              type:    'success',
              message: `Critical breach prevented: ${label}`,
            });
          }

        } else {
          // All other actions — show confirmation banner so user stays in control
          setPendingAction({ action, msgId: assistantMsg.id });
        }
      }
    } catch (err) {
      const msg     = err instanceof Error ? err.message : 'Unknown error';
      const display = msg.includes('fetch') || msg.includes('network') ? cfg.errorNet : `${cfg.errorNet} (${msg})`;
      setMessages(prev => prev.map(m => m.id === thinkingId ? { ...m, content: display, rawContent: display, pending: false } : m));
      speak(cfg.errorNet, isMuted, app.user.name);
    } finally { setIsLoading(false); }
  }, [app, isLoading, lang, messages, cfg, isMuted, groqFetch, sendPageSummary, onNavigate, onClose]);

  // ── Follow-up after action confirmed ─────────────────────────────────────────
  // Fires a short AI call so Nix acknowledges completion and asks what is next
  // rather than going silent after a confirmed action.
  const sendFollowUp = useCallback(async (actionLabel: string) => {
    if (!GROQ_API_KEY) return;
    const id = `a-follow-${Date.now()}`;
    setMessages(prev => [...prev, { id, role: 'assistant', content: cfg.thinking, rawContent: '', timestamp: new Date(), pending: true }]);
    setIsLoading(true);
    try {
      const ctx     = buildAppContext(app);
      const rawText = await groqFetch([
        { role: 'system', content: buildSystemPrompt(ctx) },
        { role: 'user',   content: `[SYSTEM NOTE: The user confirmed this action which is now applied: "${actionLabel}". Acknowledge in one short warm sentence, then ask one relevant follow-up question based on current app state. No ACTION block. English only.]` },
      ], { temperature: 0.5, max_tokens: 180 });
      const { display } = parseAction(rawText);
      setMessages(prev => prev.map(m => m.id === id ? { ...m, content: display || cfg.actionDone, rawContent: rawText, pending: false } : m));
      if (display) speak(display, isMuted, app.user.name);
    } catch {
      setMessages(prev => prev.filter(m => m.id !== id));
    } finally { setIsLoading(false); }
  }, [app, cfg, isMuted, groqFetch]);

  // ── Confirm / dismiss pending action ─────────────────────────────────────────
  const confirmAction = useCallback(() => {
    if (!pendingAction) return;
    const { action, msgId } = pendingAction;
    const isNav = action.type === 'NAVIGATE';
    const success = executeAction(action, app);
    if (success) {
      const label = describeAction(action);
      setMessages(prev => prev.map(m => m.id === msgId ? { ...m, actionTaken: label } : m));
      app.addToast({ id: `ai-action-${Date.now()}`, type: 'success', message: label });
      if (isNav && typeof action.value === 'string') {
        onNavigate?.(action.value); onClose();
        setTimeout(() => sendPageSummary(action.value as string), 500);
      } else {
        sendFollowUp(label);
      }
    }
    setPendingAction(null);
  }, [pendingAction, app, onNavigate, onClose, sendPageSummary, sendFollowUp]);

  const dismissAction = useCallback(() => setPendingAction(null), []);

  // ── LEVEL 2: Autonomous predictive temperature optimisation ───────────────────
  // Runs every 5 minutes independently of user interaction. Sends the last 60
  // sensor readings to Groq, asks it to predict the 30-minute temperature trend,
  // and if a breach is predicted it auto-adjusts the target temperature and
  // notifies the user via toast + spoken message. This is the key difference
  // from Level 1 (which only acts when the user is talking to Nix).
  //
  // Design decisions:
  // - Only fires when: GROQ_API_KEY present, at least 20 readings exist (60s of data),
  //   a device is selected, and produce setup is complete
  // - Never fires within 3 minutes of the last run (lastOptimisedRef guard)
  // - Never overwrites a user-set target within the last 2 minutes
  // - Confidence guard: only acts on "high" confidence predictions. Medium = warn only.
  // - Safe range guard: never sets a target below the produce type's safe minimum
  // - Fires once on mount after a 30s warmup, then every 5 minutes via interval

  const lastOptimisedRef    = useRef<number>(0);
  const lastUserTargetRef   = useRef<number>(0); // timestamp of last manual user target change
  const optimisationRunning = useRef<boolean>(false);

  const runTemperatureOptimisation = useCallback(async () => {
    if (!GROQ_API_KEY)              return;
    if (optimisationRunning.current) return;

    const now        = Date.now();
    const cooldown   = 3 * 60 * 1000; // 3 minutes minimum between runs
    const userCooldown = 2 * 60 * 1000; // don't override a user target for 2 mins
    if (now - lastOptimisedRef.current < cooldown)  return;
    if (now - lastUserTargetRef.current < userCooldown) return;

    const hist   = app.sensorHistory;
    if (hist.length < 20) return; // need at least 1 minute of data

    const device = app.devices.find(d => d.id === app.selectedDeviceId);
    if (!device?.produceSetupComplete || !device?.produceMode) return;

    optimisationRunning.current = true;
    lastOptimisedRef.current    = now;

    // Safe minimum temperatures by produce type — never go below these
    const safeMinTemp: Record<string, number> = {
      meat: 0, leafy: 1, fruits: 4, tubers: 8, legumes: 8, mixed: 6,
    };
    const minSafeTarget = safeMinTemp[device.produceMode] ?? 0;

    // Build compact time-series payload — last 60 readings (3 minutes of data)
    const readings = hist.slice(-60).map((r, i) => ({
      t: i * 3, // seconds from start of window
      temp: parseFloat(r.temperature.toFixed(2)),
    }));

    // ── LEVEL 3: Vercel Edge Function (deterministic Holt-Winters forecasting) ─
    // Tries the local statistical model first — no Groq tokens consumed.
    // Falls through to Groq only if the edge function is unavailable or returns
    // low confidence (e.g. during local dev without `vercel dev`).
    try {
      const edgeRes = await fetch('/api/temperature-forecast', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          readings:           readings.map(r => r.temp),
          intervalSeconds:    3,
          targetTemperature:  app.targetTemperature,
          warningThreshold:   device.warningTemperature  ?? 10,
          criticalThreshold:  device.criticalTemperature ?? 15,
          produceMode:        device.produceMode,
          minSafeTarget,
        }),
      });

      if (edgeRes.ok) {
        const edgeResult = await edgeRes.json() as {
          predictedTemp30min: number;
          predictedTemp60min: number;
          trend:              'rising' | 'falling' | 'stable';
          slopePerMin:        number;
          anomalyScore:       number;  // 0–1
          shouldAdjust:       boolean;
          recommendedTarget:  number;
          confidence:         'high' | 'medium' | 'low';
          reason:             string;
        };

        // Only act on high/medium confidence — low confidence defers to Groq
        if (edgeResult.confidence !== 'low') {
          if (edgeResult.shouldAdjust) {
            const newTarget = Math.max(
              minSafeTarget,
              Math.min(edgeResult.recommendedTarget, app.targetTemperature + 3)
            );

            if (Math.abs(newTarget - app.targetTemperature) >= 0.5) {
              app.setTargetTemperature(newTarget);
              const diffText = newTarget < app.targetTemperature
                ? `lowered from ${app.targetTemperature}°C to ${newTarget}°C`
                : `raised from ${app.targetTemperature}°C to ${newTarget}°C`;

              app.addToast({
                id:      `ai-optim-edge-${Date.now()}`,
                type:    'success',
                message: `AI optimised (statistical): target ${diffText} — ${edgeResult.reason}`,
              });

              const spokenMsg = `Temperature optimisation update. I've ${diffText} using the predictive model. ${edgeResult.reason}`;
              speak(spokenMsg, isMuted, app.user.name);

              if (isOpenRef.current) {
                setMessages(prev => [...prev, {
                  id:         `optim-edge-${Date.now()}`,
                  role:       'assistant' as const,
                  content:    `Predictive optimisation (statistical model) — I've ${diffText}. ${edgeResult.reason} Temperature was trending ${edgeResult.trend} at ${Math.abs(edgeResult.slopePerMin).toFixed(2)}°/min. Anomaly score: ${(edgeResult.anomalyScore * 100).toFixed(0)}%. Projected 30-min temp: ${edgeResult.predictedTemp30min}°C, 60-min: ${edgeResult.predictedTemp60min}°C.`,
                  rawContent: JSON.stringify(edgeResult),
                  timestamp:  new Date(),
                  pending:    false,
                  actionTaken: `Target ${diffText}`,
                }]);
              }
            }
          } else if (edgeResult.trend === 'rising' && edgeResult.confidence === 'high' && isOpenRef.current) {
            // Trend is rising but not yet at action threshold — warn in chat
            setMessages(prev => [...prev, {
              id:         `optim-edge-warn-${Date.now()}`,
              role:       'assistant' as const,
              content:    `Predictive check (statistical model) — temperature is ${edgeResult.trend} at ${Math.abs(edgeResult.slopePerMin).toFixed(2)}°/min. Projected 30-min: ${edgeResult.predictedTemp30min}°C, 60-min: ${edgeResult.predictedTemp60min}°C. ${edgeResult.reason} No adjustment needed yet, but I'll keep monitoring.`,
              rawContent: JSON.stringify(edgeResult),
              timestamp:  new Date(),
              pending:    false,
            }]);
          }

          // Edge function handled it — skip Groq entirely to save tokens
          return;
        }
        // Low confidence — fall through to Groq below
      }
    } catch {
      // Edge function unavailable (local dev without vercel dev, network error, etc.)
      // Silent — Groq fallback runs immediately below
      console.info('[ColdWatch] Edge function unavailable — using Groq fallback');
    }
    // ── END LEVEL 3 ──────────────────────────────────────────────────────────

    const prompt = `You are an AI temperature optimisation engine for a cold chain storage system.

DEVICE: ${device.name} (${device.location})
PRODUCE: ${device.produceMode}, condition: ${device.produceState ?? 'unknown'}
CURRENT TEMPERATURE: ${app.currentTemperature.toFixed(1)}°C
CURRENT TARGET: ${app.targetTemperature}°C
WARNING THRESHOLD: ${device.warningTemperature ?? 10}°C
CRITICAL THRESHOLD: ${device.criticalTemperature ?? 15}°C
SYSTEM STATUS: ${app.systemStatus}, Auto mode: ${app.autoMode}

TIME SERIES (last ${readings.length} readings, 3-second intervals):
${JSON.stringify(readings)}

TASK:
1. Analyse the temperature trend in the time series
2. Predict where temperature will be in 30 minutes if no action is taken
3. Determine if a target temperature adjustment is needed to prevent a breach

Respond with ONLY valid JSON — no markdown, no explanation outside the JSON:
{
  "predictedTempIn30min": <number, 1 decimal place>,
  "trend": "rising" | "falling" | "stable",
  "slopePerMin": <number, degrees per minute>,
  "shouldAdjust": <boolean>,
  "recommendedTarget": <number, integer °C — must be >= ${minSafeTarget} and <= ${app.targetTemperature + 3}>,
  "confidence": "high" | "medium" | "low",
  "reason": "<one plain English sentence explaining the recommendation>"
}

Only set shouldAdjust to true if: (a) the predicted temperature will exceed the warning threshold within 30 minutes AND (b) reducing the target temperature now would prevent this AND (c) confidence is high or medium.`;

    try {
      const raw = await groqFetch([
        { role: 'user', content: prompt },
      ], { temperature: 0.1, max_tokens: 300 });

      // Robust JSON extraction
      const jsonMatch = raw.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error('No JSON in response');
      const result = JSON.parse(jsonMatch[0]) as {
        predictedTempIn30min: number;
        trend: string;
        slopePerMin: number;
        shouldAdjust: boolean;
        recommendedTarget: number;
        confidence: string;
        reason: string;
      };

      // Validate the response
      if (typeof result.shouldAdjust !== 'boolean') throw new Error('Invalid response structure');

      if (result.shouldAdjust && result.confidence !== 'low') {
        // Clamp to safe range
        const newTarget = Math.max(minSafeTarget, Math.min(
          result.recommendedTarget,
          app.targetTemperature + 3 // never lower more than 3°C in one step
        ));

        // Only apply if meaningfully different from current target
        if (Math.abs(newTarget - app.targetTemperature) >= 0.5) {
          app.setTargetTemperature(newTarget);

          const diffText = newTarget < app.targetTemperature
            ? `lowered from ${app.targetTemperature}°C to ${newTarget}°C`
            : `raised from ${app.targetTemperature}°C to ${newTarget}°C`;

          const toastMsg = `AI optimised: target ${diffText} — ${result.reason}`;
          app.addToast({
            id:      `ai-optim-${Date.now()}`,
            type:    'success',
            message: toastMsg,
          });

          // Spoken notification — brief and calm, always fires regardless of drawer state
          const spokenMsg = `Temperature optimisation update. I've ${diffText} based on the current trend. ${result.reason}`;
          speak(spokenMsg, isMuted, app.user.name);

          // If drawer is open, also add a chat message so it's visible in conversation
          if (isOpenRef.current) {
            const optMsgId = `optim-${Date.now()}`;
            setMessages(prev => [...prev, {
              id:         optMsgId,
              role:       'assistant',
              content:    `Predictive optimisation — I've ${diffText}. ${result.reason} The temperature was trending ${result.trend} at ${Math.abs(result.slopePerMin).toFixed(2)} degrees per minute, with a projected temperature of ${result.predictedTempIn30min}°C in 30 minutes.`,
              rawContent: raw,
              timestamp:  new Date(),
              pending:    false,
              actionTaken: `Target ${diffText}`,
            }]);
          }
        }
      } else if (!result.shouldAdjust && result.trend === 'rising' &&
                 result.confidence === 'high' && isOpenRef.current) {
        // High-confidence rising trend but not yet at action threshold — warn in chat if open
        const warnId = `optim-warn-${Date.now()}`;
        setMessages(prev => [...prev, {
          id:         warnId,
          role:       'assistant',
          content:    `Predictive check — temperature is ${result.trend} at ${Math.abs(result.slopePerMin).toFixed(2)} degrees per minute. Projected temperature in 30 minutes: ${result.predictedTempIn30min}°C. ${result.reason} No adjustment needed yet but I'll keep monitoring.`,
          rawContent: raw,
          timestamp:  new Date(),
          pending:    false,
        }]);
      }
    } catch (err) {
      // Silent — optimisation failure must never disrupt the user experience
      console.warn('[ColdWatch AI Optimisation] Error:', err instanceof Error ? err.message : err);
    } finally {
      optimisationRunning.current = false;
    }
  }, [app, isMuted, groqFetch]);

  // Track when the user manually changes a target so we respect their intent
  // by not overriding it for 2 minutes (userCooldown in runTemperatureOptimisation)
  useEffect(() => {
    lastUserTargetRef.current = Date.now();
  }, [app.targetTemperature]);

  // Optimisation scheduler — fires once after 30s warmup, then every 5 minutes
  useEffect(() => {
    if (!GROQ_API_KEY) return;
    // 30-second warmup: give the simulation time to accumulate enough readings
    const warmup = setTimeout(() => {
      runTemperatureOptimisation();
    }, 30_000);

    const interval = setInterval(() => {
      runTemperatureOptimisation();
    }, 5 * 60 * 1000); // every 5 minutes

    return () => {
      clearTimeout(warmup);
      clearInterval(interval);
    };
  }, [runTemperatureOptimisation]);

  // ── Critical safety watchdog — runs even when drawer is CLOSED ──────────────
  // This is the core answer to "what if the user is away?" — Level 1 normally
  // requires a conversation, but this watchdog operates completely independently.
  // Checks every 60 seconds. If a critical breach is imminent, it auto-executes
  // START_COOLING and/or lowers the target, then notifies via toast + TTS.
  // This is a food safety feature — it acts without any user interaction at all.

  const watchdogFiredRef = useRef<Set<string>>(new Set()); // prevent duplicate fires per breach event

  useEffect(() => {
    if (!GROQ_API_KEY) return;

    const check = () => {
      const ctx    = buildAppContext(app);
      const trend  = ctx.readings.temperatureTrend;
      const device = app.devices.find(d => d.id === app.selectedDeviceId);

      if (!device?.produceSetupComplete) return;

      const isCriticalImminent = trend?.willBreachCriticalIn15min === true;
      const isAlreadyBreached  = ctx.readings.temperatureBreached;
      const isNotCooling       = app.systemStatus !== 'cooling';
      const shouldAct          = (isCriticalImminent || (isAlreadyBreached && isNotCooling));

      if (!shouldAct) {
        // Clear watchdog keys when situation resolves so it can fire again next breach
        watchdogFiredRef.current.clear();
        return;
      }

      // Deduplicate — only fire once per unique breach window
      // Key is based on rounded temperature to detect new breach events
      const breachKey = `breach-${Math.round(app.currentTemperature * 2)}-${app.selectedDeviceId}`;
      if (watchdogFiredRef.current.has(breachKey)) return;
      watchdogFiredRef.current.add(breachKey);

      // Safe minimum temperatures per produce type
      const safeMin: Record<string, number> = {
        meat: 0, leafy: 1, fruits: 4, tubers: 8, legumes: 8, mixed: 6,
      };
      const minSafe = safeMin[device.produceMode ?? 'mixed'] ?? 0;

      // Action 1 — start cooling if not already running
      if (isNotCooling) {
        try {
          app.startCooling();
        } catch { /* silent */ }
      }

      // Action 2 — lower target temperature preemptively if breach is imminent
      if (isCriticalImminent) {
        const newTarget = Math.max(minSafe, app.targetTemperature - 2);
        if (newTarget < app.targetTemperature) {
          try {
            app.setTargetTemperature(newTarget);
          } catch { /* silent */ }
        }
      }

      // Notify via toast — always visible regardless of drawer state
      const actionSummary = isCriticalImminent
        ? `Critical breach predicted in ~${trend?.minsToCriticalThreshold ?? '?'} minutes — cooling started, target lowered`
        : `Temperature breach detected — cooling started automatically`;

      app.addToast({
        id:      `watchdog-${Date.now()}`,
        type:    'success',
        message: `Auto-protection: ${actionSummary}`,
      });

      // Spoken alert — fires regardless of whether drawer is open
      const spokenAlert = isCriticalImminent
        ? `Automatic protection activated. The temperature is heading toward the critical threshold in about ${trend?.minsToCriticalThreshold ?? 'a few'} minutes. I have started cooling and lowered the target temperature to protect your produce.`
        : `Temperature breach detected. I have started the cooling system automatically to protect your ${device.produceMode ?? 'produce'}.`;
      speak(spokenAlert, isMuted, app.user.name);

      // If drawer is open, add a message to the chat so there is a visible record
      if (isOpen) {
        setMessages(prev => [...prev, {
          id:         `watchdog-msg-${Date.now()}`,
          role:       'assistant',
          content:    spokenAlert,
          rawContent: spokenAlert,
          timestamp:  new Date(),
          pending:    false,
          actionTaken: actionSummary,
        }]);
      }
    };

    // Run once immediately, then every 60 seconds
    check();
    const interval = setInterval(check, 60_000);
    return () => clearInterval(interval);
  }, [app.selectedDeviceId, app.currentTemperature, app.systemStatus, isOpen, isMuted]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Urgency trigger ───────────────────────────────────────────────────────────
  useEffect(() => {
    if (!isOpen || !GROQ_API_KEY) return;
    const device = app.devices.find(d => d.id === app.selectedDeviceId);
    if (!device?.produceMode || !device?.produceSetupComplete) return;
    const isMeat   = device.produceMode === 'meat';
    const isAlmost = device.produceState === 'almost-damaged';
    const tempHigh = app.currentTemperature > app.targetTemperature + 1.5;
    const should   = (isMeat && tempHigh) || (isAlmost && tempHigh);
    const key      = `${device.id}-urgency`;
    if (!should || urgencyFiredRef.current.has(key)) return;
    urgencyFiredRef.current.add(key);
    const timer = setTimeout(async () => {
      const uid = `urgency-${Date.now()}`;
      setMessages(prev => [...prev, { id: uid, role: 'assistant', content: '⚠️ Checking urgent condition...', rawContent: '', timestamp: new Date(), pending: true }]);
      try {
        const ctx  = buildAppContext(app);
        const raw  = await groqFetch([
          { role: 'system', content: buildSystemPrompt(ctx) },
          { role: 'user',   content: `[SYSTEM ALERT: ${device.produceMode}, state: ${device.produceState}. Temp: ${app.currentTemperature}°C vs target ${app.targetTemperature}°C. Short urgent calm warning — risk + one immediate action. 2 sentences max. No ACTION block. English only.]` },
        ], { temperature: 0.2, max_tokens: 160 });
        const { display } = parseAction(raw);
        const content     = display || 'Warning: temperature is above the safe range for your produce.';
        setMessages(prev => prev.map(m => m.id === uid ? { ...m, content, rawContent: raw, pending: false } : m));
        if (display) speak(display, isMuted, app.user.name);
      } catch { setMessages(prev => prev.filter(m => m.id !== uid)); }
    }, 3500);
    return () => clearTimeout(timer);
  }, [isOpen, app.selectedDeviceId, app.currentTemperature]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Reset conversation ────────────────────────────────────────────────────────
  const resetConversation = useCallback(() => {
    cancelSpeech();
    try { localStorage.removeItem('cw_assistant_messages'); } catch { /* */ }
    setMessages([]); setInput(''); setShowQuickChips(true); setPendingAction(null);
    sendSmartGreeting();
  }, [sendSmartGreeting]);

  // ── Voice recognition ─────────────────────────────────────────────────────────
  const startRecognition = useCallback(() => {
    const SR = getSpeechRecognition();
    if (!SR) return;
    if (voiceState === 'listening') { stopRecognition(); return; }
    cancelSpeech();
    const r = new SR();
    r.lang = 'en-GH'; r.continuous = false; r.interimResults = true; r.maxAlternatives = 1;
    r.onstart  = () => setVoiceState('listening');
    r.onresult = (e: SpeechRecognitionEvent) => {
      let t = '';
      for (let i = 0; i < e.results.length; i++) t += e.results[i][0].transcript;
      setInput(t);
      if (e.results[e.results.length - 1]?.isFinal) {
        if (autoSendTimerRef.current) clearTimeout(autoSendTimerRef.current);
        autoSendTimerRef.current = setTimeout(() => { setVoiceState('processing'); sendMessage(t); autoSendTimerRef.current = null; }, VOICE_AUTOSEND_DELAY);
      }
    };
    r.onerror = (e: SpeechRecognitionErrorEvent) => { if (e.error !== 'no-speech' && e.error !== 'aborted') console.warn('STT error:', e.error); stopRecognition(); };
    r.onend   = () => { if (!autoSendTimerRef.current) setVoiceState('idle'); };
    recognitionRef.current = r;
    try { r.start(); } catch (e) { console.warn('STT start failed:', e); setVoiceState('idle'); }
  }, [voiceState, stopRecognition, sendMessage]);

  // ── Expose imperative handle ──────────────────────────────────────────────────
  // narratePage: call from App.tsx on every page change for spoken page tour
  //   example: nixRef.current?.narratePage(newPage)
  useImperativeHandle(ref, () => ({
    startListening: () => startRecognition(),
    stopListening:  () => stopRecognition(),
    isListening:    () => voiceState === 'listening',
    narratePage:    (page: string) => setTimeout(() => sendPageSummary(page), 300),
  }), [startRecognition, stopRecognition, voiceState, sendPageSummary]);

  // ── Cleanup on unmount ────────────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      cancelSpeech();
      if (recognitionRef.current) recognitionRef.current.abort();
      if (autoSendTimerRef.current) clearTimeout(autoSendTimerRef.current);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Image capture ─────────────────────────────────────────────────────────────
  const handleImageCapture = useCallback(async (file: File) => {
    if (isAnalysingImage) return;
    setIsAnalysingImage(true); cancelSpeech();
    const pid = `u-photo-${Date.now()}`;
    const tid = `a-photo-${Date.now()}`;
    setMessages(prev => [...prev,
      { id: pid, role: 'user', content: '📷 [Photo shared for produce assessment]', rawContent: '📷 [Photo shared for produce assessment]', timestamp: new Date() },
      { id: tid, role: 'assistant', content: 'Analysing your photo…', rawContent: '', timestamp: new Date(), pending: true },
    ]);
    setShowQuickChips(false);
    try {
      const { base64, mimeType } = await fileToBase64Chat(file);
      const dev    = app.devices.find(d => d.id === app.selectedDeviceId);
      const label  = dev?.produceMode ? `${dev.produceMode} (${dev.produceState ?? 'condition unknown'})` : 'produce (type not set)';
      const result = await analyseProduceImageForChat(base64, mimeType, label);
      let responseText: string;
      if (!result) {
        responseText = GROQ_API_KEY
          ? "I had trouble reading that photo — it may be too dark or the produce too small in frame. Try holding it closer and in better light, or just describe what you see to me."
          : 'Image analysis is not configured. Please describe the produce condition to me instead.';
      } else {
        const conf = result.confidence === 'high' ? "I'm fairly confident about this"
          : result.confidence === 'medium' ? "there's some uncertainty here"
          : 'the image quality makes a definitive call difficult';
        const next = result.state === 'almost-damaged'
          ? "This is urgent — I'd recommend starting aggressive cooling right away. Want me to update the temperature target?"
          : result.state === 'in-between'
            ? "Still marketable but needs monitoring. Want me to check if your current settings are right for it?"
            : result.state === 'dried'
              ? "Dried produce needs low humidity more than cold. Shall I adjust the targets?"
              : "Looking good — current conditions should preserve it well. Anything specific you'd like me to check?";
        responseText = `From the photo, ${result.explanation} — that puts it in ${result.state} condition (${conf}). ${next}`;
      }
      setMessages(prev => prev.map(m => m.id === tid ? { ...m, content: responseText, rawContent: responseText, pending: false } : m));
      speak(responseText, isMuted, app.user.name);
    } catch {
      const err = 'I had trouble reading that photo. Please try again or describe the condition in words.';
      setMessages(prev => prev.map(m => m.id === tid ? { ...m, content: err, rawContent: err, pending: false } : m));
    } finally { setIsAnalysingImage(false); }
  }, [app, isAnalysingImage, isMuted]);

  const toggleMute    = useCallback(() => setIsMuted(p => { if (!p) cancelSpeech(); return !p; }), []);
  // replayMessage passes app.user.name so Ghanaian name phonetics apply correctly
  const replayMessage = useCallback((text: string) => speak(text, isMuted, app.user.name), [isMuted, app.user.name]);

  // ── Render ────────────────────────────────────────────────────────────────────
  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div key="backdrop"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-[55]"
            style={{ backgroundColor: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(2px)' }}
            onClick={handleClose} aria-hidden="true" />

          <motion.div key="drawer" ref={drawerRef}
            role="dialog" aria-modal="true" aria-label="ColdWatch AI Assistant"
            initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }}
            transition={{ duration: 0.3, ease: [0.25, 0.46, 0.45, 0.94] }}
            className="fixed top-0 right-0 bottom-0 z-[60] flex flex-col"
            style={{ width: 'min(420px, 100vw)', backgroundColor: '#FFFFFF', boxShadow: '-8px 0 40px rgba(0,0,0,0.12)' }}>

            {/* ── Header — two rows: identity / settings tray ── */}
            <div className="flex flex-col flex-shrink-0"
              style={{ borderBottom: '1px solid #DBEAFE', background: 'linear-gradient(135deg, #EBF4FF 0%, #F0F7FF 60%, #FFFFFF 100%)' }}>

              {/* Row 1: avatar | name + status | gear | close */}
              <div className="flex items-center gap-3 px-4 py-3.5">
                <div className="w-10 h-10 rounded-2xl flex items-center justify-center flex-shrink-0"
                  style={{ background: 'linear-gradient(135deg, #0984E3 0%, #0652a0 100%)', boxShadow: '0 4px 12px rgba(9,132,227,0.35)' }}>
                  <motion.div animate={{ rotate: 360 }} transition={{ duration: 20, repeat: Infinity, ease: 'linear' }}>
                    <Snowflake className="w-5 h-5 text-white" />
                  </motion.div>
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline gap-1.5">
                    <p className="text-base font-extrabold tracking-tight"
                      style={{ background: 'linear-gradient(90deg, #0652a0 0%, #0984E3 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>
                      Nix
                    </p>
                    <span className="text-[10px] font-medium text-[#93C5FD]">by ColdWatch</span>
                  </div>
                  <p className="text-xs font-medium flex items-center gap-1"
                    style={{ color: GROQ_API_KEY ? '#16A34A' : '#DC2626' }}>
                    <motion.span className="w-1.5 h-1.5 rounded-full inline-block"
                      style={{ backgroundColor: GROQ_API_KEY ? '#16A34A' : '#DC2626' }}
                      animate={GROQ_API_KEY ? { opacity: [1, 0.4, 1] } : { opacity: 1 }}
                      transition={{ duration: 2, repeat: Infinity }} />
                    {GROQ_API_KEY ? 'Online' : 'API key missing'}
                  </p>
                </div>

                <button onClick={() => setShowSettingsTray(t => !t)}
                  className="w-8 h-8 rounded-xl flex items-center justify-center transition-all active:scale-95"
                  style={{ border: `1px solid ${showSettingsTray ? '#BFDBFE' : '#E4E7EC'}`, backgroundColor: showSettingsTray ? '#EBF4FF' : '#F9FAFB' }}
                  aria-label="Assistant settings" aria-expanded={showSettingsTray} title="Language, voice, and reset">
                  <Settings2 className="w-3.5 h-3.5" style={{ color: showSettingsTray ? '#0984E3' : '#6B7280' }} />
                </button>

                <button onClick={handleClose}
                  className="w-8 h-8 rounded-xl flex items-center justify-center transition-all active:scale-95"
                  style={{ border: '1px solid #E4E7EC', backgroundColor: '#F9FAFB' }} aria-label="Close assistant">
                  <X className="w-4 h-4 text-[#374151]" />
                </button>
              </div>

              {/* Row 2: settings tray — language | voice | reset */}
              <AnimatePresence initial={false}>
                {showSettingsTray && (
                  <motion.div key="tray"
                    initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.2, ease: [0.25, 0.46, 0.45, 0.94] }}
                    style={{ overflow: 'hidden' }}>
                    <div className="flex items-center gap-2 px-4 pb-3 pt-0"
                      style={{ borderTop: '1px solid #DBEAFE' }}>
                      <button onClick={() => setLang(l => l === 'en' ? 'tw' : 'en')}
                        className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium transition-all active:scale-95 flex-1"
                        style={{ border: '1px solid #E4E7EC', backgroundColor: '#F9FAFB', color: '#374151' }}
                        aria-label="Switch language">
                        <Globe className="w-3.5 h-3.5 text-[#6B7280]" />
                        {LANG_CONFIG[lang].flag} {LANG_CONFIG[lang].label}
                      </button>
                      {ttsSupported && (
                        <button onClick={toggleMute}
                          className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium transition-all active:scale-95"
                          style={{ border: `1px solid ${isMuted ? '#FCA5A5' : '#E4E7EC'}`, backgroundColor: isMuted ? '#FEF2F2' : '#F9FAFB', color: isMuted ? '#EF4444' : '#374151' }}
                          aria-label={isMuted ? 'Unmute voice' : 'Mute voice'}>
                          {isMuted ? <VolumeX className="w-3.5 h-3.5" style={{ color: '#EF4444' }} /> : <Volume2 className="w-3.5 h-3.5" style={{ color: '#0984E3' }} />}
                          {isMuted ? 'Muted' : 'Voice on'}
                        </button>
                      )}
                      <button onClick={() => { resetConversation(); setShowSettingsTray(false); }}
                        className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium transition-all active:scale-95"
                        style={{ border: '1px solid #E4E7EC', backgroundColor: '#F9FAFB', color: '#374151' }}
                        aria-label="Reset conversation">
                        <RotateCcw className="w-3.5 h-3.5 text-[#6B7280]" />
                        Reset
                      </button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* ── Status bar ── */}
            <StatusBar app={app} />

            {/* ── Messages ── */}
            <div className="flex-1 overflow-y-auto px-3 py-4 space-y-3" style={{ backgroundColor: '#F0F7FF' }}>
              {messages.length === 0 && (
                <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}
                  className="flex flex-col items-center justify-center h-32 gap-3">
                  <motion.div animate={{ rotate: 360 }} transition={{ duration: 12, repeat: Infinity, ease: 'linear' }} style={{ color: '#BFDBFE' }}>
                    <Snowflake className="w-10 h-10" />
                  </motion.div>
                  <p className="text-xs text-[#93C5FD] font-medium">Starting up…</p>
                </motion.div>
              )}

              {messages.map(msg => (
                <MessageBubble key={msg.id} msg={msg} muted={isMuted} userName={app.user.name} onReplay={replayMessage} />
              ))}

              {showQuickChips && messages.length === 1 && (
                <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}
                  className="flex flex-col gap-2 pt-1">
                  {QUICK_PROMPTS[lang].map((prompt, i) => {
                    const urgent = prompt.startsWith('⚡');
                    return (
                      <button key={i} onClick={() => sendMessage(prompt)}
                        className="text-left px-3.5 py-2.5 rounded-2xl text-xs font-medium transition-all active:scale-[0.98]"
                        style={urgent
                          ? { border: '1px solid #FDE68A', backgroundColor: '#FFFBEB', color: '#92400E', fontWeight: 600 }
                          : { border: '1px solid #BFDBFE', backgroundColor: '#F0F7FF', color: '#1E40AF' }}>
                        {prompt}
                      </button>
                    );
                  })}
                </motion.div>
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* ── Voice status ── */}
            <AnimatePresence>
              {voiceState === 'listening' && (
                <div className="px-3"><VoiceStatusPill voiceState={voiceState} lang={lang} /></div>
              )}
            </AnimatePresence>

            {/* ── Action confirm banner ── */}
            <AnimatePresence>
              {pendingAction && (
                <ActionConfirmBanner key="action-banner"
                  action={pendingAction.action} lang={lang}
                  onConfirm={confirmAction} onDismiss={dismissAction} />
              )}
            </AnimatePresence>

            {/* ── Input area ── */}
            <div className="flex-shrink-0 px-3 py-3"
              style={{ borderTop: '1px solid #E4E7EC', backgroundColor: '#FFFFFF', paddingBottom: 'calc(env(safe-area-inset-bottom) + 12px)' }}>
              <input ref={cameraInputRef} type="file" accept="image/*" capture="environment" className="hidden"
                onChange={e => { const f = e.target.files?.[0]; if (f) handleImageCapture(f); e.target.value = ''; }} />

              <div className="flex items-center gap-2 px-3 py-2 rounded-2xl"
                style={{ border: `1px solid ${voiceState === 'listening' ? '#FCA5A5' : '#E4E7EC'}`, backgroundColor: '#F9FAFB', transition: 'border-color 0.2s' }}>

                <button onClick={() => cameraInputRef.current?.click()}
                  disabled={isLoading || isAnalysingImage || voiceState !== 'idle'}
                  className="w-8 h-8 rounded-xl flex items-center justify-center transition-all active:scale-95 flex-shrink-0 disabled:opacity-40"
                  style={{ backgroundColor: '#F3F4F6', border: '1px solid #E5E7EB' }}
                  aria-label="Share produce photo for AI assessment">
                  {isAnalysingImage ? <Loader2 className="w-4 h-4 text-[#0984E3] animate-spin" /> : <Camera className="w-4 h-4 text-[#6B7280]" />}
                </button>

                {sttSupported && (
                  <button onClick={startRecognition}
                    disabled={isLoading || voiceState === 'processing'}
                    className="w-8 h-8 rounded-xl flex items-center justify-center transition-all active:scale-95 flex-shrink-0 disabled:opacity-40"
                    style={{ backgroundColor: voiceState === 'listening' ? '#FEE2E2' : '#F3F4F6', border: `1px solid ${voiceState === 'listening' ? '#FECACA' : '#E5E7EB'}` }}
                    aria-label={voiceState === 'listening' ? 'Stop listening' : cfg.voiceHint}>
                    {voiceState === 'listening' ? <MicOff className="w-4 h-4" style={{ color: '#EF4444' }} /> : <Mic className="w-4 h-4 text-[#6B7280]" />}
                  </button>
                )}

                <input ref={inputRef} type="text" value={input}
                  onChange={e => setInput(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(input); } }}
                  placeholder={voiceState === 'listening' ? cfg.voiceListening : cfg.placeholder}
                  disabled={isLoading || voiceState === 'listening'}
                  maxLength={1000}
                  className="flex-1 bg-transparent outline-none text-sm text-[#111827] placeholder:text-[#9CA3AF] disabled:opacity-60"
                  aria-label="Message input" />

                <button onClick={() => sendMessage(input)}
                  disabled={!input.trim() || isLoading || voiceState === 'listening'}
                  className="w-8 h-8 rounded-xl flex items-center justify-center transition-all active:scale-95 disabled:opacity-40 flex-shrink-0"
                  style={{ backgroundColor: '#0984E3' }} aria-label="Send message">
                  {isLoading || voiceState === 'processing'
                    ? <Loader2 className="w-4 h-4 text-white animate-spin" />
                    : <Send className="w-4 h-4 text-white" />}
                </button>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
});

export default AIAssistant;