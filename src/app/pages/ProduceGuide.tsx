// ── ProduceGuide.tsx ──────────────────────────────────────────────────────
//
// Migration guide Chunk 4 — "Produce Knowledge" reusable knowledge centre.
// Every crop's full profile (storage conditions, shelf life, compatible/
// avoid produce, preservation tips, common mistakes, references) in one
// searchable place, reachable from anywhere via the book icon in TopBar —
// not just surfaced piecemeal inside the device wizard.
//
// Deliberately reuses the same data (CROPS, CATEGORIES, getPairCompatibility-
// derived helpers) the wizard already uses, per the migration guide's
// "one source of truth" principle — nothing here is a second copy of
// storage numbers.

import { useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  ChevronLeft, Search, ThermometerSnowflake, Droplets, Clock, CheckCircle2,
  XCircle, AlertTriangle, BookOpen, X,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import {
  CATEGORIES, CATEGORY_EMOJI, CROP_LIST, getCrop, getCompatibleCrops, getConflicts,
  type CropId, type CategoryId,
} from '../data/produce';

// Same graceful photo-with-emoji-fallback pattern used throughout
// AddDeviceFlow.tsx — kept local here rather than shared, since the two
// components' sizing/selection needs differ enough that a shared prop
// surface would end up more complex than just repeating ~15 lines.
function CropPhoto({ imageId, emoji, label, rounded = 'rounded-xl' }: {
  imageId: string; emoji: string; label: string; rounded?: string;
}) {
  const [imgError, setImgError] = useState(false);
  return (
    <div className={`w-full h-full overflow-hidden flex items-center justify-center ${rounded}`} style={{ backgroundColor: '#F3F4F6' }}>
      {!imgError ? (
        <img src={`/produce-images/${imageId}.jpg`} alt={label} className="w-full h-full object-cover"
          onError={() => setImgError(true)} />
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

export default function ProduceGuide() {
  const { setActivePage } = useApp();
  const [query, setQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<CategoryId | 'all'>('all');
  const [selectedCrop, setSelectedCrop] = useState<CropId | null>(null);

  const filteredCrops = useMemo(() => {
    const q = query.trim().toLowerCase();
    return CROP_LIST.filter(id => {
      const crop = getCrop(id);
      if (categoryFilter !== 'all' && crop.category !== categoryFilter) return false;
      if (q && !crop.label.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [query, categoryFilter]);

  const detailScrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    detailScrollRef.current?.scrollTo({ top: 0 });
  }, [selectedCrop]);

  const detail = selectedCrop ? getCrop(selectedCrop) : null;
  const compatible = selectedCrop ? getCompatibleCrops(selectedCrop) : [];
  const avoid = selectedCrop ? getConflicts(selectedCrop) : [];

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 8 }}
      transition={{ duration: 0.22 }} className="w-full h-full overflow-y-auto">
      <div className="max-w-3xl mx-auto px-4 py-6 md:px-6 md:py-8">

        <div className="mb-5 flex items-center gap-3">
          <button onClick={() => setActivePage('dashboard')}
            className="w-10 h-10 rounded-xl flex items-center justify-center active:scale-95 transition-all flex-shrink-0 hover:bg-[#F3F4F6]"
            style={{ background: '#F3F4F6', border: '1px solid #E4E7EC' }} aria-label="Back">
            <ChevronLeft className="w-5 h-5 text-[#111827]" />
          </button>
          <div>
            <h1 className="text-xl md:text-2xl font-semibold text-[#111827] flex items-center gap-2">
              <BookOpen className="w-5 h-5" style={{ color: '#0984E3' }} /> Produce Guide
            </h1>
            <p className="text-xs text-[#6B7280] mt-0.5">Storage conditions, shelf life, and what pairs well for every crop.</p>
          </div>
        </div>

        {/* ── Search ──────────────────────────────────────────────────── */}
        <div className="relative mb-3">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2" style={{ color: '#9CA3AF' }} />
          <input
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search for any crop you store eg; cassava, tomato, rice..."
            className="w-full pl-9 pr-9 py-2.5 rounded-xl text-sm outline-none"
            style={{ backgroundColor: '#F3F4F6', border: '1px solid #E4E7EC', color: '#111827' }}
          />
          {query && (
            <button onClick={() => setQuery('')} className="absolute right-3 top-1/2 -translate-y-1/2" aria-label="Clear search">
              <X className="w-4 h-4" style={{ color: '#9CA3AF' }} />
            </button>
          )}
        </div>

        {/* ── Category filter chips ──────────────────────────────────── */}
        <div className="flex gap-1.5 overflow-x-auto pb-1 mb-4 -mx-1 px-1">
          <button onClick={() => setCategoryFilter('all')}
            className="px-3 py-1.5 rounded-full text-xs font-semibold flex-shrink-0 transition-colors"
            style={categoryFilter === 'all'
              ? { backgroundColor: '#111827', color: '#FFFFFF' }
              : { backgroundColor: '#F3F4F6', color: '#374151', border: '1px solid #E4E7EC' }}>
            All ({CROP_LIST.length})
          </button>
          {Object.values(CATEGORIES).map(cat => (
            <button key={cat.id} onClick={() => setCategoryFilter(cat.id)}
              className="px-3 py-1.5 rounded-full text-xs font-semibold flex-shrink-0 transition-colors flex items-center gap-1"
              style={categoryFilter === cat.id
                ? { backgroundColor: cat.accentColor, color: '#FFFFFF' }
                : { backgroundColor: '#F3F4F6', color: '#374151', border: '1px solid #E4E7EC' }}>
              <span>{CATEGORY_EMOJI[cat.id]}</span> {cat.label}
            </button>
          ))}
        </div>

        {/* ── Crop grid ───────────────────────────────────────────────── */}
        {filteredCrops.length === 0 ? (
          <p className="text-sm text-[#6B7280] text-center py-10">No crops match "{query}".</p>
        ) : (
          <div className="grid grid-cols-3 sm:grid-cols-4 gap-2.5">
            {filteredCrops.map(id => {
              const crop = getCrop(id);
              return (
                <button key={id} onClick={() => setSelectedCrop(id)}
                  className="rounded-2xl p-2 text-left active:scale-[0.97] transition-all"
                  style={{ border: '1.5px solid #E4E7EC', backgroundColor: '#FFFFFF' }}>
                  <div className="w-full aspect-square rounded-xl overflow-hidden mb-1.5">
                    <CropPhoto imageId={crop.imageId} emoji={CATEGORY_EMOJI[crop.category]} label={crop.label} />
                  </div>
                  <p className="text-[11px] font-semibold text-[#111827] leading-tight">{crop.label}</p>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Detail sheet ──────────────────────────────────────────────── */}
      <AnimatePresence>
        {detail && selectedCrop && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-end md:items-center justify-center"
            style={{ backgroundColor: 'rgba(17,24,39,0.4)' }}
            onClick={() => setSelectedCrop(null)}
          >
            <motion.div
              initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }} transition={{ duration: 0.25, ease: 'easeOut' }}
              ref={detailScrollRef}
              className="w-full md:max-w-lg md:rounded-3xl rounded-t-3xl max-h-[88vh] overflow-y-auto"
              style={{ backgroundColor: '#FFFFFF' }}
              onClick={e => e.stopPropagation()}
            >
              <div className="sticky top-0 z-10 flex items-center justify-between px-5 pt-4 pb-3" style={{ backgroundColor: '#FFFFFF', borderBottom: '1px solid #F3F4F6' }}>
                <h2 className="text-lg font-semibold text-[#111827]">{detail.label}</h2>
                <button onClick={() => setSelectedCrop(null)} className="w-8 h-8 rounded-full flex items-center justify-center" style={{ backgroundColor: '#F3F4F6' }} aria-label="Close">
                  <X className="w-4 h-4 text-[#6B7280]" />
                </button>
              </div>

              <div className="px-5 pb-8 pt-4 space-y-5">
                <div className="w-full aspect-[16/9] rounded-2xl overflow-hidden">
                  <CropPhoto key={selectedCrop} imageId={detail.imageId} emoji={CATEGORY_EMOJI[detail.category]} label={detail.label} />
                </div>

                {/* Storage conditions */}
                <div className="grid grid-cols-2 gap-2.5">
                  <div className="rounded-xl p-3" style={{ backgroundColor: '#EBF4FF' }}>
                    <div className="flex items-center gap-1.5 mb-1">
                      <ThermometerSnowflake className="w-3.5 h-3.5" style={{ color: '#0984E3' }} />
                      <span className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: '#0984E3' }}>Temperature</span>
                    </div>
                    <p className="text-sm font-semibold text-[#111827]">{detail.targetTemperature}°C target</p>
                    <p className="text-[11px] text-[#6B7280]">{detail.tempRange[0]}–{detail.tempRange[1]}°C safe range</p>
                  </div>
                  <div className="rounded-xl p-3" style={{ backgroundColor: '#E6F6EC' }}>
                    <div className="flex items-center gap-1.5 mb-1">
                      <Droplets className="w-3.5 h-3.5" style={{ color: '#1A7A3F' }} />
                      <span className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: '#1A7A3F' }}>Humidity</span>
                    </div>
                    <p className="text-sm font-semibold text-[#111827]">{detail.targetHumidity}% target</p>
                    <p className="text-[11px] text-[#6B7280]">{detail.humidityRange[0]}–{detail.humidityRange[1]}% safe range</p>
                  </div>
                </div>

                {/* Shelf life */}
                <div className="rounded-xl p-3 flex items-start gap-2.5" style={{ backgroundColor: '#F3F4F6' }}>
                  <Clock className="w-4 h-4 flex-shrink-0 mt-0.5" style={{ color: '#6B7280' }} />
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-[#6B7280]">Shelf life</p>
                    <p className="text-sm text-[#111827] mt-0.5">{detail.shelfLife}</p>
                  </div>
                </div>

                <p className="text-sm text-[#374151] leading-relaxed">{detail.storageNote}</p>

                {/* Preservation tips */}
                <div>
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-[#6B7280] mb-2">Preservation tips</h3>
                  <div className="space-y-2">
                    {detail.tips.map((tip, i) => (
                      <div key={i} className="flex items-start gap-2 text-sm text-[#374151]">
                        <span className="flex-shrink-0">{tip.icon}</span>
                        <span>{tip.text}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Common mistakes */}
                <div>
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-[#6B7280] mb-2 flex items-center gap-1.5">
                    <AlertTriangle className="w-3.5 h-3.5" style={{ color: '#E67E22' }} /> Common mistakes
                  </h3>
                  <div className="space-y-2">
                    {detail.commonMistakes.map((m, i) => (
                      <div key={i} className="flex items-start gap-2 text-sm text-[#374151]">
                        <span className="flex-shrink-0 mt-0.5" style={{ color: '#E67E22' }}>•</span>
                        <span>{m}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Compatible / avoid */}
                {compatible.length > 0 && (
                  <div>
                    <h3 className="text-xs font-semibold uppercase tracking-wide text-[#27AE60] mb-2 flex items-center gap-1.5">
                      <CheckCircle2 className="w-3.5 h-3.5" /> Stores well with
                    </h3>
                    <div className="flex gap-1.5 overflow-x-auto pb-1">
                      {compatible.map(id => <CropChip key={id} id={id} onClick={() => setSelectedCrop(id)} />)}
                    </div>
                  </div>
                )}
                {avoid.length > 0 && (
                  <div>
                    <h3 className="text-xs font-semibold uppercase tracking-wide text-[#C0392B] mb-2 flex items-center gap-1.5">
                      <XCircle className="w-3.5 h-3.5" /> Avoid storing with
                    </h3>
                    <div className="flex gap-1.5 overflow-x-auto pb-1">
                      {avoid.map(id => <CropChip key={id} id={id} onClick={() => setSelectedCrop(id)} />)}
                    </div>
                  </div>
                )}

                {/* References */}
                <div className="pt-2" style={{ borderTop: '1px solid #F3F4F6' }}>
                  <h3 className="text-[10px] font-semibold uppercase tracking-wide text-[#9CA3AF] mb-1.5">Sources</h3>
                  {detail.references.map((r, i) => (
                    <p key={i} className="text-[11px] text-[#9CA3AF] leading-relaxed">{r}</p>
                  ))}
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
