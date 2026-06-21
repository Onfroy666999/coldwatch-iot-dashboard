import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Cpu, MapPin, Wifi, WifiOff, Battery, Info, Plus, ChevronRight, ChevronLeft,
  Signal, Settings2, X, Check, Trash2, AlertTriangle, Camera, Upload,
  Loader2, RefreshCw, CheckCircle2, PackageCheck, Clock, Hash,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import type { Device, ProduceMode, ProduceState } from '../context/AppContext';
import { getStateAdjustedTargets } from '../context/AppContext';
import { usePageLoading, DevicesSkeleton } from '../components/Skeleton';
import ProduceModeSelector from '../components/ProduceModeSelector';

// ── Module-level helpers ───────────────────────────────────────────────────────

function timeAgo(d: Date) {
  const s = Math.floor((Date.now() - d.getTime()) / 1000);
  if (s < 60)    return `${s}s ago`;
  if (s < 3600)  return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

function daysSince(d: Date): number {
  return Math.floor((Date.now() - d.getTime()) / (1000 * 60 * 60 * 24));
}

const getBatteryColor = (level: number) =>
  level > 50 ? '#27AE60' : level > 20 ? '#E67E22' : '#C0392B';

// ── Device code generation ────────────────────────────────────────────────────
// Generates 6 Hex numbers
// The user can override this in the wizard

function generateDeviceCode(existingCodes: string[]): string {
  // Format: CW- followed by exactly 6 hex characters (0-9, A-F)
  // Matches the device code flashed onto the ESP32 (derived from MAC address)
  const hex = Array.from({ length: 6 }, () =>
    '0123456789ABCDEF'[Math.floor(Math.random() * 16)]
  ).join('');
  const code = `CW-${hex}`;
  if (existingCodes.includes(code)) return generateDeviceCode(existingCodes);
  return code;
}

// ── Produce image analysis — routes through backend /ai/vision proxy ─────────
import { aiApi, produceRecordsApi } from '../Lib/api';

async function analyseProduceImage(
  base64Image: string,
  mimeType: string,
  _produceLabel: string
): Promise<{ state: ProduceState; confidence: 'high' | 'medium' | 'low'; explanation: string }> {
  const result = await aiApi.vision({ base64Image, mimeType });
  const validStates: ProduceState[] = ['fresh', 'in-between', 'dried', 'almost-damaged'];
  if (!validStates.includes(result.state as ProduceState)) throw new Error('Invalid state from AI');
  return {
    state:       result.state as ProduceState,
    confidence:  (result.confidence ?? 'medium') as 'high' | 'medium' | 'low',
    explanation: result.explanation ?? '',
  };
}

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

// ── Wizard / removal data ─────────────────────────────────────────────────────

const WIZARD_PRODUCE = [
  { id: 'mixed',   label: 'Mixed Produce',  tagline: 'Various crop types',          color: '#1A65B5', tint: '#EBF3FD', emoji: '🥕' },
  { id: 'tubers',  label: 'Tubers',         tagline: 'Cassava, Yam, Cocoyam',       color: '#B84A00', tint: '#FEF0E7', emoji: '🥔' },
  { id: 'fruits',  label: 'Fruits',         tagline: 'Mango, Pineapple, Banana',    color: '#1A7A3F', tint: '#E6F6EC', emoji: '🥭' },
  { id: 'leafy',   label: 'Leafy Veg',      tagline: 'Lettuce, Cabbage, Kontomire', color: '#0E7A62', tint: '#E6F6F2', emoji: '🥬' },
  { id: 'legumes', label: 'Legumes',        tagline: 'Cowpea, Groundnuts',          color: '#7A5A2E', tint: '#F8F2EA', emoji: '🌿' },
  { id: 'meat',    label: 'Meat & Fish',    tagline: 'Chicken, Beef, Tilapia',      color: '#B91C1C', tint: '#FEF2F2', emoji: '🍗' },
] as const;

const PRODUCE_STATES: { id: ProduceState; label: string; desc: string; color: string; tint: string; emoji: string }[] = [
  { id: 'fresh',          label: 'Still Fresh',    desc: 'Just harvested or recently received',   color: '#1A7A3F', tint: '#E6F6EC', emoji: '🟢' },
  { id: 'in-between',     label: 'In-Between',     desc: 'Some time has passed since harvest',    color: '#E67E22', tint: '#FEF5EC', emoji: '🟡' },
  { id: 'dried',          label: 'Dried / Cured',  desc: 'Processed, dried, or cured produce',    color: '#7A5A2E', tint: '#F8F2EA', emoji: '🟤' },
  { id: 'almost-damaged', label: 'Almost Damaged', desc: 'Needs urgent cooling to slow spoilage', color: '#C0392B', tint: '#FDEDEC', emoji: '🔴' },
];

// Condition on removal — maps to backend ProduceStorageRecord
const REMOVAL_CONDITIONS = [
  { id: 'fresh',                    label: 'Fresh / Good',            desc: 'Produce is in excellent condition',             color: '#1A7A3F', tint: '#E6F6EC', emoji: '🟢' },
  { id: 'slightly_deteriorated',    label: 'Slightly Deteriorated',   desc: 'Minor quality loss, still marketable',          color: '#E67E22', tint: '#FEF5EC', emoji: '🟡' },
  { id: 'significantly_deteriorated', label: 'Significantly Deteriorated', desc: 'Noticeable quality loss, limited shelf life', color: '#E07B00', tint: '#FFF3E0', emoji: '🟠' },
  { id: 'spoiled',                  label: 'Spoiled',                 desc: 'Not fit for sale or consumption',              color: '#C0392B', tint: '#FDEDEC', emoji: '🔴' },
] as const;

type RemovalConditionId = typeof REMOVAL_CONDITIONS[number]['id'];

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

function WizardPills({ step, labels }: { step: number; labels: string[] }) {
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
  confirmLabel = 'Confirm',
}: {
  result: { state: ProduceState; confidence: 'high' | 'medium' | 'low'; explanation: string };
  previewUrl: string;
  onConfirm: (state: ProduceState) => void;
  onRetake: () => void;
  confirmLabel?: string;
}) {
  const stateInfo = PRODUCE_STATES.find(s => s.id === result.state)!;
  const confColor = result.confidence === 'high' ? '#27AE60' : result.confidence === 'medium' ? '#E67E22' : '#6B7280';
  const confLabel = result.confidence === 'high' ? 'High confidence' : result.confidence === 'medium' ? 'Medium confidence' : 'Low confidence — verify';

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
      className="rounded-2xl overflow-hidden border border-[#E4E7EC]">
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
            <CheckCircle2 className="w-3.5 h-3.5" /> {confirmLabel}
          </button>
        </div>
      </div>
    </motion.div>
  );
}

// ── Remove Produce Sheet ──────────────────────────────────────────────────────
// Multi-step flow: condition → photo (optional) → summary → confirm delete

