import { useState, useEffect, useRef } from 'react';
import { Thermometer, Droplets, Activity, AlertTriangle, TrendingUp, TrendingDown, Snowflake, ChevronRight, MapPin, Wifi, WifiOff } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts';
import ControlPanel from '../components/ControlPanel';
import ProduceModeSelector from '../components/ProduceModeSelector';
import { usePageLoading, DashboardSkeleton } from '../components/Skeleton';

const ROLE_PREFIX: Record<string, string> = {
  farmer:            'Farmer',
  warehouse_manager: 'Manager',
  transporter:       'Transporter',
};

// Module-level constants — no recreation on every render
const TIME_RANGE_BUTTONS = (['1h', '6h', '24h'] as const);

const SEVERITY_STYLES: Record<string, { bar: string; badge: string; label: string }> = {
  critical: { bar: '#C0392B', badge: 'bg-red-500/10 text-red-500',      label: 'Critical' },
  warning:  { bar: '#E67E22', badge: 'bg-orange-500/10 text-orange-500', label: 'Warning'  },
  info:     { bar: '#0984E3', badge: 'bg-blue-500/10 text-blue-500',     label: 'Info'     },
};

export default function Dashboard() {
  const isLoading = usePageLoading();
  const { currentTemperature, currentHumidity, systemStatus, alerts, sensorHistory, settings, user, setActivePage, devices, selectedDeviceId, setSelectedDeviceId } = useApp();
  const [timeRange, setTimeRange] = useState<'1h' | '6h' | '24h'>('1h');

  // Live "last updated" pulse 
  const [secondsAgo, setSecondsAgo] = useState(0);
  const lastTickRef = useRef(Date.now());

  useEffect(() => {
    lastTickRef.current = Date.now();
    setSecondsAgo(0);
  }, [currentTemperature]);

  useEffect(() => {
    const id = setInterval(() => {
      setSecondsAgo(Math.floor((Date.now() - lastTickRef.current) / 1000));
    }, 1000);
    return () => clearInterval(id);
  }, []);

  // Derive hour directly — changes at most once per session, no state needed
  const hour = new Date().getHours();

  // ── Trend — compare last two readings (direction is unit-agnostic)
  const tempTrend = sensorHistory.length >= 2
    ? (sensorHistory[sensorHistory.length - 1].temperature >= sensorHistory[sensorHistory.length - 2].temperature ? 'up' : 'down')
    : 'up';
  const humidTrend = sensorHistory.length >= 2
    ? (sensorHistory[sensorHistory.length - 1].humidity >= sensorHistory[sensorHistory.length - 2].humidity ? 'up' : 'down')
    : 'up';

  if (isLoading) return <DashboardSkeleton />;

  // Empty state — all devices deleted
  if (devices.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center px-6">
        <div className="w-20 h-20 rounded-full flex items-center justify-center mb-5" style={{ backgroundColor: 'rgba(9,132,227,0.08)' }}>
          <Snowflake className="w-10 h-10" style={{ color: '#0984E3' }} />
        </div>
        <h2 className="text-xl font-semibold text-[#111827] mb-2">No Devices Connected</h2>
        <p className="text-sm text-[#6B7280] mb-6 max-w-xs leading-relaxed">
          Add an ESP32 monitoring module to start tracking your cold storage units.
        </p>
        <button
          onClick={() => setActivePage('devices')}
          className="flex items-center gap-2 px-6 py-3.5 rounded-2xl text-white text-sm font-semibold active:scale-[0.98] transition-all"
          style={{ backgroundColor: '#0984E3' }}
        >
          Go to Devices
        </button>
      </div>
    );
  }

  // Unit conversion helpers
  const isFahrenheit = settings.tempUnit === 'F';
  const toDisplay = (c: number) => isFahrenheit ? parseFloat((c * 9 / 5 + 32).toFixed(1)) : parseFloat(c.toFixed(1));
  const unitLabel = isFahrenheit ? '°F' : '°C';
  const dispTemp = toDisplay(currentTemperature);

  const selectedDevice = devices.find(d => d.id === selectedDeviceId);

  const rolePrefix = user.role ? (ROLE_PREFIX[user.role] ?? '') : '';
  const greeting   = rolePrefix
    ? `${rolePrefix} ${user.name.split(' ')[0]}`
    : user.name.split(' ')[0];

  // ── Effective thresholds — respect per-device overrides ───────────────────
  const warnTemp  = selectedDevice?.useCustomThresholds ? selectedDevice.warningTemperature  : settings.warningTemperature;
  const critTemp  = selectedDevice?.useCustomThresholds ? selectedDevice.criticalTemperature  : settings.criticalTemperature;
  const warnHumid = selectedDevice?.useCustomThresholds ? selectedDevice.warningHumidity      : settings.warningHumidity;
  const critHumid = selectedDevice?.useCustomThresholds ? selectedDevice.criticalHumidity     : settings.criticalHumidity;

  const tempColor  = currentTemperature >= critTemp  ? '#C0392B' : currentTemperature >= warnTemp  ? '#E67E22' : '#0984E3';
  const humidColor = currentHumidity    >= critHumid ? '#C0392B' : currentHumidity    >= warnHumid ? '#E67E22' : '#16A085';

  const shouldPulseRed    = currentTemperature >= critTemp;
  const shouldPulseOrange = currentTemperature >= warnTemp && !shouldPulseRed;

  // Converted threshold values for chart reference lines
  const dispWarn = toDisplay(warnTemp);
  const dispCrit = toDisplay(critTemp);
  const activeAlerts  = alerts.filter(a => a.status === 'new' || a.status === 'auto_resolved');
  const systemColor   = systemStatus === 'cooling' ? '#0984E3' : systemStatus === 'override' ? '#E67E22' : '#6B7280';
  const systemLabel   = systemStatus === 'cooling' ? 'Cooling Active' : systemStatus === 'override' ? 'Override' : 'System Idle';

  const sliceCount = timeRange === '1h' ? 20 : timeRange === '6h' ? 60 : 120;
  const chartData = sensorHistory.slice(-sliceCount).map(r => ({
    time:        r.timestamp.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }),
    temperature: toDisplay(r.temperature),
    humidity:    parseFloat(r.humidity.toFixed(1)),
  }));

  return (
    <div className="space-y-5">

      {/* Welcome Banner */}
      <div className="rounded-2xl p-4 md:p-6 text-white relative overflow-hidden" style={{ background: 'linear-gradient(135deg, #0984E3 0%, #00CEC9 100%)' }}>
        <div className="absolute top-0 right-0 w-40 h-40 md:w-64 md:h-64 opacity-10 pointer-events-none">
          <Snowflake className="w-full h-full" />
        </div>
        <div className="relative z-10">
          <h2 className="text-lg md:text-xl mb-1 font-medium">
            Good {hour < 12 ? 'Morning' : hour < 17 ? 'Afternoon' : 'Evening'}, {greeting}!
          </h2>
          <p className="text-blue-100 text-sm leading-relaxed">
            {activeAlerts.length > 0 ? `${activeAlerts.length} active alert${activeAlerts.length > 1 ? 's' : ''} need your attention.` : 'Your cold storage systems are running smoothly.'}
          </p>
          {/* Live data pulse indicator */}
          <div className="flex items-center gap-1.5 mt-3">
            <span
              className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${secondsAgo <= 4 ? 'animate-pulse' : ''}`}
              style={{
                backgroundColor: secondsAgo <= 4 ? '#A7F3D0' : '#FDE68A',
                boxShadow: secondsAgo <= 4 ? '0 0 6px rgba(167,243,208,0.8)' : 'none',
              }}
            />
            <span className="text-xs text-blue-100/80">
              {secondsAgo <= 4 ? 'Live data' : `Updated ${secondsAgo}s ago`}
            </span>
          </div>
        </div>
      </div>


      {/* Device Selector */}
      <div className="bg-white rounded-2xl border border-[#E4E7EC] p-4 shadow-sm">
        <div className="flex items-center justify-between mb-3">
          <p className="text-xs font-semibold text-[#6B7280] uppercase tracking-wide">Monitoring Device</p>
          <span className={`flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full ${ selectedDevice?.status === 'online' ? 'bg-green-500/10 text-green-600' : 'bg-red-500/10 text-red-500' }`}>
            {selectedDevice?.status === 'online' ? <Wifi className="w-3 h-3" /> : <WifiOff className="w-3 h-3" />}
            {selectedDevice?.status ?? 'unknown'}
          </span>
        </div>
        <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
          {devices.map(device => (
            <button
              key={device.id}
              onClick={() => setSelectedDeviceId(device.id)}
              className={`flex-shrink-0 flex items-start gap-2.5 px-3.5 py-2.5 rounded-xl border transition-all active:scale-[0.97] text-left ${ selectedDeviceId === device.id ? 'border-[#0984E3] bg-[#EFF6FF]' : 'border-[#E4E7EC] bg-[#F9FAFB]' }`}
              style={{ minWidth: 160 }}>
              <div className={`w-2 h-2 rounded-full mt-1.5 flex-shrink-0 ${ device.status === 'online' ? 'bg-green-500' : 'bg-red-400' }`} />
              <div className="min-w-0">
                <p className={`text-xs font-semibold truncate ${ selectedDeviceId === device.id ? 'text-[#0984E3]' : 'text-[#111827]' }`}>{device.name}</p>
                <div className="flex items-center gap-1 mt-0.5">
                  <MapPin className="w-2.5 h-2.5 text-[#6B7280] flex-shrink-0" />
                  <p className="text-[10px] text-[#6B7280] truncate">{device.location}</p>
                </div>
              </div>
            </button>
          ))}
        </div>
      </div>
      {/* Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-5">
        <div className={`bg-white rounded-2xl p-4 md:p-5 shadow-sm border border-[#E4E7EC] transition-all ${shouldPulseRed ? 'animate-pulse-red' : shouldPulseOrange ? 'animate-pulse-orange' : ''}`}>
          <div className="flex items-start justify-between mb-3">
            <div className="w-11 h-11 rounded-xl flex items-center justify-center" style={{ backgroundColor: `${tempColor}15` }}>
              <Thermometer className="w-5 h-5" style={{ color: tempColor }} />
            </div>
            <div className="flex items-center gap-1 text-xs text-[#6B7280]">{tempTrend === 'up' ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}<span>Live</span></div>
          </div>
          <p className="text-3xl font-semibold tabular-nums" style={{ color: tempColor }}>{dispTemp}{unitLabel}</p>
          <p className="text-sm text-[#6B7280] mt-1">Temperature</p>
          <div className="mt-3 flex items-center gap-2">
            <div className="flex-1 h-1.5 bg-[#E4E7EC] rounded-full overflow-hidden">
              <div className="h-full rounded-full transition-all duration-500" style={{ width: `${critTemp > 0 ? Math.min(100, (currentTemperature / critTemp) * 100) : 0}%`, backgroundColor: tempColor }} />
            </div>
            <span className="text-xs text-[#6B7280]">{dispCrit}{unitLabel}</span>          </div>
        </div>

        <div className="bg-white rounded-2xl p-4 md:p-5 shadow-sm border border-[#E4E7EC]">
          <div className="flex items-start justify-between mb-3">
            <div className="w-11 h-11 rounded-xl flex items-center justify-center" style={{ backgroundColor: `${humidColor}15` }}>
              <Droplets className="w-5 h-5" style={{ color: humidColor }} />
            </div>
            <div className="flex items-center gap-1 text-xs text-[#6B7280]">{humidTrend === 'up' ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}<span>Live</span></div>
          </div>
          <p className="text-3xl font-semibold tabular-nums" style={{ color: humidColor }}>{currentHumidity.toFixed(1)}%</p>
          <p className="text-sm text-[#6B7280] mt-1">Humidity</p>
          <div className="mt-3 flex items-center gap-2">
            <div className="flex-1 h-1.5 bg-[#E4E7EC] rounded-full overflow-hidden">
              <div className="h-full rounded-full transition-all duration-500" style={{ width: `${Math.min(100, currentHumidity)}%`, backgroundColor: humidColor }} />
            </div>
            <span className="text-xs text-[#6B7280]">100%</span>
          </div>
        </div>

        <div className="bg-white rounded-2xl p-4 md:p-5 shadow-sm border border-[#E4E7EC]">
          <div className="flex items-start justify-between mb-3">
            <div className="w-11 h-11 rounded-xl flex items-center justify-center" style={{ backgroundColor: `${systemColor}18` }}>
              <Activity className="w-5 h-5" style={{ color: systemColor }} />
            </div>
            <span className="px-2 py-1 rounded-full text-xs font-medium text-white" style={{ backgroundColor: systemColor }}>{systemStatus}</span>
          </div>
          <p className="text-base md:text-xl font-semibold" style={{ color: systemColor }}>{systemLabel}</p>
          <p className="text-sm text-[#6B7280] mt-1">Peltier Module</p>
        </div>

        <div className="bg-white rounded-2xl p-4 md:p-5 shadow-sm border border-[#E4E7EC]">
          <div className="flex items-start justify-between mb-3">
            <div className="w-11 h-11 rounded-xl flex items-center justify-center" style={{ backgroundColor: activeAlerts.length > 0 ? 'rgba(192,57,43,0.1)' : 'rgba(39,174,96,0.1)' }}>
              <AlertTriangle className="w-5 h-5" style={{ color: activeAlerts.length > 0 ? '#C0392B' : '#27AE60' }} />
            </div>
          </div>
          <p className="text-3xl font-semibold" style={{ color: activeAlerts.length > 0 ? '#C0392B' : '#27AE60' }}>{activeAlerts.length}</p>
          <p className="text-sm text-[#6B7280] mt-1">Active Alerts</p>
          {activeAlerts.length > 0 && <p className="text-xs mt-2 px-2 py-1 rounded-lg inline-block font-medium bg-red-500/10 text-red-500">Needs attention</p>}
        </div>
      </div>

      {/* Produce Mode Selector */}
      <ProduceModeSelector />

      {/* Charts + Control Panel */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 md:gap-6">

        {/* Left: two stacked charts + alerts preview */}
        <div className="lg:col-span-2 flex flex-col gap-4">

          {/* Time range tabs — shared across both charts */}
          <div className="flex items-center justify-between">
            <h3 className="text-[#111827] text-sm font-semibold">Live Sensor Data</h3>
            <div className="flex gap-1.5">
              {TIME_RANGE_BUTTONS.map(range => (
                <button key={range} onClick={() => setTimeRange(range)}
                  className={`px-3 py-2 rounded-xl text-xs font-medium transition-colors active:scale-95 ${timeRange === range ? 'bg-[#0984E3] text-white' : 'bg-[#F3F4F6] text-[#6B7280]'}`}
                  style={{ minHeight: 36, minWidth: 36 }}>
                  {range}
                </button>
              ))}
            </div>
          </div>

          {/* Temperature chart */}
          <div className="bg-white rounded-2xl p-4 md:p-5 shadow-sm border border-[#E4E7EC]">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-2.5 h-2.5 rounded-full bg-[#0984E3]" />
              <span className="text-sm font-medium text-[#111827]">Temperature ({unitLabel})</span>
              <span className="ml-auto text-2xl font-bold tabular-nums" style={{ color: tempColor }}>{dispTemp}{unitLabel}</span>
            </div>
            <ResponsiveContainer width="100%" height={160}>
              <AreaChart data={chartData} margin={{ top: 4, right: 10, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="tempGradDash" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor="#0984E3" stopOpacity={0.2} />
                    <stop offset="95%" stopColor="#0984E3" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#E4E7EC" />
                <XAxis dataKey="time" stroke="#6B7280" fontSize={10} tickLine={false} interval="preserveStartEnd" />
                <YAxis stroke="#6B7280" fontSize={10} tickLine={false} axisLine={false} width={28} />
                <Tooltip contentStyle={{ backgroundColor: '#FFFFFF', border: '1px solid #E4E7EC', borderRadius: 10, fontSize: 11, color: '#111827' }} formatter={(v: number) => [`${v}${unitLabel}`, 'Temperature']} />
                <ReferenceLine y={dispWarn} stroke="#E67E22" strokeDasharray="4 4" label={{ value: 'Warn', position: 'right', fontSize: 9, fill: '#E67E22' }} />
                <ReferenceLine y={dispCrit} stroke="#C0392B" strokeDasharray="4 4" label={{ value: 'Crit', position: 'right', fontSize: 9, fill: '#C0392B' }} />
                <Area type="monotone" dataKey="temperature" stroke="#0984E3" strokeWidth={2} fill="url(#tempGradDash)" dot={false} />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          {/* Humidity chart */}
          <div className="bg-white rounded-2xl p-4 md:p-5 shadow-sm border border-[#E4E7EC]">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-2.5 h-2.5 rounded-full bg-[#16A085]" />
              <span className="text-sm font-medium text-[#111827]">Humidity (%)</span>
              <span className="ml-auto text-2xl font-bold tabular-nums" style={{ color: humidColor }}>{currentHumidity.toFixed(1)}%</span>
            </div>
            <ResponsiveContainer width="100%" height={160}>
              <AreaChart data={chartData} margin={{ top: 4, right: 10, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="humidGradDash" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor="#16A085" stopOpacity={0.2} />
                    <stop offset="95%" stopColor="#16A085" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#E4E7EC" />
                <XAxis dataKey="time" stroke="#6B7280" fontSize={10} tickLine={false} interval="preserveStartEnd" />
                <YAxis stroke="#6B7280" fontSize={10} tickLine={false} axisLine={false} width={28} domain={[0, 100]} />
                <Tooltip contentStyle={{ backgroundColor: '#FFFFFF', border: '1px solid #E4E7EC', borderRadius: 10, fontSize: 11, color: '#111827' }} formatter={(v: number) => [`${v}%`, 'Humidity']} />
                <ReferenceLine y={warnHumid} stroke="#E67E22" strokeDasharray="4 4" label={{ value: 'Warn', position: 'right', fontSize: 9, fill: '#E67E22' }} />
                <ReferenceLine y={critHumid} stroke="#C0392B" strokeDasharray="4 4" label={{ value: 'Crit', position: 'right', fontSize: 9, fill: '#C0392B' }} />
                <Area type="monotone" dataKey="humidity" stroke="#16A085" strokeWidth={2} fill="url(#humidGradDash)" dot={false} />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          {/* Active Alerts Preview */}
          <div className="bg-white rounded-2xl shadow-sm border border-[#E4E7EC] overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3.5 border-b border-[#E4E7EC]">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-[#6B7280]" />
                <span className="text-sm font-semibold text-[#111827]">Active Alerts</span>
                {activeAlerts.length > 0 && (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-red-500/10 text-red-500">{activeAlerts.length}</span>
                )}
              </div>
              <button onClick={() => setActivePage('alerts')} className="flex items-center gap-1 text-xs text-[#0984E3] font-medium active:opacity-70">
                View all <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>

            {activeAlerts.length === 0 ? (
              <div className="px-4 py-6 text-center">
                <p className="text-sm text-[#6B7280]">No active alerts — all systems nominal.</p>
              </div>
            ) : (
              <div className="divide-y divide-[#E4E7EC]">
                {activeAlerts.slice(0, 3).map(alert => {
                  const s = SEVERITY_STYLES[alert.severity];
                  const ago = Math.floor((Date.now() - alert.timestamp.getTime()) / 60000);
                  const timeLabel = ago < 60 ? `${ago}m ago` : `${Math.floor(ago / 60)}h ago`;
                  return (
                    <div key={alert.id} className="flex items-start gap-3 px-4 py-3">
                      <div className="w-1 self-stretch rounded-full flex-shrink-0 mt-0.5" style={{ backgroundColor: s.bar }} />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium text-[#111827] leading-snug">{alert.message}</p>
                        <div className="flex items-center gap-2 mt-1">
                          <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${s.badge}`}>{s.label}</span>
                          <span className="text-[10px] text-[#6B7280]">{timeLabel}</span>
                          {alert.status === 'acknowledged' && <span className="text-[10px] text-[#6B7280]">· Acknowledged</span>}
                        </div>
                      </div>
                    </div>
                  );
                })}
                {activeAlerts.length > 3 && (
                  <button onClick={() => setActivePage('alerts')} className="w-full py-3 text-xs text-[#0984E3] font-medium text-center active:opacity-70">
                    +{activeAlerts.length - 3} more alerts — tap to view
                  </button>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Right: Control Panel */}
        <ControlPanel />
      </div>
    </div>
  );
}