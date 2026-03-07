import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Zap, Power, PowerOff, AlertTriangle, Thermometer, Droplets } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { PRODUCE_PROFILES } from './ProduceModeSelector';

// ── Unit helpers ──────────────────────────────────────────────────────────────

function makeUnitHelpers(isFahrenheit: boolean) {
  const toDisplay  = (c: number) => isFahrenheit ? parseFloat((c * 9 / 5 + 32).toFixed(1)) : parseFloat(c.toFixed(1));
  const toInternal = (d: number) => isFahrenheit ? parseFloat(((d - 32) * 5 / 9).toFixed(2)) : d;
  const unit       = isFahrenheit ? '°F' : '°C';
  const stepMin    = isFahrenheit ? 32 : 0;
  const stepMax    = isFahrenheit ? 86 : 30;
  return { toDisplay, toInternal, unit, stepMin, stepMax };
}

// ── Live Stat Card ────────────────────────────────────────────────────────────

function StatCard({
  icon, label, value, unit, statusLabel, statusColor, target, targetUnit,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  unit: string;
  statusLabel: string;
  statusColor: string;
  target: string;
  targetUnit: string;
}) {
  return (
    <div className="flex-1 rounded-2xl p-4" style={{ backgroundColor: '#F8FAFC', border: '1px solid #E4E7EC' }}>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-1.5">
          <span style={{ color: statusColor }}>{icon}</span>
          <p className="text-xs font-semibold text-[#6B7280] uppercase tracking-wide">{label}</p>
        </div>
        <span
          className="text-[10px] font-bold px-2 py-0.5 rounded-full"
          style={{ backgroundColor: `${statusColor}18`, color: statusColor }}
        >
          {statusLabel}
        </span>
      </div>
      <p className="text-3xl font-bold tabular-nums leading-none" style={{ color: statusColor }}>
        {value}<span className="text-base font-semibold ml-0.5">{unit}</span>
      </p>
      <p className="text-xs text-[#6B7280] mt-2">
        Target <span className="font-semibold text-[#111827]">{target}{targetUnit}</span>
      </p>
    </div>
  );
}

// ── Stepper + Tap-to-edit ─────────────────────────────────────────────────────

function ValueStepper({
  value, onChange, min, max, step = 1, accentColor, unit, label,
}: {
  value: number; onChange: (v: number) => void;
  min: number; max: number; step?: number;
  accentColor: string; unit: string; label: string;
}) {
  const [editing, setEditing] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const clamp = (v: number) => Math.min(max, Math.max(min, v));

  const btnClass = "w-12 h-12 rounded-2xl flex items-center justify-center text-xl font-light text-[#111827] active:bg-[#E4E7EC] transition-colors flex-shrink-0 select-none";

  return (
    <div className="flex items-center gap-3">
      <button
        onClick={() => onChange(clamp(parseFloat((value - step).toFixed(1))))}
        className={btnClass}
        style={{ border: '2px solid #E4E7EC' }}
        aria-label={`Decrease ${label}`}
      >−</button>

      <button
        className="flex-1 flex flex-col items-center justify-center py-2.5 rounded-2xl transition-opacity active:opacity-70"
        style={{ backgroundColor: '#F3F4F6' }}
        onClick={() => { setEditing(true); setTimeout(() => inputRef.current?.select(), 40); }}
      >
        {editing ? (
          <input
            ref={inputRef}
            type="number"
            value={value}
            onChange={e => { const v = parseFloat(e.target.value); if (!isNaN(v)) onChange(clamp(v)); }}
            onBlur={() => setEditing(false)}
            onKeyDown={e => e.key === 'Enter' && setEditing(false)}
            className="w-full text-center bg-transparent outline-none text-4xl font-bold tabular-nums"
            style={{ color: accentColor }}
            min={min} max={max} step={step}
            autoFocus
          />
        ) : (
          <span className="text-4xl font-bold tabular-nums" style={{ color: accentColor }}>
            {Number.isInteger(value) ? value : value.toFixed(1)}
          </span>
        )}
        <span className="text-xs text-[#6B7280] mt-0.5">{unit} · tap to edit</span>
      </button>

      <button
        onClick={() => onChange(clamp(parseFloat((value + step).toFixed(1))))}
        className={btnClass}
        style={{ border: '2px solid #E4E7EC' }}
        aria-label={`Increase ${label}`}
      >+</button>
    </div>
  );
}