function RemoveProduceSheet({
  device,
  onClose,
  onConfirm,
}: {
  device: Device;
  onClose: () => void;
  onConfirm: (record: {
    conditionOnRemoval: RemovalConditionId;
    conditionImageBase64?: string;
    conditionImageMime?: string;
    aiAssessment?: string;
    notes: string;
  }) => void;
}) {
  const [step, setStep] = useState(0); // 0=condition, 1=photo, 2=notes, 3=confirm
  const STEP_LABELS = ['Condition', 'Photo', 'Notes', 'Confirm'];

  const [condition,   setCondition]   = useState<RemovalConditionId>('fresh');
  const [notes,       setNotes]       = useState('');
  const [submitting,  setSubmitting]  = useState(false);

  // Photo / AI state
  const [previewUrl,    setPreviewUrl]    = useState<string | null>(null);
  const [imageBase64,   setImageBase64]   = useState<string | null>(null);
  const [imageMime,     setImageMime]     = useState<string | null>(null);
  const [analysing,     setAnalysing]     = useState(false);
  const [aiResult,      setAiResult]      = useState<{ state: ProduceState; confidence: 'high' | 'medium' | 'low'; explanation: string } | null>(null);
  const [aiAssessment,  setAiAssessment]  = useState('');
  const [aiError,       setAiError]       = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const storageDays = device.storedSince ? daysSince(device.storedSince) : 0;
  const produceLabel = WIZARD_PRODUCE.find(p => p.id === device.produceMode)?.label ?? device.produceMode ?? 'Produce';

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, []);

  const handleImageSelected = async (file: File) => {
    setAiError('');
    setAiResult(null);
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    setAnalysing(true);
    try {
      const { base64, mimeType } = await fileToBase64(file);
      setImageBase64(base64);
      setImageMime(mimeType);
      const result = await analyseProduceImage(base64, mimeType, produceLabel);
      setAiResult(result);
    } catch {
      setAiError('Could not analyse image. Select condition manually or try again.');
      setPreviewUrl(null);
    } finally {
      setAnalysing(false);
    }
  };

  const handleAiConfirm = (state: ProduceState) => {
    // Map ProduceState to RemovalConditionId
    const map: Record<ProduceState, RemovalConditionId> = {
      'fresh':          'fresh',
      'in-between':     'slightly_deteriorated',
      'dried':          'slightly_deteriorated',
      'almost-damaged': 'significantly_deteriorated',
    };
    setCondition(map[state]);
    setAiAssessment(aiResult?.explanation ?? '');
    setAiResult(null);
  };

  const handleSubmit = async () => {
    setSubmitting(true);
    await onConfirm({
      conditionOnRemoval:   condition,
      conditionImageBase64: imageBase64 ?? undefined,
      conditionImageMime:   imageMime   ?? undefined,
      aiAssessment:         aiAssessment || undefined,
      notes,
    });
    setSubmitting(false);
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
        <div className="flex justify-center pt-3 pb-1 flex-shrink-0">
          <div className="w-10 h-1 rounded-full bg-[#D1D5DB]" />
        </div>

        <div className="px-5 pt-2 pb-3 flex items-center justify-between flex-shrink-0">
          <div>
            <p className="font-bold text-[#111827] text-lg">Remove Produce</p>
            <WizardPills step={step} labels={STEP_LABELS} />
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

            {/* Step 0 — Condition on removal */}
            {step === 0 && (
              <motion.div key="r0"
                initial={{ opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -24 }}
                className="px-5 pb-6 space-y-4">

                {/* Storage summary */}
                <div className="flex items-center gap-3 p-4 rounded-2xl"
                  style={{ backgroundColor: '#F3F4F6', border: '1px solid #E4E7EC' }}>
                  <PackageCheck className="w-5 h-5 text-[#0984E3] flex-shrink-0" />
                  <div>
                    <p className="text-xs font-semibold text-[#111827]">
                      {device.unitName || device.name} · {device.deviceCode || device.id}
                    </p>
                    <p className="text-[11px] text-[#6B7280] mt-0.5">
                      {produceLabel} stored for <span className="font-semibold text-[#111827]">{storageDays} day{storageDays !== 1 ? 's' : ''}</span>
                    </p>
                  </div>
                </div>

                <p className="text-xs font-semibold text-[#374151] uppercase tracking-wide">
                  Condition on removal
                </p>
                <div className="space-y-2">
                  {REMOVAL_CONDITIONS.map(c => (
                    <button key={c.id} onClick={() => setCondition(c.id)}
                      className="w-full flex items-center gap-3 p-3 rounded-xl text-left transition-all active:scale-[0.98]"
                      style={{
                        border: `1.5px solid ${condition === c.id ? c.color + '60' : '#E4E7EC'}`,
                        backgroundColor: condition === c.id ? c.tint : '#FFFFFF',
                      }}>
                      <span style={{ fontSize: 18 }}>{c.emoji}</span>
                      <div className="flex-1">
                        <p className="text-xs font-semibold" style={{ color: condition === c.id ? c.color : '#111827' }}>
                          {c.label}
                        </p>
                        <p className="text-[10px] text-[#6B7280]">{c.desc}</p>
                      </div>
                      {condition === c.id && <Check className="w-4 h-4 flex-shrink-0" style={{ color: c.color }} />}
                    </button>
                  ))}
                </div>
              </motion.div>
            )}

            {/* Step 1 — Photo */}
            {step === 1 && (
              <motion.div key="r1"
                initial={{ opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -24 }}
                className="px-5 pb-6 space-y-4">

                <div className="p-3 rounded-xl"
                  style={{ backgroundColor: '#EBF4FF', border: '1px solid #BFDBFE' }}>
                  <p className="text-xs text-[#1E40AF] leading-relaxed">
                    <span className="font-semibold">Optional but valuable.</span> A photo helps our AI build better storage estimates for future batches of {produceLabel.toLowerCase()}.
                  </p>
                </div>

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

                {analysing && (
                  <div className="flex flex-col items-center gap-3 py-8 rounded-2xl border border-[#E4E7EC] bg-[#F9FAFB]">
                    <Loader2 className="w-8 h-8 text-[#0984E3] animate-spin" />
                    <p className="text-sm font-semibold text-[#111827]">Analysing your photo…</p>
                    <p className="text-xs text-[#6B7280]">AI is assessing the produce condition</p>
                  </div>
                )}

                {!analysing && aiResult && previewUrl && (
                  <AIResultCard
                    result={aiResult}
                    previewUrl={previewUrl}
                    onConfirm={handleAiConfirm}
                    onRetake={() => { setPreviewUrl(null); setAiResult(null); fileInputRef.current?.click(); }}
                    confirmLabel="Use this condition"
                  />
                )}

                {!analysing && !aiResult && (
                  <div className="space-y-3">
                    {previewUrl && (
                      <div className="relative rounded-xl overflow-hidden h-36">
                        <img src={previewUrl} alt="Preview" className="w-full h-full object-cover" />
                        <div className="absolute top-2 right-2">
                          <span className="px-2 py-1 rounded-full text-[10px] font-bold text-white bg-[#27AE60]">
                            Photo saved
                          </span>
                        </div>
                      </div>
                    )}
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      className="w-full flex items-center justify-center gap-3 py-4 rounded-2xl border-2 border-dashed border-[#0984E3] active:bg-[#EBF4FF] transition-colors"
                      style={{ backgroundColor: 'rgba(9,132,227,0.04)' }}>
                      <Camera className="w-5 h-5 text-[#0984E3]" />
                      <div className="text-left">
                        <p className="text-sm font-semibold text-[#0984E3]">
                          {previewUrl ? 'Retake Photo' : 'Take or Upload a Photo'}
                        </p>
                        <p className="text-xs text-[#6B7280] mt-0.5">AI will assess the produce condition</p>
                      </div>
                    </button>
                    {aiError && (
                      <div className="flex items-start gap-2 p-3 rounded-xl"
                        style={{ backgroundColor: 'rgba(192,57,43,0.07)', border: '1px solid rgba(192,57,43,0.2)' }}>
                        <AlertTriangle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
                        <p className="text-xs text-red-600">{aiError}</p>
                      </div>
                    )}
                  </div>
                )}
              </motion.div>
            )}

            {/* Step 2 — Notes */}
            {step === 2 && (
              <motion.div key="r2"
                initial={{ opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -24 }}
                className="px-5 pb-6 space-y-4">
                <p className="text-xs font-semibold text-[#374151] uppercase tracking-wide">
                  Additional notes (optional)
                </p>
                <p className="text-xs text-[#6B7280] leading-relaxed">
                  Any observations about the storage period? Issues noticed, temperature problems, anything unusual? This helps our AI improve future recommendations.
                </p>
                <textarea
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  placeholder="e.g. Temperature fluctuated during the first week due to door being left open..."
                  rows={5}
                  className={inputBase + ' resize-none'}
                  style={{ lineHeight: '1.5' }}
                />
                <p className="text-[10px] text-[#9CA3AF] text-right">{notes.length}/500</p>
              </motion.div>
            )}

            {/* Step 3 — Confirm removal */}
            {step === 3 && (
              <motion.div key="r3"
                initial={{ opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -24 }}
                className="px-5 pb-6 space-y-4">

                {/* Warning */}
                <div className="flex items-start gap-3 p-4 rounded-2xl"
                  style={{ backgroundColor: 'rgba(192,57,43,0.06)', border: '1px solid rgba(192,57,43,0.2)' }}>
                  <AlertTriangle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-bold text-red-700">This action cannot be undone</p>
                    <p className="text-xs text-red-600 mt-1 leading-relaxed">
                      The device will be removed from your dashboard and its ID ({device.deviceCode || 'CW-???'}) will be freed for reuse with a new batch of produce.
                    </p>
                  </div>
                </div>

                {/* Summary */}
                <div className="rounded-2xl border border-[#E4E7EC] overflow-hidden">
                  <div className="px-4 py-2.5 bg-[#F3F4F6]">
                    <p className="text-xs font-semibold text-[#374151] uppercase tracking-wide">Removal Summary</p>
                  </div>
                  <div className="px-4 py-3 space-y-2.5">
                    <div className="flex justify-between text-xs">
                      <span className="text-[#6B7280]">Device</span>
                      <span className="font-semibold text-[#111827]">{device.deviceCode || device.id}</span>
                    </div>
                    <div className="flex justify-between text-xs">
                      <span className="text-[#6B7280]">Storage Unit</span>
                      <span className="font-semibold text-[#111827]">{device.unitName || device.name}</span>
                    </div>
                    <div className="flex justify-between text-xs">
                      <span className="text-[#6B7280]">Produce</span>
                      <span className="font-semibold text-[#111827]">{produceLabel}</span>
                    </div>
                    <div className="flex justify-between text-xs">
                      <span className="text-[#6B7280]">Days stored</span>
                      <span className="font-semibold text-[#111827]">{storageDays} days</span>
                    </div>
                    <div className="flex justify-between text-xs">
                      <span className="text-[#6B7280]">Condition</span>
                      <span className="font-semibold" style={{ color: REMOVAL_CONDITIONS.find(c => c.id === condition)?.color }}>
                        {REMOVAL_CONDITIONS.find(c => c.id === condition)?.label}
                      </span>
                    </div>
                    {previewUrl && (
                      <div className="flex justify-between text-xs">
                        <span className="text-[#6B7280]">Photo</span>
                        <span className="font-semibold text-[#27AE60]">✓ Included</span>
                      </div>
                    )}
                    {aiAssessment && (
                      <div className="pt-1">
                        <p className="text-[10px] text-[#6B7280] mb-1">AI Assessment</p>
                        <p className="text-[11px] text-[#374151] leading-relaxed italic">"{aiAssessment}"</p>
                      </div>
                    )}
                    {notes && (
                      <div className="pt-1">
                        <p className="text-[10px] text-[#6B7280] mb-1">Notes</p>
                        <p className="text-[11px] text-[#374151] leading-relaxed">{notes}</p>
                      </div>
                    )}
                  </div>
                </div>

                <div className="p-3 rounded-xl"
                  style={{ backgroundColor: '#EBF4FF', border: '1px solid #BFDBFE' }}>
                  <p className="text-[11px] text-[#1E40AF] leading-relaxed">
                    This information will be stored and used by ColdWatch AI to improve shelf life estimates for future {produceLabel.toLowerCase()} storage batches.
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

          {step < 3 && (
            <button onClick={() => setStep(s => s + 1)}
              className="flex-1 h-12 rounded-2xl text-white text-sm font-bold active:scale-[0.98] flex items-center justify-center gap-2"
              style={{ backgroundColor: '#0984E3' }}>
              {step === 2 ? 'Review Summary' : 'Continue'}
              <ChevronRight className="w-4 h-4" />
            </button>
          )}

          {step === 3 && (
            <>
              <button onClick={onClose}
                className="flex-1 h-12 rounded-2xl border border-[#E4E7EC] text-[#6B7280] text-sm font-semibold active:bg-[#F3F4F6]">
                Cancel
              </button>
              <button
                onClick={handleSubmit}
                disabled={submitting}
                className="flex-1 h-12 rounded-2xl text-white text-sm font-bold active:scale-[0.98] flex items-center justify-center gap-2 disabled:opacity-60"
                style={{ backgroundColor: '#C0392B' }}>
                {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                {submitting ? 'Removing…' : 'Remove Device'}
              </button>
            </>
          )}
        </div>
      </motion.div>
    </>
  );
}

// ── Add Device Wizard ─────────────────────────────────────────────────────────

function AddDeviceModal({ onClose, onGoToSettings }: { onClose: () => void; onGoToSettings: () => void }) {
  const { addDevice, addToast, devices } = useApp();

  const [step, setStep] = useState(0);
  const STEP_LABELS = ['Device', 'Produce', 'Facility', 'Done'];

  // Step 0 — device identity
  const existingCodes = devices.map(d => d.deviceCode).filter(Boolean) as string[];
  // deviceCode stores the FULL code (CW-XXXXXX) for passing to the API.
  // codeSuffix is just the editable 6-char hex part shown in the split input.
  const [deviceCode, setDeviceCode] = useState(() => generateDeviceCode(existingCodes));
  const [codeSuffix, setCodeSuffix] = useState(() => generateDeviceCode(existingCodes).slice(3));
  const [codeError,  setCodeError]  = useState('');
  const [unitName,   setUnitName]   = useState('');
  const [location,   setLocation]   = useState('');
  const [error,      setError]      = useState('');

  // Step 1 — produce
  const [produceId,    setProduceId]    = useState<WizardProduceId>('mixed');
  const [produceState, setProduceState] = useState<ProduceState>('fresh');
  const [skipProduce,  setSkipProduce]  = useState(false);

  // Step 1 — AI image
  const [capturePreview, setCapturePreview] = useState<string | null>(null);
  const [analysing,      setAnalysing]      = useState(false);
  const [aiResult,       setAiResult]       = useState<{ state: ProduceState; confidence: 'high' | 'medium' | 'low'; explanation: string } | null>(null);
  const [aiError,        setAiError]        = useState('');
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

  const handleImageSelected = async (file: File) => {
    setAiError('');
    setAiResult(null);
    setCapturePreview(URL.createObjectURL(file));
    setAnalysing(true);
    try {
      const { base64, mimeType } = await fileToBase64(file);
      const produceLabel = WIZARD_PRODUCE.find(p => p.id === produceId)?.label ?? produceId;
      const result = await analyseProduceImage(base64, mimeType, produceLabel);
      setAiResult(result);
    } catch {
      setAiError('Could not analyse the image. Please select a condition manually or try a clearer photo.');
      setCapturePreview(null);
    } finally {
      setAnalysing(false);
    }
  };

  const handleAiConfirm = (state: ProduceState) => {
    setProduceState(state);
    setAiResult(null);
  };

  const validateCode = (code: string) => {
    const trimmed = code.trim().toUpperCase();
    if (!trimmed || trimmed === 'CW-') return 'Device ID is required — enter the 6 characters from your device.';
    if (!/^CW-[A-F0-9]{6}$/i.test(trimmed)) return `${6 - codeSuffix.length} more character${6 - codeSuffix.length === 1 ? '' : 's'} needed (only A–F and 0–9).`;
    if (existingCodes.includes(trimmed)) return 'This Device ID is already in use. Choose another.';
    return '';
  };

  const handleStep0 = () => {
    setError('');
    const cErr = validateCode(deviceCode);
    if (cErr) { setCodeError(cErr); return; }
    if (!unitName.trim()) { setError('Storage Unit Name is required.'); return; }
    if (!location.trim()) { setError('Location is required.'); return; }
    setDeviceCode(deviceCode.trim().toUpperCase());
    setStep(1);
  };

  const handleStep2 = () => {
    setSaving(true);
    setTimeout(() => {
      if (skipProduce) {
        addDevice(unitName.trim(), location.trim(), undefined, deviceCode.trim().toUpperCase(), unitName.trim());
      } else {
        addDevice(unitName.trim(), location.trim(), {
          produceMode:  produceId,
          produceState,
          facilitySize,
          transportHours,
        }, deviceCode.trim().toUpperCase(), unitName.trim());
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
        <div className="flex justify-center pt-3 pb-1 flex-shrink-0">
          <div className="w-10 h-1 rounded-full bg-[#D1D5DB]" />
        </div>
        <div className="px-5 pt-2 pb-3 flex items-center justify-between flex-shrink-0">
          <div>
            <p className="font-bold text-[#111827] text-lg">Add New Device</p>
            <WizardPills step={step} labels={STEP_LABELS} />
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

            {/* STEP 0: Device identity */}
            {step === 0 && (
              <motion.div key="s0"
                initial={{ opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -24 }}
                transition={{ duration: 0.22 }} className="px-5 pb-6 space-y-4">

                {/* Device ID */}
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-[#374151] uppercase tracking-wide flex items-center gap-1.5">
                    <Hash className="w-3.5 h-3.5" /> Device ID
                  </label>
                  <div className="flex items-stretch gap-0">
                    {/* Persistent CW- prefix — always visible, never editable */}
                    <div
                      className="flex items-center px-3 font-mono font-bold text-[#111827] bg-[#F3F4F6] border border-r-0 border-[#D1D5DB] rounded-l-xl select-none"
                      style={{ fontSize: 16, height: 52, letterSpacing: 1 }}
                    >
                      CW-
                    </div>
                    {/* 6-char hex suffix — user types here */}
                    <input
                      value={codeSuffix}
                      onChange={e => {
                        const raw = e.target.value.toUpperCase().replace(/[^A-F0-9]/g, '').slice(0, 6);
                        setCodeSuffix(raw);
                        setDeviceCode(`CW-${raw}`);
                        setCodeError('');
                      }}
                      maxLength={6}
                      autoCapitalize="characters"
                      autoCorrect="off"
                      spellCheck={false}
                      className={inputBase + ' font-mono rounded-l-none flex-1'}
                      style={{ fontSize: 16, height: 52, letterSpacing: 2 }}
                    />
                    <button
                      onClick={() => {
                          const fresh = generateDeviceCode(existingCodes);
                          setDeviceCode(fresh);
                          setCodeSuffix(fresh.slice(3));
                          setCodeError('');
                        }}
                      className="ml-2 px-2.5 py-1 rounded-lg text-[11px] font-semibold text-[#0984E3] active:bg-[#EBF4FF] whitespace-nowrap self-center"
                      style={{ backgroundColor: 'rgba(9,132,227,0.08)' }}>
                      Regenerate
                    </button>
                  </div>
                  {codeError
                    ? <p className="text-xs text-red-500 font-medium">{codeError}</p>
                    : <p className="text-[10px] text-[#6B7280]">
                        {codeSuffix.length > 0 && codeSuffix.length < 6
                          ? `${6 - codeSuffix.length} more character${6 - codeSuffix.length === 1 ? '' : 's'} needed`
                          : 'Enter the 6-character code printed on your device. Only A–F and 0–9 are accepted.'}
                      </p>
                  }
                </div>

                {/* Storage Unit Name */}
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-[#374151] uppercase tracking-wide">Storage Unit Name</label>
                  <input
                    value={unitName}
                    onChange={e => setUnitName(e.target.value)}
                    placeholder="e.g. Cold Room A, Warehouse Bay 3"
                    className={inputBase}
                    style={{ fontSize: 16, height: 52 }}
                  />
                  <p className="text-[10px] text-[#6B7280]">The physical space where the device is installed.</p>
                </div>

                {/* Location */}
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-[#374151] uppercase tracking-wide">Location</label>
                  <input
                    value={location}
                    onChange={e => setLocation(e.target.value)}
                    placeholder="e.g. Kumasi Central Market"
                    className={inputBase}
                    style={{ fontSize: 16, height: 52 }}
                  />
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

            {/* STEP 1: Produce */}
            {step === 1 && (
              <motion.div key="s1"
                initial={{ opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -24 }}
                transition={{ duration: 0.22 }} className="px-5 pb-6 space-y-5">

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

                <div>
                  <p className="text-xs font-semibold text-[#374151] uppercase tracking-wide mb-2">
                    Condition — take a photo for AI assessment
                  </p>
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
                  {analysing && (
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                      className="flex flex-col items-center gap-3 py-8 rounded-2xl border border-[#E4E7EC] bg-[#F9FAFB]">
                      <Loader2 className="w-8 h-8 text-[#0984E3] animate-spin" />
                      <p className="text-sm font-semibold text-[#111827]">Analysing your photo…</p>
                      <p className="text-xs text-[#6B7280]">AI is assessing the produce condition</p>
                    </motion.div>
                  )}
                  {!analysing && aiResult && capturePreview && (
                    <AIResultCard
                      result={aiResult}
                      previewUrl={capturePreview}
                      onConfirm={handleAiConfirm}
                      onRetake={() => { setCapturePreview(null); setAiResult(null); fileInputRef.current?.click(); }}
                    />
                  )}
                  {!analysing && !aiResult && (
                    <div className="space-y-3">
                      <button
                        onClick={() => fileInputRef.current?.click()}
                        className="w-full flex items-center justify-center gap-3 py-4 rounded-2xl border-2 border-dashed border-[#0984E3] active:bg-[#EBF4FF] transition-colors"
                        style={{ backgroundColor: 'rgba(9,132,227,0.04)' }}>
                        <Camera className="w-5 h-5 text-[#0984E3]" />
                        <div className="text-left">
                          <p className="text-sm font-semibold text-[#0984E3]">Take or Upload a Photo</p>
                          <p className="text-xs text-[#6B7280] mt-0.5">AI will assess the produce condition</p>
                        </div>
                      </button>
                      {capturePreview && !aiResult && (
                        <div className="relative rounded-xl overflow-hidden h-28">
                          <img src={capturePreview} alt="Preview" className="w-full h-full object-cover" />
                        </div>
                      )}
                      {aiError && (
                        <div className="flex items-start gap-2 p-3 rounded-xl"
                          style={{ backgroundColor: 'rgba(192,57,43,0.07)', border: '1px solid rgba(192,57,43,0.2)' }}>
                          <AlertTriangle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
                          <p className="text-xs text-red-600">{aiError}</p>
                        </div>
                      )}
                      <p className="text-[10px] text-[#6B7280] text-center">Or select condition manually below</p>
                    </div>
                  )}
                </div>

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

                <div className="rounded-xl p-3" style={{ backgroundColor: '#F3F4F6', border: '1px solid #E4E7EC' }}>
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

            {/* STEP 2: Facility */}
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

            {/* STEP 2 skip path */}
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

            {/* STEP 3: Success */}
            {step === 3 && (
              <motion.div key="s3"
                initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.28 }} className="px-5 pb-8 space-y-4">

                <div className="flex items-center gap-3 p-4 rounded-2xl"
                  style={{ backgroundColor: '#E6F6EC', border: '1px solid #A7D7B6' }}>
                  <div className="w-10 h-10 rounded-xl bg-[#27AE60]/15 flex items-center justify-center flex-shrink-0">
                    <CheckCircle2 className="w-5 h-5 text-[#27AE60]" />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-[#166534]">{unitName} added successfully</p>
                    <p className="text-xs text-[#166534]/70 mt-0.5">
                      Device ID: <span className="font-mono font-bold">{deviceCode}</span>
                    </p>
                  </div>
                </div>

                {!skipProduce && (
                  <div className="rounded-2xl p-4"
                    style={{ backgroundColor: shelfLife.color + '10', border: `1px solid ${shelfLife.color}25` }}>
                    <p className="text-xs font-semibold text-[#374151] mb-0.5">Estimated shelf life with ColdWatch active</p>
                    <p className="text-xl font-bold" style={{ color: shelfLife.color }}>{shelfLife.label}</p>
                  </div>
                )}

                <div className="rounded-2xl p-4" style={{ backgroundColor: '#EBF4FF', border: '1px solid #BFDBFE' }}>
                  <p className="text-xs font-semibold text-[#1D4ED8] mb-1">Ready to connect your ESP32?</p>
                  <p className="text-xs text-[#1E40AF] leading-relaxed mb-3">
                    The full step-by-step connection guide — including your Device ID <span className="font-mono font-bold">{deviceCode}</span>, API endpoint, firmware flashing, and WiFi setup — is available in Settings.
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
              className="flex-1 h-12 rounded-2xl text-white text-sm font-bold active:scale-[0.98] flex items-center justify-center gap-2"
              style={{ backgroundColor: '#0984E3' }}>
              Continue <ChevronRight className="w-4 h-4" />
            </button>
          )}
          {step === 1 && (
            <button onClick={() => { setSkipProduce(false); setStep(2); }}
              className="flex-1 h-12 rounded-2xl text-white text-sm font-bold active:scale-[0.98] flex items-center justify-center gap-2"
              style={{ backgroundColor: '#0984E3' }}>
              Continue <ChevronRight className="w-4 h-4" />
            </button>
          )}
          {step === 2 && (
            <button onClick={handleStep2} disabled={saving}
              className="flex-1 h-12 rounded-2xl text-white text-sm font-bold active:scale-[0.98] flex items-center justify-center gap-2 disabled:opacity-60"
              style={{ backgroundColor: '#0984E3' }}>
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <>Save Device <Check className="w-4 h-4" /></>}
            </button>
          )}
          {step === 3 && (
            <button onClick={onClose}
              className="flex-1 h-12 rounded-2xl text-white text-sm font-bold active:scale-[0.98]"
              style={{ backgroundColor: '#0984E3' }}>
              Done
            </button>
          )}
        </div>
      </motion.div>
    </>
  );
}

// ── Configure Sheet ───────────────────────────────────────────────────────────
// Tabbed bottom sheet letting users update all device settings after creation:
// Identity (name/location), Produce setup, Alert thresholds, Sensor offsets

const CONFIG_TABS = [
  { id: 'identity',   label: 'Identity'   },
  { id: 'produce',    label: 'Produce'    },
  { id: 'thresholds', label: 'Thresholds' },
  { id: 'offsets',    label: 'Offsets'    },
] as const;
type ConfigTab = typeof CONFIG_TABS[number]['id'];

const CONFIGURE_PRODUCE = WIZARD_PRODUCE;
const CONFIGURE_STATES  = PRODUCE_STATES;

function ConfigureSheet({ device, onClose }: { device: Device; onClose: () => void }) {
  const { updateDevice, updateProduceSetup, addToast, isAdvancedUser } = useApp();
  const [activeTab, setActiveTab] = useState<ConfigTab>('identity');
  const [saving,    setSaving]    = useState(false);

  // Identity
  const [unitName,  setUnitName]  = useState(device.unitName || device.name);
  const [location,  setLocation]  = useState(device.location);

  // Produce
  const [produceId,    setProduceId]    = useState<WizardProduceId>((device.produceMode as WizardProduceId) || 'mixed');
  const [produceState, setProduceState] = useState<ProduceState>(device.produceState || 'fresh');
  const [facilitySize, setFacilitySize] = useState<FacilitySizeId>((device.facilitySize as FacilitySizeId) || 'small');
  const [transportHours, setTransportHours] = useState(device.transportHours ?? 2);

  // Thresholds
  const [useCustom,    setUseCustom]    = useState(device.useCustomThresholds ?? false);
  const [warnTemp,     setWarnTemp]     = useState(String(device.warningTemperature  ?? 10));
  const [critTemp,     setCritTemp]     = useState(String(device.criticalTemperature ?? 15));
  const [warnHumid,    setWarnHumid]    = useState(String(device.warningHumidity     ?? 80));
  const [critHumid,    setCritHumid]    = useState(String(device.criticalHumidity    ?? 90));
  const [humidHigh,    setHumidHigh]    = useState(device.humidAlertHigh !== false);

  // Offsets
  const [tempOffset,  setTempOffset]  = useState(String(device.tempOffset  ?? 0));
  const [humidOffset, setHumidOffset] = useState(String(device.humidOffset ?? 0));

  // Reset all local state when the device being configured changes
  useEffect(() => {
    setProduceId((device.produceMode as WizardProduceId) || 'mixed');
    setProduceState(device.produceState || 'fresh');
    setFacilitySize((device.facilitySize as FacilitySizeId) || 'small');
    setTransportHours(device.transportHours ?? 2);
    setUseCustom(device.useCustomThresholds ?? false);
    setWarnTemp(String(device.warningTemperature  ?? 10));
    setCritTemp(String(device.criticalTemperature ?? 15));
    setWarnHumid(String(device.warningHumidity    ?? 80));
    setCritHumid(String(device.criticalHumidity   ?? 90));
    setHumidHigh(device.humidAlertHigh !== false);
    setTempOffset(String(device.tempOffset  ?? 0));
    setHumidOffset(String(device.humidOffset ?? 0));
  }, [device.id]);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, []);

  const handleSave = () => {
    setSaving(true);
    setTimeout(() => {
      // Identity
      updateDevice(device.id, {
        name:     unitName.trim(),
        unitName: unitName.trim(),
        location: location.trim(),
      });

      // Produce metadata (mode is applied live via ProduceModeSelector)
      updateProduceSetup(device.id, {
        produceMode:  device.produceMode as ProduceMode || 'mixed',
        produceState,
        facilitySize,
        transportHours,
      });

      // Thresholds
      updateDevice(device.id, {
        useCustomThresholds: useCustom,
        warningTemperature:  parseFloat(warnTemp)  || 10,
        criticalTemperature: parseFloat(critTemp)  || 15,
        warningHumidity:     parseFloat(warnHumid) || 80,
        criticalHumidity:    parseFloat(critHumid) || 90,
        humidAlertHigh:      humidHigh,
      });

      // Offsets (advanced users only)
      if (isAdvancedUser) {
        updateDevice(device.id, {
          tempOffset:  parseFloat(tempOffset)  || 0,
          humidOffset: parseFloat(humidOffset) || 0,
        });
      }

      addToast({ id: `cfg-${Date.now()}`, type: 'success', message: `${unitName.trim()} updated` });
      setSaving(false);
      onClose();
    }, 500);
  };

  const inputBase = "w-full px-4 py-3 rounded-xl border border-[#E4E7EC] bg-[#F3F4F6] text-[#111827] outline-none focus:border-[#0984E3] focus:ring-2 focus:ring-[#0984E3]/20 transition-all text-sm";
  const numInput  = (val: string, set: (v: string) => void, placeholder: string) => (
    <input
      type="number"
      inputMode="decimal"
      value={val}
      onChange={e => set(e.target.value)}
      placeholder={placeholder}
      className={inputBase}
      style={{ height: 48 }}
    />
  );

  return (
    <>
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        className="fixed inset-0 bg-black/50 z-[55] backdrop-blur-sm" onClick={onClose} />
      <motion.div initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
        transition={{ type: 'spring', stiffness: 380, damping: 38 }}
        className="fixed bottom-0 left-0 right-0 z-[60] bg-white rounded-t-3xl shadow-2xl border-t border-[#E4E7EC] flex flex-col"
        style={{ maxHeight: '92dvh' }}>

        {/* Handle */}
        <div className="flex justify-center pt-3 pb-1 flex-shrink-0">
          <div className="w-10 h-1 rounded-full bg-[#D1D5DB]" />
        </div>

        {/* Header */}
        <div className="px-5 pt-2 pb-3 flex items-center justify-between flex-shrink-0">
          <div>
            <p className="font-bold text-[#111827] text-lg">Configure Device</p>
            <p className="text-[#6B7280] font-mono text-xs mt-0.5">{device.deviceCode || device.id.slice(0, 8)}</p>
          </div>
          <button onClick={onClose}
            className="w-8 h-8 rounded-full bg-[#F3F4F6] flex items-center justify-center active:bg-[#E4E7EC]">
            <X className="w-4 h-4 text-[#6B7280]" />
          </button>
        </div>

        {/* Tabs */}
        <div className="px-5 pb-2 flex-shrink-0">
          <div className="flex gap-1 p-1 rounded-xl bg-[#F3F4F6]">
            {CONFIG_TABS.filter(t => t.id !== 'offsets' || isAdvancedUser).map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className="flex-1 py-2 rounded-lg text-xs font-semibold transition-all"
                style={{
                  backgroundColor: activeTab === tab.id ? '#FFFFFF' : 'transparent',
                  color:           activeTab === tab.id ? '#111827'  : '#6B7280',
                  boxShadow:       activeTab === tab.id ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
                }}>
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* Tab content */}
        <div className="flex-1 overflow-y-auto overscroll-contain px-5 pb-4">
          <AnimatePresence mode="wait">

            {/* ── Identity ── */}
            {activeTab === 'identity' && (
              <motion.div key="identity"
                initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -12 }}
                className="space-y-4 pt-2">
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-[#374151] uppercase tracking-wide">Storage Unit Name</label>
                  <input value={unitName} onChange={e => setUnitName(e.target.value)}
                    placeholder="e.g. Cold Room A" className={inputBase} style={{ height: 52, fontSize: 16 }} />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-[#374151] uppercase tracking-wide">Location</label>
                  <input value={location} onChange={e => setLocation(e.target.value)}
                    placeholder="e.g. Kumasi Central Market" className={inputBase} style={{ height: 52, fontSize: 16 }} />
                </div>
                <div className="p-3 rounded-xl" style={{ backgroundColor: '#F3F4F6', border: '1px solid #E4E7EC' }}>
                  <p className="text-[11px] text-[#6B7280]">
                    Device ID <span className="font-mono font-bold text-[#111827]">{device.deviceCode || '—'}</span> is permanent and cannot be changed here. To reuse this ID, remove and re-add the device.
                  </p>
                </div>
              </motion.div>
            )}

            {/* ── Produce ── */}
            {activeTab === 'produce' && (
              <motion.div key="produce"
                initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -12 }}
                className="space-y-5 pt-2">

                <ProduceModeSelector
                  deviceId={device.id}
                  currentMode={(device.produceMode as ProduceMode) || 'mixed'}
                />

                <div>
                  <p className="text-xs font-semibold text-[#374151] uppercase tracking-wide mb-2">Produce Condition</p>
                  <div className="space-y-2">
                    {CONFIGURE_STATES.map(ps => (
                      <button key={ps.id} onClick={() => setProduceState(ps.id)}
                        className="w-full flex items-center gap-3 p-3 rounded-xl text-left transition-all active:scale-[0.98]"
                        style={{
                          border:          `1.5px solid ${produceState === ps.id ? ps.color + '60' : '#E4E7EC'}`,
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

                <div>
                  <p className="text-xs font-semibold text-[#374151] uppercase tracking-wide mb-2">Facility Size</p>
                  <div className="space-y-2">
                    {FACILITY_SIZES.map(fs => (
                      <button key={fs.id} onClick={() => setFacilitySize(fs.id)}
                        className="w-full flex items-center gap-3 p-3 rounded-xl text-left active:scale-[0.98]"
                        style={{
                          border:          `1.5px solid ${facilitySize === fs.id ? '#0984E380' : '#E4E7EC'}`,
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
                  <div className="flex items-center justify-between mb-1">
                    <p className="text-xs font-semibold text-[#374151] uppercase tracking-wide">Transport Time</p>
                    <span className="text-sm font-bold text-[#0984E3]">{transportHours}h</span>
                  </div>
                  <input type="range" min={0} max={48} step={1} value={transportHours}
                    onChange={e => setTransportHours(Number(e.target.value))}
                    className="w-full accent-[#0984E3]" />
                  <div className="flex justify-between text-[9px] text-[#9CA3AF] mt-1">
                    <span>0h</span><span>12h</span><span>24h</span><span>36h</span><span>48h</span>
                  </div>
                </div>

                {/* Target preview */}
                <div className="p-3 rounded-xl" style={{ backgroundColor: '#F3F4F6', border: '1px solid #E4E7EC' }}>
                  <p className="text-[10px] text-[#6B7280] uppercase tracking-wide mb-1.5">Targets that will be applied</p>
                  {(() => {
                    const targets = getStateAdjustedTargets(produceId as ProduceMode, produceState);
                    return (
                      <div className="flex gap-4">
                        <span className="text-sm font-bold text-[#0984E3]">🌡 {targets.targetTemperature}°C</span>
                        <span className="text-sm font-bold text-[#0984E3]">💧 {targets.targetHumidity}% RH</span>
                      </div>
                    );
                  })()}
                </div>
              </motion.div>
            )}

            {/* ── Thresholds ── */}
            {activeTab === 'thresholds' && (
              <motion.div key="thresholds"
                initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -12 }}
                className="space-y-5 pt-2">

                {/* Custom threshold toggle */}
                <div className="flex items-center justify-between p-4 rounded-2xl"
                  style={{ backgroundColor: useCustom ? '#EBF4FF' : '#F3F4F6', border: `1.5px solid ${useCustom ? '#0984E380' : '#E4E7EC'}` }}>
                  <div>
                    <p className="text-sm font-semibold text-[#111827]">Custom Thresholds</p>
                    <p className="text-[11px] text-[#6B7280] mt-0.5">
                      {useCustom ? 'Using device-specific thresholds' : 'Using global settings thresholds'}
                    </p>
                  </div>
                  <button
                    onClick={() => setUseCustom(v => !v)}
                    className="relative w-11 h-6 rounded-full transition-colors flex-shrink-0"
                    style={{ backgroundColor: useCustom ? '#0984E3' : '#D1D5DB' }}>
                    <motion.div
                      animate={{ x: useCustom ? 20 : 2 }}
                      transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                      className="absolute top-1 w-4 h-4 rounded-full bg-white shadow-sm"
                    />
                  </button>
                </div>

                {useCustom && (
                  <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
                    {/* Temperature */}
                    <div>
                      <p className="text-xs font-semibold text-[#374151] uppercase tracking-wide mb-2 flex items-center gap-1.5">
                        🌡 Temperature Thresholds
                      </p>
                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1">
                          <label className="text-[11px] text-[#6B7280] font-medium">Warning (°C)</label>
                          {numInput(warnTemp, setWarnTemp, '10')}
                        </div>
                        <div className="space-y-1">
                          <label className="text-[11px] text-[#6B7280] font-medium">Critical (°C)</label>
                          {numInput(critTemp, setCritTemp, '15')}
                        </div>
                      </div>
                    </div>

                    {/* Humidity */}
                    <div>
                      <p className="text-xs font-semibold text-[#374151] uppercase tracking-wide mb-2 flex items-center gap-1.5">
                        💧 Humidity Thresholds
                      </p>
                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1">
                          <label className="text-[11px] text-[#6B7280] font-medium">Warning (%)</label>
                          {numInput(warnHumid, setWarnHumid, '80')}
                        </div>
                        <div className="space-y-1">
                          <label className="text-[11px] text-[#6B7280] font-medium">Critical (%)</label>
                          {numInput(critHumid, setCritHumid, '90')}
                        </div>
                      </div>
                    </div>

                    {/* Humidity alert direction */}
                    <div>
                      <p className="text-xs font-semibold text-[#374151] uppercase tracking-wide mb-2">Alert when humidity is…</p>
                      <div className="grid grid-cols-2 gap-2">
                        {[
                          { val: true,  label: 'Too High', desc: 'Tubers, legumes, meat', emoji: '💧⬆️' },
                          { val: false, label: 'Too Low',  desc: 'Leafy veg, fruits',     emoji: '💧⬇️' },
                        ].map(opt => (
                          <button key={String(opt.val)} onClick={() => setHumidHigh(opt.val)}
                            className="p-3 rounded-xl text-left transition-all active:scale-[0.97]"
                            style={{
                              border:          `1.5px solid ${humidHigh === opt.val ? '#0984E380' : '#E4E7EC'}`,
                              backgroundColor: humidHigh === opt.val ? '#EBF4FF' : '#FFFFFF',
                            }}>
                            <p className="text-base mb-1">{opt.emoji}</p>
                            <p className="text-xs font-semibold" style={{ color: humidHigh === opt.val ? '#0984E3' : '#111827' }}>
                              {opt.label}
                            </p>
                            <p className="text-[10px] text-[#6B7280]">{opt.desc}</p>
                          </button>
                        ))}
                      </div>
                    </div>
                  </motion.div>
                )}

                {!useCustom && (
                  <div className="p-3 rounded-xl" style={{ backgroundColor: '#FFF8F0', border: '1px solid #F5CBA7' }}>
                    <p className="text-[11px] text-[#7A3010] leading-relaxed">
                      Global thresholds are used. Enable custom thresholds above to set values specific to this device.
                    </p>
                  </div>
                )}
              </motion.div>
            )}

            {/* ── Offsets (advanced users only) ── */}
            {activeTab === 'offsets' && isAdvancedUser && (
              <motion.div key="offsets"
                initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -12 }}
                className="space-y-4 pt-2">

                <div className="p-3 rounded-xl" style={{ backgroundColor: '#EBF4FF', border: '1px solid #BFDBFE' }}>
                  <p className="text-xs font-semibold text-[#1D4ED8] mb-1">What are sensor offsets?</p>
                  <p className="text-[11px] text-[#1E40AF] leading-relaxed">
                    The SHT31 sensor can read slightly high due to self-heating inside the enclosure. Offsets are added to every raw reading before alert evaluation. Use a reference thermometer to measure the discrepancy, then set the correction here.
                  </p>
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-semibold text-[#374151] uppercase tracking-wide">Temperature Offset (°C)</label>
                  <p className="text-[10px] text-[#6B7280] mb-1.5">e.g. -1.5 if sensor reads 1.5°C too high</p>
                  {numInput(tempOffset, setTempOffset, '0')}
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-semibold text-[#374151] uppercase tracking-wide">Humidity Offset (%)</label>
                  <p className="text-[10px] text-[#6B7280] mb-1.5">e.g. +2 if sensor reads 2% too low</p>
                  {numInput(humidOffset, setHumidOffset, '0')}
                </div>

                <div className="p-3 rounded-xl" style={{ backgroundColor: 'rgba(192,57,43,0.06)', border: '1px solid rgba(192,57,43,0.2)' }}>
                  <p className="text-[11px] text-red-600 leading-relaxed">
                    ⚠️ Large offsets can mask real temperature problems. Only set these if you have verified the discrepancy with a calibrated reference thermometer.
                  </p>
                </div>
              </motion.div>
            )}

          </AnimatePresence>
        </div>

        {/* Save button */}
        <div className="flex-shrink-0 px-5 border-t border-[#E4E7EC] bg-white"
          style={{ paddingTop: 14, paddingBottom: 'calc(env(safe-area-inset-bottom) + 14px)' }}>
          <div className="flex gap-3">
            <button onClick={onClose}
              className="flex-1 rounded-2xl border-2 border-[#E4E7EC] text-[#6B7280] font-semibold active:bg-[#F3F4F6]"
              style={{ fontSize: 16, minHeight: 54 }}>
              Cancel
            </button>
            <button onClick={handleSave} disabled={saving || !unitName.trim()}
              className="flex-1 rounded-2xl text-white font-bold active:scale-[0.98] flex items-center justify-center gap-2 disabled:opacity-50"
              style={{ fontSize: 16, minHeight: 54, backgroundColor: '#0984E3' }}>
              {saving
                ? <><div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />Saving…</>
                : <><Check className="w-5 h-5" />Save Changes</>
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
  const {
    devices, deleteDevice, addToast, setActivePage, setSelectedDeviceId,
    isAdvancedUser, updateDevice,
  } = useApp();

 // Hooks must be declared before any conditional return (Rules of Hooks)
const [showAddModal,       setShowAddModal]       = useState(false);
const [configuringDevice,  setConfiguringDevice]  = useState<Device | null>(null);
const [removingDevice,     setRemovingDevice]     = useState<Device | null>(null);

const isLoading = usePageLoading();
if (isLoading) return <DevicesSkeleton />;
  const handleViewDashboard = (deviceId: string) => {
    setSelectedDeviceId(deviceId);
    setActivePage('dashboard');
  };

  const handleRemoveConfirm = async (
    device: Device,
    record: {
      conditionOnRemoval: RemovalConditionId;
      conditionImageBase64?: string;
      conditionImageMime?: string;
      aiAssessment?: string;
      notes: string;
    }
  ) => {
    const storageDurationDays = device.storedSince ? daysSince(device.storedSince) : 0;

    try {
      // Save the produce record first — if this fails we do NOT delete the
      // device, so the user can try again without losing their data.
      await produceRecordsApi.create({
        deviceId:            device.id,
        deviceCode:          device.deviceCode,
        unitName:            device.unitName,
        conditionOnRemoval:  record.conditionOnRemoval,
        conditionImageBase64: record.conditionImageBase64,
        conditionImageMime:  record.conditionImageMime,
        aiAssessment:        record.aiAssessment,
        storageDurationDays,
        produceMode:         device.produceMode,
      });
    } catch {
      // Record save failed — notify the user and abort. The device stays
      // registered; they can retry or remove without saving the record.
      addToast({
        id:       `toast-record-err-${Date.now()}`,
        type:     'error',
        message:  'Could not save produce record. Check your connection and try again.',
        duration: 6000,
      });
      return;
    }

    // Record is saved — now remove the device from the app and the backend.
    deleteDevice(device.id);
    setRemovingDevice(null);
    addToast({
      id:       `toast-remove-${Date.now()}`,
      type:     'success',
      message:  `${device.unitName ?? device.deviceCode ?? 'Device'} removed. Produce record saved.`,
      duration: 5000,
    });
  };

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
            <div className="flex items-start justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-xl flex items-center justify-center"
                  style={{ backgroundColor: device.status === 'online' ? 'rgba(9,132,227,0.1)' : 'rgba(192,57,43,0.08)' }}>
                  <Cpu className="w-6 h-6" style={{ color: device.status === 'online' ? '#0984E3' : '#C0392B' }} />
                </div>
                <div>
                  {/* Device ID badge */}
                  <div className="flex items-center gap-1.5 mb-0.5">
                    <span className="font-mono text-[11px] font-bold px-2 py-0.5 rounded-md"
                      style={{ backgroundColor: '#F3F4F6', color: '#374151' }}>
                      {device.deviceCode || device.id.slice(0, 8)}
                    </span>
                  </div>
                  {/* Storage Unit Name */}
                  <h3 className="text-[#111827] font-semibold text-sm leading-tight">
                    {device.unitName || device.name}
                  </h3>
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

            {/* Produce badge + storage duration */}
            {device.produceSetupComplete && device.produceMode && (
              <div className="flex items-center gap-2 mb-4 flex-wrap">
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
                {device.storedSince && (
                  <span className="flex items-center gap-1 text-[10px] text-[#6B7280]">
                    <Clock className="w-3 h-3" />
                    {daysSince(device.storedSince)}d stored
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
            <div className="flex gap-2">
              <button onClick={() => handleViewDashboard(device.id)}
                className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-white text-xs font-semibold active:scale-[0.98]"
                style={{ backgroundColor: '#0984E3' }}>
                Dashboard <ChevronRight className="w-3.5 h-3.5" />
              </button>
              <button onClick={() => setConfiguringDevice(device)}
                className="flex-1 flex items-center justify-center gap-1.5 py-2.5 border border-[#E4E7EC] rounded-xl text-[#6B7280] text-xs font-semibold active:bg-[#F3F4F6]">
                <Settings2 className="w-3.5 h-3.5" /> Configure
              </button>
              <button
                onClick={() => setRemovingDevice(device)}
                className="w-10 flex items-center justify-center border border-[#E4E7EC] rounded-xl text-red-400 active:bg-red-50"
                aria-label={`Remove ${device.unitName || device.name}`}
                title="Remove produce & device">
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
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
            Connect an ESP32 + SHT31 cold storage unit
          </p>
        </button>
      </div>

      {/* Bottom sheets */}
      <AnimatePresence>
        {configuringDevice && (
          <ConfigureSheet key="configure" device={configuringDevice} onClose={() => setConfiguringDevice(null)} />
        )}
        {showAddModal && (
          <AddDeviceModal key="add" onClose={() => setShowAddModal(false)} onGoToSettings={() => { setShowAddModal(false); setActivePage('settings'); }} />
        )}
        {removingDevice && (
          <RemoveProduceSheet
            key="remove"
            device={removingDevice}
            onClose={() => setRemovingDevice(null)}
            onConfirm={(record) => handleRemoveConfirm(removingDevice, record)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}