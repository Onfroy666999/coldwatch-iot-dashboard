import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Cpu, MapPin, Wifi, WifiOff, Battery, Info, Plus, ChevronRight, ChevronLeft,
  Signal, Settings2, X, Check, Trash2, AlertTriangle, Camera, Upload,
  Loader2, RefreshCw, CheckCircle2,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import type { Device, ProduceMode, ProduceState } from '../context/AppContext';
import { getStateAdjustedTargets } from '../context/AppContext';
import { usePageLoading, DevicesSkeleton } from '../components/Skeleton';

// ── Module-level helpers ───────────────────────────────────────────────────────

function timeAgo(d: Date) {
  const s = Math.floor((Date.now() - d.getTime()) / 1000);
  if (s < 60)    return `${s}s ago`;
  if (s < 3600)  return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

const getBatteryColor = (level: number) =>
  level > 50 ? '#27AE60' : level > 20 ? '#E67E22' : '#C0392B';

// ── Gemini image analysis ─────────────────────────────────────────────────────

const GEMINI_API_KEY = import.meta.env.VITE_GEMINI_API_KEY ?? '';

async function analyseProduceImage(
  base64Image: string,
  mimeType: string,
  produceLabel: string
): Promise<{ state: ProduceState; confidence: 'high' | 'medium' | 'low'; explanation: string }> {
  const prompt = `You are a cold chain expert assessing post-harvest produce quality for a Ghanaian cold storage system.

The image shows: ${produceLabel}

Classify the produce into EXACTLY ONE of these four conditions:
- fresh: just harvested, vibrant colour, firm texture, no visible damage
- in-between: some time has passed, slight softening or colour change, still marketable
- dried: fully dried or cured produce (like dried cassava, stockfish, groundnuts)
- almost-damaged: visible rot, mould, bruising, extreme softening, or discolouration — needs urgent cold

Even if the image quality is low or blurry, make your best assessment based on visible colour, texture, and shape.

Respond with ONLY valid JSON (no markdown, no extra text):
{"state":"fresh|in-between|dried|almost-damaged","confidence":"high|medium|low","explanation":"One sentence describing what you see"}`;

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          parts: [
            { text: prompt },
            { inline_data: { mime_type: mimeType, data: base64Image } },
          ],
        }],
        generationConfig: { temperature: 0.1, maxOutputTokens: 200 },
      }),
    }
  );

  if (!response.ok) throw new Error('Gemini API request failed');

  const data = await response.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
  const clean = text.replace(/```json|```/g, '').trim();
  const parsed = JSON.parse(clean);

  // Validate the state value
  const validStates: ProduceState[] = ['fresh', 'in-between', 'dried', 'almost-damaged'];
  if (!validStates.includes(parsed.state)) throw new Error('Invalid state from AI');

  return {
    state: parsed.state as ProduceState,
    confidence: parsed.confidence ?? 'medium',
    explanation: parsed.explanation ?? '',
  };
}

// Convert a File to base64
function fileToBase64(file: File): Promise<{ base64: string; mimeType: string }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      const base64 = result.split(',')[1];
      resolve({ base64, mimeType: file.type || 'image/jpeg' });
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// ── Wizard data ───────────────────────────────────────────────────────────────

const WIZARD_PRODUCE = [
  { id: 'mixed',   label: 'Mixed Produce',  tagline: 'Various crop types',        color: '#1A65B5', tint: '#EBF3FD', emoji: '🥕' },
  { id: 'tubers',  label: 'Tubers',         tagline: 'Cassava, Yam, Cocoyam',     color: '#B84A00', tint: '#FEF0E7', emoji: '🥔' },
  { id: 'fruits',  label: 'Fruits',         tagline: 'Mango, Pineapple, Banana',  color: '#1A7A3F', tint: '#E6F6EC', emoji: '🥭' },
  { id: 'leafy',   label: 'Leafy Veg',      tagline: 'Lettuce, Cabbage, Kontomire', color: '#0E7A62', tint: '#E6F6F2', emoji: '🥬' },
  { id: 'legumes', label: 'Legumes',        tagline: 'Cowpea, Groundnuts',        color: '#7A5A2E', tint: '#F8F2EA', emoji: '🌿' },
  { id: 'meat',    label: 'Meat & Fish',    tagline: 'Chicken, Beef, Tilapia',    color: '#B91C1C', tint: '#FEF2F2', emoji: '🍗' },
] as const;

const PRODUCE_STATES: { id: ProduceState; label: string; desc: string; color: string; tint: string; emoji: string }[] = [
  { id: 'fresh',          label: 'Still Fresh',    desc: 'Just harvested or recently received',   color: '#1A7A3F', tint: '#E6F6EC', emoji: '🟢' },
  { id: 'in-between',     label: 'In-Between',     desc: 'Some time has passed since harvest',    color: '#E67E22', tint: '#FEF5EC', emoji: '🟡' },
  { id: 'dried',          label: 'Dried / Cured',  desc: 'Processed, dried, or cured produce',    color: '#7A5A2E', tint: '#F8F2EA', emoji: '🟤' },
  { id: 'almost-damaged', label: 'Almost Damaged', desc: 'Needs urgent cooling to slow spoilage', color: '#C0392B', tint: '#FDEDEC', emoji: '🔴' },
];

const FACILITY_SIZES = [
  { id: 'small',  label: 'Small',  desc: 'Under 10 m²  ·  Personal or farm-scale',   color: '#0984E3' },
  { id: 'medium', label: 'Medium', desc: '10–50 m²  ·  Cooperative or small trader', color: '#0984E3' },
  { id: 'large',  label: 'Large',  desc: 'Over 50 m²  ·  Warehouse or distributor',  color: '#0984E3' },
] as const;

