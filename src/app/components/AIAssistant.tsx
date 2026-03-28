import { useState, useRef, useEffect, useCallback } from 'react';
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

// Voice recording state machine
type VoiceState = 'idle' | 'listening' | 'processing';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;       // display text (action JSON stripped out)
  rawContent: string;    // full response including any action block
  timestamp: Date;
  pending?: boolean;     // true while streaming/waiting
  actionTaken?: string;  // short label shown after an action executes
}

// Actions the AI can request the app to perform
interface AIAction {
  type:
    | 'SET_TARGET_TEMP'
    | 'SET_TARGET_HUMIDITY'
    | 'SET_AUTO_MODE'
    | 'START_COOLING'
    | 'STOP_COOLING'
    | 'ACKNOWLEDGE_ALERT'
    | 'ACKNOWLEDGE_ALL_ALERTS'
    | 'SWITCH_DEVICE';
  value?: number | boolean | string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const GROQ_API_KEY = import.meta.env.VITE_GROQ_API_KEY ?? '';
const GROQ_URL     = 'https://api.groq.com/openai/v1/chat/completions';
// Two models, one API key — both free on Groq's platform.
// 8B for conversation: fastest response, good English reasoning.
// 70B for translation only: significantly better multilingual capability
// (Twi, Ga, Ga-Adangbe, Hausa) without affecting conversation latency.
const GROQ_MODEL_CONVERSATION = 'llama-3.1-8b-instant';
const GROQ_MODEL_TRANSLATION  = 'llama-3.3-70b-versatile';

// Groq Vision — used for produce photo analysis inside the chat
// Analyse a produce photo via Groq Vision (llama-3.2-11b-vision-preview).
// Uses the same GROQ_API_KEY already in use for conversation — no extra key needed.
// Groq vision follows the OpenAI image_url format with base64 data URIs.
async function analyseProduceImageForChat(
  base64Image: string,
  mimeType: string,
  produceLabel: string
): Promise<{ state: string; confidence: string; explanation: string } | null> {
  if (!GROQ_API_KEY) return null;

  const prompt = `You are a cold chain expert assessing post-harvest produce quality in Ghana and West Africa.
The image shows: ${produceLabel}

IMPORTANT: Even if the image is dark, blurry, or taken in poor lighting — you MUST still make your best assessment. Do not refuse or ask for a better image. Look at colour, texture, shape, and any visible surface details to make a call.

Classify the produce into EXACTLY ONE of these four conditions:
- fresh: vibrant colour, firm appearance, no visible damage or softening
- in-between: some ageing visible — colour fading, slight softening or wrinkling, still marketable
- dried: fully dried or cured produce intended for long-term storage
- almost-damaged: visible rot, mould, heavy bruising, extreme discolouration, or breakdown

Respond with ONLY valid JSON (no markdown, no extra text, no explanation outside the JSON):
{"state":"fresh|in-between|dried|almost-damaged","confidence":"high|medium|low","explanation":"One plain sentence describing exactly what you see and why you gave this classification"}`;

  try {
    const res = await fetch(GROQ_URL, {
      method: 'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${GROQ_API_KEY}`,
      },
      body: JSON.stringify({
        model:       'meta-llama/llama-4-scout-17b-16e-instruct',
        temperature: 0.1,
        max_tokens:  250,
        messages: [{
          role:    'user',
          content: [
            {
              type:      'image_url',
              image_url: { url: `data:${mimeType};base64,${base64Image}` },
            },
            { type: 'text', text: prompt },
          ],
        }],
      }),
    });
    if (!res.ok) return null;
    const data  = await res.json();
    const text  = data.choices?.[0]?.message?.content ?? '';
    const clean = text.replace(/```json|```/g, '').trim();
    return JSON.parse(clean);
  } catch {
    return null;
  }
}

// Convert File to base64 for vision analysis
function fileToBase64Chat(file: File): Promise<{ base64: string; mimeType: string }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload  = () => {
      const result = reader.result as string;
      resolve({ base64: result.split(',')[1], mimeType: file.type || 'image/jpeg' });
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// Maximum messages kept in memory per session to prevent context blow-out.
const MAX_HISTORY = 20;

// How long to wait after the user stops speaking before auto-sending (ms).
// Gives the user a chance to review the transcript first.
const VOICE_AUTOSEND_DELAY = 1800;

// ─── Pre-translation layer ────────────────────────────────────────────────────
// When the user's UI language is non-English (Twi, Ga, Hausa, etc.) we run
// their message through a dedicated lightweight translation call BEFORE sending
// it to the main cold-chain assistant. This means the assistant always reasons
// in English — which it does reliably — regardless of what language the user
// spoke or typed in.
//
// Design decisions:
// - Temperature 0.0 — translation must be deterministic, not creative.
// - maxOutputTokens 300 — translations are always shorter than the original.
// - If translation fails for any reason (network, API error, unrecognisable
//   language), we fall back to sending the original text unchanged. The system
//   prompt's Layer 1 fallback then handles it gracefully at response time.
// - We never show the translated text to the user — their original message
//   is always displayed in the bubble. Translation is invisible infrastructure.

async function translateToEnglish(text: string): Promise<string> {
  if (!GROQ_API_KEY) return text;

  try {
    const res = await fetch(GROQ_URL, {
      method:  'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${GROQ_API_KEY}`,
      },
      body: JSON.stringify({
        model:       GROQ_MODEL_TRANSLATION,
        temperature: 0.0,   // Deterministic — translation must not be creative
        max_tokens:  300,
        messages: [
          {
            role:    'system',
            content: 'You are a translator. Translate the user message to English. Return ONLY the translated text — no explanation, no preamble, no quotes. If the text is already in English return it unchanged. If you cannot identify the language return the original unchanged.',
          },
          { role: 'user', content: text },
        ],
      }),
    });

    if (!res.ok) return text; // Silent fallback — don't block the main request

    const data       = await res.json();
    const translated = data?.choices?.[0]?.message?.content?.trim() ?? '';
    return translated.length > 0 ? translated : text;
  } catch {
    return text; // Network failure — fall back to original silently
  }
}

// ─── Web Speech API type declarations ────────────────────────────────────────
// These are not in the standard TypeScript lib but are present in all modern
// Android/Chrome browsers. We declare them here to avoid TS errors.

interface SpeechRecognitionEvent extends Event {
  results: SpeechRecognitionResultList;
}
interface SpeechRecognitionResultList {
  readonly length: number;
  [index: number]: SpeechRecognitionResult;
}
interface SpeechRecognitionResult {
  readonly isFinal: boolean;
  [index: number]: SpeechRecognitionAlternative;
}
interface SpeechRecognitionAlternative {
  readonly transcript: string;
  readonly confidence: number;
}
interface SpeechRecognitionErrorEvent extends Event {
  error: string;
}
interface SpeechRecognitionInstance extends EventTarget {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((event: SpeechRecognitionEvent) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEvent) => void) | null;
  onend: (() => void) | null;
  onstart: (() => void) | null;
}

// Safe accessor — returns null if the browser doesn't support STT
function getSpeechRecognition(): (new () => SpeechRecognitionInstance) | null {
  const w = window as unknown as Record<string, unknown>;
  return (w['SpeechRecognition'] ?? w['webkitSpeechRecognition'] ?? null) as
    | (new () => SpeechRecognitionInstance)
    | null;
}

// ─── Language config ──────────────────────────────────────────────────────────

const LANG_CONFIG: Record<Language, {
  label: string;
  flag: string;
  placeholder: string;
  greeting: string;
  thinking: string;
  errorNet: string;
  errorKey: string;
  confirmAction: string;
  actionDone: string;
  voiceHint: string;         // tooltip shown on mic button
  voiceListening: string;    // status text while recording
  voiceNotSupported: string; // shown if STT unavailable
  translating: string;       // shown in thinking bubble while translation is in flight
}> = {
  en: {
    label: 'English',
    flag: '🇬🇧',
    placeholder: 'Ask about your produce or give a command…',
    greeting: `Hello! I'm your ColdWatch assistant. I can help you monitor your cold storage, set targets, manage alerts, and give advice on your produce. You can type or tap the mic to speak. What can I help you with?`,
    thinking: 'Thinking…',
    translating: 'Thinking…', // English mode never hits the translation path
    errorNet: 'I could not reach the server. Please check your internet connection and try again.',
    errorKey: 'The AI service is not configured. Please add the VITE_GROQ_API_KEY to your environment.',
    confirmAction: 'Confirm',
    actionDone: 'Done',
    voiceHint: 'Tap to speak (English or Twi)',
    voiceListening: 'Listening… speak now',
    voiceNotSupported: 'Voice not supported on this browser',
  },
  tw: {
    label: 'Twi',
    flag: '🇬🇭',
    placeholder: 'Bisa ho asem anaa ma me nhyehyɛe…',
    greeting: `Mema wo akye! Meyɛ wo ColdWatch boafoɔ. Wo tumi ka asem anaa kyerɛw de bisa me. Dɛn na mɛboa wo?`,
    thinking: 'Meda wo ho dwuma…',
    translating: 'Me kyerɛw wo asem…', // "Understanding your message…" — shown during translation
    errorNet: 'Mintuiw server no. Hwɛ wo internet na san bisa.',
    errorKey: 'AI seviis no nni hɔ. Fa VITE_GROQ_API_KEY to wo environment mu.',
    confirmAction: 'Gyedi',
    actionDone: 'Ayɛ',
    voiceHint: 'Kasa wɔ Twi anaa English',
    voiceListening: 'Mete wo asem… kasa',
    voiceNotSupported: 'Kasa feature no nsiesie wo browser yi so',
  },
};

// ─── System prompt builder ────────────────────────────────────────────────────

