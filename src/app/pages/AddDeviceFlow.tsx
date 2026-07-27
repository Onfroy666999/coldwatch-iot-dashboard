import { useState, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  ChevronLeft, ChevronDown, X, XCircle, Check, Hash, Camera, Upload, Loader2, CheckCircle2,
  AlertTriangle, Info, PackageCheck, ThermometerSnowflake, Droplets, Clock, Maximize2,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import type { ProduceState } from '../context/AppContext';
import {
  CATEGORIES, CATEGORY_EMOJI, getCropsByCategory, getPairCompatibility, getStorageScore, scoreToTier,
  COMPATIBILITY_EXAMPLES, getCrop, getCategoryOfCrop, getCompatibleCrops, getConflicts,
  type CropId, type CategoryId, type PairCompatibility, type PairTier,
} from '../data/produce';
import { aiApi } from '../Lib/api';

// ── Local constants — small/stable enough to keep self-contained here rather
// than threading exports through Devices.tsx ─────────────────────────────────

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
type FacilitySizeId = typeof FACILITY_SIZES[number]['id'];

// Fallback glyph shown until a real photo exists at /produce-images/{imageId}.jpg
// — matches the naming convention from the Gemini image-gen prompt doc, so
// dropping generated files into public/produce-images/ just starts working
// with no code change. (Definition lives in produce.ts — CATEGORY_EMOJI is
// shared with ProduceGuide.tsx, not redefined here.)

const CATEGORY_BASE_HOURS: Record<CategoryId, number> = {
  tubers: 336, fruits: 96, vegetables: 96, leafy: 48, legumes: 720, meat: 72,
};

// Chunk 3 — pairwise compatibility display. Five engine tiers map onto the
// two visual buckets ("Safe Together" / "Store Separately") the migration
// guide's UX section asks for: excellent/good/acceptable all read as
// workable (green family), poor/never read as not recommended (red/orange).
export const TIER_COLOR: Record<PairTier, string> = {
  excellent: '#27AE60', good: '#52B788', acceptable: '#7FB37F', poor: '#E67E22', never: '#C0392B',
};
export const TIER_LABEL: Record<PairTier, string> = {
  excellent: 'Excellent match', good: 'Good match', acceptable: 'Acceptable — workable',
  poor: 'Not recommended', never: 'Never store together',
};

export interface GroupCompatibility {
  pairwise: PairCompatibility[];
  storageScore: number;
  overallTier: PairTier;
  safeTogether: PairCompatibility[];
  storeSeparately: PairCompatibility[];
  hasHardBlock: boolean;
}

// Shared by AddDeviceFlow's Compatibility step and Devices.tsx's Produce tab
// (Chunk 5 unification) — one place computing "how does this whole selected
// set score/bucket", so the two screens can never silently drift apart the
// way CATEGORY_EMOJI once did before it was centralized.
export function computeGroupCompatibility(cropIds: CropId[]): GroupCompatibility {
  const pairwise: PairCompatibility[] = [];
  for (let i = 0; i < cropIds.length; i++) {
    for (let j = i + 1; j < cropIds.length; j++) {
      pairwise.push(getPairCompatibility(cropIds[i], cropIds[j]));
    }
  }
  const storageScore = cropIds.length >= 2 ? getStorageScore(cropIds) : 100;
  const overallTier = scoreToTier(storageScore);
  const safeTogether = pairwise.filter(p => p.tier === 'excellent' || p.tier === 'good' || p.tier === 'acceptable');
  const storeSeparately = pairwise.filter(p => p.tier === 'poor' || p.tier === 'never');
  const hasHardBlock = pairwise.some(p => p.tier === 'never');
  return { pairwise, storageScore, overallTier, safeTogether, storeSeparately, hasHardBlock };
}

function fileToBase64(file: File): Promise<{ base64: string; mimeType: string }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      resolve({ base64: result.split(',')[1], mimeType: file.type || 'image/jpeg' });
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export function estimateShelfLifeForCrops(
  cropIds: CropId[], categoriesOf: (id: CropId) => CategoryId,
  state: ProduceState, transportHours: number,
): { hours: number; label: string; color: string } {
  const categories = Array.from(new Set(cropIds.map(categoriesOf)));
  // Protect the most sensitive category represented, same principle as
  // deriveTargetsForCrops protecting the most sensitive crop's thresholds.
  const base = categories.length ? Math.min(...categories.map(c => CATEGORY_BASE_HOURS[c])) : 168;
  const STATE_MULT: Record<ProduceState, number> = {
    fresh: 1.0, 'in-between': 0.65, dried: 1.4, 'almost-damaged': 0.3,
  };
  const hours = Math.max(4, Math.round((base - transportHours * 1.5) * STATE_MULT[state]));
  const color = hours < 24 ? '#C0392B' : hours < 72 ? '#E67E22' : '#27AE60';
  const label = hours < 24  ? `~${hours}h — urgent`
              : hours < 48  ? `~${hours}h — act soon`
              : hours < 168 ? `~${Math.round(hours / 24)} days`
              :               `~${Math.round(hours / 24 / 7)} weeks`;
  return { hours, label, color };
}

// ── Produce tile (category or crop) — photo with graceful emoji fallback ────

export function ProduceTile({
  imageId, emoji, label, tagline, selected, onClick, tint, accent, badge,
}: {
  imageId: string; emoji: string; label: string; tagline?: string;
  selected: boolean; onClick: () => void; tint: string; accent: string; badge?: number;
}) {
  const [imgError, setImgError] = useState(false);
  return (
    <button
      onClick={onClick}
      className="rounded-2xl p-2.5 text-left active:scale-[0.97] transition-all relative"
      style={{ border: selected ? `2px solid ${accent}` : '1.5px solid #E4E7EC', backgroundColor: selected ? tint : '#FFFFFF' }}
    >
      <div className="w-full aspect-square rounded-xl overflow-hidden mb-2 relative" style={{ backgroundColor: tint }}>
        {!imgError ? (
          <img
            src={`/produce-images/${imageId}.jpg`}
            alt={label}
            className="w-full h-full object-cover"
            onError={() => setImgError(true)}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-4xl">{emoji}</div>
        )}
        {selected && (
          <div className="absolute top-1.5 right-1.5 w-6 h-6 rounded-full flex items-center justify-center shadow-sm"
            style={{ backgroundColor: accent }}>
            <Check className="w-3.5 h-3.5 text-white" />
          </div>
        )}
        {!!badge && !selected && (
          <div className="absolute top-1.5 right-1.5 min-w-[20px] h-5 px-1.5 rounded-full flex items-center justify-center text-[10px] font-bold text-white shadow-sm"
            style={{ backgroundColor: accent }}>
            {badge}
          </div>
        )}
      </div>
      <p className="text-xs font-semibold text-[#111827] leading-tight">{label}</p>
      {tagline && <p className="text-[10px] text-[#6B7280] leading-tight mt-0.5">{tagline}</p>}
    </button>
  );
}

// Compact, non-interactive image tile — used in the pairwise compatibility
// checker. Same graceful fallback to an emoji as ProduceTile, just smaller
// and not tappable.
export function CropThumb({ imageId, emoji, label, size = 64, onClick }: { imageId: string; emoji: string; label: string; size?: number; onClick?: () => void }) {
  const [imgError, setImgError] = useState(false);
  const body = (
    <>
      <div className="rounded-xl overflow-hidden flex items-center justify-center flex-shrink-0 relative"
        style={{ width: size, height: size, backgroundColor: '#F3F4F6' }}>
        {!imgError ? (
          <img
            src={`/produce-images/${imageId}.jpg`}
            alt={label}
            className="w-full h-full object-cover"
            onError={() => setImgError(true)}
          />
        ) : (
          <span style={{ fontSize: size * 0.4 }}>{emoji}</span>
        )}
        {onClick && (
          <div className="absolute bottom-0.5 right-0.5 w-4 h-4 rounded-full flex items-center justify-center"
            style={{ backgroundColor: 'rgba(17,24,39,0.55)' }}>
            <Maximize2 className="w-2 h-2 text-white" />
          </div>
        )}
      </div>
      <p className="text-[10px] font-medium text-[#374151] text-center leading-tight">{label}</p>
    </>
  );
  if (onClick) {
    return (
      <button onClick={onClick} className="flex flex-col items-center gap-1 active:scale-[0.96] transition-transform" style={{ width: size }}>
        {body}
      </button>
    );
  }
  return <div className="flex flex-col items-center gap-1" style={{ width: size }}>{body}</div>;
}

function CropPhoto({ imageId, emoji, label, rounded = 'rounded-xl' }: { imageId: string; emoji: string; label: string; rounded?: string }) {
  const [imgError, setImgError] = useState(false);
  return (
    <div className={`w-full h-full overflow-hidden flex items-center justify-center ${rounded}`} style={{ backgroundColor: '#F3F4F6' }}>
      {!imgError ? (
        <img src={`/produce-images/${imageId}.jpg`} alt={label} className="w-full h-full object-cover" onError={() => setImgError(true)} />
      ) : (
        <span className="text-3xl">{emoji}</span>
      )}
    </div>
  );
}

function CropChip({ id, onClick }: { id: CropId; onClick: () => void }) {
  const crop = getCrop(id);
  return (
    <button onClick={onClick}
      className="flex items-center gap-2 pl-1.5 pr-3 py-1.5 rounded-full flex-shrink-0 active:scale-[0.97] transition-transform"
      style={{ backgroundColor: '#F3F4F6', border: '1px solid #E4E7EC' }}>
      <div className="w-6 h-6 rounded-full overflow-hidden flex-shrink-0">
        <CropPhoto imageId={crop.imageId} emoji={CATEGORY_EMOJI[crop.category]} label={crop.label} rounded="rounded-full" />
      </div>
      <span className="text-xs font-medium text-[#374151]">{crop.label}</span>
    </button>
  );
}

// ── Full-size image preview — lets the user actually see what's being
// suggested/flagged, whether it's a single crop or a paired example photo.
interface LightboxImage { imageId: string; title: string; subtitle?: string; emoji?: string }

function ImageLightbox({ image, onClose }: { image: LightboxImage; onClose: () => void }) {
  const [imgError, setImgError] = useState(false);
  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.18 }}
      className="fixed inset-0 z-[999] flex items-center justify-center px-6"
      style={{ backgroundColor: 'rgba(17,24,39,0.85)' }}
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.92, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.92, opacity: 0 }}
        transition={{ duration: 0.2, ease: [0.34, 1.56, 0.64, 1] }}
        className="w-full max-w-sm"
        onClick={e => e.stopPropagation()}
      >
        <div className="rounded-2xl overflow-hidden bg-white">
          <div className="w-full aspect-square flex items-center justify-center" style={{ backgroundColor: '#F3F4F6' }}>
            {!imgError ? (
              <img src={`/produce-images/${image.imageId}.jpg`} alt={image.title} className="w-full h-full object-cover"
                onError={() => setImgError(true)} />
            ) : (
              <span className="text-6xl">{image.emoji ?? '🖼️'}</span>
            )}
          </div>
          <div className="flex items-center justify-between p-4 gap-3">
            <div className="min-w-0">
              <p className="text-sm font-bold text-[#111827]">{image.title}</p>
              {image.subtitle && <p className="text-xs text-[#6B7280] leading-snug mt-0.5">{image.subtitle}</p>}
            </div>
            <button onClick={onClose} className="w-8 h-8 rounded-full bg-[#F3F4F6] flex items-center justify-center active:scale-95 flex-shrink-0">
              <X className="w-4 h-4 text-[#6B7280]" />
            </button>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}

