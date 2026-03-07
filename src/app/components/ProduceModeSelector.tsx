import { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Leaf, Apple, Wheat, Layers, AlertTriangle, CheckCircle2, Thermometer, Droplets, ChevronDown, ChevronUp, Info, Package, RefreshCw } from 'lucide-react';
import { useApp } from '../context/AppContext';
import type { ProduceMode } from '../context/AppContext';

// Produce Profile Data

interface ProduceProfile {
  id: ProduceMode;
  label: string;
  tagline: string;
  icon: React.ReactNode;
  iconBg: string;
  iconColor: string;
  accentColor: string;
  crops: string[];
  targetTemp: number;
  targetHumidity: number;
  tempRange: [number, number];
  humidityRange: [number, number];
  chillingFloor: number | null; // alert if temp drops below this
  tradeoffs: { icon: string; text: string; severity: 'warn' | 'info' }[];
  storageNote: string;
}

export const PRODUCE_PROFILES: Record<ProduceMode, ProduceProfile> = {
  mixed: {
    id: 'mixed',
    label: 'Mixed Produce',
    tagline: 'Compromise Mode — multiple crops',
    icon: <Layers className="w-5 h-5" />,
    iconBg: 'rgba(41,121,200,0.12)',
    iconColor: '#0984E3',
    accentColor: '#0984E3',
    crops: ['Tubers', 'Fruits', 'Leafy Vegetables', 'Plantain'],
    targetTemp: 11,
    targetHumidity: 88,
    tempRange: [10, 13],
    humidityRange: [85, 90],
    chillingFloor: 10,
    tradeoffs: [
      { icon: '🥬', text: 'Leafy vegetables may wilt 2–3× faster than at their ideal 4°C. Check them daily.', severity: 'warn' },
      { icon: '🍠', text: 'Keep temperature above 10°C at all times. Tubers suffer chilling damage if colder.', severity: 'warn' },
      { icon: '🍊', text: 'Check fruits for surface condensation, high humidity can accelerate mould at 11°C.', severity: 'info' },
    ],
    storageNote: 'This is the recommended setting when you cannot separate crop types. It balances all trade-offs without ideal conditions for any single crop.',
  },
  tubers: {
    id: 'tubers',
    label: 'Tubers Only',
    tagline: 'Cassava, Yam, Cocoyam, Plantain',
    icon: <Wheat className="w-5 h-5" />,
    iconBg: 'rgba(230,126,34,0.12)',
    iconColor: '#E67E22',
    accentColor: '#E67E22',
    crops: ['Cassava', 'Yam', 'Cocoyam', 'Plantain', 'Sweet Potato'],
    targetTemp: 13,
    targetHumidity: 75,
    tempRange: [12, 16],
    humidityRange: [70, 80],
    chillingFloor: 12,
    tradeoffs: [
      { icon: '⚠️', text: 'Critical: Never go below 12°C. Chilling injury causes rot and discolouration within 24 hours.', severity: 'warn' },
      { icon: '💧', text: 'Lower humidity (70–80%) prevents fungal growth on skin and cut surfaces.', severity: 'info' },
    ],
    storageNote: 'Tubers are the most chilling-sensitive produce. The system will alert immediately if temperature risks dropping below the safe floor.',
  },
  fruits: {
    id: 'fruits',
    label: 'Fruits Only',
    tagline: 'Mango, Pineapple, Orange, Banana',
    icon: <Apple className="w-5 h-5" />,
    iconBg: 'rgba(39,174,96,0.12)',
    iconColor: '#27AE60',
    accentColor: '#27AE60',
    crops: ['Mango', 'Pineapple', 'Orange', 'Banana', 'Pawpaw'],
    targetTemp: 10,
    targetHumidity: 85,
    tempRange: [8, 13],
    humidityRange: [80, 90],
    chillingFloor: 8,
    tradeoffs: [
      { icon: '🍌', text: 'Banana and plantain are chilling-sensitive, do not store below 12°C or skin will blacken.', severity: 'warn' },
      { icon: '🥭', text: 'Mango ripens rapidly above 13°C. Monitor closely and sell within the storage window.', severity: 'info' },
    ],
    storageNote: 'Fruit types vary widely. If mixing banana with other fruits, raise target to 12°C to protect it from chilling injury.',
  },
  leafy: {
    id: 'leafy',
    label: 'Leafy Vegetables',
    tagline: 'Lettuce, Cabbage, Spinach, Kontomire',
    icon: <Leaf className="w-5 h-5" />,
    iconBg: 'rgba(22,160,133,0.12)',
    iconColor: '#16A085',
    accentColor: '#16A085',
    crops: ['Lettuce', 'Cabbage', 'Spinach', 'Kontomire', 'Spring Onion'],
    targetTemp: 4,
    targetHumidity: 95,
    tempRange: [2, 6],
    humidityRange: [90, 98],
    chillingFloor: null,
    tradeoffs: [
      { icon: '💧', text: 'Very high humidity (90–98%) is essential.  Leafy vegetables lose marketability within hours when humidity drops.', severity: 'warn' },
      { icon: '❄️', text: 'Leafy vegetables benefit the most from cold. Do not compromise by storing with tubers or fruits.', severity: 'info' },
    ],
    storageNote: 'Leafy vegetables have the highest cold and humidity requirements. Store separately where possible for maximum shelf life.',
  },
  legumes: {
    id: 'legumes',
    label: 'Legumes',
    tagline: 'Cowpea, Groundnuts — low cold sensitivity',
    icon: <Package className="w-5 h-5" />,
    iconBg: 'rgba(113,113,130,0.12)',
    iconColor: '#717182',
    accentColor: '#717182',
    crops: ['Cowpea', 'Groundnuts', 'Soybeans', 'Bambara Beans'],
    targetTemp: 15,
    targetHumidity: 65,
    tempRange: [12, 20],
    humidityRange: [60, 70],
    chillingFloor: null,
    tradeoffs: [
      { icon: '🌾', text: 'Legumes need low humidity to prevent aflatoxin mould, keep below 70% RH at all times.', severity: 'warn' },
      { icon: 'ℹ️', text: 'Cold storage is optional for legumes, they benefit most from humidity control, not temperature.', severity: 'info' },
    ],
    storageNote: 'Legumes are not very cold-sensitive but are extremely humidity-sensitive. Aflatoxin contamination is the primary risk.',
  },
};