function buildSystemPrompt(appContext: ReturnType<typeof buildAppContext>): string {
  return `You are the ColdWatch AI assistant — an expert in cold chain management, post-harvest storage, and produce preservation in Ghana and West Africa.

LANGUAGE RULE — CRITICAL AND ABSOLUTE: You MUST always respond in clear, simple English. This rule overrides everything else. Do not reply in Twi, Ga, Hausa, or any other language under any circumstance, even if the user writes to you in another language, even if they ask you to reply in another language. English only, always, no exceptions. User messages are pre-translated to English before reaching you. Your responses will be spoken aloud to the user. Keep sentences short and natural for speech. Avoid bullet points or markdown — write in plain conversational paragraphs only.

UNKNOWN INPUT RULE: User messages will be pre-translated to English before reaching you. However, if a message still arrives that you genuinely cannot understand or interpret — even in context — do NOT guess or make up a response. Instead reply with exactly: "I'm sorry, I didn't quite understand that. Could you please rephrase it in English?" This is safer than a confident wrong answer for a farmer making real decisions.

YOUR CAPABILITIES:
- Advise on optimal temperature and humidity for any produce type or state
- Interpret current sensor readings and explain what they mean for the stored produce
- Help set temperature and humidity targets
- Explain alerts in plain practical language — not just "breach detected" but what it means for the produce and what to do right now
- Estimate and communicate shelf life impact — always give a rough time estimate when you can ("at this rate, roughly 2 days remaining")
- Advise on meat, fish, fruits, vegetables, tubers, legumes, leafy greens, and dried produce
- Understand and respond to instructions in both English and Twi
- Proactively flag issues the user has not asked about if the data warrants it
- Monitor and advise on ALL storage units/devices, not just the currently selected one
- Switch the dashboard view to any device the user mentions by name
- Compare conditions across multiple devices and tell the user which units need attention

SHELF LIFE RULE:
Whenever you have produce type and condition in the app state, mention the estimated remaining shelf life in your response — even if the user did not ask. Frame it practically: "At the current conditions, your tomatoes have roughly X days before quality drops significantly." If conditions are deteriorating, be honest and urgent about it.

ALERT EXPLANATION RULE:
When explaining alerts, always go beyond the raw message. Say what caused it, what it means for the specific produce stored, and give one clear recommended action. Example: instead of "Temperature breach — critical", say "Your cold room temperature rose above the safe range for fresh tomatoes. Prolonged exposure above 10 degrees will accelerate spoilage. I recommend starting the cooling unit now and setting the target back to 8 degrees."

AUTO-RESOLVE AWARENESS:
When there is an active breach alert, the correct approach is to take corrective action — lower the target temperature, start cooling, or enable auto mode. When conditions return to safe levels, the system automatically resolves the alert. Do NOT manually dismiss active breach alerts. Instead, fix the conditions. Tell the user clearly: "Once the temperature returns to the safe range, the system will resolve the alert automatically."

CURRENT APP STATE:
${JSON.stringify(appContext, null, 2)}

EXECUTING ACTIONS:
If the user asks you to change a setting or perform an action, include a JSON block at the very end of your response (after your explanation) in this exact format:
<ACTION>{"type":"SET_TARGET_TEMP","value":8}</ACTION>

Available action types:
- SET_TARGET_TEMP: value = number (°C) — sets target for the CURRENTLY SELECTED device
- SET_TARGET_HUMIDITY: value = number (%) — sets humidity for the CURRENTLY SELECTED device
- SET_AUTO_MODE: value = true | false — enable auto mode to let the system self-correct
- START_COOLING — engage cooling to bring temperature down during a breach
- STOP_COOLING
- ACKNOWLEDGE_ALERT: value = alertId string — only for non-breach informational alerts
- ACKNOWLEDGE_ALL_ALERTS — only when all active alerts are informational, not active breaches
- SWITCH_DEVICE: value = deviceId string — switches the dashboard to a different device so the user can view its readings and control it. Use this when the user asks to check, view, or control a specific unit by name

SAFETY RULES:
- Never suggest temperatures below 0°C for non-meat produce.
- Never suggest temperatures above 25°C as a storage target.
- Warn if requested settings seem outside safe ranges.
- Always explain WHAT you are changing and WHY before including the ACTION block.
- If you are not changing anything, do NOT include an ACTION block.
- For active breach alerts, always recommend fixing conditions first rather than dismissing the alert.

CONVERSATION BEHAVIOUR — FOLLOW THESE EVERY TIME:
- After EVERY response, always end with a relevant follow-up question or a brief "Is there anything else I can help you with?" Never go silent.
- When you complete advice or an action, acknowledge it first — e.g. "Done, I have updated your temperature target." Then follow up naturally.
- Be proactive: if readings are near breach thresholds even without an active alert, mention it without being asked.
- If the user just had an action confirmed, acknowledge it warmly — e.g. "Done! Your temperature target is now set to 8 degrees. Would you also like me to check your humidity?"
- Keep track of the conversation. Your follow-up should relate to what was just discussed, not something random.
- If the user seems to be wrapping up, offer a brief summary of what changed in the session.

TONE AND PERSONALITY — THIS IS THE MOST IMPORTANT SECTION:
You are not a formal assistant. You are Nix — a sharp, warm, knowledgeable friend who understands cold chain storage and farming in Ghana exceptionally well. Think of a trusted colleague who studied agriculture and actually knows what they are talking about, but speaks the way a friend does — direct, caring, a little bit of personality, not stiff.

WHAT HUMAN SOUNDS LIKE IN PRACTICE:
BAD (robotic): "The current temperature reading is 12.5 degrees Celsius, which exceeds the target threshold of 8 degrees Celsius by 4.5 degrees."
GOOD (natural): "Your cold room's sitting at twelve and a half right now — that's about four degrees above where it should be. Not great for fresh tomatoes."

BAD: "I recommend enabling auto mode to optimise temperature regulation."
GOOD: "Turn on auto mode — it'll handle the cooling for you and bring things back without you having to watch it."

BAD: "Is there anything else I can assist you with?"
GOOD: "Want me to check the other units while we're at it?" or "Anything else on your mind?"

SPECIFIC RULES FOR SOUNDING HUMAN:
- Use contractions always: "I'll", "it's", "you'll", "don't", "isn't", "that's", "we've", "let's"
- Vary sentence length. Mix short punchy sentences with slightly longer ones. Never three long sentences in a row.
- Express mild reactions when the situation calls for it: "Ah, that's looking good actually." or "Okay, that's a bit concerning." or "Right, glad you caught that early."
- Round numbers where rounding is honest. Say "about eight degrees" not "eight point zero degrees."
- Start responses differently each time. Not always "Your". Try: "So,", "Right, so", "Looking at your readings,", "Good news —", "Okay, so —", "Honestly,", "That said,"
- When the user is vague, make a sensible assumption and state it: "I'll assume you mean the tomatoes in unit one — let me know if you meant something else."
- Say the user's name occasionally and naturally — the way a friend would, not every message.
- When something is wrong, be calm and honest: "Look, the temperature has been too high for a while. That is real risk. Let's fix it now."
- Never say "Certainly!", "Absolutely!", "Of course!", "Great question!" — these are filler phrases.
- End with something specific: not "Is there anything else I can help you with?" but a natural follow-up tied to what was just discussed.
- Acknowledge uncertainty like a person would: "Honestly, hard to say for sure without knowing how long it's been like this, but my best guess is about two days."

LOCAL GROUNDING:
- Reference Ghanaian seasons, local transport realities, market timing, and produce types where relevant.
- You understand produce in Ghana often travels long distances in heat before reaching cold storage. Factor that into shelf-life reasoning.
- Address users with Ghanaian names the way you would if you knew them personally.

FORMAT:
- Plain conversational English only. No bullet points. No markdown. No numbered lists.
- Write as if speaking aloud, because it will be spoken aloud.
- Maximum four sentences per response unless the question genuinely needs more detail.`;
}

// ─── App context snapshot ─────────────────────────────────────────────────────

function buildAppContext(app: ReturnType<typeof useApp>) {
  const selectedDevice = app.devices.find(d => d.id === app.selectedDeviceId);
  const activeAlerts   = app.alerts.filter(a => a.status === 'new' || a.status === 'acknowledged');
  const breachAlerts   = activeAlerts.filter(a => a.severity === 'critical' || a.severity === 'warning');

  // Base shelf-life hours by produce state — AI refines with produce type context
  const shelfBaseHours: Record<string, number> = {
    fresh: 120, 'in-between': 72, dried: 720, 'almost-damaged': 24,
  };

  return {
    // ── Currently selected device (live readings) ───────────────────────────
    selectedDevice: selectedDevice
      ? {
          id:             selectedDevice.id,
          name:           selectedDevice.name,
          location:       selectedDevice.location,
          status:         selectedDevice.status,
          produceMode:    selectedDevice.produceMode   ?? 'not set',
          produceState:   selectedDevice.produceState  ?? 'not set',
          facilitySize:   selectedDevice.facilitySize  ?? 'not set',
          transportHours: selectedDevice.transportHours ?? 'not set',
          produceSetupComplete: selectedDevice.produceSetupComplete ?? false,
        }
      : null,

    // ── Live readings for the selected device ───────────────────────────────
    readings: {
      currentTemperature:  app.currentTemperature,
      currentHumidity:     app.currentHumidity,
      targetTemperature:   app.targetTemperature,
      targetHumidity:      app.targetHumidity,
      systemStatus:        app.systemStatus,
      autoMode:            app.autoMode,
      temperatureBreached: app.currentTemperature > app.targetTemperature + 1,
      humidityBreached:    Math.abs(app.currentHumidity - app.targetHumidity) > 5,
    },

    // ── ALL devices — full profile so AI can advise on every unit ──────────
    // This is the key data the AI needs to answer "how are all my units?"
    allDevices: app.devices.map(d => ({
      id:                   d.id,
      name:                 d.name,
      location:             d.location,
      status:               d.status,
      isSelected:           d.id === app.selectedDeviceId,
      produceMode:          d.produceMode    ?? 'not set',
      produceState:         d.produceState   ?? 'not set',
      facilitySize:         d.facilitySize   ?? 'not set',
      transportHours:       d.transportHours ?? 'not set',
      produceSetupComplete: d.produceSetupComplete ?? false,
      batteryLevel:         d.batteryLevel,
      // Threshold config so AI knows what's safe for each unit
      warningTemperature:   d.warningTemperature,
      criticalTemperature:  d.criticalTemperature,
      warningHumidity:      d.warningHumidity,
      criticalHumidity:     d.criticalHumidity,
      // Estimated shelf life for this device's produce
      estimatedShelfLifeHours: d.produceState
        ? Math.max(0, (shelfBaseHours[d.produceState] ?? 96) - (d.transportHours ?? 0))
        : null,
      // Active alerts for this specific device
      activeAlerts: activeAlerts
        .filter(a => a.deviceId === d.id)
        .map(a => ({ id: a.id, severity: a.severity, message: a.message })),
    })),

    // ── Alerts across ALL devices ───────────────────────────────────────────
    alerts: {
      total:          activeAlerts.length,
      unread:         app.unreadAlertCount,
      activeBreaches: breachAlerts.length,
      items: activeAlerts.slice(0, 8).map(a => ({
        id:       a.id,
        severity: a.severity,
        message:  a.message,
        device:   a.deviceName,
        deviceId: a.deviceId,
        isBreach: a.severity !== 'info',
      })),
    },

    user: {
      name: app.user.name,
      role: app.user.role ?? 'user',
    },

    // ── Shelf life context for selected device ──────────────────────────────
    shelfLifeContext: selectedDevice?.produceMode && selectedDevice?.produceState
      ? {
          produceMode:         selectedDevice.produceMode,
          produceState:        selectedDevice.produceState,
          transportHours:      selectedDevice.transportHours ?? 0,
          estimatedBaseHours:  shelfBaseHours[selectedDevice.produceState ?? 'fresh'] ?? 96,
          currentTempBreached: app.currentTemperature > app.targetTemperature + 1,
        }
      : null,
  };
}