type WizardProduceId = typeof WIZARD_PRODUCE[number]['id'];
type FacilitySizeId   = typeof FACILITY_SIZES[number]['id'];

function estimateShelfLife(
  produceId: WizardProduceId,
  state: ProduceState,
  transportHours: number
): { hours: number; label: string; color: string } {
  const BASE: Record<WizardProduceId, number> = {
    mixed: 168, tubers: 336, fruits: 96, leafy: 48, legumes: 720, meat: 72,
  };
  const STATE_MULT: Record<ProduceState, number> = {
    fresh: 1.0, 'in-between': 0.65, dried: 1.4, 'almost-damaged': 0.3,
  };
  const hours  = Math.max(4, Math.round((BASE[produceId] - transportHours * 1.5) * STATE_MULT[state]));
  const color  = hours < 24 ? '#C0392B' : hours < 72 ? '#E67E22' : '#27AE60';
  const label  = hours < 24  ? `~${hours}h — urgent`
               : hours < 48  ? `~${hours}h — act soon`
               : hours < 168 ? `~${Math.round(hours / 24)} days`
               :               `~${Math.round(hours / 24 / 7)} weeks`;
  return { hours, label, color };
}

// ── Step indicator ────────────────────────────────────────────────────────────

function WizardPills({ step }: { step: number }) {
  const labels = ['Device', 'Produce', 'Facility', 'Done'];
  return (
    <div className="flex gap-2 items-center">
      {labels.map((l, i) => (
        <div key={i} className="flex flex-col items-center gap-0.5">
          <motion.div
            animate={{
              width: i === step ? 28 : 8,
              backgroundColor: i < step ? '#0984E360' : i === step ? '#0984E3' : '#E4E7EC',
            }}
            transition={{ duration: 0.25 }}
            style={{ height: 5, borderRadius: 99 }}
          />
          {i === step && <span className="text-[9px] font-semibold text-[#0984E3]">{l}</span>}
        </div>
      ))}
    </div>
  );
}

// ── AI Result Card ────────────────────────────────────────────────────────────

function AIResultCard({
  result,
  previewUrl,
  onConfirm,
  onRetake,
}: {
  result: { state: ProduceState; confidence: 'high' | 'medium' | 'low'; explanation: string };
  previewUrl: string;
  onConfirm: (state: ProduceState) => void;
  onRetake: () => void;
}) {
  const stateInfo = PRODUCE_STATES.find(s => s.id === result.state)!;
  const confColor = result.confidence === 'high' ? '#27AE60' : result.confidence === 'medium' ? '#E67E22' : '#6B7280';
  const confLabel = result.confidence === 'high' ? 'High confidence' : result.confidence === 'medium' ? 'Medium confidence' : 'Low confidence — consider verifying';

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
      className="rounded-2xl overflow-hidden border border-[#E4E7EC]">
      {/* Image preview */}
      <div className="relative h-40 bg-[#F3F4F6] overflow-hidden">
        <img src={previewUrl} alt="Produce photo" className="w-full h-full object-cover" />
        <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent" />
        <div className="absolute bottom-2 left-3 right-3 flex items-center justify-between">
          <span className="text-white text-xs font-semibold drop-shadow">AI Analysis</span>
          <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full"
            style={{ backgroundColor: confColor, color: '#fff' }}>
            {confLabel}
          </span>
        </div>
      </div>

      {/* Result */}
      <div className="p-4 bg-white space-y-3">
        <div className="flex items-center gap-3">
          <span style={{ fontSize: 28 }}>{stateInfo.emoji}</span>
          <div>
            <p className="text-sm font-bold" style={{ color: stateInfo.color }}>
              Detected: {stateInfo.label}
            </p>
            <p className="text-xs text-[#6B7280] mt-0.5 leading-relaxed">{result.explanation}</p>
          </div>
        </div>

        <div className="flex gap-2 pt-1">
          <button onClick={onRetake}
            className="flex-1 py-2.5 rounded-xl border border-[#E4E7EC] text-[#6B7280] text-xs font-semibold active:bg-[#F3F4F6] flex items-center justify-center gap-1.5">
            <RefreshCw className="w-3.5 h-3.5" /> Retake
          </button>
          <button onClick={() => onConfirm(result.state)}
            className="flex-1 py-2.5 rounded-xl text-white text-xs font-bold active:scale-[0.98] flex items-center justify-center gap-1.5"
            style={{ backgroundColor: stateInfo.color }}>
            <CheckCircle2 className="w-3.5 h-3.5" /> Confirm
          </button>
        </div>
      </div>
    </motion.div>
  );
}

// ── Add Device Wizard ─────────────────────────────────────────────────────────