// Trade-off Warning Card 

function TradeoffWarnings({ profile }: { profile: ProduceProfile }) {
  const [expanded, setExpanded] = useState(true);

  if (profile.tradeoffs.length === 0) return null;

  const warnCount = profile.tradeoffs.filter(t => t.severity === 'warn').length;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -4 }}
      transition={{ duration: 0.2 }}
      className="mt-4 rounded-2xl border overflow-hidden"
      style={{ borderColor: warnCount > 0 ? 'rgba(230,126,34,0.3)' : '#E4E7EC' }}
    >
      <button
        onClick={() => setExpanded(e => !e)}
        className="w-full flex items-center justify-between px-4 py-3 transition-colors active:opacity-70"
        style={{ backgroundColor: warnCount > 0 ? 'rgba(230,126,34,0.06)' : '#F3F4F6' }}
      >
        <div className="flex items-center gap-2">
          {warnCount > 0
            ? <AlertTriangle className="w-4 h-4 text-orange-500 flex-shrink-0" />
            : <Info className="w-4 h-4 text-[#6B7280] flex-shrink-0" />
          }
          <span className="text-xs font-semibold" style={{ color: warnCount > 0 ? '#E67E22' : '#111827' }}>
            {profile.id === 'mixed'
              ? 'Mixed produce trade-offs — read before storing'
              : `${profile.tradeoffs.length} storage note${profile.tradeoffs.length > 1 ? 's' : ''}`}
          </span>
        </div>
        {expanded ? <ChevronUp className="w-4 h-4 text-[#6B7280]" /> : <ChevronDown className="w-4 h-4 text-[#6B7280]" />}
      </button>

      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0 }}
            animate={{ height: 'auto' }}
            exit={{ height: 0 }}
            className="overflow-hidden"
          >
            <div className="px-4 py-3 space-y-2.5 border-t border-[#E4E7EC] bg-white">
              {profile.tradeoffs.map((t, i) => (
                <div key={i} className="flex items-start gap-2.5">
                  <span className="text-base leading-none mt-0.5 flex-shrink-0">{t.icon}</span>
                  <p className="text-xs leading-relaxed" style={{ color: t.severity === 'warn' ? '#111827' : '#6B7280' }}>
                    {t.text}
                  </p>
                </div>
              ))}
              <div className="pt-2 border-t border-[#E4E7EC]">
                <p className="text-[11px] text-[#6B7280] italic leading-relaxed">{profile.storageNote}</p>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

