import { useState } from 'react';
import { useTheme } from 'next-themes';
import { useApp } from '../context/AppContext';
import type { DeviceConfig } from '../context/AppContext';
import {
  Bell, Save, Shield, Thermometer, LogOut,
  Monitor, Cpu, Database, Lock, ChevronDown, ChevronUp,
  Sliders, Phone, Mail, Clock, Trash2, AlertTriangle,
  Sun, Moon, Laptop,
} from 'lucide-react';

// ── Shared primitives ─────────────────────────────────────────────────────────

function Toggle({ value, onChange, label }: { value: boolean; onChange: () => void; label: string }) {
  return (
    <button
      onClick={onChange}
      role="switch"
      aria-checked={value}
      aria-label={label}
      className={`w-14 h-8 rounded-full transition-colors duration-200 relative flex-shrink-0 active:scale-95 ${
        value ? 'bg-[#2979C8]' : 'bg-gray-200 dark:bg-gray-600'
      }`}
    >
      <div className={`w-6 h-6 bg-white rounded-full shadow-md absolute top-1 transition-transform duration-200 ${value ? 'translate-x-7' : 'translate-x-1'}`} />
    </button>
  );
}

const inputClass =
  'w-full px-4 py-3.5 border border-border rounded-2xl bg-muted focus:bg-background focus:border-[#2979C8] focus:ring-2 focus:ring-[#2979C8]/20 outline-none transition-all text-sm text-foreground';

const saveBtnClass =
  'flex items-center gap-2 px-6 py-3.5 rounded-2xl text-white text-sm font-medium active:scale-[0.98] transition-all';

function Section({ icon, iconBg, iconColor, title, subtitle, children }: {
  icon: React.ReactNode; iconBg: string; iconColor: string; title: string; subtitle: string; children: React.ReactNode;
}) {
  return (
    <div className="bg-card rounded-2xl p-4 md:p-6 shadow-sm border border-border">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0" style={{ backgroundColor: iconBg }}>
          <span style={{ color: iconColor }}>{icon}</span>
        </div>
        <div>
          <h3 className="text-card-foreground font-semibold text-sm md:text-base">{title}</h3>
          <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>
        </div>
      </div>
      {children}
    </div>
  );
}

function ToggleRow({ label, description, value, onChange, border = true }: {
  label: string; description: string; value: boolean; onChange: () => void; border?: boolean;
}) {
  return (
    <div className={`flex items-center justify-between py-4 ${border ? 'border-b border-border' : ''}`}>
      <div className="pr-4">
        <p className="text-sm text-foreground font-medium">{label}</p>
        <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
      </div>
      <Toggle value={value} onChange={onChange} label={label} />
    </div>
  );
}

