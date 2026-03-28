import { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { useApp } from '../context/AppContext';
import {
  X, Send, Bot, ChevronDown,
  Thermometer, Droplets, Zap, CheckCheck,
  AlertTriangle, Globe, RotateCcw, Loader2,
  Mic, MicOff, Volume2, VolumeX, Play,
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
    | 'ACKNOWLEDGE_ALL_ALERTS';
  value?: number | boolean | string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const GEMINI_API_KEY = import.meta.env.VITE_GEMINI_API_KEY ?? '';
const GEMINI_URL =
  'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent';

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
  if (!GEMINI_API_KEY) return text;

  const prompt = `You are a translator. Your only job is to translate the text below into English.
Rules:
- If the text is already in English, return it exactly as written — do not change a single word.
- If the text is in Twi, Ga, Ga-Adangbe, Hausa, or any other language, translate it to clear English.
- Return ONLY the translated text. No explanation, no preamble, no quotation marks.
- If you cannot identify or translate the language at all, return the original text unchanged.

Text to translate:
${text}`;

  try {
    const res = await fetch(`${GEMINI_URL}?key=${GEMINI_API_KEY}`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: {
          temperature:     0.0,   // Deterministic — translation, not creativity
          maxOutputTokens: 300,
          topP:            1.0,
          topK:            1,
        },
      }),
    });

    if (!res.ok) return text; // Silent fallback — don't block the main request

    const data        = await res.json();
    const translated  = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ?? '';
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
    errorKey: 'The AI service is not configured. Please add the VITE_GEMINI_API_KEY to your environment.',
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
    errorKey: 'AI seviis no nni hɔ. Fa VITE_GEMINI_API_KEY to wo environment mu.',
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

LANGUAGE RULE: Always respond in clear, simple English. Your responses will be spoken aloud to the user. Keep sentences short and natural for speech. Avoid bullet points or markdown in your response — write in plain conversational paragraphs only. The user may speak to you in Twi, English, Ga, Hausa, or any other language — always reply in English.

UNKNOWN INPUT RULE: User messages will be pre-translated to English before reaching you. However, if a message still arrives that you genuinely cannot understand or interpret — even in context — do NOT guess or make up a response. Instead reply with exactly: "I'm sorry, I didn't quite understand that. Could you please rephrase it in English?" This is safer than a confident wrong answer for a farmer making real decisions.

YOUR CAPABILITIES:
- Advise on optimal temperature and humidity for any produce type or state
- Interpret current sensor readings and explain what they mean for the stored produce
- Help set temperature and humidity targets
- Explain alerts and recommend corrective actions that will bring conditions back to safe levels
- Estimate shelf life impact of current conditions
- Advise on meat, fish, fruits, vegetables, tubers, legumes, leafy greens, and dried produce
- Understand and respond to instructions in both English and Twi

AUTO-RESOLVE AWARENESS:
When there is an active breach alert, the correct approach is to take corrective action — lower the target temperature, start cooling, or enable auto mode. When conditions return to safe levels, the system automatically resolves the alert. Do NOT manually dismiss active breach alerts. Instead, fix the conditions. Tell the user clearly: "Once the temperature returns to the safe range, the system will resolve the alert automatically."

CURRENT APP STATE:
${JSON.stringify(appContext, null, 2)}

EXECUTING ACTIONS:
If the user asks you to change a setting or perform an action, include a JSON block at the very end of your response (after your explanation) in this exact format:
<ACTION>{"type":"SET_TARGET_TEMP","value":8}</ACTION>

Available action types:
- SET_TARGET_TEMP: value = number (°C) — use this to correct a temperature breach
- SET_TARGET_HUMIDITY: value = number (%) — use this to correct a humidity breach
- SET_AUTO_MODE: value = true | false — enable auto mode to let the system self-correct
- START_COOLING — engage cooling to bring temperature down during a breach
- STOP_COOLING
- ACKNOWLEDGE_ALERT: value = alertId string — only for non-breach informational alerts
- ACKNOWLEDGE_ALL_ALERTS — only when all active alerts are informational, not active breaches

