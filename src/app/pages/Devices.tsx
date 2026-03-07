import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Cpu, MapPin, Wifi, WifiOff, Battery, Info, Plus, ChevronRight, Signal, Settings2, X, Check, Trash2, AlertTriangle } from 'lucide-react';
import { useApp } from '../context/AppContext';
import type { Device } from '../context/AppContext';
import { usePageLoading, DevicesSkeleton } from '../components/Skeleton';

// Module-level helpers 

function timeAgo(d: Date) {
  const s = Math.floor((Date.now() - d.getTime()) / 1000);
  if (s < 60)    return `${s}s ago`;
  if (s < 3600)  return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

const getBatteryColor = (level: number) =>
  level > 50 ? '#27AE60' : level > 20 ? '#E67E22' : '#C0392B';

// Configure Bottom Sheet 

function ConfigureSheet({ device, onClose }: { device: Device; onClose: () => void }) {
  const { updateDevice, addToast } = useApp();
  const [name,     setName]     = useState(device.name);
  const [location, setLocation] = useState(device.location);
  const [saving,   setSaving]   = useState(false);

  const isDirty = name.trim() !== device.name || location.trim() !== device.location;

  // Lock body scroll while sheet is open — prevents the whole page scrolling behind it on iOS
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

  // CRITICAL: font-size must be 16px minimum on inputs.
  // Anything below 16px causes iOS Safari to auto-zoom the entire page when the input is focused.
  const inputBase = "w-full px-4 rounded-xl border border-[#E4E7EC] bg-[#F3F4F6] text-[#111827] outline-none focus:border-[#0984E3] focus:ring-2 focus:ring-[#0984E3]/20 transition-all";

  return (
    <>
      {/* Backdrop — z-[55] so it sits above BottomNav (z-50) */}
      <motion.div
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        className="fixed inset-0 bg-black/50 z-[55] backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Sheet — z-[60] so it sits above backdrop and BottomNav */}
      <motion.div
        initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
        transition={{ type: 'spring', stiffness: 380, damping: 38 }}
        className="fixed bottom-0 left-0 right-0 z-[60] bg-white rounded-t-3xl shadow-2xl border-t border-[#E4E7EC] flex flex-col"
        style={{ maxHeight: '85dvh' }}
      >
        {/* Drag handle */}
        <div className="flex justify-center pt-4 pb-2 flex-shrink-0">
          <div className="w-12 h-1.5 rounded-full bg-[#D1D5DB]" />
        </div>

        {/* Scrollable content */}
        <div className="px-5 pt-2 overflow-y-auto flex-1 overscroll-contain">

          {/* Header */}
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
            {/* 44×44 minimum touch target for older users */}
            <button
              onClick={onClose}
              className="rounded-full bg-[#F3F4F6] flex items-center justify-center active:opacity-70"
              style={{ width: 44, height: 44 }}
            >
              <X className="w-5 h-5 text-[#6B7280]" />
            </button>
          </div>

          {/* Fields */}
          <div className="space-y-5 mb-5">
            <div>
              <label className="block font-semibold text-[#111827] mb-2 uppercase tracking-wide" style={{ fontSize: 14 }}>
                Device Name
              </label>
              <input
                type="text"
                value={name}
                onChange={e => setName(e.target.value)}
                className={inputBase}
                placeholder="e.g. Storage Unit A"
                maxLength={40}
                autoComplete="off"
                autoCorrect="off"
                // 16px prevents iOS Safari auto-zoom; height gives large touch target for older users
                style={{ fontSize: 16, height: 56 }}
              />
            </div>
            <div>
              <label className="block font-semibold text-[#111827] mb-2 uppercase tracking-wide" style={{ fontSize: 14 }}>
                Location
              </label>
              <input
                type="text"
                value={location}
                onChange={e => setLocation(e.target.value)}
                className={inputBase}
                placeholder="e.g. Kumasi Central Market"
                maxLength={60}
                autoComplete="off"
                autoCorrect="off"
                style={{ fontSize: 16, height: 56 }}
              />
            </div>
          </div>

          {/* Calibration note */}
          <p className="text-[#6B7280] pb-6 leading-relaxed" style={{ fontSize: 14 }}>
            Calibration offsets and custom thresholds can be adjusted in{' '}
            <span className="text-[#0984E3] font-semibold">Settings → Device Configuration</span>.
          </p>
        </div>

        {/* Sticky action buttons — always visible above keyboard, safe-area aware */}
        <div
          className="flex-shrink-0 px-5 border-t border-[#E4E7EC] bg-white"
          style={{ paddingTop: 14, paddingBottom: 'calc(env(safe-area-inset-bottom) + 14px)' }}
        >
          <div className="flex gap-3">
            <button
              onClick={onClose}
              className="flex-1 rounded-2xl border-2 border-[#E4E7EC] text-[#6B7280] font-semibold active:bg-[#F3F4F6] transition-all"
              style={{ fontSize: 17, minHeight: 58 }}
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={!name.trim() || saving}
              className="flex-1 rounded-2xl text-white font-bold active:scale-[0.98] transition-all flex items-center justify-center gap-2 disabled:opacity-50"
              style={{ fontSize: 17, minHeight: 58, backgroundColor: isDirty ? '#0984E3' : '#27AE60' }}
            >
              {saving
                ? <><div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />Saving…</>
                : isDirty
                  ? 'Save Changes'
                  : <><Check className="w-5 h-5" />No Changes</>
              }
            </button>
          </div>
        </div>
      </motion.div>
    </>
  );
}

// Add Device Modal

function AddDeviceModal({ onClose }: { onClose: () => void }) {
  const { addDevice, addToast } = useApp();
  const [name,     setName]     = useState('');
  const [location, setLocation] = useState('');
  const [saving,   setSaving]   = useState(false);
  const [error,    setError]    = useState('');

  // Lock body scroll while sheet is open
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, []);

  const handleAdd = () => {
    setError('');
    if (!name.trim())     { setError('Device name is required.'); return; }
    if (!location.trim()) { setError('Location is required.'); return; }
    setSaving(true);
    setTimeout(() => {
      addDevice(name.trim(), location.trim());
      addToast({ id: `toast-${Date.now()}`, type: 'success', message: `${name.trim()} added — awaiting ESP32 connection` });
      setSaving(false);
      onClose();
    }, 600);
  };

  const inputBase = "w-full px-4 rounded-xl border border-[#E4E7EC] bg-[#F3F4F6] text-[#111827] outline-none focus:border-[#0984E3] focus:ring-2 focus:ring-[#0984E3]/20 transition-all";

  return (
    <>
      <motion.div
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        className="fixed inset-0 bg-black/50 z-[55] backdrop-blur-sm"
        onClick={onClose}
      />

      <motion.div
        initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
        transition={{ type: 'spring', stiffness: 380, damping: 38 }}
        className="fixed bottom-0 left-0 right-0 z-[60] bg-white rounded-t-3xl shadow-2xl border-t border-[#E4E7EC] flex flex-col"
        style={{ maxHeight: '85dvh' }}
      >
        <div className="flex justify-center pt-4 pb-2 flex-shrink-0">
          <div className="w-12 h-1.5 rounded-full bg-[#D1D5DB]" />
        </div>

        <div className="px-5 pt-2 overflow-y-auto flex-1 overscroll-contain">

          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-xl bg-[#0984E3]/10 flex items-center justify-center flex-shrink-0">
                <Plus style={{ width: 24, height: 24, color: '#0984E3' }} />
              </div>
              <p className="font-bold text-[#111827]" style={{ fontSize: 18 }}>Add New Device</p>
            </div>
            <button
              onClick={onClose}
              className="rounded-full bg-[#F3F4F6] flex items-center justify-center active:opacity-70"
              style={{ width: 44, height: 44 }}
            >
              <X className="w-5 h-5 text-[#6B7280]" />
            </button>
          </div>

          <div className="space-y-5 mb-5">
            <div>
              <label className="block font-semibold text-[#111827] mb-2 uppercase tracking-wide" style={{ fontSize: 14 }}>
                Device Name
              </label>
              <input
                type="text"
                value={name}
                onChange={e => setName(e.target.value)}
                className={inputBase}
                placeholder="e.g. Cold Room B"
                maxLength={40}
                autoComplete="off"
                autoCorrect="off"
                style={{ fontSize: 16, height: 56 }}
              />
            </div>
            <div>
              <label className="block font-semibold text-[#111827] mb-2 uppercase tracking-wide" style={{ fontSize: 14 }}>
                Location
              </label>
              <input
                type="text"
                value={location}
                onChange={e => setLocation(e.target.value)}
                className={inputBase}
                placeholder="e.g. Tamale Market"
                maxLength={60}
                autoComplete="off"
                autoCorrect="off"
                style={{ fontSize: 16, height: 56 }}
              />
            </div>
          </div>

          <div className="flex items-start gap-3 p-4 rounded-xl mb-4" style={{ backgroundColor: 'rgba(9,132,227,0.08)', border: '1px solid rgba(9,132,227,0.2)' }}>
            <Info style={{ width: 20, height: 20, color: '#0984E3', flexShrink: 0, marginTop: 1 }} />
            <p style={{ fontSize: 14, color: '#0984E3', lineHeight: 1.5 }}>
              The device will show as <span className="font-semibold">Offline</span> until your ESP32 connects and starts sending data.
            </p>
          </div>

          {error && (
            <div className="p-4 rounded-xl border mb-4" style={{ fontSize: 15, color: '#C0392B', backgroundColor: 'rgba(192,57,43,0.08)', borderColor: 'rgba(192,57,43,0.2)' }}>
              {error}
            </div>
          )}
        </div>

        {/* Sticky action buttons */}
        <div
          className="flex-shrink-0 px-5 border-t border-[#E4E7EC] bg-white"
          style={{ paddingTop: 14, paddingBottom: 'calc(env(safe-area-inset-bottom) + 14px)' }}
        >
          <div className="flex gap-3">
            <button
              onClick={onClose}
              className="flex-1 rounded-2xl border-2 border-[#E4E7EC] text-[#6B7280] font-semibold active:bg-[#F3F4F6] transition-all"
              style={{ fontSize: 17, minHeight: 58 }}
            >
              Cancel
            </button>
            <button
              onClick={handleAdd}
              disabled={saving}
              className="flex-1 rounded-2xl text-white font-bold active:scale-[0.98] flex items-center justify-center gap-2 disabled:opacity-50"
              style={{ fontSize: 17, minHeight: 58, backgroundColor: '#0984E3' }}
            >
              {saving
                ? <><div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />Adding…</>
                : 'Add Device'
              }
            </button>
          </div>
        </div>
      </motion.div>
    </>
  );
}

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

  return (
    <div className="space-y-6">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-[#111827]">Connected Devices</h2>
          <p className="text-[#6B7280] text-sm mt-1">Manage your ColdWatch ESP32 monitoring modules</p>
        </div>
        <button
          onClick={() => setShowAddModal(true)}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-white text-sm font-medium active:scale-[0.98] transition-all"
          style={{ backgroundColor: '#0984E3' }}
        >
          <Plus className="w-4 h-4" />
          Add Device
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

            {/* Info Rows */}
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
                  <Info className="w-3.5 h-3.5" />
                  <span>Last Seen</span>
                </div>
                <span className={`text-xs font-medium ${device.status === 'offline' ? 'text-red-500' : 'text-[#111827]'}`}>
                  {device.status === 'online' ? 'Just now' : timeAgo(device.lastSeen)}
                </span>
              </div>

              {isAdvancedUser && (
                <div className="flex items-center justify-between py-2 border-b border-[#E4E7EC]">
                  <div className="flex items-center gap-2 text-xs text-[#6B7280]">
                    <Signal className="w-3.5 h-3.5" />
                    <span>Firmware</span>
                  </div>
                  <span className="text-xs font-mono text-[#111827]">v{device.firmwareVersion}</span>
                </div>
              )}

              <div className="flex items-center justify-between py-2">
                <div className="flex items-center gap-2 text-xs text-[#6B7280]">
                  <Battery className="w-3.5 h-3.5" />
                  <span>Battery</span>
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
                <motion.div
                  key="confirm"
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 4 }}
                  transition={{ duration: 0.15 }}
                  className="rounded-xl p-3 border"
                  style={{ backgroundColor: 'rgba(192,57,43,0.06)', borderColor: 'rgba(192,57,43,0.2)' }}
                >
                  <div className="flex items-center gap-2 mb-2.5">
                    <AlertTriangle className="w-3.5 h-3.5 text-red-500 flex-shrink-0" />
                    <p className="text-xs font-semibold text-red-600">Remove this device?</p>
                  </div>
                  <p className="text-[11px] text-[#6B7280] mb-3 leading-relaxed">
                    This removes it from your dashboard. The ESP32 hardware is unaffected.
                  </p>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setConfirmingDelete(null)}
                      className="flex-1 py-2 rounded-lg text-xs font-semibold text-[#6B7280] border border-[#E4E7EC] active:bg-[#F3F4F6] transition-all"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={() => handleDelete(device)}
                      className="flex-1 py-2 rounded-lg text-xs font-semibold text-white active:scale-[0.98] transition-all"
                      style={{ backgroundColor: '#C0392B' }}
                    >
                      Remove
                    </button>
                  </div>
                </motion.div>
              ) : (
                <motion.div
                  key="actions"
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 4 }}
                  transition={{ duration: 0.15 }}
                  className="flex gap-2"
                >
                  <button
                    onClick={() => handleViewDashboard(device.id)}
                    className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-white text-xs font-semibold active:scale-[0.98] transition-all"
                    style={{ backgroundColor: '#0984E3' }}
                  >
                    Dashboard <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => setConfiguringDevice(device)}
                    className="flex-1 flex items-center justify-center gap-1.5 py-2.5 border border-[#E4E7EC] rounded-xl text-[#6B7280] text-xs font-semibold active:bg-[#F3F4F6] transition-all"
                  >
                    <Settings2 className="w-3.5 h-3.5" /> Configure
                  </button>
                  {isAdvancedUser && (
                    <button
                      onClick={() => setConfirmingDelete(device.id)}
                      className="w-10 flex items-center justify-center border border-[#E4E7EC] rounded-xl text-red-400 active:bg-red-50 transition-all"
                      aria-label={`Remove ${device.name}`}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        ))}

        {/* Add Device placeholder card */}
        <button
          onClick={() => setShowAddModal(true)}
          className="bg-white rounded-2xl p-5 shadow-sm border-2 border-dashed border-[#E4E7EC] hover:border-[#0984E3] active:scale-[0.98] transition-all flex flex-col items-center justify-center min-h-[280px] group"
        >
          <div className="w-14 h-14 rounded-full flex items-center justify-center mb-3 transition-colors"
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
          <ConfigureSheet
            key="configure"
            device={configuringDevice}
            onClose={() => setConfiguringDevice(null)}
          />
        )}
        {showAddModal && (
          <AddDeviceModal
            key="add"
            onClose={() => setShowAddModal(false)}
          />
        )}
      </AnimatePresence>

    </div>
  );
}