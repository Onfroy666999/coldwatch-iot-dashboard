import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { useApp } from '../context/AppContext';
import type { DeviceConfig } from '../context/AppContext';
import { usePageLoading, SettingsSkeleton } from '../components/Skeleton';
import {
  Bell, Save, Thermometer, ChevronRight, ChevronLeft,
  Monitor, Cpu, Database, Lock, ChevronDown, ChevronUp,
  Sliders, Phone, Mail, Clock, Trash2, AlertTriangle, ShieldCheck,
} from 'lucide-react';

// Shared primitives 

function Toggle({ value, onChange, label }: { value: boolean; onChange: () => void; label: string }) {
  return (
    <button
      onClick={onChange}
      role="switch"
      aria-checked={value}
      aria-label={label}
      className={`w-14 h-8 rounded-full transition-colors duration-200 relative flex-shrink-0 active:scale-95 ${
        value ? 'bg-[#0984E3]' : 'bg-[#D1D5DB]'
      }`}
    >
      <div className={`w-6 h-6 bg-white rounded-full shadow-md absolute top-1 transition-transform duration-200 ${value ? 'translate-x-7' : 'translate-x-1'}`} />
    </button>
  );
}

const inputClass =
  'w-full px-4 py-3.5 border border-[#E4E7EC] rounded-2xl bg-[#F9FAFB] focus:bg-white focus:border-[#0984E3] focus:ring-2 focus:ring-[#0984E3]/20 outline-none transition-all text-sm text-[#111827]';

const saveBtnClass =
  'flex items-center gap-2 px-6 py-3.5 rounded-2xl text-white text-sm font-medium active:scale-[0.98] transition-all';

function ToggleRow({ label, description, value, onChange, border = true }: {
  label: string; description: string; value: boolean; onChange: () => void; border?: boolean;
}) {
  return (
    <div className={`flex items-center justify-between py-4 ${border ? 'border-b border-[#E4E7EC]' : ''}`}>
      <div className="pr-4">
        <p className="text-sm text-[#111827] font-medium">{label}</p>
        <p className="text-xs text-[#6B7280] mt-0.5">{description}</p>
      </div>
      <Toggle value={value} onChange={onChange} label={label} />
    </div>
  );
}

//  Sub-page shell

function SubPage({ title, icon, iconBg, iconColor, onBack, children }: {
  title: string;
  icon: React.ReactNode;
  iconBg: string;
  iconColor: string;
  onBack: () => void;
  children: React.ReactNode;
}) {
  return (
    <motion.div
      initial={{ x: 40, opacity: 0 }}
      animate={{ x: 0,  opacity: 1 }}
      exit={{    x: 40, opacity: 0 }}
      transition={{ duration: 0.22, ease: [0.25, 0.46, 0.45, 0.94] }}
      className="space-y-5 max-w-4xl"
    >
      <div className="flex items-center gap-3">
        <button
          onClick={onBack}
          className="w-10 h-10 rounded-xl flex items-center justify-center active:scale-95 transition-all flex-shrink-0"
          style={{ background: '#F3F4F6', border: '1px solid #E4E7EC' }}
        >
          <ChevronLeft className="w-5 h-5 text-[#111827]" />
        </button>
        <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ backgroundColor: iconBg }}>
          <span style={{ color: iconColor }}>{icon}</span>
        </div>
        <h2 className="text-[#111827] font-semibold text-base">{title}</h2>
      </div>
      {children}
    </motion.div>
  );
}

// DeviceConfigCard 