// ── Flow ──────────────────────────────────────────────────────────────────────

type FlowStep = 'device' | 'produce' | 'compat' | 'tips' | 'condition' | 'facility' | 'review' | 'skip-ready' | 'done';

const STEP_TITLES: Record<FlowStep, string> = {
  device: 'Device details',
  produce: 'What are you storing?',
  compat: 'Mixed storage check',
  tips: 'Preservation tips',
  condition: 'Current condition',
  facility: 'Storage facility',
  review: 'Review & confirm',
  'skip-ready': 'Ready to save',
  done: 'Device added',
};

export default function AddDeviceFlow() {
  const { addDevice, addToast, devices, setActivePage } = useApp();

  const [stepStack, setStepStack] = useState<FlowStep[]>(['device']);
  const step = stepStack[stepStack.length - 1];
  const goTo   = (s: FlowStep) => setStepStack(prev => [...prev, s]);
  const goBack = () => setStepStack(prev => (prev.length > 1 ? prev.slice(0, -1) : prev));
  const close  = () => setActivePage('devices');

  // ── Device identity ────────────────────────────────────────────────────────
  const existingCodes = devices.map(d => d.deviceCode).filter(Boolean) as string[];
  const [deviceCode, setDeviceCode] = useState('');
  const [codeSuffix, setCodeSuffix] = useState('');
  const [codeError,  setCodeError]  = useState('');
  const [unitName,   setUnitName]   = useState('');
  const [location,   setLocation]   = useState('');
  const [error,      setError]      = useState('');

  // ── Produce: category + crop multi-select ─────────────────────────────────
  const [pickerCategory, setPickerCategory] = useState<CategoryId | null>(null);
  const [selectedCrops,  setSelectedCrops]  = useState<CropId[]>([]);
  const [skipProduce,    setSkipProduce]    = useState(false);
  // True when the user took the Quick Setup shortcut (single crop, defaults
  // applied, tips/condition/facility skipped) rather than the full wizard.
  // Only affects the progress bar and totalSteps below — deriveTargetsForCrops
  // (the actual saved warning/critical thresholds) depends only on cropIds,
  // never on produceState/facilitySize/transportHours, so the defaults this
  // path leaves in place don't affect device configuration, only the
  // display-only shelf-life estimate shown on Review.
  const [quickSetup,     setQuickSetup]     = useState(false);

  // ── Condition ──────────────────────────────────────────────────────────────
  const [produceState,   setProduceState]   = useState<ProduceState>('fresh');
  const [capturePreview, setCapturePreview] = useState<string | null>(null);
  const [analysing,      setAnalysing]      = useState(false);
  const [aiResult, setAiResult] = useState<{ state: ProduceState; confidence: 'high' | 'medium' | 'low'; explanation: string } | null>(null);
  const [aiError,  setAiError]  = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── Facility ───────────────────────────────────────────────────────────────
  const [facilitySize,   setFacilitySize]   = useState<FacilitySizeId>('small');
  const [transportHours, setTransportHours] = useState(2);

  const [saving, setSaving] = useState(false);
  const [viewingImage, setViewingImage] = useState<LightboxImage | null>(null);

  const { storageScore, overallTier, safeTogether, storeSeparately, hasHardBlock } =
    computeGroupCompatibility(selectedCrops);
  const [showMixingGuide, setShowMixingGuide] = useState(false);
  const shelfLife = estimateShelfLifeForCrops(selectedCrops, getCategoryOfCrop, produceState, transportHours);

  const validateCode = (code: string) => {
    const trimmed = code.trim().toUpperCase();
    if (!trimmed || trimmed === 'CW-') return 'Device ID is required — enter the 6 characters from your device.';
    if (!/^CW-[A-F0-9]{6}$/i.test(trimmed)) return `${6 - codeSuffix.length} more character${6 - codeSuffix.length === 1 ? '' : 's'} needed (only A–F and 0–9).`;
    if (existingCodes.includes(trimmed)) return 'This Device ID is already in use. Choose another.';
    return '';
  };

  const handleDeviceNext = () => {
    setError('');
    const cErr = validateCode(deviceCode);
    if (cErr) { setCodeError(cErr); return; }
    if (!unitName.trim()) { setError('Storage Unit Name is required.'); return; }
    if (!location.trim()) { setError('Location is required.'); return; }
    setDeviceCode(deviceCode.trim().toUpperCase());
    goTo('produce');
  };

  const toggleCrop = (id: CropId) => {
    setSelectedCrops(prev => prev.includes(id) ? prev.filter(c => c !== id) : [...prev, id]);
  };

  const handleProduceContinue = () => {
    goTo(selectedCrops.length >= 2 ? 'compat' : 'tips');
  };

  // "I store yams, just give me defaults" — for a single crop, skip tips/
  // condition/facility entirely and go straight to Review with whatever
  // produceState/facilitySize/transportHours are already defaulted to.
  // Still fully editable from Review's "Edit" links afterward.
  const handleQuickSetup = () => {
    setQuickSetup(true);
    goTo('review');
  };

  const handleSkip = () => {
    setSkipProduce(true);
    goTo('skip-ready');
  };

  const handleKeepFirstOnly = () => {
    const first = selectedCrops[0];
    setSelectedCrops(first ? [first] : []);
    addToast({
      id: `keep-first-${Date.now()}`, type: 'info',
      message: 'Kept one crop for this device — add the rest as a second device afterward.',
    });
    goBack(); // back to 'produce' to review/adjust
  };

  const handleImageSelected = async (file: File) => {
    setAiError(''); setAiResult(null);
    setCapturePreview(URL.createObjectURL(file));
    setAnalysing(true);
    try {
      const { base64, mimeType } = await fileToBase64(file);
      const result = await aiApi.vision({ base64Image: base64, mimeType });
      const validStates: ProduceState[] = ['fresh', 'in-between', 'dried', 'almost-damaged'];
      if (!validStates.includes(result.state as ProduceState)) throw new Error('Invalid state from AI');
      setAiResult({
        state: result.state as ProduceState,
        confidence: (result.confidence ?? 'medium') as 'high' | 'medium' | 'low',
        explanation: result.explanation ?? '',
      });
    } catch {
      setAiError('Could not analyse the image. Please select a condition manually or try a clearer photo.');
      setCapturePreview(null);
    } finally {
      setAnalysing(false);
    }
  };

  const handleFinalSubmit = async () => {
    setSaving(true);
    try {
      if (skipProduce) {
        await addDevice(unitName.trim(), location.trim(), undefined, deviceCode.trim().toUpperCase(), unitName.trim());
      } else {
        await addDevice(unitName.trim(), location.trim(), {
          cropIds: selectedCrops, produceState, facilitySize, transportHours,
        }, deviceCode.trim().toUpperCase(), unitName.trim());
      }
      goTo('done');
    } catch {
      // addDevice already showed an error toast — stay put so they can retry
    } finally {
      setSaving(false);
    }
  };

  const totalSteps = skipProduce ? 3 : quickSetup ? 3 : (selectedCrops.length >= 2 ? 7 : 6);
  const progressPct = Math.min(100, Math.round((stepStack.length / totalSteps) * 100));

  const inputBase = "w-full px-4 py-3 rounded-xl border border-[#E4E7EC] bg-[#F3F4F6] text-[#111827] outline-none focus:border-[#0984E3] focus:ring-2 focus:ring-[#0984E3]/20 transition-all text-sm";

  return (
    <div className="min-h-full flex flex-col" style={{ backgroundColor: '#F8FAFC' }}>
      {/* Header */}
      <div className="sticky top-0 z-10 px-5 pt-4 pb-3" style={{ backgroundColor: '#F8FAFC' }}>
        <div className="flex items-center justify-between mb-3">
          {stepStack.length > 1 && step !== 'done' ? (
            <button onClick={goBack} className="w-9 h-9 rounded-full bg-white flex items-center justify-center active:bg-[#E4E7EC] shadow-sm">
              <ChevronLeft className="w-5 h-5 text-[#6B7280]" />
            </button>
          ) : <div className="w-9" />}
          <p className="font-bold text-[#111827] text-base">{STEP_TITLES[step]}</p>
          {step !== 'done' ? (
            <button onClick={close} className="w-9 h-9 rounded-full bg-white flex items-center justify-center active:bg-[#E4E7EC] shadow-sm">
              <X className="w-4 h-4 text-[#6B7280]" />
            </button>
          ) : <div className="w-9" />}
        </div>
        {step !== 'done' && (
          <div className="h-1.5 rounded-full bg-[#E4E7EC] overflow-hidden">
            <motion.div className="h-full rounded-full" style={{ backgroundColor: '#0984E3' }}
              animate={{ width: `${progressPct}%` }} transition={{ duration: 0.3 }} />
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto px-5 pb-32">
        <AnimatePresence mode="wait">

          {/* ── Device details ────────────────────────────────────────────── */}
          {step === 'device' && (
            <motion.div key="device" initial={{ opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -24 }}
              transition={{ duration: 0.22 }} className="space-y-4">

              <div className="space-y-1">
                <label className="text-xs font-semibold text-[#374151] uppercase tracking-wide flex items-center gap-1.5">
                  <Hash className="w-3.5 h-3.5" /> Device ID
                </label>
                <div className="flex items-stretch gap-0">
                  <div className="flex items-center px-3 font-mono font-bold text-[#111827] bg-[#F3F4F6] border border-r-0 border-[#D1D5DB] rounded-l-xl select-none"
                    style={{ fontSize: 16, height: 52, letterSpacing: 1 }}>
                    CW-
                  </div>
                  <input
                    value={codeSuffix}
                    onChange={e => {
                      const raw = e.target.value.toUpperCase().replace(/[^A-F0-9]/g, '').slice(0, 6);
                      setCodeSuffix(raw);
                      setDeviceCode(`CW-${raw}`);
                      setCodeError('');
                    }}
                    maxLength={6} autoCapitalize="characters" autoCorrect="off" spellCheck={false}
                    className={inputBase + ' font-mono rounded-l-none flex-1'}
                    style={{ fontSize: 16, height: 52, letterSpacing: 2 }}
                  />
                </div>
                {codeError
                  ? <p className="text-xs text-red-500 font-medium">{codeError}</p>
                  : <p className="text-[10px] text-[#6B7280]">
                      {codeSuffix.length > 0 && codeSuffix.length < 6
                        ? `${6 - codeSuffix.length} more character${6 - codeSuffix.length === 1 ? '' : 's'} needed`
                        : 'Enter the 6-character code printed on your device. Only A–F and 0–9 are accepted.'}
                    </p>}
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-[#374151] uppercase tracking-wide">Storage Unit Name</label>
                <input value={unitName} onChange={e => setUnitName(e.target.value)}
                  placeholder="e.g. Cold Room A, Warehouse Bay 3" className={inputBase} style={{ fontSize: 16, height: 52 }} />
                <p className="text-[10px] text-[#6B7280]">The physical space where the device is installed.</p>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-[#374151] uppercase tracking-wide">Location</label>
                <input value={location} onChange={e => setLocation(e.target.value)}
                  placeholder="e.g. Kumasi Central Market" className={inputBase} style={{ fontSize: 16, height: 52 }} />
              </div>

              {error && <p className="text-xs text-red-500 font-medium">{error}</p>}

              <div className="rounded-2xl p-4" style={{ backgroundColor: '#EBF4FF', border: '1px solid #BFDBFE' }}>
                <p className="text-xs font-semibold text-[#1D4ED8] mb-1">What happens next?</p>
                <p className="text-xs text-[#1E40AF] leading-relaxed">
                  Next you'll pick exactly what you're storing — photos, mixing suggestions, and preservation tips included.
                </p>
              </div>
            </motion.div>
          )}

          {/* ── Produce: category + crop pick ────────────────────────────── */}
          {step === 'produce' && (
            <motion.div key="produce" initial={{ opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -24 }}
              transition={{ duration: 0.22 }} className="space-y-4">

              {pickerCategory === null ? (
                <>
                  <p className="text-sm text-[#6B7280]">Tap a category, then choose exactly what's inside it. You can add more than one.</p>
                  <div className="grid grid-cols-2 gap-3">
                    {Object.values(CATEGORIES).map(cat => (
                      <ProduceTile
                        key={cat.id}
                        imageId={cat.imageId}
                        emoji={CATEGORY_EMOJI[cat.id]}
                        label={cat.label}
                        tagline={cat.tagline}
                        selected={false}
                        badge={selectedCrops.filter(id => getCropsByCategory(cat.id).some(c => c.id === id)).length}
                        onClick={() => setPickerCategory(cat.id)}
                        tint={cat.iconBg}
                        accent={cat.accentColor}
                      />
                    ))}
                  </div>
                  <button onClick={handleSkip} className="text-xs font-medium text-[#6B7280] underline underline-offset-2 mx-auto block pt-1">
                    Skip for now — set this up later
                  </button>
                </>
              ) : (
                <>
                  <button onClick={() => setPickerCategory(null)}
                    className="flex items-center gap-1.5 text-xs font-semibold text-[#0984E3] mb-1">
                    <ChevronLeft className="w-3.5 h-3.5" /> All categories
                  </button>
                  <p className="text-sm text-[#6B7280]">Which exactly? Tap all that apply.</p>
                  <div className="grid grid-cols-3 gap-2.5">
                    {getCropsByCategory(pickerCategory).map(crop => (
                      <ProduceTile
                        key={crop.id}
                        imageId={crop.imageId}
                        emoji={CATEGORY_EMOJI[crop.category]}
                        label={crop.label}
                        selected={selectedCrops.includes(crop.id)}
                        onClick={() => toggleCrop(crop.id)}
                        tint={CATEGORIES[crop.category].iconBg}
                        accent={CATEGORIES[crop.category].accentColor}
                      />
                    ))}
                  </div>
                </>
              )}

              {selectedCrops.length > 0 && (
                <div className="rounded-2xl p-3.5" style={{ backgroundColor: '#F3F4F6', border: '1px solid #E4E7EC' }}>
                  <p className="text-[10px] font-semibold text-[#6B7280] uppercase tracking-wide mb-2">
                    Selected ({selectedCrops.length})
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {selectedCrops.map(id => {
                      const crop = getCrop(id);
                      return (
                        <button key={id} onClick={() => toggleCrop(id)}
                          className="flex items-center gap-1 pl-2.5 pr-1.5 py-1 rounded-full text-[11px] font-medium"
                          style={{ backgroundColor: CATEGORIES[crop.category].iconBg, color: CATEGORIES[crop.category].accentColor }}>
                          {crop.label} <X className="w-3 h-3" />
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </motion.div>
          )}

          {/* ── Mixed-storage compatibility check ────────────────────────── */}
          {step === 'compat' && (
            <motion.div key="compat" initial={{ opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -24 }}
              transition={{ duration: 0.22 }} className="space-y-4">

              {/* Overall score */}
              <div className="rounded-2xl p-4 flex items-center gap-4"
                style={{ backgroundColor: TIER_COLOR[overallTier] + '15', border: `1px solid ${TIER_COLOR[overallTier]}50` }}>
                <div className="w-16 h-16 rounded-full flex items-center justify-center flex-shrink-0"
                  style={{ backgroundColor: TIER_COLOR[overallTier] }}>
                  <span className="text-white font-bold text-lg">{storageScore}</span>
                </div>
                <div>
                  <p className="text-sm font-bold" style={{ color: TIER_COLOR[overallTier] }}>{TIER_LABEL[overallTier]}</p>
                  <p className="text-xs text-[#6B7280] mt-0.5">Overall storage score for these {selectedCrops.length} crops</p>
                </div>
              </div>

              {/* Safe Together */}
              {safeTogether.length > 0 && (
                <div className="space-y-2.5">
                  <p className="text-xs font-bold text-[#166534] uppercase tracking-wide flex items-center gap-1.5">
                    <CheckCircle2 className="w-3.5 h-3.5" /> Safe Together
                  </p>
                  {safeTogether.map((p, i) => {
                    const cropA = getCrop(p.cropA);
                    const cropB = getCrop(p.cropB);
                    return (
                      <div key={i} className="rounded-2xl p-3.5 bg-white" style={{ border: `1px solid ${TIER_COLOR[p.tier]}40` }}>
                        <div className="flex items-center justify-center gap-3">
                          <CropThumb imageId={cropA.imageId} emoji={CATEGORY_EMOJI[cropA.category]} label={cropA.label} onClick={() => setViewingImage({ imageId: cropA.imageId, title: cropA.label, emoji: CATEGORY_EMOJI[cropA.category] })} />
                          <div className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0"
                            style={{ backgroundColor: TIER_COLOR[p.tier] + '20' }}>
                            <Check className="w-5 h-5" style={{ color: TIER_COLOR[p.tier] }} />
                          </div>
                          <CropThumb imageId={cropB.imageId} emoji={CATEGORY_EMOJI[cropB.category]} label={cropB.label} onClick={() => setViewingImage({ imageId: cropB.imageId, title: cropB.label, emoji: CATEGORY_EMOJI[cropB.category] })} />
                        </div>
                        <p className="text-[11px] font-semibold text-center mt-2" style={{ color: TIER_COLOR[p.tier] }}>
                          {TIER_LABEL[p.tier]}
                        </p>
                        {p.reasons.length > 0 && (
                          <p className="text-[11px] text-[#6B7280] leading-relaxed text-center mt-1">{p.reasons[0]}</p>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Store Separately */}
              {storeSeparately.length > 0 && (
                <div className="space-y-2.5">
                  <p className="text-xs font-bold text-[#C0392B] uppercase tracking-wide flex items-center gap-1.5">
                    <XCircle className="w-3.5 h-3.5" /> Store Separately
                  </p>
                  {storeSeparately.map((p, i) => {
                    const cropA = getCrop(p.cropA);
                    const cropB = getCrop(p.cropB);
                    return (
                      <div key={i} className="rounded-2xl p-3.5 bg-white" style={{ border: `1px solid ${TIER_COLOR[p.tier]}40` }}>
                        <div className="flex items-center justify-center gap-3">
                          <CropThumb imageId={cropA.imageId} emoji={CATEGORY_EMOJI[cropA.category]} label={cropA.label} onClick={() => setViewingImage({ imageId: cropA.imageId, title: cropA.label, emoji: CATEGORY_EMOJI[cropA.category] })} />
                          <div className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0"
                            style={{ backgroundColor: TIER_COLOR[p.tier] + '20' }}>
                            <XCircle className="w-5 h-5" style={{ color: TIER_COLOR[p.tier] }} />
                          </div>
                          <CropThumb imageId={cropB.imageId} emoji={CATEGORY_EMOJI[cropB.category]} label={cropB.label} onClick={() => setViewingImage({ imageId: cropB.imageId, title: cropB.label, emoji: CATEGORY_EMOJI[cropB.category] })} />
                        </div>
                        <p className="text-[11px] font-semibold text-center mt-2" style={{ color: TIER_COLOR[p.tier] }}>
                          {TIER_LABEL[p.tier]}
                        </p>
                        {p.reasons.length > 0 && (
                          <p className="text-[11px] text-[#6B7280] leading-relaxed text-center mt-1">{p.reasons[0]}</p>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              {/* General mixing-guide reference — independent of the current
                  selection, teaches the underlying principles. */}
              <div className="rounded-2xl overflow-hidden" style={{ border: '1px solid #E4E7EC' }}>
                <button onClick={() => setShowMixingGuide(v => !v)}
                  className="w-full flex items-center justify-between p-3.5 bg-white">
                  <span className="text-xs font-semibold text-[#374151]">Not sure what generally pairs well? See examples</span>
                  <ChevronDown className="w-4 h-4 text-[#6B7280] transition-transform"
                    style={{ transform: showMixingGuide ? 'rotate(180deg)' : 'rotate(0deg)' }} />
                </button>
                {showMixingGuide && (
                  <div className="p-3.5 pt-0 space-y-2.5" style={{ backgroundColor: '#FFFFFF' }}>
                    {COMPATIBILITY_EXAMPLES.map(ex => (
                      <div key={ex.id} className="flex items-center gap-3 rounded-xl p-2.5"
                        style={{ backgroundColor: ex.tier === 'compatible' ? '#F0FBF4' : '#FDF3F2' }}>
                        <button
                          onClick={() => setViewingImage({ imageId: ex.imageId, title: ex.title, subtitle: ex.description })}
                          className="w-14 h-14 rounded-lg overflow-hidden flex-shrink-0 relative active:scale-95 transition-transform"
                          style={{ backgroundColor: '#F3F4F6' }}
                        >
                          <img src={`/produce-images/${ex.imageId}.jpg`} alt={ex.title}
                            className="w-full h-full object-cover"
                            onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                          <div className="absolute bottom-0.5 right-0.5 w-4 h-4 rounded-full flex items-center justify-center"
                            style={{ backgroundColor: 'rgba(17,24,39,0.55)' }}>
                            <Maximize2 className="w-2 h-2 text-white" />
                          </div>
                        </button>
                        <div className="flex-1 min-w-0">
                          <p className="text-[11px] font-semibold" style={{ color: ex.tier === 'compatible' ? '#166534' : '#C0392B' }}>
                            {ex.tier === 'compatible' ? '✓ ' : '✕ '}{ex.title}
                          </p>
                          <p className="text-[10px] text-[#6B7280] leading-tight mt-0.5">{ex.description}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="rounded-2xl p-4" style={{ backgroundColor: '#EBF4FF', border: '1px solid #BFDBFE' }}>
                <p className="text-xs text-[#1E40AF] leading-relaxed">
                  This is guidance, not a rule — you can still add this device with the crops you've picked. Our
                  suggestion, if any pair is flagged "store separately," is a second device for those crops.
                </p>
              </div>

              {hasHardBlock && (
                <button onClick={handleKeepFirstOnly}
                  className="w-full py-3 rounded-2xl text-sm font-semibold text-center"
                  style={{ backgroundColor: '#FFFFFF', border: '1.5px solid #0984E3', color: '#0984E3' }}>
                  Keep just the first crop for this device
                </button>
              )}
            </motion.div>
          )}

          {/* ── Preservation tips ─────────────────────────────────────────── */}
          {step === 'tips' && (
            <motion.div key="tips" initial={{ opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -24 }}
              transition={{ duration: 0.22 }} className="space-y-3.5">
              {selectedCrops.map(id => {
                const crop = getCrop(id);
                const compatible = getCompatibleCrops(id);
                const avoid = getConflicts(id);
                return (
                  <div key={id} className="rounded-2xl overflow-hidden bg-white" style={{ border: '1px solid #E4E7EC' }}>
                    <div className="w-full aspect-[16/9] overflow-hidden">
                      <CropPhoto imageId={crop.imageId} emoji={CATEGORY_EMOJI[crop.category]} label={crop.label} />
                    </div>
                    <div className="p-4 space-y-4">
                      <div>
                        <p className="text-sm font-bold text-[#111827]">{crop.label}</p>
                        <p className="text-xs text-[#6B7280] leading-relaxed mt-1">{crop.storageNote}</p>
                      </div>

                      <div className="grid grid-cols-2 gap-2.5">
                        <div className="rounded-xl p-3" style={{ backgroundColor: '#EBF4FF' }}>
                          <div className="flex items-center gap-1.5 mb-1">
                            <ThermometerSnowflake className="w-3.5 h-3.5" style={{ color: '#0984E3' }} />
                            <span className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: '#0984E3' }}>Temperature</span>
                          </div>
                          <p className="text-sm font-semibold text-[#111827]">{crop.targetTemperature}°C target</p>
                          <p className="text-[11px] text-[#6B7280]">{crop.tempRange[0]}–{crop.tempRange[1]}°C safe range</p>
                        </div>
                        <div className="rounded-xl p-3" style={{ backgroundColor: '#E6F6EC' }}>
                          <div className="flex items-center gap-1.5 mb-1">
                            <Droplets className="w-3.5 h-3.5" style={{ color: '#1A7A3F' }} />
                            <span className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: '#1A7A3F' }}>Humidity</span>
                          </div>
                          <p className="text-sm font-semibold text-[#111827]">{crop.targetHumidity}% target</p>
                          <p className="text-[11px] text-[#6B7280]">{crop.humidityRange[0]}–{crop.humidityRange[1]}% safe range</p>
                        </div>
                      </div>

                      <div className="rounded-xl p-3 flex items-start gap-2.5" style={{ backgroundColor: '#F3F4F6' }}>
                        <Clock className="w-4 h-4 flex-shrink-0 mt-0.5" style={{ color: '#6B7280' }} />
                        <div>
                          <p className="text-[10px] font-semibold uppercase tracking-wide text-[#6B7280]">Shelf life</p>
                          <p className="text-sm text-[#111827] mt-0.5">{crop.shelfLife}</p>
                        </div>
                      </div>

                      <div>
                        <h3 className="text-xs font-semibold uppercase tracking-wide text-[#6B7280] mb-2">Preservation tips</h3>
                        <div className="space-y-2">
                          {crop.tips.map((t, i) => (
                            <div key={i} className="flex items-start gap-2 text-sm text-[#374151]">
                              <span className="flex-shrink-0">{t.icon}</span>
                              <span>{t.text}</span>
                            </div>
                          ))}
                        </div>
                      </div>

                      <div>
                        <h3 className="text-xs font-semibold uppercase tracking-wide text-[#6B7280] mb-2 flex items-center gap-1.5">
                          <AlertTriangle className="w-3.5 h-3.5" style={{ color: '#E67E22' }} /> Common mistakes
                        </h3>
                        <div className="space-y-2">
                          {crop.commonMistakes.map((m, i) => (
                            <div key={i} className="flex items-start gap-2 text-sm text-[#374151]">
                              <span className="flex-shrink-0 mt-0.5" style={{ color: '#E67E22' }}>•</span>
                              <span>{m}</span>
                            </div>
                          ))}
                        </div>
                      </div>

                      {compatible.length > 0 && (
                        <div>
                          <h3 className="text-xs font-semibold uppercase tracking-wide text-[#27AE60] mb-2 flex items-center gap-1.5">
                            <CheckCircle2 className="w-3.5 h-3.5" /> Stores well with
                          </h3>
                          <div className="flex gap-1.5 overflow-x-auto pb-1">
                            {compatible.map(id => <CropChip key={id} id={id} onClick={() => {}} />)}
                          </div>
                        </div>
                      )}

                      {avoid.length > 0 && (
                        <div>
                          <h3 className="text-xs font-semibold uppercase tracking-wide text-[#C0392B] mb-2 flex items-center gap-1.5">
                            <XCircle className="w-3.5 h-3.5" /> Avoid storing with
                          </h3>
                          <div className="flex gap-1.5 overflow-x-auto pb-1">
                            {avoid.map(id => <CropChip key={id} id={id} onClick={() => {}} />)}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
              <p className="text-[10px] text-[#9CA3AF] text-center pt-1">
                These tips mirror the produce guide so you can review crop-specific storage advice while setting up a device.
              </p>
            </motion.div>
          )}

          {/* ── Condition ──────────────────────────────────────────────────── */}
          {step === 'condition' && (
            <motion.div key="condition" initial={{ opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -24 }}
              transition={{ duration: 0.22 }} className="space-y-4">

              <div>
                <p className="text-xs font-semibold text-[#374151] uppercase tracking-wide mb-2">Take a photo (optional)</p>
                <input ref={fileInputRef} type="file" accept="image/*" capture="environment" className="hidden"
                  onChange={e => { const f = e.target.files?.[0]; if (f) handleImageSelected(f); }} />
                {!capturePreview ? (
                  <button onClick={() => fileInputRef.current?.click()}
                    className="w-full py-8 rounded-2xl flex flex-col items-center gap-2 border-2 border-dashed"
                    style={{ borderColor: '#E4E7EC' }}>
                    <Camera className="w-6 h-6 text-[#6B7280]" />
                    <span className="text-xs text-[#6B7280]">Tap to take or upload a photo — AI will assess condition</span>
                  </button>
                ) : (
                  <div className="relative rounded-2xl overflow-hidden">
                    <img src={capturePreview} alt="Produce" className="w-full h-40 object-cover" />
                    {analysing && (
                      <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                        <Loader2 className="w-6 h-6 text-white animate-spin" />
                      </div>
                    )}
                  </div>
                )}
                {aiError && <p className="text-xs text-red-500 mt-1.5">{aiError}</p>}
                {aiResult && (
                  <div className="mt-2.5 rounded-2xl p-3.5" style={{ backgroundColor: '#EBF4FF', border: '1px solid #BFDBFE' }}>
                    <p className="text-xs font-semibold text-[#1D4ED8] mb-1">AI suggests: {PRODUCE_STATES.find(s => s.id === aiResult.state)?.label}</p>
                    <p className="text-[11px] text-[#1E40AF] leading-relaxed mb-2">{aiResult.explanation}</p>
                    <button onClick={() => { setProduceState(aiResult.state); setAiResult(null); }}
                      className="text-xs font-bold text-[#0984E3]">Use this</button>
                  </div>
                )}
              </div>

              <div>
                <p className="text-xs font-semibold text-[#374151] uppercase tracking-wide mb-2">Or select manually</p>
                <div className="space-y-2">
                  {PRODUCE_STATES.map(s => (
                    <button key={s.id} onClick={() => setProduceState(s.id)}
                      className="w-full flex items-center gap-3 p-3 rounded-xl text-left transition-all active:scale-[0.98]"
                      style={{ border: `1.5px solid ${produceState === s.id ? s.color + '80' : '#E4E7EC'}`, backgroundColor: produceState === s.id ? s.tint : '#FFFFFF' }}>
                      <span className="text-lg">{s.emoji}</span>
                      <div>
                        <p className="text-xs font-semibold" style={{ color: produceState === s.id ? s.color : '#111827' }}>{s.label}</p>
                        <p className="text-[10px] text-[#6B7280]">{s.desc}</p>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            </motion.div>
          )}

          {/* ── Facility ───────────────────────────────────────────────────── */}
          {step === 'facility' && (
            <motion.div key="facility" initial={{ opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -24 }}
              transition={{ duration: 0.22 }} className="space-y-5">
              <div>
                <p className="text-xs font-semibold text-[#374151] uppercase tracking-wide mb-2">Storage Facility Size</p>
                <div className="space-y-2">
                  {FACILITY_SIZES.map(fs => (
                    <button key={fs.id} onClick={() => setFacilitySize(fs.id)}
                      className="w-full flex items-center gap-3 p-3.5 rounded-xl text-left transition-all active:scale-[0.98]"
                      style={{ border: `1.5px solid ${facilitySize === fs.id ? '#0984E380' : '#E4E7EC'}`, backgroundColor: facilitySize === fs.id ? '#EBF4FF' : '#FFFFFF' }}>
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
                <p className="text-[10px] text-[#6B7280] mb-3">How long did it take to move the produce from farm to this facility?</p>
                <input type="range" min={0} max={48} step={1} value={transportHours}
                  onChange={e => setTransportHours(Number(e.target.value))} className="w-full accent-[#0984E3]" />
                <div className="flex justify-between text-[9px] text-[#9CA3AF] mt-1">
                  <span>0h</span><span>12h</span><span>24h</span><span>36h</span><span>48h</span>
                </div>
              </div>

              <div className="rounded-2xl p-4" style={{ backgroundColor: shelfLife.color + '12', border: `1px solid ${shelfLife.color}30` }}>
                <p className="text-xs font-semibold mb-0.5" style={{ color: shelfLife.color }}>Estimated shelf life with ColdWatch</p>
                <p className="text-2xl font-bold" style={{ color: shelfLife.color }}>{shelfLife.label}</p>
                <p className="text-[10px] text-[#6B7280] mt-1">Based on produce type, condition, and transport time. ColdWatch will actively work to extend this.</p>
              </div>
            </motion.div>
          )}

          {/* ── Review — final summary before creating the device ─────────── */}
          {step === 'review' && (
            <motion.div key="review" initial={{ opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -24 }}
              transition={{ duration: 0.22 }} className="space-y-3.5">

              <p className="text-xs text-[#6B7280]">Check everything below, then save to create the device.</p>

              {/* Device identity */}
              <div className="rounded-2xl p-4 bg-white space-y-2" style={{ border: '1px solid #E4E7EC' }}>
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold text-[#374151] uppercase tracking-wide">Device</p>
                  <button onClick={() => setStepStack(['device'])} className="text-[11px] font-semibold text-[#0984E3]">Edit</button>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-[#6B7280]">Device ID</span>
                  <span className="font-mono font-semibold text-[#111827]">{deviceCode}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-[#6B7280]">Storage unit</span>
                  <span className="font-semibold text-[#111827]">{unitName}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-[#6B7280]">Location</span>
                  <span className="font-semibold text-[#111827]">{location}</span>
                </div>
              </div>

              {/* Produce */}
              <div className="rounded-2xl p-4 bg-white space-y-2.5" style={{ border: '1px solid #E4E7EC' }}>
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold text-[#374151] uppercase tracking-wide">
                    Produce ({selectedCrops.length})
                  </p>
                  <button onClick={() => setStepStack(['device', 'produce'])} className="text-[11px] font-semibold text-[#0984E3]">Edit</button>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {selectedCrops.map(id => {
                    const crop = getCrop(id);
                    return (
                      <span key={id} className="flex items-center gap-1 pl-2.5 pr-3 py-1 rounded-full text-[11px] font-medium"
                        style={{ backgroundColor: CATEGORIES[crop.category].iconBg, color: CATEGORIES[crop.category].accentColor }}>
                        {crop.label}
                      </span>
                    );
                  })}
                </div>
                {selectedCrops.length >= 2 && (
                  <div className="flex items-center gap-2 pt-1">
                    <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0"
                      style={{ backgroundColor: TIER_COLOR[overallTier] }}>
                      <span className="text-white font-bold text-[11px]">{storageScore}</span>
                    </div>
                    <span className="text-[11px] font-semibold" style={{ color: TIER_COLOR[overallTier] }}>
                      {TIER_LABEL[overallTier]}
                    </span>
                    {storeSeparately.length > 0 && (
                      <span className="text-[11px] text-[#6B7280]">— {storeSeparately.length} pair{storeSeparately.length === 1 ? '' : 's'} flagged</span>
                    )}
                  </div>
                )}
              </div>

              {/* Condition */}
              <div className="rounded-2xl p-4 bg-white flex items-center justify-between" style={{ border: '1px solid #E4E7EC' }}>
                <div>
                  <p className="text-xs font-semibold text-[#374151] uppercase tracking-wide mb-1">Condition</p>
                  <p className="text-sm font-semibold text-[#111827]">
                    {PRODUCE_STATES.find(s => s.id === produceState)?.emoji} {PRODUCE_STATES.find(s => s.id === produceState)?.label}
                  </p>
                </div>
                <button onClick={() => { setQuickSetup(false); setStepStack(['device', 'produce', 'condition']); }} className="text-[11px] font-semibold text-[#0984E3]">Edit</button>
              </div>

              {/* Facility */}
              <div className="rounded-2xl p-4 bg-white space-y-1.5" style={{ border: '1px solid #E4E7EC' }}>
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold text-[#374151] uppercase tracking-wide">Storage facility</p>
                  <button onClick={() => { setQuickSetup(false); setStepStack(['device', 'produce', 'condition', 'facility']); }} className="text-[11px] font-semibold text-[#0984E3]">Edit</button>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-[#6B7280]">Size</span>
                  <span className="font-semibold text-[#111827]">{FACILITY_SIZES.find(f => f.id === facilitySize)?.label}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-[#6B7280]">Transport time</span>
                  <span className="font-semibold text-[#111827]">{transportHours}h</span>
                </div>
              </div>

              {/* Shelf life estimate */}
              <div className="rounded-2xl p-4" style={{ backgroundColor: shelfLife.color + '12', border: `1px solid ${shelfLife.color}30` }}>
                <p className="text-xs font-semibold mb-0.5" style={{ color: shelfLife.color }}>Estimated shelf life with ColdWatch</p>
                <p className="text-2xl font-bold" style={{ color: shelfLife.color }}>{shelfLife.label}</p>
              </div>
            </motion.div>
          )}

          {/* ── Skip path — ready to save ─────────────────────────────────── */}
          {step === 'skip-ready' && (
            <motion.div key="skip-ready" initial={{ opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -24 }}
              transition={{ duration: 0.22 }}>
              <div className="rounded-2xl p-5" style={{ backgroundColor: '#F8FAFC', border: '1px solid #E4E7EC' }}>
                <p className="font-semibold text-[#111827] mb-1">Ready to save</p>
                <p className="text-sm text-[#6B7280]">
                  You skipped produce setup. You can complete it later from the device card. Tap below to save the device.
                </p>
              </div>
            </motion.div>
          )}

          {/* ── Done ───────────────────────────────────────────────────────── */}
          {step === 'done' && (
            <motion.div key="done" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.28 }} className="space-y-4">
              <div className="flex items-center gap-3 p-4 rounded-2xl" style={{ backgroundColor: '#E6F6EC', border: '1px solid #A7D7B6' }}>
                <div className="w-10 h-10 rounded-xl bg-[#27AE60]/15 flex items-center justify-center flex-shrink-0">
                  <CheckCircle2 className="w-5 h-5 text-[#27AE60]" />
                </div>
                <div>
                  <p className="text-sm font-bold text-[#166534]">{unitName} added successfully</p>
                  <p className="text-xs text-[#166534]/70 mt-0.5">Device ID: <span className="font-mono font-bold">{deviceCode}</span></p>
                </div>
              </div>

              {!skipProduce && (
                <div className="rounded-2xl p-4" style={{ backgroundColor: shelfLife.color + '10', border: `1px solid ${shelfLife.color}25` }}>
                  <p className="text-xs font-semibold text-[#374151] mb-0.5">Estimated shelf life with ColdWatch active</p>
                  <p className="text-xl font-bold" style={{ color: shelfLife.color }}>{shelfLife.label}</p>
                </div>
              )}

              <div className="rounded-2xl p-4" style={{ backgroundColor: '#FFF8F0', border: '1px solid #F5CBA7' }}>
                <p className="text-xs font-semibold text-[#C0501A] mb-1">No hardware yet?</p>
                <p className="text-xs text-[#7A3010] leading-relaxed">That's fine — the device is registered and the simulation is running.</p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Bottom actions */}
      <div className="fixed bottom-0 left-0 right-0 md:left-56 px-5 pb-8 pt-3 bg-white flex gap-2.5" style={{ borderTop: '1px solid #F3F4F6' }}>
        {step === 'device' && (
          <button onClick={handleDeviceNext} className="flex-1 h-12 rounded-2xl text-white text-sm font-bold active:scale-[0.98]" style={{ backgroundColor: '#0984E3' }}>
            Continue
          </button>
        )}
        {step === 'produce' && (
          <>
            {selectedCrops.length === 1 && (
              <button onClick={handleQuickSetup}
                className="h-12 px-4 rounded-2xl text-sm font-bold active:scale-[0.98] whitespace-nowrap"
                style={{ backgroundColor: '#EFF6FF', color: '#0984E3' }}>
                Quick Setup
              </button>
            )}
            <button onClick={handleProduceContinue} disabled={selectedCrops.length === 0}
              className="flex-1 h-12 rounded-2xl text-white text-sm font-bold active:scale-[0.98] disabled:opacity-40"
              style={{ backgroundColor: '#0984E3' }}>
              Continue{selectedCrops.length > 0 ? ` (${selectedCrops.length})` : ''}
            </button>
          </>
        )}
        {step === 'compat' && (
          <button onClick={() => goTo('tips')} className="flex-1 h-12 rounded-2xl text-white text-sm font-bold active:scale-[0.98]" style={{ backgroundColor: '#0984E3' }}>
            {storeSeparately.length > 0 ? 'Continue anyway' : 'Continue'}
          </button>
        )}
        {step === 'tips' && (
          <button onClick={() => goTo('condition')} className="flex-1 h-12 rounded-2xl text-white text-sm font-bold active:scale-[0.98]" style={{ backgroundColor: '#0984E3' }}>
            Continue
          </button>
        )}
        {step === 'condition' && (
          <button onClick={() => goTo('facility')} className="flex-1 h-12 rounded-2xl text-white text-sm font-bold active:scale-[0.98]" style={{ backgroundColor: '#0984E3' }}>
            Continue
          </button>
        )}
        {step === 'facility' && (
          <button onClick={() => goTo('review')} className="flex-1 h-12 rounded-2xl text-white text-sm font-bold active:scale-[0.98]" style={{ backgroundColor: '#0984E3' }}>
            Continue
          </button>
        )}
        {step === 'review' && (
          <button onClick={handleFinalSubmit} disabled={saving}
            className="flex-1 h-12 rounded-2xl text-white text-sm font-bold active:scale-[0.98] disabled:opacity-60 flex items-center justify-center gap-2"
            style={{ backgroundColor: '#0984E3' }}>
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <>Save Device <PackageCheck className="w-4 h-4" /></>}
          </button>
        )}
        {step === 'skip-ready' && (
          <button onClick={handleFinalSubmit} disabled={saving}
            className="flex-1 h-12 rounded-2xl text-white text-sm font-bold active:scale-[0.98] disabled:opacity-60 flex items-center justify-center gap-2"
            style={{ backgroundColor: '#0984E3' }}>
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <>Save Device <Check className="w-4 h-4" /></>}
          </button>
        )}
        {step === 'done' && (
          <button onClick={close} className="flex-1 h-12 rounded-2xl text-white text-sm font-bold active:scale-[0.98]" style={{ backgroundColor: '#0984E3' }}>
            Done
          </button>
        )}
      </div>

      <AnimatePresence>
        {viewingImage && <ImageLightbox image={viewingImage} onClose={() => setViewingImage(null)} />}
      </AnimatePresence>
    </div>
  );
}
