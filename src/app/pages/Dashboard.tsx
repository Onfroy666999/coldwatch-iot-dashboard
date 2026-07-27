import { useState, useEffect, useRef } from 'react';
import { KeepAwake } from '@capacitor-community/keep-awake';
import { Thermometer, Droplets, Activity, AlertTriangle, TrendingUp, TrendingDown, Snowflake, ChevronRight, MapPin, Wifi, WifiOff, Lightbulb } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { insightsApi, type AIInsight } from '../Lib/api';
import ControlPanel from '../components/ControlPanel';
import { usePageLoading, DashboardSkeleton } from '../components/Skeleton.tsx';

const ROLE_PREFIX: Record<string, string> = {
  farmer:            'Farmer',
  warehouse_manager: 'Manager',
  transporter:       'Transporter',
};

const SEVERITY_STYLES: Record<string, { bar: string; badge: string; label: string }> = {
  critical: { bar: '#C0392B', badge: 'bg-red-500/10 text-red-500',      label: 'Critical' },
  warning:  { bar: '#E67E22', badge: 'bg-orange-500/10 text-orange-500', label: 'Warning'  },
  info:     { bar: '#0984E3', badge: 'bg-blue-500/10 text-blue-500',     label: 'Info'     },
};

export default function Dashboard() {
  const isLoading = usePageLoading();
  const { currentTemperature, currentHumidity, systemStatus, alerts, sensorHistory, settings, user, setActivePage, devices, selectedDeviceId, setSelectedDeviceId, isOnline, lastReadingAt } = useApp();

  // Keep the screen awake while this page is mounted — a dimmed/locked screen
  // is exactly the condition that kills the WebSocket in the field (see
  // App.tsx's resume-reconnect handling, which exists to recover from this).
  // Released automatically on unmount, i.e. as soon as the user navigates
  // away from the dashboard — not held for the whole app session.
  useEffect(() => {
    KeepAwake.keepAwake().catch(() => {
      // Not fatal — e.g. unsupported browser (no Screen Wake Lock API) on web.
    });
    return () => {
      KeepAwake.allowSleep().catch(() => {});
    };
  }, []);

  const [insights, setInsights] = useState<AIInsight[]>([]);
  const [insightsLoading, setInsightsLoading] = useState(false);

  // Fetch insights whenever the selected device changes
  useEffect(() => {
    if (!selectedDeviceId) return;
    let cancelled = false;
    setInsightsLoading(true);
    insightsApi.list(selectedDeviceId)
      .then(({ insights: data }) => { if (!cancelled) setInsights(data); })
      .catch(() => { if (!cancelled) setInsights([]); })
      .finally(() => { if (!cancelled) setInsightsLoading(false); });
    return () => { cancelled = true; };
  }, [selectedDeviceId]);

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
  // True when the device is offline and readings are coming from the local simulation
  // rather than real ESP32 hardware. Used to show a "Simulated data" badge.
  const isSimulated = !selectedDevice || selectedDevice.status !== 'online';

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

  // Converted threshold value for the temperature progress bar
  const dispCrit = toDisplay(critTemp);
  const activeAlerts  = alerts.filter(a => a.status === 'new' || a.status === 'auto_resolved');
  const systemColor   = systemStatus === 'cooling' ? '#0984E3' : systemStatus === 'override' ? '#E67E22' : '#6B7280';
  const systemLabel   = systemStatus === 'cooling' ? 'Cooling Active' : systemStatus === 'override' ? 'Override' : 'System Idle';

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
            {activeAlerts.length > 0
              ? `${activeAlerts.length} active alert${activeAlerts.length > 1 ? 's' : ''} need your attention.`
              : selectedDevice?.status === 'online'
                ? 'Your cold storage systems are running smoothly.'
                : selectedDevice
                  ? 'Your device is offline. Check your connection or sensor.'
                  : 'Add a device to start monitoring your cold storage.'
            }
          </p>
          {/* Live data pulse — only shown when device is actually online */}
          {selectedDevice?.status === 'online' && (
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
          )}
        </div>
      </div>

      {/* Offline Indicator */}
      {!isOnline && (
        <div className="flex items-center gap-2.5 rounded-xl px-4 py-3 bg-amber-50 border border-amber-200 text-amber-700">
          <WifiOff className="w-4 h-4 flex-shrink-0" />
          <p className="text-sm font-medium">
            Offline — showing last known data
            {lastReadingAt && (
              <span className="font-normal text-amber-600">
                {' '}from {new Date(lastReadingAt).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true })}
              </span>
            )}
          </p>
        </div>
      )}


      {/* Device Selector */}
      <div className="bg-white rounded-2xl border border-[#E4E7EC] p-4 shadow-sm">
        <div className="flex items-center justify-between mb-3">
          <p className="text-xs font-semibold text-[#6B7280] uppercase tracking-wide">Monitoring Device</p>
          <span className={`flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full ${ selectedDevice?.status === 'online' ? 'bg-green-500/10 text-green-600' : 'bg-red-500/10 text-red-500' }`}>
            {selectedDevice?.status === 'online' ? <Wifi className="w-3 h-3" /> : <WifiOff className="w-3 h-3" />}
            {selectedDevice?.status ?? 'unknown'}
          </span>
          {isSimulated && (
            <span className="flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-600 border border-amber-500/20">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
              Last known data
            </span>
          )}
        </div>
        <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
          {devices.map(device => (
            <button
              key={device.id}
              onClick={() => setSelectedDeviceId(device.id)}
              className={`flex-shrink-0 flex items-start gap-2.5 px-3.5 py-2.5 rounded-xl border transition-all active:scale-[0.97] text-left ${ selectedDeviceId === device.id ? 'border-[#0984E3] bg-[#EFF6FF]' : 'border-[#E4E7EC] bg-[#F9FAFB]' }`}
              style={{ minWidth: 160 }}>
              {device.status === 'online'
                ? <Wifi    className="w-3 h-3 mt-0.5 flex-shrink-0 text-green-500" aria-hidden="true" />
                : <WifiOff className="w-3 h-3 mt-0.5 flex-shrink-0 text-red-400"   aria-hidden="true" />}
              <span className="sr-only">{device.status === 'online' ? 'Online' : 'Offline'}</span>
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

      {/* AI Insights */}
      {(insightsLoading || insights.length > 0) && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Lightbulb className="w-4 h-4 text-[#0984E3]" />
              <span className="text-sm font-semibold text-[#111827]">Storage insights</span>
            </div>
            <span className="text-[11px] text-[#9CA3AF]">Last 7 days</span>
          </div>

          {insightsLoading ? (
            <div className="space-y-3">
              {[1, 2].map(i => (
                <div key={i} className="bg-white rounded-2xl border border-[#E4E7EC] p-4 animate-pulse">
                  <div className="flex gap-3">
                    <div className="w-9 h-9 rounded-xl bg-[#F3F4F6] flex-shrink-0" />
                    <div className="flex-1 space-y-2 pt-1">
                      <div className="h-2.5 bg-[#F3F4F6] rounded w-1/2" />
                      <div className="h-2 bg-[#F3F4F6] rounded w-full" />
                      <div className="h-2 bg-[#F3F4F6] rounded w-4/5" />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="space-y-3">
              {insights.map(insight => {
                const isWarning = insight.severity === 'warning';
                return (
                  <div
                    key={insight.id}
                    className="bg-white rounded-2xl border border-[#E4E7EC] overflow-hidden"
                    style={{ borderLeft: `3px solid ${isWarning ? '#E67E22' : '#0984E3'}`, borderRadius: '0 16px 16px 0' }}
                  >
                    <div className="flex items-start gap-3 p-4">
                      <div
                        className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
                        style={{ backgroundColor: isWarning ? 'rgba(230,126,34,0.1)' : 'rgba(9,132,227,0.08)' }}
                      >
                        <Lightbulb
                          className="w-4 h-4"
                          style={{ color: isWarning ? '#E67E22' : '#0984E3' }}
                        />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span
                            className="text-[10px] font-semibold px-2 py-0.5 rounded-full"
                            style={{
                              backgroundColor: isWarning ? 'rgba(230,126,34,0.1)' : 'rgba(9,132,227,0.08)',
                              color: isWarning ? '#E67E22' : '#0984E3',
                            }}
                          >
                            {isWarning ? 'Action needed' : 'Informational'}
                          </span>
                        </div>
                        <p className="text-xs font-semibold text-[#111827] mb-1">{insight.title}</p>
                        <p className="text-[11px] text-[#6B7280] leading-relaxed">{insight.body}</p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Alerts + Control Panel */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 md:gap-6">

        {/* Left: alerts preview */}
        <div className="lg:col-span-2 flex flex-col gap-4">

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