function DeviceConfigCard({ config, onUpdate, globalSettings }: {
  config: DeviceConfig;
  onUpdate: (c: Partial<DeviceConfig>) => void;
  globalSettings: { warningTemperature: number; criticalTemperature: number; warningHumidity: number; criticalHumidity: number };
}) {
  const [expanded, setExpanded] = useState(false);
  const [local, setLocal] = useState(config);
  useEffect(() => { setLocal(config); }, [config]);
  const isCustomised = local.tempOffset !== 0 || local.humidOffset !== 0 || local.useCustomThresholds;
  const statusColor = isCustomised ? '#D97706' : '#16A34A';

  return (
    <div className="rounded-2xl overflow-hidden" style={{ border: '1px solid #E4E7EC' }}>
      <button
        onClick={() => setExpanded(e => !e)}
        className="w-full flex items-center justify-between p-4 transition-colors active:bg-[#F9FAFB]"
        style={{ minHeight: 64 }}
      >
        <div className="flex items-center gap-3 text-left">
          <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0" style={{ backgroundColor: 'rgba(9,132,227,0.08)' }}>
            <Cpu className="w-4 h-4" style={{ color: '#0984E3' }} />
          </div>
          <div>
            <p className="text-sm font-semibold text-[#111827]">{local.name}</p>
            <p className="text-xs text-[#6B7280]">{local.location}</p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <span className="text-xs font-medium px-2.5 py-1 rounded-full" style={{ backgroundColor: `${statusColor}15`, color: statusColor }}>
            {isCustomised ? 'Customised' : 'Using defaults'}
          </span>
          {expanded ? <ChevronUp className="w-4 h-4 text-[#6B7280]" /> : <ChevronDown className="w-4 h-4 text-[#6B7280]" />}
        </div>
      </button>

      {expanded && (
        <div className="px-4 pb-5 space-y-5" style={{ borderTop: '1px solid #E4E7EC' }}>
          <div className="pt-4 grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-[#6B7280] mb-2">Device Name</label>
              <input value={local.name} onChange={e => setLocal({ ...local, name: e.target.value })} className={inputClass} />
            </div>
            <div>
              <label className="block text-xs font-medium text-[#6B7280] mb-2">Location</label>
              <input value={local.location} onChange={e => setLocal({ ...local, location: e.target.value })} className={inputClass} />
            </div>
          </div>

          <div>
            <div className="flex items-center gap-2 mb-2">
              <Sliders className="w-4 h-4 text-[#6B7280]" />
              <p className="text-sm font-medium text-[#111827]">Sensor Calibration Offsets</p>
            </div>
            <p className="text-xs text-[#6B7280] mb-3 leading-relaxed">
              Correct for sensor drift. A value of <span className="font-mono">-0.5</span> means the sensor reads 0.5° too high.
            </p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-[#6B7280] mb-2">Temp Offset (°C)</label>
                <input type="number" step="0.1" value={local.tempOffset} onChange={e => setLocal({ ...local, tempOffset: parseFloat(e.target.value) || 0 })} className={inputClass} placeholder="0.0" />
              </div>
              <div>
                <label className="block text-xs font-medium text-[#6B7280] mb-2">Humidity Offset (%)</label>
                <input type="number" step="0.5" value={local.humidOffset} onChange={e => setLocal({ ...local, humidOffset: parseFloat(e.target.value) || 0 })} className={inputClass} placeholder="0.0" />
              </div>
            </div>
          </div>

          <div className="pt-4" style={{ borderTop: '1px solid #E4E7EC' }}>
            <div className="flex items-center justify-between mb-3">
              <div>
                <p className="text-sm font-medium text-[#111827]">Custom Alert Thresholds</p>
                <p className="text-xs text-[#6B7280] mt-0.5">Override global thresholds for this device only</p>
              </div>
              <Toggle value={local.useCustomThresholds} onChange={() => setLocal({ ...local, useCustomThresholds: !local.useCustomThresholds })} label="Use custom thresholds" />
            </div>
            {local.useCustomThresholds ? (
              <div className="grid grid-cols-2 gap-3 mt-4">
                <div><label className="block text-xs font-medium text-[#6B7280] mb-2">Warning Temp (°C)</label><input type="number" value={local.warningTemperature} onChange={e => setLocal({ ...local, warningTemperature: parseFloat(e.target.value) || 0 })} className={inputClass} /></div>
                <div><label className="block text-xs font-medium text-[#6B7280] mb-2">Critical Temp (°C)</label><input type="number" value={local.criticalTemperature} onChange={e => setLocal({ ...local, criticalTemperature: parseFloat(e.target.value) || 0 })} className={inputClass} /></div>
                <div><label className="block text-xs font-medium text-[#6B7280] mb-2">Warning Humidity (%)</label><input type="number" value={local.warningHumidity} onChange={e => setLocal({ ...local, warningHumidity: parseFloat(e.target.value) || 0 })} className={inputClass} /></div>
                <div><label className="block text-xs font-medium text-[#6B7280] mb-2">Critical Humidity (%)</label><input type="number" value={local.criticalHumidity} onChange={e => setLocal({ ...local, criticalHumidity: parseFloat(e.target.value) || 0 })} className={inputClass} /></div>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-2 mt-2">
                {[
                  { label: 'Warn Temp',  value: `${globalSettings.warningTemperature}°C` },
                  { label: 'Crit Temp',  value: `${globalSettings.criticalTemperature}°C` },
                  { label: 'Warn Humid', value: `${globalSettings.warningHumidity}%` },
                  { label: 'Crit Humid', value: `${globalSettings.criticalHumidity}%` },
                ].map((item, i) => (
                  <div key={i} className="rounded-xl px-3 py-2" style={{ backgroundColor: '#F3F4F6' }}>
                    <p className="text-xs text-[#6B7280]">{item.label}</p>
                    <p className="text-sm font-medium text-[#111827]">{item.value}</p>
                  </div>
                ))}
              </div>
            )}
          </div>

          <button onClick={() => onUpdate(local)} className={`${saveBtnClass} w-full justify-center`} style={{ backgroundColor: '#0984E3' }}>
            <Save className="w-4 h-4" />Save Device Settings
          </button>
        </div>
      )}
    </div>
  );
}

// Sub-page content components 

type AppSettings = ReturnType<typeof useApp>['settings'];

function DisplaySub({ onBack, local, setLocal, save }: { onBack: () => void; local: AppSettings; setLocal: React.Dispatch<React.SetStateAction<AppSettings>>; save: (l: string, p: any) => void }) {
  return (
    <SubPage title="Display Preferences" icon={<Monitor className="w-5 h-5" />} iconBg="rgba(9,132,227,0.08)" iconColor="#0984E3" onBack={onBack}>
      <div className="rounded-2xl p-4 md:p-6 shadow-sm bg-white" style={{ border: '1px solid #E4E7EC' }}>
        <p className="text-sm font-medium text-[#111827] mb-1">Temperature Unit</p>
        <p className="text-xs text-[#6B7280] mb-4">All readings will display in your chosen unit</p>
        <div className="flex gap-2 mb-6">
          {(['C', 'F'] as const).map(unit => (
            <button key={unit} onClick={() => setLocal(p => ({ ...p, tempUnit: unit }))}
              className={`flex-1 py-3 rounded-2xl text-sm font-semibold transition-all active:scale-95 border-2 ${local.tempUnit === unit ? 'border-[#0984E3] bg-[#0984E3] text-white' : 'border-[#E4E7EC] bg-[#F3F4F6] text-[#6B7280]'}`}>
              °{unit} {unit === 'C' ? 'Celsius' : 'Fahrenheit'}
            </button>
          ))}
        </div>
        <button onClick={() => save('Display preferences saved', { tempUnit: local.tempUnit })} className={`${saveBtnClass} w-full justify-center`} style={{ backgroundColor: '#0984E3' }}>
          <Save className="w-4 h-4" />Save Preferences
        </button>
      </div>
    </SubPage>
  );
}

function NotificationsSub({ onBack, local, setLocal, save, showNotifEmail, notifEmail, setNotifEmail, notifEmailError, setNotifEmailError, updateUser, isAdvancedUser, updateSettings }: {
  onBack: () => void; local: AppSettings; setLocal: React.Dispatch<React.SetStateAction<AppSettings>>; save: (l: string, p: any) => void;
  showNotifEmail: boolean; notifEmail: string; setNotifEmail: (v: string) => void; notifEmailError: string; setNotifEmailError: (v: string) => void;
  updateUser: ReturnType<typeof useApp>['updateUser']; isAdvancedUser: boolean; updateSettings: ReturnType<typeof useApp>['updateSettings'];
}) {
  return (
    <SubPage title="Notifications" icon={<Bell className="w-5 h-5" />} iconBg="rgba(9,132,227,0.08)" iconColor="#0984E3" onBack={onBack}>
      <div className="rounded-2xl p-4 md:p-6 shadow-sm bg-white" style={{ border: '1px solid #E4E7EC' }}>
        <div className="space-y-1">
          <ToggleRow label="In-App Notifications" description="Show alert banners inside the dashboard" value={local.inAppNotifications} onChange={() => setLocal(p => ({ ...p, inAppNotifications: !p.inAppNotifications }))} />

          <div className="py-4 border-b border-[#E4E7EC]">
            <div className="flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2 mb-0.5"><Mail className="w-4 h-4 text-[#6B7280]" /><p className="text-sm font-medium text-[#111827]">Email Alerts</p></div>
                <p className="text-xs text-[#6B7280]">Receive alerts to your registered email</p>
              </div>
              <Toggle value={local.emailAlerts} onChange={() => setLocal(p => ({ ...p, emailAlerts: !p.emailAlerts }))} label="Email alerts" />
            </div>
          </div>

          <div className="py-4 border-b border-[#E4E7EC]">
            <div className="flex items-center justify-between mb-3">
              <div>
                <div className="flex items-center gap-2 mb-0.5"><Phone className="w-4 h-4 text-[#6B7280]" /><p className="text-sm font-medium text-[#111827]">SMS Alerts</p></div>
                <p className="text-xs text-[#6B7280]">Send critical alerts via SMS</p>
              </div>
              <Toggle value={local.smsAlerts} onChange={() => setLocal(p => ({ ...p, smsAlerts: !p.smsAlerts }))} label="SMS alerts" />
            </div>
            {local.smsAlerts && <input placeholder="+233 xx xxx xxxx" value={local.userPhone} onChange={e => setLocal(p => ({ ...p, userPhone: e.target.value }))} className={inputClass} />}
          </div>

          <div className={`py-4 ${isAdvancedUser ? 'border-b border-[#E4E7EC]' : ''}`}>
            <div className="flex items-center gap-2 mb-1"><AlertTriangle className="w-4 h-4 text-[#6B7280]" /><p className="text-sm font-medium text-[#111827]">Escalation Contact</p></div>
            <p className="text-xs text-[#6B7280] mb-3">Notified if an alert goes unacknowledged</p>
            <input placeholder="Supervisor name or phone number" value={local.escalationContact} onChange={e => setLocal(p => ({ ...p, escalationContact: e.target.value }))} className={inputClass} />
          </div>

          {isAdvancedUser && (
            <div className={`py-4 ${showNotifEmail ? 'border-b border-[#E4E7EC]' : ''}`}>
              <div className="flex items-center gap-2 mb-1"><Clock className="w-4 h-4 text-[#6B7280]" /><p className="text-sm font-medium text-[#111827]">Alert Repeat Interval</p></div>
              <p className="text-xs text-[#6B7280] mb-3">How often to re-send if unacknowledged</p>
              <div className="grid grid-cols-2 gap-2">
                {[{ value: '5min', label: 'Every 5 min' }, { value: '15min', label: 'Every 15 min' }, { value: '30min', label: 'Every 30 min' }, { value: 'once', label: 'Once only' }].map(opt => (
                  <button key={opt.value} onClick={() => setLocal(p => ({ ...p, alertRepeatInterval: opt.value }))}
                    className={`py-3 rounded-2xl text-sm font-medium transition-all active:scale-95 border-2 ${local.alertRepeatInterval === opt.value ? 'border-[#0984E3] bg-[#0984E3] text-white' : 'border-[#E4E7EC] bg-[#F3F4F6] text-[#6B7280]'}`}>
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {showNotifEmail && (
            <div className="py-4">
              <div className="flex items-center gap-2 mb-1"><Mail className="w-4 h-4 text-[#6B7280]" /><p className="text-sm font-medium text-[#111827]">Alert Email Address</p></div>
              <p className="text-xs text-[#6B7280] mb-3">Receive critical alerts by email. Can differ from your login email.</p>
              <input type="email" placeholder="alerts@yourfacility.com" value={notifEmail} onChange={e => { setNotifEmail(e.target.value); setNotifEmailError(''); }} className={inputClass} />
              {notifEmailError && <p className="text-xs text-red-500 mt-1">{notifEmailError}</p>}
            </div>
          )}
        </div>

        <div className="flex justify-end mt-4">
          <button
            onClick={() => {
              if (showNotifEmail && notifEmail.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(notifEmail.trim())) { setNotifEmailError('Please enter a valid email address.'); return; }
              const patch = { inAppNotifications: local.inAppNotifications, emailAlerts: local.emailAlerts, smsAlerts: local.smsAlerts, userPhone: local.userPhone, escalationContact: local.escalationContact, ...(isAdvancedUser && { alertRepeatInterval: local.alertRepeatInterval }) };
              save('Notification preferences saved', patch);
              if (showNotifEmail) updateUser({ notificationEmail: notifEmail.trim() || undefined });
            }}
            className={`${saveBtnClass} w-full justify-center`} style={{ backgroundColor: '#0984E3' }}>
            <Save className="w-4 h-4" />Save Notifications
          </button>
        </div>
      </div>
    </SubPage>
  );
}

function ThresholdsSub({ onBack, local, setLocal, save }: { onBack: () => void; local: AppSettings; setLocal: React.Dispatch<React.SetStateAction<AppSettings>>; save: (l: string, p: any) => void }) {
  return (
    <SubPage title="Alert Thresholds" icon={<Thermometer className="w-5 h-5" />} iconBg="rgba(217,119,6,0.08)" iconColor="#D97706" onBack={onBack}>
      <div className="rounded-2xl p-4 md:p-6 shadow-sm bg-white" style={{ border: '1px solid #E4E7EC' }}>
        <p className="text-xs text-[#6B7280] mb-4 leading-relaxed">Default limits applied to all devices unless overridden per device.</p>
        <div className="grid grid-cols-2 gap-3 mb-5">
          {[
            { key: 'warningTemperature',  label: 'Warning Temp (°C)',    hint: 'Triggers a yellow alert' },
            { key: 'criticalTemperature', label: 'Critical Temp (°C)',   hint: 'Triggers a red alert'    },
            { key: 'warningHumidity',     label: 'Warning Humidity (%)', hint: 'Triggers a yellow alert' },
            { key: 'criticalHumidity',    label: 'Critical Humidity (%)',hint: 'Triggers a red alert'    },
          ].map(field => (
            <div key={field.key}>
              <label className="block text-xs font-medium text-[#6B7280] mb-2">{field.label}</label>
              <input type="number" value={(local as any)[field.key]} onChange={e => setLocal(p => ({ ...p, [field.key]: parseFloat(e.target.value) || 0 }))} className={inputClass} />
              <p className="text-xs text-[#6B7280] mt-1">{field.hint}</p>
            </div>
          ))}
        </div>

        <div className="rounded-2xl p-4 mb-5" style={{ backgroundColor: '#F3F4F6' }}>
          <p className="text-xs font-medium text-[#6B7280] mb-3">Threshold Preview</p>
          <div className="flex-1 h-3 rounded-full overflow-hidden flex">
            <div className="h-full rounded-l-full" style={{ width: `${(local.warningTemperature / local.criticalTemperature) * 80}%`, backgroundColor: '#16A34A' }} />
            <div className="h-full" style={{ width: '15%', backgroundColor: '#D97706' }} />
            <div className="h-full rounded-r-full flex-1" style={{ backgroundColor: '#DC2626' }} />
          </div>
          <div className="flex justify-between text-xs text-[#6B7280] mt-1.5">
            <span>0°C</span>
            <span className="text-orange-500">{local.warningTemperature}°C warn</span>
            <span className="text-red-500">{local.criticalTemperature}°C crit</span>
          </div>
        </div>

        <button onClick={() => save('Alert thresholds updated', { warningTemperature: local.warningTemperature, criticalTemperature: local.criticalTemperature, warningHumidity: local.warningHumidity, criticalHumidity: local.criticalHumidity })}
          className={`${saveBtnClass} w-full justify-center`} style={{ backgroundColor: '#D97706' }}>
          <Save className="w-4 h-4" />Save Thresholds
        </button>
      </div>
    </SubPage>
  );
}

function DevicesSub({ onBack, deviceConfigs, updateDeviceConfig, addToast, settings }: {
  onBack: () => void;
  deviceConfigs: ReturnType<typeof useApp>['deviceConfigs'];
  updateDeviceConfig: ReturnType<typeof useApp>['updateDeviceConfig'];
  addToast: ReturnType<typeof useApp>['addToast'];
  settings: ReturnType<typeof useApp>['settings'];
}) {
  return (
    <SubPage title="Device Configuration" icon={<Cpu className="w-5 h-5" />} iconBg="rgba(22,163,74,0.08)" iconColor="#16A34A" onBack={onBack}>
      <div className="space-y-3">
        {deviceConfigs.map(config => (
          <DeviceConfigCard key={config.id} config={config}
            onUpdate={patch => { updateDeviceConfig(config.id, patch); addToast({ id: `toast-${Date.now()}`, type: 'success', message: `${config.name} settings saved` }); }}
            globalSettings={{ warningTemperature: settings.warningTemperature, criticalTemperature: settings.criticalTemperature, warningHumidity: settings.warningHumidity, criticalHumidity: settings.criticalHumidity }}
          />
        ))}
      </div>
    </SubPage>
  );
}

function DataSub({ onBack, local, setLocal, save }: { onBack: () => void; local: AppSettings; setLocal: React.Dispatch<React.SetStateAction<AppSettings>>; save: (l: string, p: any) => void }) {
  return (
    <SubPage title="Data & History" icon={<Database className="w-5 h-5" />} iconBg="rgba(22,163,74,0.08)" iconColor="#16A34A" onBack={onBack}>
      <div className="rounded-2xl p-4 md:p-6 shadow-sm bg-white space-y-6" style={{ border: '1px solid #E4E7EC' }}>
        <div>
          <p className="text-sm font-medium text-[#111827] mb-1">Sampling Interval</p>
          <p className="text-xs text-[#6B7280] mb-3">How often the ESP32 sends a reading. Faster = more detail, more battery use.</p>
          <div className="grid grid-cols-2 gap-2">
            {[{ value: '3s', label: 'Every 3s', hint: 'High detail' }, { value: '10s', label: 'Every 10s', hint: 'Balanced' }, { value: '30s', label: 'Every 30s', hint: 'Battery saver' }, { value: '1min', label: 'Every 1 min', hint: 'Low power' }].map(opt => (
              <button key={opt.value} onClick={() => setLocal(p => ({ ...p, samplingInterval: opt.value }))}
                className={`py-3 px-3 rounded-2xl text-left transition-all active:scale-95 border-2 ${local.samplingInterval === opt.value ? 'border-[#16A34A] bg-[#16A34A]/5' : 'border-[#E4E7EC] bg-[#F3F4F6]'}`}>
                <p className={`text-sm font-semibold ${local.samplingInterval === opt.value ? 'text-[#16A34A]' : 'text-[#111827]'}`}>{opt.label}</p>
                <p className="text-xs text-[#6B7280] mt-0.5">{opt.hint}</p>
              </button>
            ))}
          </div>
        </div>
        <div className="pt-2" style={{ borderTop: '1px solid #E4E7EC' }}>
          <p className="text-sm font-medium text-[#111827] mb-1 pt-4">Data Retention Period</p>
          <p className="text-xs text-[#6B7280] mb-3">Readings older than this are automatically deleted</p>
          <div className="grid grid-cols-3 gap-2">
            {[{ value: '7d', label: '7 Days' }, { value: '30d', label: '30 Days' }, { value: '90d', label: '90 Days' }].map(opt => (
              <button key={opt.value} onClick={() => setLocal(p => ({ ...p, dataRetention: opt.value }))}
                className={`py-3 rounded-2xl text-sm font-semibold transition-all active:scale-95 border-2 ${local.dataRetention === opt.value ? 'border-[#16A34A] bg-[#16A34A] text-white' : 'border-[#E4E7EC] bg-[#F3F4F6] text-[#6B7280]'}`}>
                {opt.label}
              </button>
            ))}
          </div>
        </div>
        <button onClick={() => save('Data settings saved', { samplingInterval: local.samplingInterval, dataRetention: local.dataRetention })}
          className={`${saveBtnClass} w-full justify-center`} style={{ backgroundColor: '#16A34A' }}>
          <Save className="w-4 h-4" />Save Data Settings
        </button>
      </div>
    </SubPage>
  );
}

function SecuritySub({ onBack, local, setLocal, save, user }: {
  onBack: () => void; local: AppSettings; setLocal: React.Dispatch<React.SetStateAction<AppSettings>>; save: (l: string, p: any) => void;
  user: ReturnType<typeof useApp>['user'];
}) {
  // FIX: farmers may have no email — fall back to name
  const sessionIdentifier = user.email || user.name;

  return (
    <SubPage title="Security" icon={<Lock className="w-5 h-5" />} iconBg="rgba(220,38,38,0.06)" iconColor="#DC2626" onBack={onBack}>
      <div className="rounded-2xl p-4 md:p-6 shadow-sm bg-white space-y-5" style={{ border: '1px solid #E4E7EC' }}>
        <div>
          <p className="text-sm font-medium text-[#111827] mb-1">Auto-Logout Timer</p>
          <p className="text-xs text-[#6B7280] mb-3">Sign out automatically after inactivity — important on shared warehouse devices</p>
          <div className="grid grid-cols-2 gap-2">
            {[{ value: 0, label: 'Never' }, { value: 15, label: '15 minutes' }, { value: 30, label: '30 minutes' }, { value: 60, label: '1 hour' }].map(opt => (
              <button key={opt.value} onClick={() => setLocal(p => ({ ...p, autoLogoutMinutes: opt.value }))}
                className={`py-3 rounded-2xl text-sm font-semibold transition-all active:scale-95 border-2 ${local.autoLogoutMinutes === opt.value ? 'border-[#111827] bg-[#111827] text-white' : 'border-[#E4E7EC] bg-[#F3F4F6] text-[#6B7280]'}`}>
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        <div className="rounded-2xl p-4" style={{ backgroundColor: '#F3F4F6' }}>
          <p className="text-xs font-medium text-[#6B7280] mb-3">Current Session</p>
          <div className="space-y-2.5">
            {[
              { label: 'Signed in as',    value: sessionIdentifier },
              { label: 'Session started', value: 'Today, ' + new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) },
              { label: 'Auto-logout',     value: local.autoLogoutMinutes === 0 ? 'Disabled' : `After ${local.autoLogoutMinutes} min of inactivity` },
            ].map((row, i) => (
              <div key={i} className="flex items-center justify-between">
                <p className="text-xs text-[#6B7280]">{row.label}</p>
                <p className="text-xs font-medium text-[#111827]">{row.value}</p>
              </div>
            ))}
          </div>
        </div>

        <button onClick={() => save('Security settings saved', { autoLogoutMinutes: local.autoLogoutMinutes })}
          className={`${saveBtnClass} w-full justify-center`} style={{ backgroundColor: '#111827' }}>
          <Save className="w-4 h-4" />Save Security Settings
        </button>
      </div>
    </SubPage>
  );
}

// Main Settings page 

type SubKey = 'display' | 'notifications' | 'thresholds' | 'devices' | 'data' | 'security';

export default function Settings() {
  const { settings, updateSettings, updateDeviceConfig, deviceConfigs, user, addToast, deleteAccount, isAdvancedUser, updateUser } = useApp();
  const [activeSub,         setActiveSub]         = useState<SubKey | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [local,             setLocal]             = useState(settings);
  const [notifEmail,        setNotifEmail]        = useState(user.notificationEmail || '');
  const [notifEmailError,   setNotifEmailError]   = useState('');
  // Resync if user.notificationEmail is updated externally (e.g. set during SetupSurvey
  // in the same session) — useState only captures the value at mount time.
  useEffect(() => { setNotifEmail(user.notificationEmail || ''); }, [user.notificationEmail]);
  const isLoading = usePageLoading();

  if (isLoading) return <SettingsSkeleton isAdvancedUser={isAdvancedUser} />;

  const isTransporter  = user.role === 'transporter';
  const showNotifEmail = isAdvancedUser || isTransporter;

  const save = (label: string, patch: Partial<typeof settings>) => {
    updateSettings(patch);
    setLocal(prev => ({ ...prev, ...patch }));
    addToast({ id: `toast-${Date.now()}`, type: 'success', message: label });
  };

  const menuRows: { key: SubKey; icon: React.ReactNode; iconBg: string; iconColor: string; label: string; subtitle: string; managerOnly?: boolean }[] = [
    { key: 'display',       icon: <Monitor className="w-5 h-5" />,     iconBg: 'rgba(9,132,227,0.08)',  iconColor: '#0984E3', label: 'Display Preferences',  subtitle: 'Temperature unit'                       },
    { key: 'notifications', icon: <Bell className="w-5 h-5" />,        iconBg: 'rgba(9,132,227,0.08)',  iconColor: '#0984E3', label: 'Notifications',         subtitle: 'Alerts, SMS, email, escalation'         },
    { key: 'thresholds',    icon: <Thermometer className="w-5 h-5" />, iconBg: 'rgba(217,119,6,0.08)',  iconColor: '#D97706', label: 'Alert Thresholds',      subtitle: 'Global warning and critical limits',    managerOnly: true },
    { key: 'devices',       icon: <Cpu className="w-5 h-5" />,         iconBg: 'rgba(22,163,74,0.08)',  iconColor: '#16A34A', label: 'Device Configuration',  subtitle: 'Calibration, names, per-device limits', managerOnly: true },
    { key: 'data',          icon: <Database className="w-5 h-5" />,    iconBg: 'rgba(22,163,74,0.08)',  iconColor: '#16A34A', label: 'Data & History',        subtitle: 'Sampling interval, retention period',   managerOnly: true },
    { key: 'security',      icon: <Lock className="w-5 h-5" />,        iconBg: 'rgba(220,38,38,0.06)',  iconColor: '#DC2626', label: 'Security',              subtitle: 'Auto-logout, session info'             },
  ];

  const visibleRows = menuRows.filter(r => !r.managerOnly || isAdvancedUser);
  const sharedProps = { local, setLocal, save };

  return (
    <AnimatePresence mode="wait">

      {/* ── Main menu ── */}
      {activeSub === null && (
        <motion.div key="main"
          initial={{ x: -24, opacity: 0 }} animate={{ x: 0, opacity: 1 }} exit={{ x: -24, opacity: 0 }}
          transition={{ duration: 0.2, ease: [0.25, 0.46, 0.45, 0.94] }}
          className="space-y-5 max-w-4xl"
        >
          {isAdvancedUser && (
            <div className="flex items-center gap-3 px-4 py-3 rounded-2xl" style={{ backgroundColor: 'rgba(9,132,227,0.06)', border: '1px solid rgba(9,132,227,0.15)' }}>
              <ShieldCheck className="w-4 h-4 flex-shrink-0" style={{ color: '#0984E3' }} />
              <p className="text-xs text-[#0984E3] font-medium">
                As a Warehouse Manager, you have full access to advanced configuration, device calibration, and global threshold controls.
              </p>
            </div>
          )}

          <div className="bg-white rounded-2xl shadow-sm overflow-hidden" style={{ border: '1px solid #E4E7EC' }}>
            {visibleRows.map((row, i) => (
              <button key={row.key} onClick={() => setActiveSub(row.key)}
                className={`w-full flex items-center gap-4 px-4 py-4 active:bg-[#F3F4F6] transition-colors text-left ${i < visibleRows.length - 1 ? 'border-b border-[#E4E7EC]' : ''}`}
                style={{ minHeight: 72 }}
              >
                <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ backgroundColor: row.iconBg }}>
                  <span style={{ color: row.iconColor }}>{row.icon}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-[#111827]">{row.label}</p>
                  <p className="text-xs text-[#6B7280] mt-0.5 truncate">{row.subtitle}</p>
                </div>
                <ChevronRight className="w-4 h-4 text-[#9CA3AF] flex-shrink-0" />
              </button>
            ))}
          </div>

          {/* Danger Zone — inline, no submenu */}
          <div className="rounded-2xl p-4 md:p-6 shadow-sm bg-white" style={{ border: '2px solid #FEE2E2' }}>
            <div className="flex items-center gap-3 mb-3">
              <Trash2 className="w-5 h-5 text-red-500" />
              <h3 className="text-red-600 font-semibold">Danger Zone</h3>
            </div>
            <p className="text-sm text-[#6B7280] mb-5 leading-relaxed">
              Deleting your account is permanent and irreversible. All devices, history, and settings will be removed.
            </p>
            {!showDeleteConfirm ? (
              <button onClick={() => setShowDeleteConfirm(true)} className="w-full md:w-auto px-6 py-3.5 border-2 border-red-200 rounded-2xl text-red-600 text-sm font-medium active:bg-red-50 transition-colors">
                Delete Account
              </button>
            ) : (
              <div className="space-y-3">
                <div className="flex items-start gap-3 p-3.5 rounded-xl bg-red-50 border border-red-200">
                  <AlertTriangle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
                  <p className="text-sm text-red-700 leading-relaxed">This will permanently delete your account, all device configurations, alert history, and settings. This cannot be undone.</p>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => setShowDeleteConfirm(false)} className="flex-1 py-3 rounded-xl text-sm font-medium text-[#6B7280] active:bg-[#F3F4F6] transition-colors" style={{ border: '1px solid #E4E7EC' }}>Cancel</button>
                  <button onClick={deleteAccount} className="flex-1 py-3 rounded-xl text-white text-sm font-semibold bg-red-600 active:bg-red-700 transition-colors">Delete Forever</button>
                </div>
              </div>
            )}
          </div>
          <div className="h-6" />
        </motion.div>
      )}

      {/* ── Sub-pages ── */}
      {activeSub === 'display'       && <DisplaySub       key="display"       onBack={() => setActiveSub(null)} {...sharedProps} />}
      {activeSub === 'notifications' && <NotificationsSub key="notifications" onBack={() => setActiveSub(null)} {...sharedProps} showNotifEmail={showNotifEmail} notifEmail={notifEmail} setNotifEmail={setNotifEmail} notifEmailError={notifEmailError} setNotifEmailError={setNotifEmailError} updateUser={updateUser} isAdvancedUser={isAdvancedUser} updateSettings={updateSettings} />}
      {activeSub === 'thresholds'    && <ThresholdsSub    key="thresholds"    onBack={() => setActiveSub(null)} {...sharedProps} />}
      {activeSub === 'devices'       && <DevicesSub       key="devices"       onBack={() => setActiveSub(null)} deviceConfigs={deviceConfigs} updateDeviceConfig={updateDeviceConfig} addToast={addToast} settings={settings} />}
      {activeSub === 'data'          && <DataSub          key="data"          onBack={() => setActiveSub(null)} {...sharedProps} />}
      {activeSub === 'security'      && <SecuritySub      key="security"      onBack={() => setActiveSub(null)} {...sharedProps} user={user} />}

    </AnimatePresence>
  );
}