//  Main Component 

// ThresholdRecommendation is no longer needed externally — profile application
// is handled entirely within AppContext via applyProduceProfile.
// Kept as a type export for backward compatibility with any future consumers.
export interface ThresholdRecommendation {
  warningTemperature:  number;
  criticalTemperature: number;
  warningHumidity:     number;
  criticalHumidity:    number;
  humidAlertHigh:      boolean;
}

type ApplyStep = 'idle' | 'confirm';

export default function ProduceModeSelector() {
  const { produceMode, addToast, user, applyProduceProfile } = useApp();
  const [showAllModes, setShowAllModes] = useState(false);
  // 'idle'    — focused confirmation view (survey done)
  // 'confirm' — "are you sure you want to change?" prompt
  // 'grid'    — full mode selection grid
  type ViewState = 'idle' | 'confirm' | 'grid';
  const [viewState, setViewState] = useState<ViewState>('idle');

  const surveyDone = user.surveyComplete === true;
  const profile    = PRODUCE_PROFILES[produceMode];

  const primaryModes: ProduceMode[] = ['mixed', 'tubers', 'fruits', 'leafy'];
  const allModes: ProduceMode[]     = [...primaryModes, 'legumes'];
  const visibleModes = showAllModes ? allModes : primaryModes;

  const handleSelectAndApply = (mode: ProduceMode) => {
    applyProduceProfile(mode);
    addToast({
      id: `produce-${Date.now()}`,
      type: 'success',
      message: `${PRODUCE_PROFILES[mode].label} profile applied — targets and thresholds updated`,
    });
    setViewState('idle');
    setShowAllModes(false);
  };

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-[#E4E7EC] p-4 md:p-5">

      {/* Header */}
      <div className="flex items-start justify-between mb-4">
        <div>
          <h3 className="text-[#111827] font-semibold text-sm md:text-base">
            {surveyDone && viewState === 'idle' ? 'Storage Profile' : 'What are you storing?'}
          </h3>
          <p className="text-xs text-[#6B7280] mt-0.5">
            {surveyDone && viewState === 'idle'
              ? 'Targets and alert thresholds are set for your produce type'
              : 'Select your produce type — targets and thresholds will be applied automatically'}
          </p>
        </div>
        {surveyDone && viewState === 'idle' && (
          <button
            onClick={() => setViewState('confirm')}
            className="flex-shrink-0 ml-3 flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-[10px] font-semibold transition-colors active:opacity-70"
            style={{ backgroundColor: '#F3F4F6', color: '#6B7280', border: '1px solid #E4E7EC' }}
          >
            <RefreshCw className="w-3 h-3" />
            Change
          </button>
        )}
      </div>

      <AnimatePresence mode="wait">

        {/* STATE 1: Focused confirmation — survey done, profile active */}
        {surveyDone && viewState === 'idle' && (
          <motion.div
            key="focused"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.2 }}
          >
            <div
              className="flex items-center gap-4 p-4 rounded-2xl border-2 mb-3"
              style={{ borderColor: profile.accentColor, backgroundColor: `${profile.accentColor}0d` }}
            >
              <div
                className="w-14 h-14 rounded-xl flex items-center justify-center flex-shrink-0"
                style={{ backgroundColor: `${profile.accentColor}20`, color: profile.accentColor }}
              >
                <span style={{ transform: 'scale(1.4)', display: 'block' }}>{profile.icon}</span>
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  <p className="text-sm font-bold text-[#111827]">{profile.label}</p>
                  <span className="w-4 h-4 rounded-full flex items-center justify-center flex-shrink-0"
                    style={{ backgroundColor: profile.accentColor }}>
                    <CheckCircle2 className="w-2.5 h-2.5 text-white" />
                  </span>
                </div>
                <p className="text-xs text-[#6B7280] leading-snug">{profile.tagline}</p>
                <div className="flex flex-wrap gap-1 mt-2">
                  {profile.crops.slice(0, 4).map(crop => (
                    <span key={crop}
                      className="px-1.5 py-0.5 rounded-full text-[10px] font-medium"
                      style={{ backgroundColor: `${profile.accentColor}15`, color: profile.accentColor }}>
                      {crop}
                    </span>
                  ))}
                </div>
              </div>
            </div>

            <div className="bg-[#F3F4F6] rounded-2xl px-3 py-3">
              <p className="text-[10px] text-[#6B7280] uppercase tracking-wide mb-1.5">Active targets</p>
              <div className="flex items-center gap-3 flex-wrap">
                <div className="flex items-center gap-1">
                  <Thermometer className="w-3.5 h-3.5" style={{ color: profile.accentColor }} />
                  <span className="text-sm font-bold" style={{ color: profile.accentColor }}>{profile.targetTemp}°C</span>
                  <span className="text-[10px] text-[#6B7280] ml-0.5">({profile.tempRange[0]}–{profile.tempRange[1]}°C)</span>
                </div>
                <div className="w-px h-4 bg-border flex-shrink-0" />
                <div className="flex items-center gap-1">
                  <Droplets className="w-3.5 h-3.5" style={{ color: profile.accentColor }} />
                  <span className="text-sm font-bold" style={{ color: profile.accentColor }}>{profile.targetHumidity}%</span>
                  <span className="text-[10px] text-[#6B7280] ml-0.5">({profile.humidityRange[0]}–{profile.humidityRange[1]}%)</span>
                </div>
              </div>
            </div>
          </motion.div>
        )}

        {/* STATE 2: Change confirmation — deliberate friction before switching */}
        {viewState === 'confirm' && (
          <motion.div
            key="confirm"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.2 }}
            className="rounded-2xl border border-[#E4E7EC] bg-[#F3F4F6] p-4 space-y-3"
          >
            <div className="flex items-start gap-3">
              <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 bg-orange-500/10">
                <RefreshCw className="w-4 h-4 text-orange-500" />
              </div>
              <div>
                <p className="text-sm font-semibold text-[#111827]">Change storage profile?</p>
                <p className="text-xs text-[#6B7280] mt-1 leading-relaxed">
                  This will update the temperature target, humidity target, and alert thresholds
                  for this device. Your current settings will be replaced.
                </p>
              </div>
            </div>
            <div className="flex gap-2 pt-1">
              <button
                onClick={() => setViewState('grid')}
                className="flex-1 py-2.5 rounded-xl text-white text-xs font-semibold active:scale-[0.98] transition-all"
                style={{ backgroundColor: '#E67E22' }}
              >
                Yes, change profile
              </button>
              <button
                onClick={() => setViewState('idle')}
                className="flex-1 py-2.5 rounded-xl border border-[#E4E7EC] text-[#6B7280] text-xs font-semibold active:bg-[#F3F4F6]/70 transition-colors"
              >
                Keep {profile.label}
              </button>
            </div>
          </motion.div>
        )}

        {/* STATE 3: Full grid — survey skipped or confirmed change */}
        {(!surveyDone || viewState === 'grid') && (
          <motion.div
            key="grid"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.2 }}
          >
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-3">
              {visibleModes.map(modeId => {
                const p      = PRODUCE_PROFILES[modeId];
                const active = produceMode === modeId;
                return (
                  <button
                    key={modeId}
                    onClick={() => handleSelectAndApply(modeId)}
                    className="relative flex flex-col items-start p-3 rounded-2xl border-2 transition-all active:scale-[0.97] text-left"
                    style={{
                      borderColor:     active ? p.accentColor : '#E4E7EC',
                      backgroundColor: active ? `${p.accentColor}0e` : '#F3F4F6',
                    }}
                  >
                    {active && (
                      <span className="absolute top-2 right-2 w-4 h-4 rounded-full flex items-center justify-center"
                        style={{ backgroundColor: p.accentColor }}>
                        <CheckCircle2 className="w-3 h-3 text-white" />
                      </span>
                    )}
                    <div className="w-9 h-9 rounded-xl flex items-center justify-center mb-2 flex-shrink-0"
                      style={{ backgroundColor: active ? `${p.accentColor}20` : '#FFFFFF', color: p.iconColor }}>
                      {p.icon}
                    </div>
                    <p className="text-xs font-bold text-[#111827] leading-tight">{p.label}</p>
                    <p className="text-[10px] text-[#6B7280] mt-0.5 leading-tight">{p.tagline.split('—')[0].trim()}</p>
                    <div className="mt-2 flex items-center gap-1">
                      <Thermometer className="w-3 h-3 flex-shrink-0" style={{ color: p.iconColor }} />
                      <span className="text-[10px] font-semibold"
                        style={{ color: active ? p.accentColor : '#6B7280' }}>
                        {p.targetTemp}°C
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>

            {!showAllModes && (
              <button onClick={() => setShowAllModes(true)}
                className="text-[11px] text-[#6B7280] underline underline-offset-2 mb-3 block">
                + Legumes (Cowpea, Groundnuts)
              </button>
            )}

            <div className="bg-[#F3F4F6] rounded-2xl px-3 py-3 mt-2">
              <p className="text-[10px] text-[#6B7280] uppercase tracking-wide mb-1.5">Tap any card to apply</p>
              <div className="flex items-center gap-3 flex-wrap">
                <div className="flex items-center gap-1">
                  <Thermometer className="w-3.5 h-3.5" style={{ color: profile.accentColor }} />
                  <span className="text-sm font-bold" style={{ color: profile.accentColor }}>{profile.targetTemp}°C</span>
                  <span className="text-[10px] text-[#6B7280] ml-0.5">({profile.tempRange[0]}–{profile.tempRange[1]}°C)</span>
                </div>
                <div className="w-px h-4 bg-border flex-shrink-0" />
                <div className="flex items-center gap-1">
                  <Droplets className="w-3.5 h-3.5" style={{ color: profile.accentColor }} />
                  <span className="text-sm font-bold" style={{ color: profile.accentColor }}>{profile.targetHumidity}%</span>
                  <span className="text-[10px] text-[#6B7280] ml-0.5">({profile.humidityRange[0]}–{profile.humidityRange[1]}%)</span>
                </div>
              </div>
            </div>

            {surveyDone && viewState === 'grid' && (
              <button
                onClick={() => { setViewState('idle'); setShowAllModes(false); }}
                className="w-full text-xs text-[#6B7280] text-center mt-2 py-1.5 active:opacity-60"
              >
                Cancel — keep {profile.label}
              </button>
            )}
          </motion.div>
        )}

      </AnimatePresence>

      {/* Trade-off warnings — always visible */}
      <AnimatePresence mode="wait">
        <TradeoffWarnings key={produceMode} profile={profile} />
      </AnimatePresence>
    </div>
  );
}