SAFETY RULES:
- Never suggest temperatures below 0°C for non-meat produce.
- Never suggest temperatures above 25°C as a storage target.
- Warn if requested settings seem outside safe ranges.
- Always explain WHAT you are changing and WHY before including the ACTION block.
- If you are not changing anything, do NOT include an ACTION block.
- For active breach alerts, always recommend fixing conditions first rather than dismissing the alert.

TONE:
- Friendly, practical, and concise. Farmers need clear answers, not lectures.
- Acknowledge uncertainty — if you are not sure, say so.
- Use local context: reference Ghanaian produce types, seasonal patterns, and local conditions where relevant.
- Since your response will be spoken aloud, write as if you are speaking — naturally and conversationally.`;
}

// ─── App context snapshot ─────────────────────────────────────────────────────

function buildAppContext(app: ReturnType<typeof useApp>) {
  const selectedDevice = app.devices.find(d => d.id === app.selectedDeviceId);
  const activeAlerts   = app.alerts.filter(a => a.status === 'new' || a.status === 'acknowledged');
  const breachAlerts   = activeAlerts.filter(a => a.severity === 'critical' || a.severity === 'warning');

  return {
    selectedDevice: selectedDevice
      ? {
          name:           selectedDevice.name,
          location:       selectedDevice.location,
          status:         selectedDevice.status,
          produceMode:    selectedDevice.produceMode   ?? 'not set',
          produceState:   selectedDevice.produceState  ?? 'not set',
          facilitySize:   selectedDevice.facilitySize  ?? 'not set',
          transportHours: selectedDevice.transportHours ?? 'not set',
        }
      : null,
    readings: {
      currentTemperature: app.currentTemperature,
      currentHumidity:    app.currentHumidity,
      targetTemperature:  app.targetTemperature,
      targetHumidity:     app.targetHumidity,
      systemStatus:       app.systemStatus,
      autoMode:           app.autoMode,
      // Tell the AI whether the device is currently in a breach condition
      temperatureBreached: app.currentTemperature > app.targetTemperature + 1,
      humidityBreached:    Math.abs(app.currentHumidity - app.targetHumidity) > 5,
    },
    alerts: {
      total:         activeAlerts.length,
      unread:        app.unreadAlertCount,
      activeBreaches: breachAlerts.length,
      // Pass breach alert IDs so AI can reference them precisely
      items: activeAlerts.slice(0, 5).map(a => ({
        id:       a.id,
        severity: a.severity,
        message:  a.message,
        device:   a.deviceName,
        isBreach: a.severity !== 'info',
      })),
    },
    user: {
      name: app.user.name,
      role: app.user.role ?? 'user',
    },
    totalDevices: app.devices.length,
  };
}

// ─── Parse AI action from response ───────────────────────────────────────────

function parseAction(raw: string): { display: string; action: AIAction | null } {
  const actionMatch = raw.match(/<ACTION>([\s\S]*?)<\/ACTION>/);
  if (!actionMatch) return { display: raw.trim(), action: null };

  const display = raw.replace(/<ACTION>[\s\S]*?<\/ACTION>/, '').trim();
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
      default:
        return false;
    }
  } catch {
    return false;
  }
}

// ─── Text-to-speech helper ────────────────────────────────────────────────────
// Wraps the Web Speech API's SpeechSynthesis. Always speaks in English.
// Cancels any ongoing speech before starting a new utterance.

function speak(text: string, muted: boolean): void {
  if (muted || !('speechSynthesis' in window)) return;

  // Strip any leftover markdown or action tags before speaking
  const clean = text
    .replace(/<ACTION>[\s\S]*?<\/ACTION>/g, '')
    .replace(/[*_`#>]/g, '')
    .trim();

  if (!clean) return;

  window.speechSynthesis.cancel();
  const utter = new SpeechSynthesisUtterance(clean);

  // Pick the best available English voice — prefer en-GB or en-US
  const voices = window.speechSynthesis.getVoices();
  const preferred = voices.find(v => v.lang === 'en-GB') ??
                    voices.find(v => v.lang === 'en-US') ??
                    voices.find(v => v.lang.startsWith('en')) ??
                    null;
  if (preferred) utter.voice = preferred;

  utter.lang  = 'en-GB';
  utter.rate  = 0.95;   // Slightly slower than default — easier to understand
  utter.pitch = 1.0;
  utter.volume = 1.0;

  window.speechSynthesis.speak(utter);
}