// ─── Parse AI action from response ───────────────────────────────────────────

function parseAction(raw: string): { display: string; action: AIAction | null } {
  // Strip the ACTION block from display text regardless of whether parsing succeeds.
  // Llama models sometimes vary whitespace/newlines around the tags, so we use a
  // case-insensitive, whitespace-tolerant regex for both matching and stripping.
  const TAG_RE    = /<\s*ACTION\s*>([\s\S]*?)<\s*\/\s*ACTION\s*>/i;
  const actionMatch = raw.match(TAG_RE);

  // Always strip — even if JSON parsing fails the tag must never show in the UI
  const display = raw.replace(TAG_RE, '').replace(/\n{3,}/g, '\n\n').trim();

  if (!actionMatch) return { display, action: null };

  try {
    const action = JSON.parse(actionMatch[1].trim()) as AIAction;
    if (!action.type) return { display, action: null };
    return { display, action };
  } catch {
    return { display, action: null };
  }
}

// ─── Action label ─────────────────────────────────────────────────────────────

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
    default:                       return 'Action taken';
  }
}

// ─── Execute action ───────────────────────────────────────────────────────────

function executeAction(action: AIAction, app: ReturnType<typeof useApp>): boolean {
  try {
    switch (action.type) {
      case 'SET_TARGET_TEMP':
        if (typeof action.value === 'number' && action.value >= 0 && action.value <= 25) {
          app.setTargetTemperature(action.value);
          return true;
        }
        return false;
      case 'SET_TARGET_HUMIDITY':
        if (typeof action.value === 'number' && action.value >= 30 && action.value <= 98) {
          app.setTargetHumidity(action.value);
          return true;
        }
        return false;
      case 'SET_AUTO_MODE':
        app.setAutoMode(Boolean(action.value));
        return true;
      case 'START_COOLING':
        app.startCooling();
        return true;
      case 'STOP_COOLING':
        app.stopCooling();
        return true;
      case 'ACKNOWLEDGE_ALERT':
        if (typeof action.value === 'string') {
          app.acknowledgeAlert(action.value);
          return true;
        }
        return false;
      case 'ACKNOWLEDGE_ALL_ALERTS':
        app.acknowledgeAllAlerts();
        return true;
      case 'SWITCH_DEVICE':
        if (typeof action.value === 'string') {
          // value is the device id
          app.setSelectedDeviceId(action.value);
          return true;
        }
        return false;
      default:
        return false;
    }
  } catch {
    return false;
  }
}

// ─── Text-to-speech helper ────────────────────────────────────────────────────
// Wraps the Web Speech API's SpeechSynthesis. Always speaks in English.
// Voice priority: Google Neural > Google any > Enhanced/Premium > en-GB > en-US.

// ─── Ghanaian name phonetics ─────────────────────────────────────────────────
// Maps common Ghanaian/West African names to phonetic respellings so English
// TTS engines render them the way a Ghanaian would say them.
const GHANAIAN_NAME_PHONETICS: Record<string, string> = {
  kwame:    'Kwah-meh',    kofi:     'Koh-fee',
  kojo:     'Koh-joh',    kweku:    'Kweh-koo',
  kwabena:  'Kwah-beh-nah', kwasi:  'Kwah-see',
  yaw:      'Yao',         ama:     'Ah-mah',
  akua:     'Ah-kwah',    adwoa:    'Ah-jwah',
  abena:    'Ah-beh-nah', afia:     'Ah-fyah',
  akosua:   'Ah-koh-swah', adjoa:   'Ah-jwah',
  nii:      'Nee',         naa:     'Nah',
  aba:      'Ah-bah',     okai:     'Oh-kai',
  tetteh:   'Teh-teh',   lamptey:  'Lamp-teh',
  kafui:    'Kah-foo-ee', edem:     'Eh-dehm',
  seyram:   'Seh-rahm',  selorm:    'Seh-lorm',
  alhassan: 'Al-has-sahn', issah:   'Ee-sah',
  fuseini:  'Foo-seh-nee',
  asante:   'Ah-sahn-teh', mensah:  'Men-sah',
  boateng:  'Bwah-teng',  owusu:    'Oh-woo-soo',
  appiah:   'Ah-pyah',    amoah:    'Ah-moh-ah',
  frimpong: 'Freem-pong', darko:    'Dar-koh',
  antwi:    'Ahn-twee',
};

// Replaces each word in a name string with its phonetic form if known.
function phoneticiseName(name: string): string {
  return name.split(/\s+/).map(word => {
    const lower = word.toLowerCase().replace(/[^a-z]/g, '');
    return GHANAIAN_NAME_PHONETICS[lower] ?? word;
  }).join(' ');
}

// Converts integers 0–999 to English words so TTS reads them naturally.
function numberToWords(n: number): string {
  if (n < 0)  return `minus ${numberToWords(-n)}`;
  const ones = ['zero','one','two','three','four','five','six','seven','eight',
                 'nine','ten','eleven','twelve','thirteen','fourteen','fifteen',
                 'sixteen','seventeen','eighteen','nineteen'];
  const tens = ['','','twenty','thirty','forty','fifty','sixty','seventy','eighty','ninety'];
  if (n < 20)   return ones[n];
  if (n < 100)  return tens[Math.floor(n / 10)] + (n % 10 ? '-' + ones[n % 10] : '');
  if (n < 1000) {
    const rem = n % 100;
    return ones[Math.floor(n / 100)] + ' hundred' + (rem ? ' and ' + numberToWords(rem) : '');
  }
  return String(n);
}