function AddDeviceModal({ onClose, onGoToSettings }: { onClose: () => void; onGoToSettings: () => void }) {
  const { addDevice, addToast } = useApp();

  const [step, setStep] = useState(0);

  // Step 0
  const [name,     setName]     = useState('');
  const [location, setLocation] = useState('');
  const [error,    setError]    = useState('');

  // Step 1 — produce
  const [produceId,    setProduceId]    = useState<WizardProduceId>('mixed');
  const [produceState, setProduceState] = useState<ProduceState>('fresh');
  const [skipProduce,  setSkipProduce]  = useState(false);

  // Step 1 — AI image analysis
  const [capturePreview,  setCapturePreview]  = useState<string | null>(null);
  const [analysing,       setAnalysing]       = useState(false);
  const [aiResult,        setAiResult]        = useState<{ state: ProduceState; confidence: 'high' | 'medium' | 'low'; explanation: string } | null>(null);
  const [aiError,         setAiError]         = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Step 2 — facility
  const [facilitySize,   setFacilitySize]   = useState<FacilitySizeId>('small');
  const [transportHours, setTransportHours] = useState(2);

  // Step 3
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, []);

  const shelfLife = estimateShelfLife(produceId, produceState, transportHours);

  // ── Image capture / upload ─────────────────────────────────────────────────

  const handleImageSelected = async (file: File) => {
    setAiError('');
    setAiResult(null);
    const previewUrl = URL.createObjectURL(file);
    setCapturePreview(previewUrl);
    setAnalysing(true);

    try {
      const { base64, mimeType } = await fileToBase64(file);
      const produceLabel = WIZARD_PRODUCE.find(p => p.id === produceId)?.label ?? produceId;
      const result = await analyseProduceImage(base64, mimeType, produceLabel);
      setAiResult(result);
    } catch (err) {
      setAiError('Could not analyse the image. Please select a condition manually or try a clearer photo.');
      setCapturePreview(null);
    } finally {
      setAnalysing(false);
    }
  };

  const handleAiConfirm = (state: ProduceState) => {
    setProduceState(state);
    setAiResult(null);
    // Don't clear preview — keep it as visual reference
  };

  const handleRetake = () => {
    setCapturePreview(null);
    setAiResult(null);
    setAiError('');
    fileInputRef.current?.click();
  };

  // ── Navigation ─────────────────────────────────────────────────────────────

  const handleStep0 = () => {
    setError('');
    if (!name.trim())     { setError('Device name is required.'); return; }
    if (!location.trim()) { setError('Location is required.'); return; }
    setStep(1);
  };

  const handleStep2 = () => {
    setSaving(true);
    setTimeout(() => {
      if (skipProduce) {
        addDevice(name.trim(), location.trim());
      } else {
        addDevice(name.trim(), location.trim(), {
          produceMode:  produceId,
          produceState,
          facilitySize,
          transportHours,
        });
      }
      setSaving(false);
      setStep(3);
    }, 600);
  };

  const inputBase = "w-full px-4 py-3 rounded-xl border border-[#E4E7EC] bg-[#F3F4F6] text-[#111827] outline-none focus:border-[#0984E3] focus:ring-2 focus:ring-[#0984E3]/20 transition-all text-sm";

  return (
    <>
      <motion.div
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        className="fixed inset-0 bg-black/50 z-[55] backdrop-blur-sm"
        onClick={step < 3 ? onClose : undefined}
      />
      <motion.div
        initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
        transition={{ type: 'spring', stiffness: 380, damping: 38 }}
        className="fixed bottom-0 left-0 right-0 z-[60] bg-white rounded-t-3xl shadow-2xl border-t border-[#E4E7EC] flex flex-col"
        style={{ maxHeight: '92dvh' }}
      >
        {/* Handle */}
        <div className="flex justify-center pt-3 pb-1 flex-shrink-0">
          <div className="w-10 h-1 rounded-full bg-[#D1D5DB]" />
        </div>

        {/* Header */}
        <div className="px-5 pt-2 pb-3 flex items-center justify-between flex-shrink-0">
          <div>
            <p className="font-bold text-[#111827] text-lg">Add New Device</p>
            <WizardPills step={step} />
          </div>
          {step < 3 && (
            <button onClick={onClose}
              className="w-8 h-8 rounded-full bg-[#F3F4F6] flex items-center justify-center active:bg-[#E4E7EC]">
              <X className="w-4 h-4 text-[#6B7280]" />
            </button>
          )}
        </div>

        <div className="flex-1 overflow-y-auto overscroll-contain">
          <AnimatePresence mode="wait">

            {/* ── STEP 0: Device basics ───────────────────────────────── */}
            {step === 0 && (
              <motion.div key="s0"
                initial={{ opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -24 }}
                transition={{ duration: 0.22 }} className="px-5 pb-6 space-y-4">

                <div className="space-y-1">
                  <label className="text-xs font-semibold text-[#374151] uppercase tracking-wide">Device Name</label>
                  <input value={name} onChange={e => setName(e.target.value)}
                    placeholder="e.g. Cold Room A" className={inputBase} style={{ fontSize: 16, height: 52 }} />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-[#374151] uppercase tracking-wide">Location</label>
                  <input value={location} onChange={e => setLocation(e.target.value)}
                    placeholder="e.g. Kumasi Warehouse, Bay 3" className={inputBase} style={{ fontSize: 16, height: 52 }} />
                </div>
                {error && <p className="text-xs text-red-500 font-medium">{error}</p>}

                <div className="rounded-2xl p-4" style={{ backgroundColor: '#EBF4FF', border: '1px solid #BFDBFE' }}>
                  <p className="text-xs font-semibold text-[#1D4ED8] mb-1">What happens next?</p>
                  <p className="text-xs text-[#1E40AF] leading-relaxed">
                    Next you'll set up produce details — you can take a photo and our AI will assess the condition automatically.
                    Connection instructions are in <span className="font-semibold">Settings → How to Connect</span>.
                  </p>
                </div>
              </motion.div>
            )}

            {/* ── STEP 1: Produce type + AI image analysis ─────────────── */}
            {step === 1 && (
              <motion.div key="s1"
                initial={{ opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -24 }}
                transition={{ duration: 0.22 }} className="px-5 pb-6 space-y-5">

                {/* Produce type grid */}
                <div>
                  <p className="text-xs font-semibold text-[#374151] uppercase tracking-wide mb-2">What are you storing?</p>
                  <div className="grid grid-cols-2 gap-2">
                    {WIZARD_PRODUCE.map(p => (
                      <button key={p.id}
                        onClick={() => { setProduceId(p.id); setAiResult(null); setCapturePreview(null); setAiError(''); }}
                        className="flex items-center gap-2 p-3 rounded-xl text-left transition-all active:scale-[0.97]"
                        style={{
                          border: `1.5px solid ${produceId === p.id ? p.color + '80' : '#E4E7EC'}`,
                          backgroundColor: produceId === p.id ? p.tint : '#FFFFFF',
                        }}>
                        <span className="text-xl">{p.emoji}</span>
                        <div className="min-w-0">
                          <p className="text-xs font-semibold truncate" style={{ color: produceId === p.id ? p.color : '#111827' }}>
                            {p.label}
                          </p>
                          <p className="text-[10px] text-[#6B7280] truncate">{p.tagline}</p>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>

                {/* AI image capture */}
                <div>
                  <p className="text-xs font-semibold text-[#374151] uppercase tracking-wide mb-2">
                    Condition — take a photo for AI assessment
                  </p>

                  {/* Hidden file input — accepts camera and gallery */}
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    capture="environment"
                    className="hidden"
                    onChange={e => {
                      const file = e.target.files?.[0];
                      if (file) handleImageSelected(file);
                      e.target.value = '';
                    }}
                  />

                  {/* Analysing spinner */}
                  {analysing && (
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                      className="flex flex-col items-center gap-3 py-8 rounded-2xl border border-[#E4E7EC] bg-[#F9FAFB]">
                      <Loader2 className="w-8 h-8 text-[#0984E3] animate-spin" />
                      <div className="text-center">
                        <p className="text-sm font-semibold text-[#111827]">Analysing your photo…</p>
                        <p className="text-xs text-[#6B7280] mt-1">The AI is assessing the produce condition</p>
                      </div>
                    </motion.div>
                  )}

                  {/* AI result card */}
                  {!analysing && aiResult && capturePreview && (
                    <AIResultCard
                      result={aiResult}
                      previewUrl={capturePreview}
                      onConfirm={handleAiConfirm}
                      onRetake={handleRetake}
                    />
                  )}

                  {/* Camera button — shown when no result yet */}
                  {!analysing && !aiResult && (
                    <div className="space-y-3">
                      <button
                        onClick={() => fileInputRef.current?.click()}
                        className="w-full flex items-center justify-center gap-3 py-4 rounded-2xl border-2 border-dashed border-[#0984E3] active:bg-[#EBF4FF] transition-colors"
                        style={{ backgroundColor: 'rgba(9,132,227,0.04)' }}>
                        <Camera className="w-5 h-5 text-[#0984E3]" />
                        <div className="text-left">
                          <p className="text-sm font-semibold text-[#0984E3]">Take or Upload a Photo</p>
                          <p className="text-xs text-[#6B7280] mt-0.5">AI will assess the produce condition from the image</p>
                        </div>
                      </button>

                      {/* Preview thumbnail if photo taken but no AI result (e.g. after retake) */}
                      {capturePreview && !aiResult && (
                        <div className="relative rounded-xl overflow-hidden h-28">
                          <img src={capturePreview} alt="Preview" className="w-full h-full object-cover" />
                        </div>
                      )}

                      {aiError && (
                        <div className="flex items-start gap-2 p-3 rounded-xl"
                          style={{ backgroundColor: 'rgba(192,57,43,0.07)', border: '1px solid rgba(192,57,43,0.2)' }}>
                          <AlertTriangle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
                          <p className="text-xs text-red-600 leading-relaxed">{aiError}</p>
                        </div>
                      )}

                      <p className="text-[10px] text-[#6B7280] text-center">
                        Or select condition manually below
                      </p>
                    </div>
                  )}
                </div>

                {/* Manual condition selection — always visible */}
                <div>
                  <p className="text-xs font-semibold text-[#374151] uppercase tracking-wide mb-2">
                    {aiResult ? 'Confirmed Condition' : 'Manual Selection'}
                  </p>
                  <div className="space-y-2">
                    {PRODUCE_STATES.map(ps => (
                      <button key={ps.id}
                        onClick={() => { setProduceState(ps.id); setAiResult(null); }}
                        className="w-full flex items-center gap-3 p-3 rounded-xl text-left transition-all active:scale-[0.98]"
                        style={{
                          border: `1.5px solid ${produceState === ps.id ? ps.color + '60' : '#E4E7EC'}`,
                          backgroundColor: produceState === ps.id ? ps.tint : '#FFFFFF',
                        }}>
                        <span style={{ fontSize: 18 }}>{ps.emoji}</span>
                        <div className="flex-1">
                          <p className="text-xs font-semibold" style={{ color: produceState === ps.id ? ps.color : '#111827' }}>
                            {ps.label}
                          </p>
                          <p className="text-[10px] text-[#6B7280]">{ps.desc}</p>
                        </div>
                        {produceState === ps.id && <Check className="w-4 h-4 flex-shrink-0" style={{ color: ps.color }} />}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Dashboard targets preview */}
                <div className="rounded-xl p-3"
                  style={{ backgroundColor: '#F3F4F6', border: '1px solid #E4E7EC' }}>
                  <p className="text-[10px] text-[#6B7280] uppercase tracking-wide mb-1.5">Dashboard targets that will be applied</p>
                  {(() => {
                    const targets = getStateAdjustedTargets(produceId as ProduceMode, produceState);
                    return (
                      <div className="flex items-center gap-4">
                        <span className="text-sm font-bold text-[#0984E3]">🌡 {targets.targetTemperature}°C</span>
                        <span className="text-sm font-bold text-[#0984E3]">💧 {targets.targetHumidity}% RH</span>
                      </div>
                    );
                  })()}
                </div>

                <button onClick={() => { setSkipProduce(true); setStep(2); }}
                  className="w-full text-xs text-[#6B7280] underline text-center py-1 active:opacity-60">
                  Skip for now — I'll set this up later
                </button>
              </motion.div>
            )}

            {/* ── STEP 2: Facility size + transport time ──────────────── */}
            {step === 2 && !skipProduce && (
              <motion.div key="s2"
                initial={{ opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -24 }}
                transition={{ duration: 0.22 }} className="px-5 pb-6 space-y-5">

                <div>
                  <p className="text-xs font-semibold text-[#374151] uppercase tracking-wide mb-2">Storage Facility Size</p>
                  <div className="space-y-2">
                    {FACILITY_SIZES.map(fs => (
                      <button key={fs.id} onClick={() => setFacilitySize(fs.id)}
                        className="w-full flex items-center gap-3 p-3.5 rounded-xl text-left transition-all active:scale-[0.98]"
                        style={{
                          border: `1.5px solid ${facilitySize === fs.id ? '#0984E380' : '#E4E7EC'}`,
                          backgroundColor: facilitySize === fs.id ? '#EBF4FF' : '#FFFFFF',
                        }}>
                        <div className="w-4 h-4 rounded-full border-2 flex items-center justify-center flex-shrink-0"
                          style={{ borderColor: facilitySize === fs.id ? '#0984E3' : '#C8CDD8', backgroundColor: facilitySize === fs.id ? '#0984E3' : 'transparent' }}>
                          {facilitySize === fs.id && <Check className="w-2.5 h-2.5 text-white" />}
                        </div>
                        <div>
                          <p className="text-xs font-semibold" style={{ color: facilitySize === fs.id ? '#0984E3' : '#111827' }}>{fs.label}</p>
                          <p className="text-[10px] text-[#6B7280]">{fs.desc}</p>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-xs font-semibold text-[#374151] uppercase tracking-wide">Transport Time</p>
                    <span className="text-sm font-bold text-[#0984E3]">{transportHours}h</span>
                  </div>
                  <p className="text-[10px] text-[#6B7280] mb-3">
                    How long did it take to move the produce from farm to this facility?
                  </p>
                  <input type="range" min={0} max={48} step={1} value={transportHours}
                    onChange={e => setTransportHours(Number(e.target.value))}
                    className="w-full accent-[#0984E3]" />
                  <div className="flex justify-between text-[9px] text-[#9CA3AF] mt-1">
                    <span>0h</span><span>12h</span><span>24h</span><span>36h</span><span>48h</span>
                  </div>
                </div>

                <div className="rounded-2xl p-4" style={{ backgroundColor: shelfLife.color + '12', border: `1px solid ${shelfLife.color}30` }}>
                  <p className="text-xs font-semibold mb-0.5" style={{ color: shelfLife.color }}>
                    Estimated shelf life with ColdWatch
                  </p>
                  <p className="text-2xl font-bold" style={{ color: shelfLife.color }}>{shelfLife.label}</p>
                  <p className="text-[10px] text-[#6B7280] mt-1">
                    Based on produce type, condition, and transport time. ColdWatch will actively work to extend this.
                  </p>
                </div>
              </motion.div>
            )}

            {/* ── STEP 2 skip path ────────────────────────────────────── */}
            {step === 2 && skipProduce && (
              <motion.div key="s2skip"
                initial={{ opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -24 }}
                transition={{ duration: 0.22 }} className="px-5 pb-6">
                <div className="rounded-2xl p-5" style={{ backgroundColor: '#F8FAFC', border: '1px solid #E4E7EC' }}>
                  <p className="font-semibold text-[#111827] mb-1">Ready to save</p>
                  <p className="text-sm text-[#6B7280]">
                    You skipped produce setup. You can complete it later from the device card. Tap below to save the device.
                  </p>
                </div>
              </motion.div>
            )}

            {/* ── STEP 3: Success — point to Settings ─────────────────── */}
            {step === 3 && (
              <motion.div key="s3"
                initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.28 }} className="px-5 pb-8 space-y-4">

                {/* Success */}
                <div className="flex items-center gap-3 p-4 rounded-2xl"
                  style={{ backgroundColor: '#E6F6EC', border: '1px solid #A7D7B6' }}>
                  <div className="w-10 h-10 rounded-xl bg-[#27AE60]/15 flex items-center justify-center flex-shrink-0">
                    <CheckCircle2 className="w-5 h-5 text-[#27AE60]" />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-[#166534]">{name} added successfully</p>
                    <p className="text-xs text-[#166534]/70 mt-0.5">
                      {skipProduce ? 'Complete produce setup from the device card when ready.' : 'Dashboard targets have been updated for your produce.'}
                    </p>
                  </div>
                </div>

                {/* Shelf life if produce was set */}
                {!skipProduce && (
                  <div className="rounded-2xl p-4"
                    style={{ backgroundColor: shelfLife.color + '10', border: `1px solid ${shelfLife.color}25` }}>
                    <p className="text-xs font-semibold text-[#374151] mb-0.5">Estimated shelf life with ColdWatch active</p>
                    <p className="text-xl font-bold" style={{ color: shelfLife.color }}>{shelfLife.label}</p>
                  </div>
                )}

                {/* Connect prompt */}
                <div className="rounded-2xl p-4" style={{ backgroundColor: '#EBF4FF', border: '1px solid #BFDBFE' }}>
                  <p className="text-xs font-semibold text-[#1D4ED8] mb-1">Ready to connect your ESP32?</p>
                  <p className="text-xs text-[#1E40AF] leading-relaxed mb-3">
                    The full step-by-step connection guide — including device ID, API endpoint, firmware flashing, and WiFi setup — is available in Settings.
                  </p>
                  <button
                    onClick={() => { onClose(); onGoToSettings(); }}
                    className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-white text-xs font-semibold active:scale-[0.98]"
                    style={{ backgroundColor: '#0984E3' }}>
                    Go to Settings → How to Connect
                    <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                </div>

                <div className="rounded-2xl p-4" style={{ backgroundColor: '#FFF8F0', border: '1px solid #F5CBA7' }}>
                  <p className="text-xs font-semibold text-[#C0501A] mb-1">No hardware yet?</p>
                  <p className="text-xs text-[#7A3010] leading-relaxed">
                    That's fine — the device is registered and the simulation is running. Come back to the guide when your ESP32 is ready.
                  </p>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Bottom actions */}
        <div className="px-5 pb-8 pt-3 flex gap-2.5 flex-shrink-0" style={{ borderTop: '1px solid #F3F4F6' }}>
          {step > 0 && step < 3 && (
            <button onClick={() => setStep(s => s - 1)}
              className="w-11 h-12 rounded-2xl flex items-center justify-center flex-shrink-0 active:bg-[#E4E7EC]"
              style={{ border: '1.5px solid #E4E7EC' }}>
              <ChevronLeft className="w-5 h-5 text-[#6B7280]" />
            </button>
          )}

          {step === 0 && (
            <button onClick={handleStep0}
              className="flex-1 h-12 rounded-2xl text-white text-sm font-semibold flex items-center justify-center gap-1.5 active:scale-[0.98]"
              style={{ backgroundColor: '#0984E3' }}>
              Continue <ChevronRight className="w-4 h-4" />
            </button>
          )}
          {step === 1 && (
            <button
              onClick={() => { setSkipProduce(false); setStep(2); }}
              disabled={analysing}
              className="flex-1 h-12 rounded-2xl text-white text-sm font-semibold flex items-center justify-center gap-1.5 active:scale-[0.98] disabled:opacity-50"
              style={{ backgroundColor: '#0984E3' }}>
              Continue <ChevronRight className="w-4 h-4" />
            </button>
          )}
          {step === 2 && (
            <button onClick={handleStep2} disabled={saving}
              className="flex-1 h-12 rounded-2xl text-white text-sm font-semibold flex items-center justify-center gap-1.5 active:scale-[0.98] disabled:opacity-50"
              style={{ backgroundColor: '#0984E3' }}>
              {saving
                ? <><Loader2 className="w-4 h-4 animate-spin" />Saving…</>
                : <>Save Device <ChevronRight className="w-4 h-4" /></>
              }
            </button>
          )}
          {step === 3 && (
            <button onClick={onClose}
              className="flex-1 h-12 rounded-2xl text-white text-sm font-semibold flex items-center justify-center gap-1.5 active:scale-[0.98]"
              style={{ backgroundColor: '#27AE60' }}>
              Done <Check className="w-4 h-4" />
            </button>
          )}
        </div>
      </motion.div>
    </>
  );
}

// ── Configure Sheet ────────────────────────────────────────────────────────────

function ConfigureSheet({ device, onClose }: { device: Device; onClose: () => void }) {
  const { updateDevice, addToast } = useApp();
  const [name,     setName]     = useState(device.name);
  const [location, setLocation] = useState(device.location);
  const [saving,   setSaving]   = useState(false);
  const isDirty = name.trim() !== device.name || location.trim() !== device.location;

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, []);

  const handleSave = () => {
    if (!name.trim()) return;
    if (!isDirty) { onClose(); return; }
    setSaving(true);
    setTimeout(() => {
      updateDevice(device.id, { name: name.trim(), location: location.trim() });
      addToast({ id: `toast-${Date.now()}`, type: 'success', message: `${name.trim()} updated` });
      setSaving(false);
      onClose();
    }, 500);
  };

  const inputBase = "w-full px-4 rounded-xl border border-[#E4E7EC] bg-[#F3F4F6] text-[#111827] outline-none focus:border-[#0984E3] focus:ring-2 focus:ring-[#0984E3]/20 transition-all";

  return (
    <>
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        className="fixed inset-0 bg-black/50 z-[55] backdrop-blur-sm" onClick={onClose} />
      <motion.div initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
        transition={{ type: 'spring', stiffness: 380, damping: 38 }}
        className="fixed bottom-0 left-0 right-0 z-[60] bg-white rounded-t-3xl shadow-2xl border-t border-[#E4E7EC] flex flex-col"
        style={{ maxHeight: '85dvh' }}>
        <div className="flex justify-center pt-4 pb-2 flex-shrink-0">
          <div className="w-12 h-1.5 rounded-full bg-[#D1D5DB]" />
        </div>
        <div className="px-5 pt-2 overflow-y-auto flex-1 overscroll-contain">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-xl bg-[#0984E3]/10 flex items-center justify-center flex-shrink-0">
                <Settings2 style={{ width: 24, height: 24, color: '#0984E3' }} />
              </div>
              <div>
                <p className="font-bold text-[#111827]" style={{ fontSize: 18 }}>Configure Device</p>
                <p className="text-[#6B7280] font-mono mt-0.5" style={{ fontSize: 13 }}>{device.id}</p>
              </div>
            </div>
            <button onClick={onClose}
              className="rounded-full bg-[#F3F4F6] flex items-center justify-center active:opacity-70"
              style={{ width: 44, height: 44 }}>
              <X className="w-5 h-5 text-[#6B7280]" />
            </button>
          </div>
          <div className="space-y-5 mb-5">
            <div>
              <label className="block font-semibold text-[#111827] mb-2 uppercase tracking-wide" style={{ fontSize: 14 }}>
                Device Name
              </label>
              <input type="text" value={name} onChange={e => setName(e.target.value)}
                className={inputBase} placeholder="e.g. Storage Unit A"
                maxLength={40} autoComplete="off" style={{ fontSize: 16, height: 56 }} />
            </div>
            <div>
              <label className="block font-semibold text-[#111827] mb-2 uppercase tracking-wide" style={{ fontSize: 14 }}>
                Location
              </label>
              <input type="text" value={location} onChange={e => setLocation(e.target.value)}
                className={inputBase} placeholder="e.g. Kumasi Central Market"
                maxLength={60} autoComplete="off" style={{ fontSize: 16, height: 56 }} />
            </div>
          </div>
          <p className="text-[#6B7280] pb-6 leading-relaxed" style={{ fontSize: 14 }}>
            Calibration offsets and custom thresholds can be adjusted in{' '}
            <span className="text-[#0984E3] font-semibold">Settings → Device Configuration</span>.
          </p>
        </div>
        <div className="flex-shrink-0 px-5 border-t border-[#E4E7EC] bg-white"
          style={{ paddingTop: 14, paddingBottom: 'calc(env(safe-area-inset-bottom) + 14px)' }}>
          <div className="flex gap-3">
            <button onClick={onClose}
              className="flex-1 rounded-2xl border-2 border-[#E4E7EC] text-[#6B7280] font-semibold active:bg-[#F3F4F6]"
              style={{ fontSize: 17, minHeight: 58 }}>
              Cancel
            </button>
            <button onClick={handleSave} disabled={!name.trim() || saving}
              className="flex-1 rounded-2xl text-white font-bold active:scale-[0.98] flex items-center justify-center gap-2 disabled:opacity-50"
              style={{ fontSize: 17, minHeight: 58, backgroundColor: isDirty ? '#0984E3' : '#27AE60' }}>
              {saving
                ? <><div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />Saving…</>
                : isDirty ? 'Save Changes' : <><Check className="w-5 h-5" />No Changes</>
              }
            </button>
          </div>
        </div>
      </motion.div>
    </>
  );
}

// ── Main Devices Page ─────────────────────────────────────────────────────────

export default function Devices() {
  const { devices, setActivePage, setSelectedDeviceId, isAdvancedUser, deleteDevice, addToast } = useApp();
  const [configuringDevice, setConfiguringDevice] = useState<Device | null>(null);
  const [showAddModal,      setShowAddModal]      = useState(false);
  const [confirmingDelete,  setConfirmingDelete]  = useState<string | null>(null);
  const isLoading = usePageLoading();

  if (isLoading) return <DevicesSkeleton />;

  const handleViewDashboard = (deviceId: string) => {
    setSelectedDeviceId(deviceId);
    setActivePage('dashboard');
  };

  const handleDelete = (device: Device) => {
    deleteDevice(device.id);
    setConfirmingDelete(null);
    addToast({ id: `toast-${Date.now()}`, type: 'info', message: `${device.name} removed` });
  };

  const handleGoToSettings = () => setActivePage('settings');

  return (
    <div className="space-y-6">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-[#111827]">Connected Devices</h2>
          <p className="text-[#6B7280] text-sm mt-1">Manage your ColdWatch ESP32 monitoring modules</p>
        </div>
        <button onClick={() => setShowAddModal(true)}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-white text-sm font-medium active:scale-[0.98]"
          style={{ backgroundColor: '#0984E3' }}>
          <Plus className="w-4 h-4" />Add Device
        </button>
      </div>

      {/* Devices Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
        {devices.map(device => (
          <motion.div layout key={device.id} className="bg-white rounded-2xl p-5 shadow-sm border border-[#E4E7EC]">

            {/* Card Header */}
            <div className="flex items-start justify-between mb-5">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-xl flex items-center justify-center"
                  style={{ backgroundColor: device.status === 'online' ? 'rgba(9,132,227,0.1)' : 'rgba(192,57,43,0.08)' }}>
                  <Cpu className="w-6 h-6" style={{ color: device.status === 'online' ? '#0984E3' : '#C0392B' }} />
                </div>
                <div>
                  <h3 className="text-[#111827] font-medium text-sm">{device.name}</h3>
                  <div className="flex items-center gap-1 text-xs text-[#6B7280] mt-0.5">
                    <MapPin className="w-3 h-3" />
                    <span className="truncate max-w-[140px]">{device.location}</span>
                  </div>
                </div>
              </div>
              <span className="px-2.5 py-1 rounded-full text-[10px] font-bold text-white uppercase flex-shrink-0"
                style={{ backgroundColor: device.status === 'online' ? '#27AE60' : '#C0392B' }}>
                {device.status}
              </span>
            </div>

            {/* Produce setup prompt */}
            {!device.produceSetupComplete && (
              <div className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl mb-4"
                style={{ backgroundColor: '#FFF8F0', border: '1px solid #F5CBA7' }}>
                <Info className="w-3.5 h-3.5 text-[#C0501A] flex-shrink-0" />
                <p className="text-[11px] text-[#7A3010] flex-1">
                  Produce setup incomplete — tap Configure to set type and condition.
                </p>
              </div>
            )}

            {/* Produce badge */}
            {device.produceSetupComplete && device.produceMode && (
              <div className="flex items-center gap-2 mb-4">
                <span className="px-2.5 py-1 rounded-full text-[10px] font-semibold"
                  style={{ backgroundColor: '#EBF4FF', color: '#1A65B5' }}>
                  {device.produceMode.charAt(0).toUpperCase() + device.produceMode.slice(1)}
                </span>
                {device.produceState && (
                  <span className="px-2.5 py-1 rounded-full text-[10px] font-semibold"
                    style={{
                      backgroundColor: device.produceState === 'fresh' ? '#E6F6EC' : device.produceState === 'almost-damaged' ? '#FDEDEC' : '#FEF5EC',
                      color: device.produceState === 'fresh' ? '#1A7A3F' : device.produceState === 'almost-damaged' ? '#C0392B' : '#E67E22',
                    }}>
                    {device.produceState === 'in-between' ? 'In-Between' : device.produceState.charAt(0).toUpperCase() + device.produceState.slice(1)}
                  </span>
                )}
              </div>
            )}

            {/* Info rows */}
            <div className="space-y-2.5 mb-5">
              <div className="flex items-center justify-between py-2 border-b border-[#E4E7EC]">
                <div className="flex items-center gap-2 text-xs text-[#6B7280]">
                  {device.status === 'online' ? <Wifi className="w-3.5 h-3.5" /> : <WifiOff className="w-3.5 h-3.5" />}
                  <span>Connection</span>
                </div>
                <span className="text-xs font-medium text-[#111827]">
                  {device.status === 'online' ? 'Connected' : 'Disconnected'}
                </span>
              </div>
              <div className="flex items-center justify-between py-2 border-b border-[#E4E7EC]">
                <div className="flex items-center gap-2 text-xs text-[#6B7280]">
                  <Info className="w-3.5 h-3.5" /><span>Last Seen</span>
                </div>
                <span className={`text-xs font-medium ${device.status === 'offline' ? 'text-red-500' : 'text-[#111827]'}`}>
                  {device.status === 'online' ? 'Just now' : timeAgo(device.lastSeen)}
                </span>
              </div>
              {isAdvancedUser && (
                <div className="flex items-center justify-between py-2 border-b border-[#E4E7EC]">
                  <div className="flex items-center gap-2 text-xs text-[#6B7280]">
                    <Signal className="w-3.5 h-3.5" /><span>Firmware</span>
                  </div>
                  <span className="text-xs font-mono text-[#111827]">v{device.firmwareVersion}</span>
                </div>
              )}
              <div className="flex items-center justify-between py-2">
                <div className="flex items-center gap-2 text-xs text-[#6B7280]">
                  <Battery className="w-3.5 h-3.5" /><span>Battery</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-20 h-1.5 bg-[#F3F4F6] rounded-full overflow-hidden">
                    <div className="h-full rounded-full transition-all"
                      style={{ width: `${device.batteryLevel}%`, backgroundColor: getBatteryColor(device.batteryLevel) }} />
                  </div>
                  <span className="text-xs font-medium text-[#111827]">{device.batteryLevel}%</span>
                </div>
              </div>
            </div>

            {/* Actions */}
            <AnimatePresence mode="wait">
              {confirmingDelete === device.id ? (
                <motion.div key="confirm"
                  initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 4 }}
                  className="rounded-xl p-3 border"
                  style={{ backgroundColor: 'rgba(192,57,43,0.06)', borderColor: 'rgba(192,57,43,0.2)' }}>
                  <div className="flex items-center gap-2 mb-2.5">
                    <AlertTriangle className="w-3.5 h-3.5 text-red-500 flex-shrink-0" />
                    <p className="text-xs font-semibold text-red-600">Remove this device?</p>
                  </div>
                  <p className="text-[11px] text-[#6B7280] mb-3 leading-relaxed">
                    This removes it from your dashboard. The ESP32 hardware is unaffected.
                  </p>
                  <div className="flex gap-2">
                    <button onClick={() => setConfirmingDelete(null)}
                      className="flex-1 py-2 rounded-lg text-xs font-semibold text-[#6B7280] border border-[#E4E7EC] active:bg-[#F3F4F6]">
                      Cancel
                    </button>
                    <button onClick={() => handleDelete(device)}
                      className="flex-1 py-2 rounded-lg text-xs font-semibold text-white active:scale-[0.98]"
                      style={{ backgroundColor: '#C0392B' }}>
                      Remove
                    </button>
                  </div>
                </motion.div>
              ) : (
                <motion.div key="actions"
                  initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 4 }}
                  className="flex gap-2">
                  <button onClick={() => handleViewDashboard(device.id)}
                    className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-white text-xs font-semibold active:scale-[0.98]"
                    style={{ backgroundColor: '#0984E3' }}>
                    Dashboard <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                  <button onClick={() => setConfiguringDevice(device)}
                    className="flex-1 flex items-center justify-center gap-1.5 py-2.5 border border-[#E4E7EC] rounded-xl text-[#6B7280] text-xs font-semibold active:bg-[#F3F4F6]">
                    <Settings2 className="w-3.5 h-3.5" /> Configure
                  </button>
                  {isAdvancedUser && (
                    <button onClick={() => setConfirmingDelete(device.id)}
                      className="w-10 flex items-center justify-center border border-[#E4E7EC] rounded-xl text-red-400 active:bg-red-50"
                      aria-label={`Remove ${device.name}`}>
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        ))}

        {/* Add placeholder card */}
        <button onClick={() => setShowAddModal(true)}
          className="bg-white rounded-2xl p-5 shadow-sm border-2 border-dashed border-[#E4E7EC] hover:border-[#0984E3] active:scale-[0.98] transition-all flex flex-col items-center justify-center min-h-[280px]">
          <div className="w-14 h-14 rounded-full flex items-center justify-center mb-3"
            style={{ backgroundColor: 'rgba(9,132,227,0.1)' }}>
            <Plus className="w-7 h-7 text-[#0984E3]" />
          </div>
          <p className="text-[#111827] font-medium text-sm mb-1">Add New Device</p>
          <p className="text-[#6B7280] text-xs text-center max-w-[180px] leading-relaxed">
            Connect an ESP32 + DHT22 cold storage unit
          </p>
        </button>
      </div>

      {/* Bottom sheets */}
      <AnimatePresence>
        {configuringDevice && (
          <ConfigureSheet key="configure" device={configuringDevice} onClose={() => setConfiguringDevice(null)} />
        )}
        {showAddModal && (
          <AddDeviceModal key="add" onClose={() => setShowAddModal(false)} onGoToSettings={handleGoToSettings} />
        )}
      </AnimatePresence>
    </div>
  );
}