function DeviceConfigCard({ config, onUpdate, globalSettings }: {
  config: DeviceConfig;
  onUpdate: (c: Partial<DeviceConfig>) => void;
  globalSettings: { warningTemperature: number; criticalTemperature: number; warningHumidity: number; criticalHumidity: number };
}) {
  const [expanded, setExpanded] = useState(false);
  const [local, setLocal] = useState(config);
  const isCustomised = local.tempOffset !== 0 || local.humidOffset !== 0 || local.useCustomThresholds;
  const statusColor = isCustomised ? '#E67E22' : '#27AE60';

  return (
    <div className="border border-border rounded-2xl overflow-hidden">
      <button onClick={() => setExpanded(e => !e)} className="w-full flex items-center justify-between p-4 active:bg-accent transition-colors" style={{ minHeight: 64 }}>
        <div className="flex items-center gap-3 text-left">
          <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0" style={{ backgroundColor: 'rgba(41,121,200,0.1)' }}>
            <Cpu className="w-4 h-4" style={{ color: '#2979C8' }} />
          </div>
          <div>
            <p className="text-sm font-semibold text-foreground">{local.name}</p>
            <p className="text-xs text-muted-foreground">{local.location}</p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <span className="text-xs font-medium px-2.5 py-1 rounded-full" style={{ backgroundColor: `${statusColor}15`, color: statusColor }}>
            {isCustomised ? 'Customised' : 'Using defaults'}
          </span>
          {expanded ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
        </div>
      </button>

      {expanded && (
        <div className="px-4 pb-5 border-t border-border space-y-5">
          <div className="pt-4 grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-2">Device Name</label>
              <input value={local.name} onChange={e => setLocal({ ...local, name: e.target.value })} className={inputClass} />
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-2">Location</label>
              <input value={local.location} onChange={e => setLocal({ ...local, location: e.target.value })} className={inputClass} />
            </div>
          </div>

          <div>
            <div className="flex items-center gap-2 mb-2">
              <Sliders className="w-4 h-4 text-muted-foreground" />
              <p className="text-sm font-medium text-foreground">Sensor Calibration Offsets</p>
            </div>
            <p className="text-xs text-muted-foreground mb-3 leading-relaxed">
              Correct for sensor drift. A value of <span className="font-mono">-0.5</span> means the sensor reads 0.5° too high — ColdWatch will subtract 0.5 from all readings for this device.
            </p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-2">Temp Offset (°C)</label>
                <input type="number" step="0.1" value={local.tempOffset} onChange={e => setLocal({ ...local, tempOffset: parseFloat(e.target.value) || 0 })} className={inputClass} placeholder="0.0" />
              </div>
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-2">Humidity Offset (%)</label>
                <input type="number" step="0.5" value={local.humidOffset} onChange={e => setLocal({ ...local, humidOffset: parseFloat(e.target.value) || 0 })} className={inputClass} placeholder="0.0" />
              </div>
            </div>
          </div>

          <div className="border-t border-border pt-4">
            <div className="flex items-center justify-between mb-3">
              <div>
                <p className="text-sm font-medium text-foreground">Custom Alert Thresholds</p>
                <p className="text-xs text-muted-foreground mt-0.5">Override global thresholds for this device only</p>
              </div>
              <Toggle value={local.useCustomThresholds} onChange={() => setLocal({ ...local, useCustomThresholds: !local.useCustomThresholds })} label="Use custom thresholds" />
            </div>

            {local.useCustomThresholds ? (
              <div className="grid grid-cols-2 gap-3 mt-4">
                <div><label className="block text-xs font-medium text-muted-foreground mb-2">Warning Temp (°C)</label><input type="number" value={local.warningTemperature} onChange={e => setLocal({ ...local, warningTemperature: parseFloat(e.target.value) || 0 })} className={inputClass} /></div>
                <div><label className="block text-xs font-medium text-muted-foreground mb-2">Critical Temp (°C)</label><input type="number" value={local.criticalTemperature} onChange={e => setLocal({ ...local, criticalTemperature: parseFloat(e.target.value) || 0 })} className={inputClass} /></div>
                <div><label className="block text-xs font-medium text-muted-foreground mb-2">Warning Humidity (%)</label><input type="number" value={local.warningHumidity} onChange={e => setLocal({ ...local, warningHumidity: parseFloat(e.target.value) || 0 })} className={inputClass} /></div>
                <div><label className="block text-xs font-medium text-muted-foreground mb-2">Critical Humidity (%)</label><input type="number" value={local.criticalHumidity} onChange={e => setLocal({ ...local, criticalHumidity: parseFloat(e.target.value) || 0 })} className={inputClass} /></div>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-2 mt-2">
                {[{ label: 'Warn Temp', value: `${globalSettings.warningTemperature}°C` }, { label: 'Crit Temp', value: `${globalSettings.criticalTemperature}°C` }, { label: 'Warn Humid', value: `${globalSettings.warningHumidity}%` }, { label: 'Crit Humid', value: `${globalSettings.criticalHumidity}%` }].map((item, i) => (
                  <div key={i} className="bg-muted rounded-xl px-3 py-2">
                    <p className="text-xs text-muted-foreground">{item.label}</p>
                    <p className="text-sm font-medium text-foreground">{item.value}</p>
                  </div>
                ))}
              </div>
            )}
          </div>

          <button onClick={() => onUpdate(local)} className={`${saveBtnClass} w-full justify-center`} style={{ backgroundColor: '#2979C8' }}>
            <Save className="w-4 h-4" />
            Save Device Settings
          </button>
        </div>
      )}
    </div>
  );
}

// ── Main Settings page ────────────────────────────────────────────────────────

export default function Settings() {
  const { settings, updateSettings, updateDeviceConfig, deviceConfigs, user, addToast, logout } = useApp();
  const { theme, setTheme } = useTheme();
  const [localSettings, setLocalSettings] = useState(settings);
  const [userName, setUserName] = useState(user.name);
  const [userEmail, setUserEmail] = useState(user.email);

  const save = (label: string, patch: Partial<typeof settings>) => {
    updateSettings(patch);
    setLocalSettings(prev => ({ ...prev, ...patch }));
    addToast({ id: `toast-${Date.now()}`, type: 'success', message: label });
  };

  const themeOptions = [
    { value: 'light', label: 'Light', icon: <Sun className="w-5 h-5" /> },
    { value: 'dark',  label: 'Dark',  icon: <Moon className="w-5 h-5" /> },
    { value: 'system',label: 'System',icon: <Laptop className="w-5 h-5" /> },
  ];

  return (
    <div className="space-y-5 max-w-4xl">

      {/* ── 1. Profile ── */}
      <div className="bg-card rounded-2xl p-4 md:p-6 shadow-sm border border-border">
        <div className="flex items-center justify-between gap-3 mb-6">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-14 h-14 rounded-full flex items-center justify-center text-white font-bold text-lg flex-shrink-0" style={{ backgroundColor: '#2979C8' }}>
              {user.avatar}
            </div>
            <div className="min-w-0">
              <p className="text-foreground font-semibold truncate">{user.name}</p>
              <p className="text-muted-foreground text-xs truncate">{user.email}</p>
              <span className="text-xs font-medium" style={{ color: '#27AE60' }}>● Administrator</span>
            </div>
          </div>
          <button onClick={logout} className="flex items-center gap-2 px-4 py-3 rounded-2xl border-2 border-red-100 dark:border-red-900 text-red-500 active:bg-red-50 transition-colors text-sm font-medium flex-shrink-0">
            <LogOut className="w-4 h-4" />
            <span className="hidden sm:inline">Logout</span>
          </button>
        </div>

        <div className="space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-2">Full Name</label>
              <input value={userName} onChange={e => setUserName(e.target.value)} className={inputClass} />
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-2">Email Address</label>
              <input type="email" value={userEmail} onChange={e => setUserEmail(e.target.value)} className={inputClass} />
            </div>
          </div>
          <div className="pt-3 border-t border-border">
            <p className="text-xs font-medium text-muted-foreground mb-3">Change Password</p>
            <div className="space-y-3">
              <input type="password" placeholder="Current password" className={inputClass} />
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <input type="password" placeholder="New password" className={inputClass} />
                <input type="password" placeholder="Confirm new password" className={inputClass} />
              </div>
            </div>
          </div>
        </div>

        <div className="flex justify-end mt-5">
          <button onClick={() => addToast({ id: `toast-${Date.now()}`, type: 'success', message: 'Account updated' })} className={saveBtnClass} style={{ backgroundColor: '#27AE60' }}>
            <Save className="w-4 h-4" />
            Update Profile
          </button>
        </div>
      </div>

      {/* ── 2. Display Preferences ── */}
      <Section icon={<Monitor className="w-5 h-5" />} iconBg="rgba(41,121,200,0.1)" iconColor="#2979C8" title="Display Preferences" subtitle="Customise how the app looks and feels">

        {/* Dark / Light / System theme selector */}
        <div className="pb-5 border-b border-border">
          <p className="text-sm font-medium text-foreground mb-1">Appearance</p>
          <p className="text-xs text-muted-foreground mb-4">Choose light, dark, or follow your device setting automatically</p>
          <div className="grid grid-cols-3 gap-2">
            {themeOptions.map(opt => (
              <button
                key={opt.value}
                onClick={() => setTheme(opt.value)}
                className={`flex flex-col items-center gap-2.5 py-4 rounded-2xl border-2 transition-all active:scale-95 ${
                  theme === opt.value
                    ? 'border-[#2979C8] bg-[#2979C8]/8 text-[#2979C8]'
                    : 'border-border bg-muted text-muted-foreground'
                }`}
              >
                {opt.icon}
                <span className="text-xs font-semibold">{opt.label}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-1 mt-1">
          <ToggleRow
            label="Compact Mode"
            description="Smaller font and reduced padding — ideal for small warehouse screens"
            value={localSettings.compactMode}
            onChange={() => setLocalSettings(p => ({ ...p, compactMode: !p.compactMode }))}
          />

          <div className="py-4">
            <p className="text-sm font-medium text-foreground mb-1">Temperature Unit</p>
            <p className="text-xs text-muted-foreground mb-3">All readings will display in your chosen unit</p>
            <div className="flex gap-2">
              {(['C', 'F'] as const).map(unit => (
                <button
                  key={unit}
                  onClick={() => setLocalSettings(p => ({ ...p, tempUnit: unit }))}
                  className={`flex-1 py-3 rounded-2xl text-sm font-semibold transition-all active:scale-95 border-2 ${
                    localSettings.tempUnit === unit
                      ? 'border-[#2979C8] bg-[#2979C8] text-white'
                      : 'border-border bg-muted text-muted-foreground'
                  }`}
                >
                  °{unit} {unit === 'C' ? 'Celsius' : 'Fahrenheit'}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="flex justify-end mt-2">
          <button onClick={() => save('Display preferences saved', { compactMode: localSettings.compactMode, tempUnit: localSettings.tempUnit })} className={saveBtnClass} style={{ backgroundColor: '#2979C8' }}>
            <Save className="w-4 h-4" />
            Save Preferences
          </button>
        </div>
      </Section>

      {/* ── 3. Global Alert Thresholds ── */}
      <Section icon={<Thermometer className="w-5 h-5" />} iconBg="rgba(230,126,34,0.1)" iconColor="#E67E22" title="Global Alert Thresholds" subtitle="Default limits applied to all devices unless overridden per device">
        <div className="grid grid-cols-2 gap-3 mb-5">
          {[
            { key: 'warningTemperature', label: 'Warning Temp (°C)', hint: 'Triggers a yellow alert' },
            { key: 'criticalTemperature', label: 'Critical Temp (°C)', hint: 'Triggers a red alert' },
            { key: 'warningHumidity', label: 'Warning Humidity (%)', hint: 'Triggers a yellow alert' },
            { key: 'criticalHumidity', label: 'Critical Humidity (%)', hint: 'Triggers a red alert' },
          ].map(field => (
            <div key={field.key}>
              <label className="block text-xs font-medium text-muted-foreground mb-2">{field.label}</label>
              <input type="number" value={(localSettings as any)[field.key]} onChange={e => setLocalSettings(p => ({ ...p, [field.key]: parseFloat(e.target.value) || 0 }))} className={inputClass} />
              <p className="text-xs text-muted-foreground mt-1">{field.hint}</p>
            </div>
          ))}
        </div>

        {/* Visual threshold bar */}
        <div className="bg-muted rounded-2xl p-4 mb-5">
          <p className="text-xs font-medium text-muted-foreground mb-3">Threshold Preview</p>
          <div className="flex-1 h-3 rounded-full overflow-hidden flex">
            <div className="h-full rounded-l-full" style={{ width: `${(localSettings.warningTemperature / localSettings.criticalTemperature) * 80}%`, backgroundColor: '#27AE60' }} />
            <div className="h-full" style={{ width: '15%', backgroundColor: '#E67E22' }} />
            <div className="h-full rounded-r-full flex-1" style={{ backgroundColor: '#C0392B' }} />
          </div>
          <div className="flex justify-between text-xs text-muted-foreground mt-1.5">
            <span>0°C</span>
            <span className="text-orange-500">{localSettings.warningTemperature}°C warn</span>
            <span className="text-red-500">{localSettings.criticalTemperature}°C crit</span>
          </div>
        </div>

        <button onClick={() => save('Alert thresholds updated', { warningTemperature: localSettings.warningTemperature, criticalTemperature: localSettings.criticalTemperature, warningHumidity: localSettings.warningHumidity, criticalHumidity: localSettings.criticalHumidity })} className={saveBtnClass} style={{ backgroundColor: '#E67E22' }}>
          <Save className="w-4 h-4" />
          Save Thresholds
        </button>
      </Section>

      {/* ── 4. Device Configuration ── */}
      <Section icon={<Cpu className="w-5 h-5" />} iconBg="rgba(22,160,133,0.1)" iconColor="#16A085" title="Device Configuration" subtitle="Rename devices, calibrate sensors, and set per-device thresholds">
        <div className="space-y-3">
          {deviceConfigs.map(config => (
            <DeviceConfigCard
              key={config.id}
              config={config}
              onUpdate={(patch) => {
                updateDeviceConfig(config.id, patch);
                addToast({ id: `toast-${Date.now()}`, type: 'success', message: `${config.name} settings saved` });
              }}
              globalSettings={{ warningTemperature: settings.warningTemperature, criticalTemperature: settings.criticalTemperature, warningHumidity: settings.warningHumidity, criticalHumidity: settings.criticalHumidity }}
            />
          ))}
        </div>
      </Section>

      {/* ── 5. Notifications ── */}
      <Section icon={<Bell className="w-5 h-5" />} iconBg="rgba(41,121,200,0.1)" iconColor="#2979C8" title="Notifications" subtitle="Control how and when ColdWatch alerts you">
        <div className="space-y-1">
          <ToggleRow label="In-App Notifications" description="Show alert banners inside the dashboard" value={localSettings.inAppNotifications} onChange={() => setLocalSettings(p => ({ ...p, inAppNotifications: !p.inAppNotifications }))} />

          <div className="py-4 border-b border-border">
            <div className="flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2 mb-0.5"><Mail className="w-4 h-4 text-muted-foreground" /><p className="text-sm font-medium text-foreground">Email Alerts</p></div>
                <p className="text-xs text-muted-foreground">Receive alerts to your registered email</p>
              </div>
              <Toggle value={localSettings.emailAlerts} onChange={() => setLocalSettings(p => ({ ...p, emailAlerts: !p.emailAlerts }))} label="Email alerts" />
            </div>
          </div>

          <div className="py-4 border-b border-border">
            <div className="flex items-center justify-between mb-3">
              <div>
                <div className="flex items-center gap-2 mb-0.5"><Phone className="w-4 h-4 text-muted-foreground" /><p className="text-sm font-medium text-foreground">SMS Alerts</p></div>
                <p className="text-xs text-muted-foreground">Send critical alerts via SMS</p>
              </div>
              <Toggle value={localSettings.smsAlerts} onChange={() => setLocalSettings(p => ({ ...p, smsAlerts: !p.smsAlerts }))} label="SMS alerts" />
            </div>
            {localSettings.smsAlerts && <input placeholder="+233 xx xxx xxxx" value={localSettings.userPhone} onChange={e => setLocalSettings(p => ({ ...p, userPhone: e.target.value }))} className={inputClass} />}
          </div>

          <div className="py-4 border-b border-border">
            <div className="flex items-center gap-2 mb-1"><AlertTriangle className="w-4 h-4 text-muted-foreground" /><p className="text-sm font-medium text-foreground">Escalation Contact</p></div>
            <p className="text-xs text-muted-foreground mb-3">Notified if an alert goes unacknowledged after the repeat interval</p>
            <input placeholder="Supervisor name or phone number" value={localSettings.escalationContact} onChange={e => setLocalSettings(p => ({ ...p, escalationContact: e.target.value }))} className={inputClass} />
          </div>

          <div className="py-4">
            <div className="flex items-center gap-2 mb-1"><Clock className="w-4 h-4 text-muted-foreground" /><p className="text-sm font-medium text-foreground">Alert Repeat Interval</p></div>
            <p className="text-xs text-muted-foreground mb-3">How often to re-send if unacknowledged</p>
            <div className="grid grid-cols-2 gap-2">
              {[{ value: '5min', label: 'Every 5 min' }, { value: '15min', label: 'Every 15 min' }, { value: '30min', label: 'Every 30 min' }, { value: 'once', label: 'Once only' }].map(opt => (
                <button key={opt.value} onClick={() => setLocalSettings(p => ({ ...p, alertRepeatInterval: opt.value }))}
                  className={`py-3 rounded-2xl text-sm font-medium transition-all active:scale-95 border-2 ${localSettings.alertRepeatInterval === opt.value ? 'border-[#2979C8] bg-[#2979C8] text-white' : 'border-border bg-muted text-muted-foreground'}`}>
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="flex justify-end mt-2">
          <button onClick={() => save('Notification preferences saved', { inAppNotifications: localSettings.inAppNotifications, emailAlerts: localSettings.emailAlerts, smsAlerts: localSettings.smsAlerts, userPhone: localSettings.userPhone, escalationContact: localSettings.escalationContact, alertRepeatInterval: localSettings.alertRepeatInterval })} className={saveBtnClass} style={{ backgroundColor: '#2979C8' }}>
            <Save className="w-4 h-4" />
            Save Notifications
          </button>
        </div>
      </Section>

      {/* ── 6. Data & History ── */}
      <Section icon={<Database className="w-5 h-5" />} iconBg="rgba(39,174,96,0.1)" iconColor="#27AE60" title="Data & History" subtitle="Control data collection frequency and retention period">
        <div className="space-y-5">
          <div>
            <p className="text-sm font-medium text-foreground mb-1">Sampling Interval</p>
            <p className="text-xs text-muted-foreground mb-3">How often the ESP32 sends a reading. Faster = more detail, more battery use.</p>
            <div className="grid grid-cols-2 gap-2">
              {[{ value: '3s', label: 'Every 3s', hint: 'High detail' }, { value: '10s', label: 'Every 10s', hint: 'Balanced' }, { value: '30s', label: 'Every 30s', hint: 'Battery saver' }, { value: '1min', label: 'Every 1 min', hint: 'Low power' }].map(opt => (
                <button key={opt.value} onClick={() => setLocalSettings(p => ({ ...p, samplingInterval: opt.value }))}
                  className={`py-3 px-3 rounded-2xl text-left transition-all active:scale-95 border-2 ${localSettings.samplingInterval === opt.value ? 'border-[#27AE60] bg-[#27AE60]/5' : 'border-border bg-muted'}`}>
                  <p className={`text-sm font-semibold ${localSettings.samplingInterval === opt.value ? 'text-[#27AE60]' : 'text-foreground'}`}>{opt.label}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{opt.hint}</p>
                </button>
              ))}
            </div>
          </div>

          <div className="border-t border-border pt-5">
            <p className="text-sm font-medium text-foreground mb-1">Data Retention Period</p>
            <p className="text-xs text-muted-foreground mb-3">Readings older than this are automatically deleted</p>
            <div className="grid grid-cols-3 gap-2">
              {[{ value: '7d', label: '7 Days' }, { value: '30d', label: '30 Days' }, { value: '90d', label: '90 Days' }].map(opt => (
                <button key={opt.value} onClick={() => setLocalSettings(p => ({ ...p, dataRetention: opt.value }))}
                  className={`py-3 rounded-2xl text-sm font-semibold transition-all active:scale-95 border-2 ${localSettings.dataRetention === opt.value ? 'border-[#27AE60] bg-[#27AE60] text-white' : 'border-border bg-muted text-muted-foreground'}`}>
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="flex justify-end mt-5">
          <button onClick={() => save('Data settings saved', { samplingInterval: localSettings.samplingInterval, dataRetention: localSettings.dataRetention })} className={saveBtnClass} style={{ backgroundColor: '#27AE60' }}>
            <Save className="w-4 h-4" />
            Save Data Settings
          </button>
        </div>
      </Section>

      {/* ── 7. Security ── */}
      <Section icon={<Lock className="w-5 h-5" />} iconBg="rgba(192,57,43,0.08)" iconColor="#C0392B" title="Security" subtitle="Session and access control settings">
        <div className="space-y-4">
          <div>
            <p className="text-sm font-medium text-foreground mb-1">Auto-Logout Timer</p>
            <p className="text-xs text-muted-foreground mb-3">Sign out automatically after inactivity — important on shared warehouse devices</p>
            <div className="grid grid-cols-2 gap-2">
              {[{ value: 0, label: 'Never' }, { value: 15, label: '15 minutes' }, { value: 30, label: '30 minutes' }, { value: 60, label: '1 hour' }].map(opt => (
                <button key={opt.value} onClick={() => setLocalSettings(p => ({ ...p, autoLogoutMinutes: opt.value }))}
                  className={`py-3 rounded-2xl text-sm font-semibold transition-all active:scale-95 border-2 ${localSettings.autoLogoutMinutes === opt.value ? 'border-[#1F3864] bg-[#1F3864] text-white' : 'border-border bg-muted text-muted-foreground'}`}>
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          <div className="bg-muted rounded-2xl p-4">
            <p className="text-xs font-medium text-muted-foreground mb-3">Current Session</p>
            <div className="space-y-2.5">
              {[
                { label: 'Signed in as', value: user.email },
                { label: 'Session started', value: 'Today, ' + new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) },
                { label: 'Auto-logout', value: localSettings.autoLogoutMinutes === 0 ? 'Disabled' : `After ${localSettings.autoLogoutMinutes} min of inactivity` },
              ].map((row, i) => (
                <div key={i} className="flex items-center justify-between">
                  <p className="text-xs text-muted-foreground">{row.label}</p>
                  <p className="text-xs font-medium text-foreground">{row.value}</p>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="flex justify-end mt-5">
          <button onClick={() => save('Security settings saved', { autoLogoutMinutes: localSettings.autoLogoutMinutes })} className={saveBtnClass} style={{ backgroundColor: '#1F3864' }}>
            <Save className="w-4 h-4" />
            Save Security Settings
          </button>
        </div>
      </Section>

      {/* ── 8. Danger Zone ── */}
      <div className="bg-card rounded-2xl p-4 md:p-6 shadow-sm border-2 border-red-100 dark:border-red-900/40">
        <div className="flex items-center gap-3 mb-3">
          <Trash2 className="w-5 h-5 text-red-500" />
          <h3 className="text-red-600 font-semibold">Danger Zone</h3>
        </div>
        <p className="text-sm text-muted-foreground mb-5 leading-relaxed">
          Deleting your account is permanent and irreversible. All devices, history, and settings will be removed.
        </p>
        <button className="w-full md:w-auto px-6 py-3.5 border-2 border-red-200 dark:border-red-900 rounded-2xl text-red-600 text-sm font-medium active:bg-red-50 transition-colors">
          Delete Account
        </button>
      </div>

      <div className="h-6" />
    </div>
  );
}