// ── Preset Pills ──────────────────────────────────────────────────────────────

function PresetPills({
  presets, current, onSelect, accentColor,
}: {
  presets: { label: string; value: number; hint: string }[];
  current: number;
  onSelect: (v: number) => void;
  accentColor: string;
}) {
  return (
    <div className="grid grid-cols-3 gap-2">
      {presets.map(p => {
        const active = Math.abs(current - p.value) < 0.5;
        return (
          <button
            key={p.value}
            onClick={() => onSelect(p.value)}
            className="py-2.5 rounded-xl transition-all active:scale-[0.96] border"
            style={{
              borderColor:     active ? accentColor : '#E4E7EC',
              backgroundColor: active ? `${accentColor}12` : '#F9FAFB',
              color:           active ? accentColor : '#6B7280',
            }}
          >
            <p className="text-xs font-bold tabular-nums">{p.label}</p>
            <p className="text-[9px] mt-0.5 opacity-70">{p.hint}</p>
          </button>
        );
      })}
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function ControlPanel() {
  const {
    currentTemperature, currentHumidity, settings,
    targetTemperature, targetHumidity,
    autoMode, systemStatus, produceMode,
    setTargetTemperature, setTargetHumidity,
    setAutoMode, startCooling, stopCooling, addToast,
    devices, selectedDeviceId,
  } = useApp();

  const isFahrenheit = settings.tempUnit === 'F';
  const { toDisplay, toInternal, unit, stepMin, stepMax } = makeUnitHelpers(isFahrenheit);

  const [tempInput,  setTempInput]  = useState(() => toDisplay(targetTemperature));
  const [humidInput, setHumidInput] = useState(targetHumidity);

  // Sync when produce profile applied externally
  useEffect(() => { setTempInput(toDisplay(targetTemperature)); }, [targetTemperature, isFahrenheit]);
  useEffect(() => { setHumidInput(targetHumidity); },             [targetHumidity]);

  const profile     = PRODUCE_PROFILES[produceMode];
  const accentTemp  = profile.accentColor;
  const accentHumid = '#0891B2';

  // Respect per-device custom thresholds — same logic as Dashboard
  const selectedDevice = devices.find(d => d.id === selectedDeviceId);
  const warnTemp  = selectedDevice?.useCustomThresholds ? selectedDevice.warningTemperature  : settings.warningTemperature;
  const critTemp  = selectedDevice?.useCustomThresholds ? selectedDevice.criticalTemperature  : settings.criticalTemperature;
  const warnHumid = selectedDevice?.useCustomThresholds ? selectedDevice.warningHumidity      : settings.warningHumidity;
  const critHumid = selectedDevice?.useCustomThresholds ? selectedDevice.criticalHumidity     : settings.criticalHumidity;

  // Chilling floor check (always in °C internally)
  const chillingFloor = profile.chillingFloor;
  const isBelowChill  = chillingFloor !== null && toInternal(tempInput) < chillingFloor;

  // Status colours — use effective per-device thresholds
  const tempStatus =
    currentTemperature >= critTemp  ? { label: 'Critical', color: '#DC2626' } :
    currentTemperature >= warnTemp  ? { label: 'Warning',  color: '#D97706' } :
                                      { label: 'Normal',   color: '#16A34A' };

  const humidStatus =
    currentHumidity >= critHumid ? { label: 'Critical', color: '#DC2626' } :
    currentHumidity >= warnHumid ? { label: 'Warning',  color: '#D97706' } :
                                   { label: 'Normal',   color: '#16A34A' };

  // 3 presets from profile ranges — no hardcoded per-mode lookup table
  const [tLow, tHigh] = profile.tempRange;
  const tempPresets = [
    { label: `${toDisplay(tLow).toFixed(0)}${unit}`,           value: toDisplay(tLow),           hint: 'Cool end' },
    { label: `${toDisplay(profile.targetTemp).toFixed(0)}${unit}`, value: toDisplay(profile.targetTemp), hint: 'Ideal'    },
    { label: `${toDisplay(tHigh).toFixed(0)}${unit}`,          value: toDisplay(tHigh),          hint: 'Warm end' },
  ];

  const [hLow, hHigh] = profile.humidityRange;
  const humidPresets = [
    { label: `${hLow}%`,                  value: hLow,                  hint: 'Low end' },
    { label: `${profile.targetHumidity}%`, value: profile.targetHumidity, hint: 'Ideal'   },
    { label: `${hHigh}%`,                 value: hHigh,                 hint: 'High end' },
  ];

  const isTempDirty  = Math.abs(tempInput - toDisplay(targetTemperature)) > 0.05;
  const isHumidDirty = humidInput !== targetHumidity;

  const applyTemp = (displayVal: number) => {
    setTargetTemperature(toInternal(displayVal));
    addToast({ id: `t-${Date.now()}`, type: 'success', message: `Temperature target → ${displayVal.toFixed(isFahrenheit ? 0 : 1)}${unit}` });
  };

  const applyHumid = (val: number) => {
    setTargetHumidity(val);
    addToast({ id: `t-${Date.now()}`, type: 'success', message: `Humidity target → ${val}% RH` });
  };

  const handleMode = (wantAuto: boolean) => {
    if (wantAuto === autoMode) return;
    setAutoMode(wantAuto);
    addToast({ id: `t-${Date.now()}`, type: 'info', message: wantAuto ? 'Switched to Auto mode' : 'Switched to Manual mode' });
  };

  const handleCooling = () => {
    if (systemStatus === 'cooling') {
      stopCooling();
      addToast({ id: `t-${Date.now()}`, type: 'warning', message: 'Cooling stopped manually' });
    } else {
      startCooling();
      addToast({ id: `t-${Date.now()}`, type: 'success', message: 'Cooling started' });
    }
  };

  const isCooling = systemStatus === 'cooling';

  return (
    <div
      className="rounded-2xl overflow-hidden flex flex-col"
      style={{ backgroundColor: '#FFFFFF', border: '1px solid #E4E7EC', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}
    >

      {/* ── Header ── */}
      <div className="px-5 pt-5 pb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ backgroundColor: `${accentTemp}18` }}>
            <Thermometer className="w-4 h-4" style={{ color: accentTemp }} />
          </div>
          <span className="text-[#111827] font-semibold text-sm">Control Panel</span>
        </div>
        <div
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold"
          style={{ backgroundColor: isCooling ? '#0984E318' : '#F3F4F6', color: isCooling ? '#0984E3' : '#6B7280' }}
        >
          <span className={`w-1.5 h-1.5 rounded-full ${isCooling ? 'bg-[#0984E3] animate-pulse' : 'bg-[#9CA3AF]'}`} />
          {isCooling ? 'Cooling Active' : 'System Idle'}
        </div>
      </div>

      {/* ── Auto / Manual toggle ── */}
      <div className="px-5 pb-4">
        <div className="flex bg-[#F3F4F6] rounded-2xl p-1 gap-1">
          {[
            { auto: true,  label: 'Auto',   icon: <Zap   className="w-3.5 h-3.5" /> },
            { auto: false, label: 'Manual', icon: <Power className="w-3.5 h-3.5" /> },
          ].map(tab => (
            <button
              key={String(tab.auto)}
              onClick={() => handleMode(tab.auto)}
              className="relative flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-xs font-semibold transition-all active:scale-[0.97]"
              style={{ color: autoMode === tab.auto ? 'white' : '#6B7280' }}
            >
              {autoMode === tab.auto && (
                <motion.div
                  layoutId="cp-mode-pill"
                  className="absolute inset-0 rounded-xl"
                  style={{ backgroundColor: tab.auto ? '#0984E3' : '#D97706' }}
                  transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                />
              )}
              <span className="relative z-10 flex items-center gap-1.5">{tab.icon}{tab.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* ── Live stat cards ── */}
      <div className="px-5 pb-4 flex gap-3">
        <StatCard
          icon={<Thermometer className="w-3.5 h-3.5" />}
          label="Temp"
          value={toDisplay(currentTemperature).toFixed(1)}
          unit={unit}
          statusLabel={tempStatus.label}
          statusColor={tempStatus.color}
          target={toDisplay(targetTemperature).toFixed(isFahrenheit ? 0 : 1)}
          targetUnit={unit}
        />
        <StatCard
          icon={<Droplets className="w-3.5 h-3.5" />}
          label="Humidity"
          value={currentHumidity.toFixed(1)}
          unit="%"
          statusLabel={humidStatus.label}
          statusColor={humidStatus.color}
          target={String(targetHumidity)}
          targetUnit="% RH"
        />
      </div>

      {/* ── Temperature target ── */}
      <div className="px-5 pb-4" style={{ borderTop: '1px solid #E4E7EC', paddingTop: '1rem' }}>
        <p className="text-xs font-semibold text-[#6B7280] uppercase tracking-wide mb-3">
          Set Target Temperature
        </p>

        <ValueStepper
          value={tempInput}
          onChange={setTempInput}
          min={stepMin} max={stepMax}
          accentColor={isTempDirty ? '#D97706' : accentTemp}
          unit={unit}
          label="temperature"
        />

        <div className="mt-3 mb-3">
          <PresetPills
            presets={tempPresets}
            current={tempInput}
            onSelect={v => { setTempInput(v); applyTemp(v); }}
            accentColor={accentTemp}
          />
        </div>

        {/* Chilling floor warning */}
        <AnimatePresence>
          {isBelowChill && (
            <motion.div
              key="chill-warning"
              initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }} className="overflow-hidden mb-3"
            >
              <div className="flex items-start gap-2 px-3 py-2.5 rounded-xl" style={{ backgroundColor: 'rgba(220,38,38,0.06)', border: '1px solid rgba(220,38,38,0.2)' }}>
                <AlertTriangle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
                <p className="text-xs text-red-600 leading-relaxed">
                  <span className="font-bold">Chilling injury risk.</span>{' '}
                  {profile.label} should stay above {toDisplay(chillingFloor!)}{unit} — cold damage causes rot within hours.
                </p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {isTempDirty && (
            <motion.button
              key="apply-temp"
              initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }} transition={{ duration: 0.15 }}
              onClick={() => applyTemp(tempInput)}
              className="w-full py-3.5 rounded-2xl text-white text-sm font-semibold active:scale-[0.98] transition-transform"
              style={{ backgroundColor: accentTemp }}
            >
              Apply {tempInput.toFixed(isFahrenheit ? 0 : 1)}{unit}
            </motion.button>
          )}
        </AnimatePresence>
      </div>

      {/* ── Humidity target ── */}
      <div className="px-5 pb-4" style={{ borderTop: '1px solid #E4E7EC', paddingTop: '1rem' }}>
        <p className="text-xs font-semibold text-[#6B7280] uppercase tracking-wide mb-3">
          Set Target Humidity
        </p>

        <ValueStepper
          value={humidInput}
          onChange={setHumidInput}
          min={0} max={100}
          accentColor={isHumidDirty ? '#D97706' : accentHumid}
          unit="% RH"
          label="humidity"
        />

        <div className="mt-3 mb-3">
          <PresetPills
            presets={humidPresets}
            current={humidInput}
            onSelect={v => { setHumidInput(v); applyHumid(v); }}
            accentColor={accentHumid}
          />
        </div>

        <AnimatePresence>
          {isHumidDirty && (
            <motion.button
              key="apply-humid"
              initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }} transition={{ duration: 0.15 }}
              onClick={() => applyHumid(humidInput)}
              className="w-full py-3.5 rounded-2xl text-white text-sm font-semibold active:scale-[0.98] transition-transform"
              style={{ backgroundColor: accentHumid }}
            >
              Apply {humidInput}% RH
            </motion.button>
          )}
        </AnimatePresence>
      </div>

      {/* ── Manual override ── */}
      <AnimatePresence>
        {!autoMode && (
          <motion.div
            initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 300, damping: 30 }}
            className="overflow-hidden"
            style={{ borderTop: '1px solid #E4E7EC' }}
          >
            <div className="px-5 py-4">
              <div className="flex items-center gap-2 mb-3">
                <Power className="w-3.5 h-3.5 text-[#D97706]" />
                <p className="text-xs font-semibold text-[#D97706] uppercase tracking-wide">Manual Override</p>
              </div>
              <button
                onClick={handleCooling}
                className="w-full py-3.5 rounded-2xl text-white text-sm font-semibold active:scale-[0.98] transition-transform flex items-center justify-center gap-2"
                style={{ backgroundColor: isCooling ? '#DC2626' : '#0984E3' }}
              >
                {isCooling
                  ? <><PowerOff className="w-4 h-4" />Stop Cooling</>
                  : <><Power    className="w-4 h-4" />Start Cooling</>
                }
              </button>
              <p className="text-xs text-[#D97706] text-center mt-2 opacity-80">
                Auto mode is off — you control the compressor directly.
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

    </div>
  );
}