function cancelSpeech(): void {
  if ('speechSynthesis' in window) window.speechSynthesis.cancel();
}

// ─── Quick prompt chips ───────────────────────────────────────────────────────

const QUICK_PROMPTS: Record<Language, string[]> = {
  en: [
    'What are my current readings?',
    'Are my conditions safe for the produce?',
    'What temperature should I set?',
    'Explain my active alerts',
    'How long will my produce last?',
  ],
  tw: [
    'Me readings deɛn na ɛte saa?',
    'Me aduan ho yɛ saa anaa?',
    'Temperature bɛn na mɛhyehyɛ?',
    'Kyerɛ me alert a ɛwɔ hɔ no',
    'Me aduan bɛtena ahe?',
  ],
};

// ─── Sub-components ───────────────────────────────────────────────────────────

function TypingIndicator() {
  return (
    <div className="flex items-center gap-1.5 px-3 py-2">
      {[0, 1, 2].map(i => (
        <motion.div
          key={i}
          className="w-2 h-2 rounded-full"
          style={{ backgroundColor: '#0984E3' }}
          animate={{ y: [0, -5, 0], opacity: [0.4, 1, 0.4] }}
          transition={{ duration: 0.8, repeat: Infinity, delay: i * 0.15 }}
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
  return (
    <div className="flex items-center gap-3 px-4 py-2 flex-wrap"
      style={{ backgroundColor: '#F8FAFC', borderBottom: '1px solid #E4E7EC' }}>
      <div className="flex items-center gap-1.5">
        <Thermometer className="w-3.5 h-3.5" style={{ color: '#0984E3' }} />
        <span className="text-xs font-semibold text-[#111827]">{app.currentTemperature.toFixed(1)}°C</span>
        <span className="text-xs text-[#6B7280]">→ {app.targetTemperature}°C</span>
      </div>
      <div className="flex items-center gap-1.5">
        <Droplets className="w-3.5 h-3.5" style={{ color: '#0984E3' }} />
        <span className="text-xs font-semibold text-[#111827]">{app.currentHumidity.toFixed(0)}%</span>
        <span className="text-xs text-[#6B7280]">→ {app.targetHumidity}%</span>
      </div>
      {app.unreadAlertCount > 0 && (
        <div className="flex items-center gap-1">
          <AlertTriangle className="w-3 h-3" style={{ color: '#D97706' }} />
          <span className="text-xs font-medium" style={{ color: '#D97706' }}>
            {app.unreadAlertCount} alert{app.unreadAlertCount !== 1 ? 's' : ''}
          </span>
        </div>
      )}
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
          style={{ backgroundColor: '#EBF4FF' }}
        >
          <Bot className="w-3.5 h-3.5" style={{ color: '#0984E3' }} />
        </div>
      )}

      <div className={`max-w-[80%] ${isUser ? 'items-end' : 'items-start'} flex flex-col gap-1`}>
        <div
          className="px-3.5 py-2.5 rounded-2xl text-sm leading-relaxed"
          style={
            isUser
              ? { backgroundColor: '#0984E3', color: '#FFFFFF', borderBottomRightRadius: 4 }
              : { backgroundColor: '#F3F4F6', color: '#111827', borderBottomLeftRadius: 4 }
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

  const [messages,        setMessages]        = useState<Message[]>([]);
  const [input,           setInput]           = useState('');
  const [isLoading,       setIsLoading]       = useState(false);
  const [pendingAction,   setPendingAction]   = useState<{ action: AIAction; msgId: string } | null>(null);
  const [showQuickChips,  setShowQuickChips]  = useState(true);

  // Voice state
  const [voiceState,      setVoiceState]      = useState<VoiceState>('idle');
  const [isMuted,         setIsMuted]         = useState(false);
  const [sttSupported,    setSttSupported]    = useState(false);
  const [ttsSupported,    setTtsSupported]    = useState(false);

  const recognitionRef    = useRef<SpeechRecognitionInstance | null>(null);
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

  // Initialise greeting when language changes or drawer first opens
  useEffect(() => {
    if (!isOpen) return;
    setMessages([{
      id:         'greeting',
      role:       'assistant',
      content:    LANG_CONFIG[lang].greeting,
      rawContent: LANG_CONFIG[lang].greeting,
      timestamp:  new Date(),
    }]);
    setShowQuickChips(true);
    setPendingAction(null);
  }, [isOpen, lang]);

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
      if (e.key === 'Escape') {
        cancelSpeech();
        onClose();
      }
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

    if (!GEMINI_API_KEY) {
      setMessages(prev => prev.map(m =>
        m.pending ? { ...m, content: cfg.errorKey, rawContent: cfg.errorKey, pending: false } : m
      ));
      setIsLoading(false);
      speak(cfg.errorKey, isMuted);
      return;
    }

    try {
      // ── Build all synchronous context immediately ──────────────────────────
      // This work happens while the translation call is in flight (for non-English)
      // so it does not add to the user-perceived wait time.
      const historyForGemini = messages
        .filter(m => m.id !== 'greeting' && !m.pending)
        .map(m => ({
          role:  m.role === 'user' ? 'user' : 'model',
          parts: [{ text: m.rawContent }],
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

      // ── Main assistant call ────────────────────────────────────────────────
      const body = {
        system_instruction: {
          parts: [{ text: systemPrompt }],
        },
        contents: [
          ...historyForGemini,
          { role: 'user', parts: [{ text: queryForAI }] },
        ],
        generationConfig: {
          temperature:     0.4,
          maxOutputTokens: 512,
          topP:            0.8,
          topK:            40,
        },
        safetySettings: [
          { category: 'HARM_CATEGORY_HARASSMENT',        threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
          { category: 'HARM_CATEGORY_HATE_SPEECH',       threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
          { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
          { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
        ],
      };

      const res = await fetch(`${GEMINI_URL}?key=${GEMINI_API_KEY}`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(body),
      });

      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        const errMsg  = (errBody as any)?.error?.message ?? `HTTP ${res.status}`;
        throw new Error(errMsg);
      }

      const data    = await res.json();
      const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
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
      speak(display, isMuted);

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
      speak(cfg.errorNet, isMuted);
    } finally {
      setIsLoading(false);
    }
  }, [app, isLoading, lang, messages, cfg, isMuted]);

  // ── Confirm pending action ──────────────────────────────────────────────────

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
      speak(label, isMuted);
    }
    setPendingAction(null);
  }, [pendingAction, app, isMuted]);

  const dismissAction = useCallback(() => {
    setPendingAction(null);
  }, []);

  // ── Reset conversation ──────────────────────────────────────────────────────

  const resetConversation = useCallback(() => {
    cancelSpeech();
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
  }, [cfg]);

  // ── Voice input ─────────────────────────────────────────────────────────────

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
            onClick={() => { cancelSpeech(); onClose(); }}
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
            <div
              className="flex items-center gap-3 px-4 py-3.5 flex-shrink-0"
              style={{ borderBottom: '1px solid #E4E7EC', backgroundColor: '#FFFFFF' }}
            >
              <div
                className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
                style={{ backgroundColor: '#EBF4FF' }}
              >
                <Bot className="w-5 h-5" style={{ color: '#0984E3' }} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-[#111827]">ColdWatch AI</p>
                <p className="text-xs font-medium flex items-center gap-1"
                  style={{ color: GEMINI_API_KEY ? '#16A34A' : '#DC2626' }}>
                  <span className="w-1.5 h-1.5 rounded-full inline-block"
                    style={{ backgroundColor: GEMINI_API_KEY ? '#16A34A' : '#DC2626' }} />
                  {GEMINI_API_KEY ? 'Online' : 'API key missing'}
                </p>
              </div>

              {/* Mute toggle — only shown when TTS is supported */}
              {ttsSupported && (
                <button
                  onClick={toggleMute}
                  className="w-8 h-8 rounded-xl flex items-center justify-center transition-all active:scale-95"
                  style={{
                    border: `1px solid ${isMuted ? '#FCA5A5' : '#E4E7EC'}`,
                    backgroundColor: isMuted ? '#FEF2F2' : '#F9FAFB',
                  }}
                  aria-label={isMuted ? 'Unmute voice' : 'Mute voice'}
                  title={isMuted ? 'Voice muted — tap to unmute' : 'Voice on — tap to mute'}
                >
                  {isMuted
                    ? <VolumeX className="w-3.5 h-3.5" style={{ color: '#EF4444' }} />
                    : <Volume2 className="w-3.5 h-3.5" style={{ color: '#0984E3' }} />
                  }
                </button>
              )}

              {/* Language toggle */}
              <button
                onClick={() => setLang(l => l === 'en' ? 'tw' : 'en')}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium transition-all active:scale-95"
                style={{ border: '1px solid #E4E7EC', backgroundColor: '#F9FAFB', color: '#374151' }}
                aria-label="Switch language"
                title={`Switch to ${lang === 'en' ? LANG_CONFIG.tw.label : LANG_CONFIG.en.label}`}
              >
                <Globe className="w-3.5 h-3.5" />
                {LANG_CONFIG[lang].flag} {LANG_CONFIG[lang].label}
                <ChevronDown className="w-3 h-3 text-[#9CA3AF]" />
              </button>

              {/* Reset */}
              <button
                onClick={resetConversation}
                className="w-8 h-8 rounded-xl flex items-center justify-center transition-all active:scale-95"
                style={{ border: '1px solid #E4E7EC', backgroundColor: '#F9FAFB' }}
                aria-label="Reset conversation"
                title="Reset conversation"
              >
                <RotateCcw className="w-3.5 h-3.5 text-[#6B7280]" />
              </button>

              {/* Close */}
              <button
                onClick={() => { cancelSpeech(); onClose(); }}
                className="w-8 h-8 rounded-xl flex items-center justify-center transition-all active:scale-95"
                style={{ border: '1px solid #E4E7EC', backgroundColor: '#F9FAFB' }}
                aria-label="Close assistant"
              >
                <X className="w-4 h-4 text-[#374151]" />
              </button>
            </div>

            {/* ── Live status bar ── */}
            <StatusBar app={app} />

            {/* ── Messages ── */}
            <div className="flex-1 overflow-y-auto px-3 py-4 space-y-3">
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
                  {QUICK_PROMPTS[lang].map((prompt, i) => (
                    <button
                      key={i}
                      onClick={() => sendMessage(prompt)}
                      className="text-left px-3.5 py-2.5 rounded-2xl text-xs font-medium transition-all active:scale-[0.98]"
                      style={{
                        border: '1px solid #BFDBFE',
                        backgroundColor: '#EBF4FF',
                        color: '#1E40AF',
                      }}
                    >
                      {prompt}
                    </button>
                  ))}
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
              <div
                className="flex items-center gap-2 px-3 py-2 rounded-2xl"
                style={{
                  border: `1px solid ${voiceState === 'listening' ? '#FCA5A5' : '#E4E7EC'}`,
                  backgroundColor: '#F9FAFB',
                  transition: 'border-color 0.2s',
                }}
              >
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

              {/* Voice language note */}
              {sttSupported && (
                <p className="text-center text-[10px] text-[#9CA3AF] mt-1.5">
                  🎤 Speak in English or Twi · AI replies in English
                </p>
              )}
              <p className="text-center text-[10px] text-[#9CA3AF] mt-0.5">
                AI advice is a guide — always verify critical decisions.
              </p>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}