// Rewrites AI response text so the speech engine reads it naturally:
//   "8°C" → "eight degrees", "85%" → "eighty-five percent",
//   user names phonecticised, sentence rhythm preserved.
function prepareSpeechText(text: string, userName: string): string {
  let t = text;

  // Strip action tags and markdown artefacts
  t = t.replace(/<\s*ACTION\s*>[\s\S]*?<\s*\/\s*ACTION\s*>/gi, '');
  t = t.replace(/[*_`#>]/g, '');

  // Phonecticise the user's name wherever it appears (case-insensitive)
  if (userName) {
    const escaped  = userName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const nameRe   = new RegExp(`\\b${escaped}\\b`, 'gi');
    const phonetic = phoneticiseName(userName);
    t = t.replace(nameRe, phonetic);
  }

  // Temperatures: "8°C" → "eight degrees", "10.5°C" → "ten point five degrees"
  t = t.replace(/(\d+\.?\d*)\s*°C/g, (_m, n) => {
    const val = parseFloat(n);
    if (Number.isInteger(val)) return `${numberToWords(val)} degrees`;
    const [int, dec] = n.split('.');
    return `${numberToWords(parseInt(int, 10))} point ${dec} degrees`;
  });

  // Humidity percentages: "85%" → "eighty-five percent"
  t = t.replace(/(\d+)%/g, (_m, n) => `${numberToWords(parseInt(n, 10))} percent`);

  // Long hour counts: "24 hours" → "twenty-four hours"
  t = t.replace(/\b(\d{2,})\s*hours?\b/gi,
    (_m, n) => `${numberToWords(parseInt(n, 10))} hours`);

  // Natural pause hints — commas after key conversational phrases
  t = t.replace(/(right now|I'd recommend|let me know|sounds good|good news|by the way)(,?)/gi,
    '$1,');

  // Clean up excess whitespace
  t = t.replace(/  +/g, ' ').trim();
  return t;
}

function speak(text: string, muted: boolean, userName = ''): void {
  if (muted || !('speechSynthesis' in window)) return;

  // Run text through speech preparation — phonetics, number words, natural pauses
  const clean = prepareSpeechText(text, userName);
  if (!clean) return;

  window.speechSynthesis.cancel();
  const utter = new SpeechSynthesisUtterance(clean);

  const voices   = window.speechSynthesis.getVoices();
  const enVoices = voices.filter(v => v.lang.startsWith('en'));

  // Priority 1: Google Neural2 / Wavenet — best quality, Android Chrome / ChromeOS
  const googleNeural = enVoices.find(v => /google/i.test(v.name) && /neural|wavenet/i.test(v.name));
  // Priority 2: en-GH (Ghana English) or en-NG (Nigerian English) — handles West African
  //   names and accent patterns far better than en-GB for Ghanaian users
  const enGH = enVoices.find(v => v.lang === 'en-GH');
  const enNG = enVoices.find(v => v.lang === 'en-NG');
  // Priority 3: Any Google English voice
  const googleAny  = enVoices.find(v => /google/i.test(v.name));
  // Priority 4: Enhanced/Premium OS voices (iOS Siri, macOS)
  const enhanced   = enVoices.find(v => /enhanced|premium/i.test(v.name));
  // Priority 5: en-GB — standard fallback
  const enGB       = enVoices.find(v => v.lang === 'en-GB');
  // Priority 6: en-US, then any English
  const enUS       = enVoices.find(v => v.lang === 'en-US');
  const any        = enVoices[0] ?? null;

  const chosen = googleNeural ?? enGH ?? enNG ?? googleAny ?? enhanced ?? enGB ?? enUS ?? any;
  if (chosen) utter.voice = chosen;

  // Rate 0.85 — slightly slower than natural speech gives clarity in noisy
  // field/warehouse environments without sounding artificially slowed.
  // Pitch 1.0 — dead neutral. Avoiding artificial warmth (1.05+) prevents
  // the "cheerful robot" effect. Natural warmth comes from the text itself.
  utter.lang   = 'en-GH';  // Hint to the engine for accent-aware rendering
  utter.rate   = 0.85;
  utter.pitch  = 1.0;
  utter.volume = 1.0;

  window.speechSynthesis.speak(utter);
}

function cancelSpeech(): void {
  if ('speechSynthesis' in window) window.speechSynthesis.cancel();
}

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
    '⚡ Deɛn na mɛyɛ seesei?',
    'Me readings deɛn na ɛte saa?',
    'Me aduan bɛtena ahe?',
    'Me aduan ho yɛ saa anaa?',
    'Kyerɛ me alert a ɛwɔ hɔ no',
    'Temperature bɛn na mɛhyehyɛ?',
  ],
};

// ─── Sub-components ───────────────────────────────────────────────────────────

function TypingIndicator() {
  return (
    <div className="flex items-center gap-1.5 px-3 py-2">
      {[0, 1, 2].map(i => (
        <motion.div
          key={i}
          className="w-2.5 h-2.5 rounded-full"
          style={{ background: 'linear-gradient(135deg, #0984E3, #38bdf8)' }}
          animate={{ y: [0, -6, 0], opacity: [0.35, 1, 0.35], scale: [0.8, 1, 0.8] }}
          transition={{ duration: 0.9, repeat: Infinity, delay: i * 0.18, ease: 'easeInOut' }}
        />
      ))}
    </div>
  );
}

function ActionConfirmBanner({
  action, lang, onConfirm, onDismiss,
}: {
  action: AIAction;
  lang: Language;
  onConfirm: () => void;
  onDismiss: () => void;
}) {
  const label = describeAction(action);
  const cfg   = LANG_CONFIG[lang];

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 8 }}
      className="mx-3 mb-2 rounded-2xl overflow-hidden"
      style={{ border: '1px solid #BFDBFE', backgroundColor: '#EBF4FF' }}
    >
      <div className="flex items-center gap-3 px-4 py-3">
        <Zap className="w-4 h-4 flex-shrink-0" style={{ color: '#0984E3' }} />
        <p className="flex-1 text-xs font-medium text-[#1E40AF] leading-snug">{label}</p>
        <div className="flex gap-2 flex-shrink-0">
          <button
            onClick={onDismiss}
            className="px-3 py-1.5 rounded-xl text-xs font-medium text-[#6B7280] transition-all active:scale-95"
            style={{ border: '1px solid #D1D5DB', backgroundColor: '#F9FAFB' }}
          >
            {lang === 'tw' ? 'Nna' : 'Cancel'}
          </button>
          <button
            onClick={onConfirm}
            className="px-3 py-1.5 rounded-xl text-xs font-semibold text-white transition-all active:scale-95"
            style={{ backgroundColor: '#0984E3' }}
          >
            {cfg.confirmAction}
          </button>
        </div>
      </div>
    </motion.div>
  );
}

function StatusBar({ app }: { app: ReturnType<typeof useApp> }) {
  // Calm informational strip — no urgency colours or alarm chips.
  // Nix handles urgency through conversation. This strip is just context.
  const selectedDevice = app.devices.find(d => d.id === app.selectedDeviceId);
  const deviceLabel    = selectedDevice?.name ?? 'No device';

  return (
    <div
      className="flex items-center gap-4 px-4 py-2 flex-wrap"
      style={{ backgroundColor: '#F8FAFC', borderBottom: '1px solid #E4E7EC' }}
    >
      {/* Device label */}
      <span className="text-[10px] font-semibold uppercase tracking-widest text-[#6B7280]">
        {deviceLabel}
        {selectedDevice?.status === 'offline' && (
          <span className="ml-1 normal-case tracking-normal font-normal text-[#9CA3AF]">(offline)</span>
        )}
      </span>

      {/* Temperature */}
      <div className="flex items-center gap-1.5">
        <Thermometer className="w-3.5 h-3.5 flex-shrink-0 text-[#6B7280]" />
        <span className="text-xs font-semibold text-[#111827]">{app.currentTemperature.toFixed(1)}°C</span>
        <span className="text-xs text-[#9CA3AF]">→ {app.targetTemperature}°C</span>
      </div>

      {/* Humidity */}
      <div className="flex items-center gap-1.5">
        <Droplets className="w-3.5 h-3.5 flex-shrink-0 text-[#6B7280]" />
        <span className="text-xs font-semibold text-[#111827]">{app.currentHumidity.toFixed(0)}%</span>
        <span className="text-xs text-[#9CA3AF]">→ {app.targetHumidity}%</span>
      </div>
    </div>
  );
}

// ─── Message bubble ───────────────────────────────────────────────────────────

function MessageBubble({
  msg,
  muted,
  onReplay,
}: {
  msg: Message;
  muted: boolean;
  onReplay: (text: string) => void;
}) {
  const isUser = msg.role === 'user';
  // Detect urgency language in AI responses to apply severity-aware styling
  const isUrgentContent = !isUser && !msg.pending && (
    /urgent|critical|breach|damaged|spoil|danger|immediately|alert/i.test(msg.content)
  );

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      className={`flex gap-2 ${isUser ? 'justify-end' : 'justify-start'}`}
    >
      {!isUser && (
        <div
          className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5"
          style={{
            background: 'linear-gradient(135deg, #EBF4FF 0%, #DBEAFE 100%)',
            border: '1px solid #BFDBFE',
          }}
        >
          <Snowflake className="w-3.5 h-3.5" style={{ color: '#0984E3' }} />
        </div>
      )}

      <div className={`max-w-[80%] ${isUser ? 'items-end' : 'items-start'} flex flex-col gap-1`}>
        <div
          className="px-3.5 py-2.5 rounded-2xl text-sm leading-relaxed"
          style={
            isUser
              ? { backgroundColor: '#0984E3', color: '#FFFFFF', borderBottomRightRadius: 4 }
              : isUrgentContent
                ? { backgroundColor: '#FEF2F2', color: '#111827', borderBottomLeftRadius: 4, border: '1px solid #FECACA' }
                : { backgroundColor: '#F0F7FF', color: '#111827', borderBottomLeftRadius: 4, border: '1px solid #DBEAFE' }
          }
        >
          {msg.pending ? <TypingIndicator /> : (
            <span style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{msg.content}</span>
          )}
        </div>

        {/* Replay audio button — only on assistant messages that are not pending */}
        {!isUser && !msg.pending && (
          <button
            onClick={() => onReplay(msg.content)}
            className="flex items-center gap-1 px-2 py-1 rounded-full transition-all active:scale-95"
            style={{ backgroundColor: 'transparent' }}
            aria-label="Replay message audio"
            title={muted ? 'Voice is muted' : 'Replay audio'}
          >
            <Play className="w-3 h-3" style={{ color: muted ? '#9CA3AF' : '#0984E3' }} />
            <span className="text-[10px]" style={{ color: muted ? '#9CA3AF' : '#0984E3' }}>Replay</span>
          </button>
        )}

        {/* Action taken badge */}
        {msg.actionTaken && (
          <div className="flex items-center gap-1 px-2 py-1 rounded-full"
            style={{ backgroundColor: '#E6F6EC', border: '1px solid #A7D7B6' }}>
            <CheckCheck className="w-3 h-3" style={{ color: '#166534' }} />
            <span className="text-xs font-medium" style={{ color: '#166534' }}>{msg.actionTaken}</span>
          </div>
        )}

        <span className="text-[10px] text-[#9CA3AF] px-1">
          {msg.timestamp.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
        </span>
      </div>
    </motion.div>
  );
}

// ─── Voice status pill ────────────────────────────────────────────────────────

function VoiceStatusPill({ voiceState, lang }: { voiceState: VoiceState; lang: Language }) {
  if (voiceState !== 'listening') return null;
  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 4 }}
      className="flex items-center gap-2 px-3 py-1.5 rounded-full mx-auto w-fit mb-2"
      style={{ backgroundColor: '#FEE2E2', border: '1px solid #FECACA' }}
    >
      {/* Pulsing red dot */}
      <motion.div
        className="w-2 h-2 rounded-full"
        style={{ backgroundColor: '#EF4444' }}
        animate={{ opacity: [1, 0.3, 1] }}
        transition={{ duration: 1, repeat: Infinity }}
      />
      <span className="text-xs font-medium" style={{ color: '#DC2626' }}>
        {LANG_CONFIG[lang].voiceListening}
      </span>
    </motion.div>
  );
}

// ─── Main AIAssistant drawer ──────────────────────────────────────────────────

interface AIAssistantProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function AIAssistant({ isOpen, onClose }: AIAssistantProps) {
  const app = useApp();

  // Language preference persisted to localStorage
  const [lang, setLang] = useState<Language>(() => {
    try {
      const stored = localStorage.getItem('cw_assistant_lang');
      return (stored === 'en' || stored === 'tw') ? stored : 'en';
    } catch {
      return 'en';
    }
  });

  const cfg = LANG_CONFIG[lang];

  // Restore conversation history from localStorage so it survives drawer close/reopen.
  // Timestamps are stored as ISO strings — parse them back to Date objects on load.
  const [messages, setMessages] = useState<Message[]>(() => {
    try {
      const stored = localStorage.getItem('cw_assistant_messages');
      if (!stored) return [];
      const parsed = JSON.parse(stored) as Message[];
      // Revive Date objects and strip any pending/loading messages from a previous session
      return parsed
        .filter(m => !m.pending)
        .map(m => ({ ...m, timestamp: new Date(m.timestamp) }));
    } catch {
      return [];
    }
  });
  const [input,           setInput]           = useState('');
  const [isLoading,       setIsLoading]       = useState(false);
  const [pendingAction,   setPendingAction]   = useState<{ action: AIAction; msgId: string } | null>(null);
  const [showQuickChips,  setShowQuickChips]  = useState(true);
  const [showSettingsTray, setShowSettingsTray] = useState(false);  // collapsed by default — opens when user taps the Settings2 icon

  // Voice state
  const [voiceState,      setVoiceState]      = useState<VoiceState>('idle');
  const [isMuted,         setIsMuted]         = useState(false);
  const [sttSupported,       setSttSupported]       = useState(false);
  const [isAnalysingImage,   setIsAnalysingImage]   = useState(false);
  const [ttsSupported,    setTtsSupported]    = useState(false);

  const recognitionRef    = useRef<SpeechRecognitionInstance | null>(null);
  const cameraInputRef    = useRef<HTMLInputElement>(null);
  const autoSendTimerRef  = useRef<ReturnType<typeof setTimeout> | null>(null);
  const messagesEndRef    = useRef<HTMLDivElement>(null);
  const inputRef          = useRef<HTMLInputElement>(null);
  const drawerRef         = useRef<HTMLDivElement>(null);

  // ── Feature detection on mount ──────────────────────────────────────────────

  useEffect(() => {
    setSttSupported(getSpeechRecognition() !== null);
    setTtsSupported('speechSynthesis' in window);
  }, []);

  // Persist language preference
  useEffect(() => {
    try { localStorage.setItem('cw_assistant_lang', lang); } catch { /* */ }
  }, [lang]);

  // Persist conversation history — skip pending messages (they're transient)
  useEffect(() => {
    try {
      const toStore = messages.filter(m => !m.pending).slice(-MAX_HISTORY);
      localStorage.setItem('cw_assistant_messages', JSON.stringify(toStore));
    } catch { /* storage quota or private mode — fail silently */ }
  }, [messages]);

  // ── Smart greeting — reads live app state on open ─────────────────────────
  // Instead of a static "Hello", the AI opens with an actual assessment of the
  // current conditions so the user immediately gets value.
  const sendSmartGreeting = useCallback(async () => {
    const greetingId = 'greeting';
    // Show a brief loading state while the greeting is being generated
    setMessages([{
      id:         greetingId,
      role:       'assistant',
      content:    cfg.thinking,
      rawContent: '',
      timestamp:  new Date(),
      pending:    true,
    }]);

    if (!GROQ_API_KEY) {
      // Fallback to static greeting if no key
      setMessages([{
        id:         greetingId,
        role:       'assistant',
        content:    cfg.greeting,
        rawContent: cfg.greeting,
        timestamp:  new Date(),
      }]);
      return;
    }

    try {
      const appCtx       = buildAppContext(app);
      const systemPrompt = buildSystemPrompt(appCtx);
      const hour         = new Date().getHours();
      const timeOfDay    = hour < 12 ? 'morning' : hour < 17 ? 'afternoon' : 'evening';

      const res = await fetch(GROQ_URL, {
        method:  'POST',
        headers: {
          'Content-Type':  'application/json',
          'Authorization': `Bearer ${GROQ_API_KEY}`,
        },
        body: JSON.stringify({
          model:       GROQ_MODEL_CONVERSATION,
          temperature: 0.6,
          max_tokens:  200,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user',   content: `[SYSTEM NOTE: The user just opened the ColdWatch assistant. It is ${timeOfDay}. Greet them by name (${appCtx.user.name}), give a one-sentence status of their current storage conditions (good, warning, or critical), mention the most urgent issue if any, and end with one practical question or offer to help. Keep it under 3 sentences total. Speak naturally as if you know their farm. Do not include any ACTION block. Reply in English only.]` },
          ],
        }),
      });

      const data    = res.ok ? await res.json() : null;
      const rawText = data?.choices?.[0]?.message?.content ?? cfg.greeting;
      const { display } = parseAction(rawText);

      setMessages([{
        id:         greetingId,
        role:       'assistant',
        content:    display || cfg.greeting,
        rawContent: rawText,
        timestamp:  new Date(),
        pending:    false,
      }]);
      speak(display || cfg.greeting, isMuted, app.user.name);
    } catch {
      setMessages([{
        id:         greetingId,
        role:       'assistant',
        content:    cfg.greeting,
        rawContent: cfg.greeting,
        timestamp:  new Date(),
      }]);
    }
  }, [app, cfg, isMuted]);

  // Trigger smart greeting when drawer opens or language changes
  useEffect(() => {
    if (!isOpen) return;
    setPendingAction(null);

    // If there is already a conversation in memory (restored from localStorage or
    // from keeping the drawer state alive), don't wipe it with a new greeting.
    // Only send the smart greeting on a truly fresh session (no saved messages).
    if (messages.length === 0) {
      setShowQuickChips(true);
      sendSmartGreeting();
    }
    // If language changed, always reset and re-greet in the new language
  }, [isOpen, lang]); // eslint-disable-line react-hooks/exhaustive-deps

  // Cancel speech and recognition when drawer closes
  useEffect(() => {
    if (!isOpen) {
      cancelSpeech();
      stopRecognition();
    }
  }, [isOpen]);

  // Auto-scroll to latest message
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Focus input when drawer opens (on desktop only — on mobile we skip this
  // to prevent the software keyboard from immediately popping up)
  useEffect(() => {
    if (isOpen && window.innerWidth > 768) {
      setTimeout(() => inputRef.current?.focus(), 300);
    }
  }, [isOpen]);

  // Trap focus and close on Escape
  useEffect(() => {
    if (!isOpen) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { handleClose(); }
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [isOpen, onClose]);

  // Preload TTS voices — browsers load them asynchronously on first call
  useEffect(() => {
    if ('speechSynthesis' in window) {
      window.speechSynthesis.getVoices();
      window.speechSynthesis.onvoiceschanged = () => {
        window.speechSynthesis.getVoices(); // cache voices after they load
      };
    }
  }, []);

  // ── Send message ────────────────────────────────────────────────────────────

  const sendMessage = useCallback(async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || isLoading) return;

    // Input sanitisation — strip HTML/script tags, cap at 1000 chars
    const sanitised = trimmed.replace(/<[^>]*>/g, '').slice(0, 1000);

    setInput('');
    setShowQuickChips(false);

    const userMsg: Message = {
      id:         `u-${Date.now()}`,
      role:       'user',
      content:    sanitised,    // always display the original text the user sent
      rawContent: sanitised,
      timestamp:  new Date(),
    };

    // Thinking bubble — starts with the appropriate phase label.
    // For non-English messages it shows "translating" first, then updates to
    // "thinking" once translation is done and the main call is in flight.
    const thinkingId  = `a-${Date.now()}`;
    const thinkingMsg: Message = {
      id:         thinkingId,
      role:       'assistant',
      content:    lang !== 'en' ? cfg.translating : cfg.thinking,
      rawContent: '',
      timestamp:  new Date(),
      pending:    true,
    };

    setMessages(prev => {
      const history = prev.length >= MAX_HISTORY
        ? [prev[0], ...prev.slice(-(MAX_HISTORY - 2))]
        : prev;
      return [...history, userMsg, thinkingMsg];
    });
    setIsLoading(true);

    if (!GROQ_API_KEY) {
      setMessages(prev => prev.map(m =>
        m.pending ? { ...m, content: cfg.errorKey, rawContent: cfg.errorKey, pending: false } : m
      ));
      setIsLoading(false);
      speak(cfg.errorKey, isMuted, app.user.name);
      return;
    }

    try {
      // ── Build all synchronous context immediately ──────────────────────────
      // This work happens while the translation call is in flight (for non-English)
      // so it does not add to the user-perceived wait time.
      // Map conversation history to OpenAI-compatible message format (Groq)
      const historyForGroq = messages
        .filter(m => m.id !== 'greeting' && !m.pending)
        .map(m => ({
          role:    m.role === 'user' ? 'user' : 'assistant',
          content: m.rawContent,
        }));

      const appCtx       = buildAppContext(app);
      const systemPrompt = buildSystemPrompt(appCtx);

      // ── Parallel optimisation ──────────────────────────────────────────────
      // For non-English messages we fire the translation call immediately.
      // All synchronous preparation above happens at the same time (no await
      // until this point), so by the time translation resolves the main request
      // body is already fully assembled and the fetch fires with zero extra delay.
      // For English messages we skip the translation entirely — one call only.
      const queryForAI = lang !== 'en'
        ? await translateToEnglish(sanitised)
        : sanitised;

      // Translation done — update the thinking bubble to the "thinking" phase
      // so the user sees that we understood their message and are now processing.
      if (lang !== 'en') {
        setMessages(prev => prev.map(m =>
          m.id === thinkingId ? { ...m, content: cfg.thinking } : m
        ));
      }

      // ── Main assistant call (Groq — OpenAI-compatible) ────────────────────
      const body = {
        model:       GROQ_MODEL_CONVERSATION,
        temperature: 0.4,
        max_tokens:  512,
        messages: [
          { role: 'system',    content: systemPrompt },
          ...historyForGroq,
          { role: 'user',      content: `${queryForAI}\n\n[REMINDER: Reply in English only, regardless of the language above.]` },
        ],
      };

      const res = await fetch(GROQ_URL, {
        method:  'POST',
        headers: {
          'Content-Type':  'application/json',
          'Authorization': `Bearer ${GROQ_API_KEY}`,
        },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        const errMsg  = (errBody as any)?.error?.message ?? `HTTP ${res.status}`;
        throw new Error(errMsg);
      }

      const data    = await res.json();
      const rawText = data?.choices?.[0]?.message?.content ?? '';
      const { display, action } = parseAction(rawText);

      const assistantMsg: Message = {
        id:         thinkingId,
        role:       'assistant',
        content:    display,
        rawContent: rawText,
        timestamp:  new Date(),
        pending:    false,
      };

      setMessages(prev => prev.map(m => m.id === thinkingId ? assistantMsg : m));

      // Speak the response aloud in English
      speak(display, isMuted, app.user.name);

      // If AI wants to take an action, queue it for user confirmation
      if (action) {
        setPendingAction({ action, msgId: assistantMsg.id });
      }

    } catch (err) {
      const errorText = err instanceof Error && err.message.includes('fetch')
        ? cfg.errorNet
        : `${cfg.errorNet} (${err instanceof Error ? err.message : 'Unknown error'})`;

      setMessages(prev => prev.map(m =>
        m.id === thinkingId
          ? { ...m, content: errorText, rawContent: errorText, pending: false }
          : m
      ));
      speak(cfg.errorNet, isMuted, app.user.name);
    } finally {
      setIsLoading(false);
    }
  }, [app, isLoading, lang, messages, cfg, isMuted]);

  // ── Confirm pending action ──────────────────────────────────────────────────

  // ── Follow-up after action confirmed ────────────────────────────────────────
  // Fires a short AI call so the assistant acknowledges completion and asks
  // if there is anything else — instead of going silent after an action.
  const sendFollowUp = useCallback(async (actionLabel: string) => {
    if (!GROQ_API_KEY) return;

    const followUpId = `a-follow-${Date.now()}`;
    const thinkingMsg: Message = {
      id:         followUpId,
      role:       'assistant',
      content:    cfg.thinking,
      rawContent: '',
      timestamp:  new Date(),
      pending:    true,
    };
    setMessages(prev => [...prev, thinkingMsg]);
    setIsLoading(true);

    try {
      const appCtx       = buildAppContext(app);
      const systemPrompt = buildSystemPrompt(appCtx);

      const res = await fetch(GROQ_URL, {
        method:  'POST',
        headers: {
          'Content-Type':  'application/json',
          'Authorization': `Bearer ${GROQ_API_KEY}`,
        },
        body: JSON.stringify({
          model:       GROQ_MODEL_CONVERSATION,
          temperature: 0.5,
          max_tokens:  180,  // Keep follow-ups brief
          messages: [
            { role: 'system',    content: systemPrompt },
            // Tell the AI exactly what just happened so it can acknowledge naturally
            { role: 'user',      content: `[SYSTEM NOTE: The user just confirmed the following action which has now been successfully applied to their device: "${actionLabel}". Acknowledge this was done in one short, warm sentence, then ask one relevant follow-up question based on the current app state. Do not include any ACTION block. Reply in English only.]` },
          ],
        }),
      });

      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const data      = await res.json();
      const rawText   = data?.choices?.[0]?.message?.content ?? '';
      const { display } = parseAction(rawText); // strip any accidental action tags

      const followUpMsg: Message = {
        id:         followUpId,
        role:       'assistant',
        content:    display,
        rawContent: rawText,
        timestamp:  new Date(),
        pending:    false,
      };

      setMessages(prev => prev.map(m => m.id === followUpId ? followUpMsg : m));
      speak(display, isMuted, app.user.name);
    } catch {
      // Follow-up failure is silent — the action already succeeded, this is just polish
      setMessages(prev => prev.filter(m => m.id !== followUpId));
    } finally {
      setIsLoading(false);
    }
  }, [app, cfg, isMuted]);

  const confirmAction = useCallback(() => {
    if (!pendingAction) return;
    const { action, msgId } = pendingAction;
    const success = executeAction(action, app);
    if (success) {
      const label = describeAction(action);
      setMessages(prev => prev.map(m =>
        m.id === msgId ? { ...m, actionTaken: label } : m
      ));
      app.addToast({ id: `ai-action-${Date.now()}`, type: 'success', message: label });
      // Fire follow-up AI message so the assistant acknowledges completion
      // and asks if there is anything else — instead of going silent
      sendFollowUp(label);
    }
    setPendingAction(null);
  }, [pendingAction, app, sendFollowUp]);

  const dismissAction = useCallback(() => {
    setPendingAction(null);
  }, []);

  // stopRecognition defined here (before handleClose) so handleClose can reference it
  // in its useCallback dependency array without a stale closure error.
  const stopRecognition = useCallback(() => {
    if (autoSendTimerRef.current) {
      clearTimeout(autoSendTimerRef.current);
      autoSendTimerRef.current = null;
    }
    if (recognitionRef.current) {
      recognitionRef.current.abort();
      recognitionRef.current = null;
    }
    setVoiceState('idle');
  }, []);

  // ── Session summary on close ───────────────────────────────────────────────
  // If anything happened during the session (actions taken, messages exchanged),
  // fire a brief summary before closing so the user knows what changed.
  const handleClose = useCallback(async () => {
    cancelSpeech();
    stopRecognition();

    const actionsTaken = messages.filter(m => m.actionTaken).map(m => m.actionTaken);
    const hasActivity  = messages.length > 2; // more than just greeting + one message

    if (!hasActivity || !GROQ_API_KEY || actionsTaken.length === 0) {
      onClose();
      return;
    }

    // Show a quick summary message before closing
    const summaryId = `summary-${Date.now()}`;
    const summaryMsg: Message = {
      id:         summaryId,
      role:       'assistant',
      content:    'One moment, summarising your session...',
      rawContent: '',
      timestamp:  new Date(),
      pending:    true,
    };
    setMessages(prev => [...prev, summaryMsg]);

    try {
      const appCtx = buildAppContext(app);
      const res    = await fetch(GROQ_URL, {
        method:  'POST',
        headers: {
          'Content-Type':  'application/json',
          'Authorization': `Bearer ${GROQ_API_KEY}`,
        },
        body: JSON.stringify({
          model:       GROQ_MODEL_CONVERSATION,
          temperature: 0.3,
          max_tokens:  120,
          messages: [
            { role: 'system', content: buildSystemPrompt(appCtx) },
            { role: 'user',   content: `[SYSTEM NOTE: The user is closing the assistant. Actions taken this session: ${actionsTaken.join(', ')}. Give a one or two sentence closing summary of what was done and wish them well with their storage. Keep it brief and warm. No ACTION block. English only.]` },
          ],
        }),
      });

      const data    = res.ok ? await res.json() : null;
      const rawText = data?.choices?.[0]?.message?.content ?? '';
      const { display } = parseAction(rawText);

      if (display) {
        setMessages(prev => prev.map(m =>
          m.id === summaryId ? { ...m, content: display, rawContent: rawText, pending: false } : m
        ));
        speak(display, isMuted, app.user.name);
        // Let the user read/hear the summary before closing
        await new Promise(resolve => setTimeout(resolve, 2800));
      }
    } catch { /* silent — just close */ }

    onClose();
  }, [messages, app, isMuted, onClose, stopRecognition]);

  // ── Produce urgency trigger ────────────────────────────────────────────────
  // Proactively fires when meat or almost-damaged produce readings are unsafe.
  // Only fires once per session per device to avoid spamming the user.
  const urgencyFiredRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!isOpen || !GROQ_API_KEY) return;

    const device = app.devices.find(d => d.id === app.selectedDeviceId);
    if (!device?.produceMode || !device?.produceSetupComplete) return;

    const isMeat       = device.produceMode === 'meat';
    const isAlmostGone = device.produceState === 'almost-damaged';
    const tempTooHigh  = app.currentTemperature > app.targetTemperature + 1.5;
    const shouldWarn   = (isMeat && tempTooHigh) || (isAlmostGone && tempTooHigh);

    const deviceKey = `${device.id}-urgency`;
    if (!shouldWarn || urgencyFiredRef.current.has(deviceKey)) return;

    urgencyFiredRef.current.add(deviceKey);

    // Small delay so it doesn't fire at the exact same moment as the greeting
    const timer = setTimeout(async () => {
      const appCtx = buildAppContext(app);
      const urgencyId = `urgency-${Date.now()}`;

      setMessages(prev => [...prev, {
        id:         urgencyId,
        role:       'assistant',
        content:    '⚠️ Checking urgent condition...',
        rawContent: '',
        timestamp:  new Date(),
        pending:    true,
      }]);

      try {
        const res = await fetch(GROQ_URL, {
          method:  'POST',
          headers: {
            'Content-Type':  'application/json',
            'Authorization': `Bearer ${GROQ_API_KEY}`,
          },
          body: JSON.stringify({
            model:       GROQ_MODEL_CONVERSATION,
            temperature: 0.2,
            max_tokens:  160,
            messages: [
              { role: 'system', content: buildSystemPrompt(appCtx) },
              { role: 'user',   content: `[SYSTEM ALERT: Urgent condition detected. Produce: ${device.produceMode}, state: ${device.produceState}. Current temperature: ${app.currentTemperature}°C, target: ${app.targetTemperature}°C. This is above the safe threshold. Send a short urgent but calm warning to the user explaining the risk to their specific produce and recommend one immediate action. 2 sentences max. No ACTION block. English only.]` },
            ],
          }),
        });

        const data    = res.ok ? await res.json() : null;
        const rawText = data?.choices?.[0]?.message?.content ?? '';
        const { display } = parseAction(rawText);

        setMessages(prev => prev.map(m =>
          m.id === urgencyId
            ? { ...m, content: display || 'Warning: temperature is above safe range for your produce.', rawContent: rawText, pending: false }
            : m
        ));
        if (display) speak(display, isMuted, app.user.name);
      } catch {
        setMessages(prev => prev.filter(m => m.id !== urgencyId));
      }
    }, 3500);

    return () => clearTimeout(timer);
  }, [isOpen, app.selectedDeviceId, app.currentTemperature]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Reset conversation ──────────────────────────────────────────────────────

  const resetConversation = useCallback(() => {
    cancelSpeech();
    // Clear persisted history so the next open starts truly fresh
    try { localStorage.removeItem('cw_assistant_messages'); } catch { /* */ }
    setMessages([{
      id:         'greeting',
      role:       'assistant',
      content:    cfg.greeting,
      rawContent: cfg.greeting,
      timestamp:  new Date(),
    }]);
    setInput('');
    setShowQuickChips(true);
    setPendingAction(null);
    sendSmartGreeting();
  }, [cfg, sendSmartGreeting]);


  const startRecognition = useCallback(() => {
    const SpeechRecognition = getSpeechRecognition();
    if (!SpeechRecognition) return;

    // If already listening, stop
    if (voiceState === 'listening') {
      stopRecognition();
      return;
    }

    cancelSpeech(); // stop any TTS playing before the user speaks

    const recognition = new SpeechRecognition();

    // en-GH is the Ghana English locale — best for Ghanaian accents and
    // gives Twi the best chance of being picked up correctly.
    recognition.lang            = 'en-GH';
    recognition.continuous      = false;
    recognition.interimResults  = true;
    recognition.maxAlternatives = 1;

    recognition.onstart = () => setVoiceState('listening');

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      let transcript = '';
      for (let i = 0; i < event.results.length; i++) {
        transcript += event.results[i][0].transcript;
      }
      setInput(transcript);

      // If this is a final result, start the auto-send countdown
      if (event.results[event.results.length - 1]?.isFinal) {
        if (autoSendTimerRef.current) clearTimeout(autoSendTimerRef.current);
        autoSendTimerRef.current = setTimeout(() => {
          setVoiceState('processing');
          // sendMessage reads from the latest input state via closure capture —
          // we pass transcript directly to avoid stale state issues
          sendMessage(transcript);
          autoSendTimerRef.current = null;
        }, VOICE_AUTOSEND_DELAY);
      }
    };

    recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      // 'no-speech' and 'aborted' are normal — the user just didn't say anything
      // or we called abort() ourselves. Don't show an error for these.
      if (event.error !== 'no-speech' && event.error !== 'aborted') {
        console.warn('Speech recognition error:', event.error);
      }
      stopRecognition();
    };

    recognition.onend = () => {
      // Only reset to idle if auto-send timer hasn't fired yet
      if (!autoSendTimerRef.current) {
        setVoiceState('idle');
      }
    };

    recognitionRef.current = recognition;

    try {
      recognition.start();
    } catch (err) {
      // Can throw if called while another instance is running
      console.warn('Speech recognition start failed:', err);
      setVoiceState('idle');
    }
  }, [voiceState, stopRecognition, sendMessage]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      cancelSpeech();
      stopRecognition();
    };
  }, [stopRecognition]);

  // ── Image capture for produce assessment ──────────────────────────────────────
  const handleImageCapture = useCallback(async (file: File) => {
    if (isAnalysingImage) return;
    setIsAnalysingImage(true);
    cancelSpeech();

    // Show user message with indicator that photo was shared
    const photoMsg: Message = {
      id:         `u-photo-${Date.now()}`,
      role:       'user',
      content:    '📷 [Photo shared for produce assessment]',
      rawContent: '📷 [Photo shared for produce assessment]',
      timestamp:  new Date(),
    };

    const thinkingId  = `a-photo-${Date.now()}`;
    const thinkingMsg: Message = {
      id:         thinkingId,
      role:       'assistant',
      content:    'Analysing your photo…',
      rawContent: '',
      timestamp:  new Date(),
      pending:    true,
    };

    setMessages(prev => [...prev, photoMsg, thinkingMsg]);
    setShowQuickChips(false);

    try {
      const { base64, mimeType } = await fileToBase64Chat(file);
      // Use selected device produce mode as context if available
      const selectedDevice = app.devices.find(d => d.id === app.selectedDeviceId);
      const produceLabel   = selectedDevice?.produceMode
        ? `${selectedDevice.produceMode} (${selectedDevice.produceState ?? 'condition unknown'})`
        : 'produce (type not set for this device)';

      const result = await analyseProduceImageForChat(base64, mimeType, produceLabel);

      let responseText: string;
      if (!result) {
        responseText = GROQ_API_KEY
          ? 'I had trouble reading that photo — it may be too dark or the produce too small in frame. Try holding it closer and in better light, or just describe what you see to me.'
          : 'Image analysis is not configured. Please describe the produce condition to me instead.';
      } else {
        const confLabel = result.confidence === 'high'
          ? 'I am fairly confident about this'
          : result.confidence === 'medium'
            ? 'there is some uncertainty here'
            : 'the image quality makes this difficult to assess';

        responseText = `From the photo, the produce appears to be in ${result.state} condition — ${result.explanation} (${confLabel}). `
          + (result.state === 'almost-damaged'
            ? 'This is urgent. I recommend starting aggressive cooling immediately to slow further deterioration. Would you like me to update the temperature target for this device?'
            : result.state === 'in-between'
              ? 'The produce is still marketable but needs careful monitoring. Would you like me to check if your current temperature settings are appropriate?'
              : result.state === 'dried'
                ? 'Dried produce has different storage requirements — lower humidity is more important than aggressive cold. Shall I adjust the targets?'
                : 'Fresh produce is in good shape. Your current conditions should preserve it well. Is there anything specific you would like me to check?');
      }

      const assistantMsg: Message = {
        id:         thinkingId,
        role:       'assistant',
        content:    responseText,
        rawContent: responseText,
        timestamp:  new Date(),
        pending:    false,
      };
      setMessages(prev => prev.map(m => m.id === thinkingId ? assistantMsg : m));
      speak(responseText, isMuted, app.user.name);

    } catch {
      const errText = 'I had trouble reading that photo. Please try again or describe the condition in words.';
      setMessages(prev => prev.map(m =>
        m.id === thinkingId ? { ...m, content: errText, rawContent: errText, pending: false } : m
      ));
    } finally {
      setIsAnalysingImage(false);
    }
  }, [app, isAnalysingImage, isMuted]);

  // ── Toggle mute ─────────────────────────────────────────────────────────────

  const toggleMute = useCallback(() => {
    setIsMuted(prev => {
      if (!prev) cancelSpeech(); // immediately stop any current speech when muting
      return !prev;
    });
  }, []);

  // ── Replay message ──────────────────────────────────────────────────────────

  const replayMessage = useCallback((text: string) => {
    speak(text, isMuted);
  }, [isMuted]);

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            key="backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-[55]"
            style={{ backgroundColor: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(2px)' }}
            onClick={handleClose}
            aria-hidden="true"
          />

          {/* Drawer */}
          <motion.div
            key="drawer"
            ref={drawerRef}
            role="dialog"
            aria-modal="true"
            aria-label="ColdWatch AI Assistant"
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ duration: 0.3, ease: [0.25, 0.46, 0.45, 0.94] }}
            className="fixed top-0 right-0 bottom-0 z-[60] flex flex-col"
            style={{
              width: 'min(420px, 100vw)',
              backgroundColor: '#FFFFFF',
              boxShadow: '-8px 0 40px rgba(0,0,0,0.12)',
            }}
          >
            {/* ── Header ── */}
            {/* Two-row layout:
                Row 1 — avatar | name + status | close
                Row 2 (settings tray, toggleable) — language | mute | reset —
                collapsed by default, slides open via Settings2 icon on Row 1.
                This gives the name room to breathe at full width, while keeping
                all controls accessible without cluttering the title.            */}
            <div
              className="flex flex-col flex-shrink-0"
              style={{
                borderBottom: '1px solid #DBEAFE',
                background: 'linear-gradient(135deg, #EBF4FF 0%, #F0F7FF 60%, #FFFFFF 100%)',
              }}
            >
              {/* Row 1: identity + close */}
              <div className="flex items-center gap-3 px-4 py-3.5">
                {/* Animated snowflake avatar */}
                <div
                  className="w-10 h-10 rounded-2xl flex items-center justify-center flex-shrink-0"
                  style={{
                    background: 'linear-gradient(135deg, #0984E3 0%, #0652a0 100%)',
                    boxShadow: '0 4px 12px rgba(9,132,227,0.35)',
                  }}
                >
                  <motion.div
                    animate={{ rotate: 360 }}
                    transition={{ duration: 20, repeat: Infinity, ease: 'linear' }}
                  >
                    <Snowflake className="w-5 h-5 text-white" />
                  </motion.div>
                </div>

                {/* Name + status — takes all remaining width */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline gap-1.5">
                    <p
                      className="text-base font-extrabold tracking-tight"
                      style={{
                        background: 'linear-gradient(90deg, #0652a0 0%, #0984E3 100%)',
                        WebkitBackgroundClip: 'text',
                        WebkitTextFillColor: 'transparent',
                        backgroundClip: 'text',
                      }}
                    >
                      Nix 
                    </p>
                    <span className="text-[10px] font-medium text-[#93C5FD]">by ColdWatch</span>
                  </div>
                  <p className="text-xs font-medium flex items-center gap-1"
                    style={{ color: GROQ_API_KEY ? '#16A34A' : '#DC2626' }}>
                    <motion.span
                      className="w-1.5 h-1.5 rounded-full inline-block"
                      style={{ backgroundColor: GROQ_API_KEY ? '#16A34A' : '#DC2626' }}
                      animate={GROQ_API_KEY ? { opacity: [1, 0.4, 1] } : { opacity: 1 }}
                      transition={{ duration: 2, repeat: Infinity }}
                    />
                    {GROQ_API_KEY ? 'Online' : 'API key missing'}
                  </p>
                </div>

                {/* Settings tray toggle — opens Row 2 */}
                <button
                  onClick={() => setShowSettingsTray(t => !t)}
                  className="w-8 h-8 rounded-xl flex items-center justify-center transition-all active:scale-95"
                  style={{
                    border: `1px solid ${showSettingsTray ? '#BFDBFE' : '#E4E7EC'}`,
                    backgroundColor: showSettingsTray ? '#EBF4FF' : '#F9FAFB',
                  }}
                  aria-label="Assistant settings"
                  aria-expanded={showSettingsTray}
                  title="Language, voice, and reset"
                >
                  <Settings2 className="w-3.5 h-3.5" style={{ color: showSettingsTray ? '#0984E3' : '#6B7280' }} />
                </button>

                {/* Close */}
                <button
                  onClick={handleClose}
                  className="w-8 h-8 rounded-xl flex items-center justify-center transition-all active:scale-95"
                  style={{ border: '1px solid #E4E7EC', backgroundColor: '#F9FAFB' }}
                  aria-label="Close assistant"
                >
                  <X className="w-4 h-4 text-[#374151]" />
                </button>
              </div>

              {/* Row 2: settings tray — language, mute, reset */}
              <AnimatePresence initial={false}>
                {showSettingsTray && (
                  <motion.div
                    key="settings-tray"
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.2, ease: [0.25, 0.46, 0.45, 0.94] }}
                    style={{ overflow: 'hidden' }}
                  >
                    <div
                      className="flex items-center gap-2 px-4 pb-3 pt-0"
                      style={{ borderTop: '1px solid #DBEAFE' }}
                    >
                      {/* Language toggle */}
                      <button
                        onClick={() => setLang(l => l === 'en' ? 'tw' : 'en')}
                        className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium transition-all active:scale-95 flex-1"
                        style={{ border: '1px solid #E4E7EC', backgroundColor: '#F9FAFB', color: '#374151' }}
                        aria-label="Switch language"
                        title={`Switch to ${lang === 'en' ? LANG_CONFIG.tw.label : LANG_CONFIG.en.label}`}
                      >
                        <Globe className="w-3.5 h-3.5 text-[#6B7280]" />
                        {LANG_CONFIG[lang].flag} {LANG_CONFIG[lang].label}
                      </button>

                      {/* Mute toggle — only when TTS is supported */}
                      {ttsSupported && (
                        <button
                          onClick={toggleMute}
                          className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium transition-all active:scale-95"
                          style={{
                            border: `1px solid ${isMuted ? '#FCA5A5' : '#E4E7EC'}`,
                            backgroundColor: isMuted ? '#FEF2F2' : '#F9FAFB',
                            color: isMuted ? '#EF4444' : '#374151',
                          }}
                          aria-label={isMuted ? 'Unmute voice' : 'Mute voice'}
                          title={isMuted ? 'Voice muted — tap to unmute' : 'Voice on — tap to mute'}
                        >
                          {isMuted
                            ? <VolumeX className="w-3.5 h-3.5" style={{ color: '#EF4444' }} />
                            : <Volume2 className="w-3.5 h-3.5" style={{ color: '#0984E3' }} />
                          }
                          {isMuted ? 'Muted' : 'Voice on'}
                        </button>
                      )}

                      {/* Reset conversation */}
                      <button
                        onClick={() => { resetConversation(); setShowSettingsTray(false); }}
                        className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium transition-all active:scale-95"
                        style={{ border: '1px solid #E4E7EC', backgroundColor: '#F9FAFB', color: '#374151' }}
                        aria-label="Reset conversation"
                        title="Clear chat and start fresh"
                      >
                        <RotateCcw className="w-3.5 h-3.5 text-[#6B7280]" />
                        Reset
                      </button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
            {/* ── Live status bar ── */}
            <StatusBar app={app} />

            {/* ── Messages ── */}
            <div
              className="flex-1 overflow-y-auto px-3 py-4 space-y-3"
              style={{ backgroundColor: '#F0F7FF' }}
            >
              {/* Empty state — shown while smart greeting is loading on first open */}
              {messages.length === 0 && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="flex flex-col items-center justify-center h-32 gap-3"
                >
                  <motion.div
                    animate={{ rotate: 360 }}
                    transition={{ duration: 12, repeat: Infinity, ease: 'linear' }}
                    style={{ color: '#BFDBFE' }}
                  >
                    <Snowflake className="w-10 h-10" />
                  </motion.div>
                  <p className="text-xs text-[#93C5FD] font-medium">Starting up…</p>
                </motion.div>
              )}

              {messages.map(msg => (
                <MessageBubble
                  key={msg.id}
                  msg={msg}
                  muted={isMuted}
                  onReplay={replayMessage}
                />
              ))}

              {/* Quick prompt chips — shown only on greeting */}
              {showQuickChips && messages.length === 1 && (
                <motion.div
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.3 }}
                  className="flex flex-col gap-2 pt-1"
                >
                  {QUICK_PROMPTS[lang].map((prompt, i) => {
                    const isUrgentChip = prompt.startsWith('⚡');
                    return (
                      <button
                        key={i}
                        onClick={() => sendMessage(prompt)}
                        className="text-left px-3.5 py-2.5 rounded-2xl text-xs font-medium transition-all active:scale-[0.98]"
                        style={isUrgentChip ? {
                          border: '1px solid #FDE68A',
                          backgroundColor: '#FFFBEB',
                          color: '#92400E',
                          fontWeight: 600,
                        } : {
                          border: '1px solid #BFDBFE',
                          backgroundColor: '#F0F7FF',
                          color: '#1E40AF',
                        }}
                      >
                        {prompt}
                      </button>
                    );
                  })}
                </motion.div>
              )}

              <div ref={messagesEndRef} />
            </div>

            {/* ── Voice listening status ── */}
            <AnimatePresence>
              {voiceState === 'listening' && (
                <div className="px-3">
                  <VoiceStatusPill voiceState={voiceState} lang={lang} />
                </div>
              )}
            </AnimatePresence>

            {/* ── Action confirm banner ── */}
            <AnimatePresence>
              {pendingAction && (
                <ActionConfirmBanner
                  key="action-banner"
                  action={pendingAction.action}
                  lang={lang}
                  onConfirm={confirmAction}
                  onDismiss={dismissAction}
                />
              )}
            </AnimatePresence>

            {/* ── Input area ── */}
            <div
              className="flex-shrink-0 px-3 py-3"
              style={{
                borderTop: '1px solid #E4E7EC',
                backgroundColor: '#FFFFFF',
                paddingBottom: 'calc(env(safe-area-inset-bottom) + 12px)',
              }}
            >
              {/* Hidden camera input — opens rear camera on mobile, file picker on desktop */}
              <input
                ref={cameraInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={e => {
                  const file = e.target.files?.[0];
                  if (file) handleImageCapture(file);
                  e.target.value = '';
                }}
              />

              <div
                className="flex items-center gap-2 px-3 py-2 rounded-2xl"
                style={{
                  border: `1px solid ${voiceState === 'listening' ? '#FCA5A5' : '#E4E7EC'}`,
                  backgroundColor: '#F9FAFB',
                  transition: 'border-color 0.2s',
                }}
              >
                {/* Camera button — for produce photo assessment */}
                <button
                  onClick={() => cameraInputRef.current?.click()}
                  disabled={isLoading || isAnalysingImage || voiceState !== 'idle'}
                  className="w-8 h-8 rounded-xl flex items-center justify-center transition-all active:scale-95 flex-shrink-0 disabled:opacity-40"
                  style={{ backgroundColor: '#F3F4F6', border: '1px solid #E5E7EB' }}
                  aria-label="Share produce photo for AI assessment"
                  title="Take or upload a photo of your produce for AI condition assessment"
                >
                  {isAnalysingImage
                    ? <Loader2 className="w-4 h-4 text-[#0984E3] animate-spin" />
                    : <Camera className="w-4 h-4 text-[#6B7280]" />
                  }
                </button>

                {/* Mic button — hidden if STT not supported */}
                {sttSupported ? (
                  <button
                    onClick={startRecognition}
                    disabled={isLoading || voiceState === 'processing'}
                    className="w-8 h-8 rounded-xl flex items-center justify-center transition-all active:scale-95 flex-shrink-0 disabled:opacity-40"
                    style={{
                      backgroundColor: voiceState === 'listening' ? '#FEE2E2' : '#F3F4F6',
                      border: `1px solid ${voiceState === 'listening' ? '#FECACA' : '#E5E7EB'}`,
                    }}
                    aria-label={voiceState === 'listening' ? 'Stop listening' : cfg.voiceHint}
                    title={sttSupported ? cfg.voiceHint : cfg.voiceNotSupported}
                  >
                    {voiceState === 'listening'
                      ? <MicOff className="w-4 h-4" style={{ color: '#EF4444' }} />
                      : <Mic className="w-4 h-4 text-[#6B7280]" />
                    }
                  </button>
                ) : null}

                <input
                  ref={inputRef}
                  type="text"
                  value={input}
                  onChange={e => setInput(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      sendMessage(input);
                    }
                  }}
                  placeholder={voiceState === 'listening' ? cfg.voiceListening : cfg.placeholder}
                  disabled={isLoading || voiceState === 'listening'}
                  maxLength={1000}
                  className="flex-1 bg-transparent outline-none text-sm text-[#111827] placeholder:text-[#9CA3AF] disabled:opacity-60"
                  aria-label="Message input"
                />

                <button
                  onClick={() => sendMessage(input)}
                  disabled={!input.trim() || isLoading || voiceState === 'listening'}
                  className="w-8 h-8 rounded-xl flex items-center justify-center transition-all active:scale-95 disabled:opacity-40 flex-shrink-0"
                  style={{ backgroundColor: '#0984E3' }}
                  aria-label="Send message"
                >
                  {isLoading || voiceState === 'processing'
                    ? <Loader2 className="w-4 h-4 text-white animate-spin" />
                    : <Send className="w-4 h-4 text-white" />
                  }
                </button>
              </div>


            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}