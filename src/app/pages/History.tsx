import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { useApp } from '../context/AppContext';
import type { Device } from '../context/AppContext';
import {
  XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine, AreaChart, Area
} from 'recharts';
import { Upload, BarChart3, Table, Clock, MapPin, Wifi, WifiOff, FileText, FileJson } from 'lucide-react';
import { usePageLoading, HistorySkeleton } from '../components/Skeleton';

export default function History() {
  const { deviceHistories, settings, devices, selectedDeviceId, isAdvancedUser } = useApp();
  const [viewMode, setViewMode] = useState<'chart' | 'table'>('chart');
  const [showExportMenu, setShowExportMenu] = useState(false);
  const exportMenuRef = useRef<HTMLDivElement>(null);
  // Local device selection — independent from global selectedDeviceId so switching
  // device in History doesn't affect Dashboard/ControlPanel and vice versa.
  const [historyDeviceId, setHistoryDeviceId] = useState(selectedDeviceId);
  const isLoading = usePageLoading();

  // Close export menu on outside click
  useEffect(() => {
    if (!showExportMenu) return;
    const handler = (e: MouseEvent) => {
      if (exportMenuRef.current && !exportMenuRef.current.contains(e.target as Node)) {
        setShowExportMenu(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showExportMenu]);

  if (isLoading) return <HistorySkeleton />;

  const selectedDevice = devices.find(d => d.id === historyDeviceId);
  const historyData = deviceHistories[historyDeviceId] ?? [];

  // ── Effective thresholds — respect per-device overrides, same as Dashboard ─
  const warnTemp  = selectedDevice?.useCustomThresholds ? selectedDevice.warningTemperature  : settings.warningTemperature;
  const critTemp  = selectedDevice?.useCustomThresholds ? selectedDevice.criticalTemperature  : settings.criticalTemperature;
  const warnHumid = selectedDevice?.useCustomThresholds ? selectedDevice.warningHumidity      : settings.warningHumidity;
  const critHumid = selectedDevice?.useCustomThresholds ? selectedDevice.criticalHumidity     : settings.criticalHumidity;

  // ── Unit conversion
  const isFahrenheit = settings.tempUnit === 'F';
  const toDisplay = (c: number) => isFahrenheit ? parseFloat((c * 9 / 5 + 32).toFixed(1)) : parseFloat(c.toFixed(1));
  const unitLabel = isFahrenheit ? '°F' : '°C';

  const chartData = historyData.map(reading => ({
    time: reading.timestamp.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }),
    temperature: toDisplay(reading.temperature),
    humidity: parseFloat(reading.humidity.toFixed(1)),
  }));

  const avgTemp = historyData.length > 0
    ? toDisplay(historyData.reduce((s, r) => s + r.temperature, 0) / historyData.length).toFixed(1) : '—';
  const maxTemp = historyData.length > 0
    ? toDisplay(Math.max(...historyData.map(r => r.temperature))).toFixed(1) : '—';
  const minTemp = historyData.length > 0
    ? toDisplay(Math.min(...historyData.map(r => r.temperature))).toFixed(1) : '—';
  const avgHumidity = historyData.length > 0
    ? (historyData.reduce((s, r) => s + r.humidity, 0) / historyData.length).toFixed(1) : '—';

  // CSV export — respects user's temperature unit setting 
  const handleExportCSV = () => {
    const headers = ['Timestamp', `Temperature (${unitLabel})`, 'Humidity (%)'];
    const csvContent = [
      headers.join(','),
      ...historyData.map(r => [
        r.timestamp.toISOString(),
        toDisplay(r.temperature).toFixed(2),
        r.humidity.toFixed(2),
      ].join(',')),
    ].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `coldwatch-${selectedDevice?.name.replace(/\s+/g, '-').toLowerCase() ?? 'device'}-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
  };

  // JSON export
  const handleExportJSON = () => {
    const data = {
      device: selectedDevice ? { id: selectedDevice.id, name: selectedDevice.name, location: selectedDevice.location } : null,
      exportedAt: new Date().toISOString(),
      unit: unitLabel,
      readings: historyData.map(r => ({
        timestamp: r.timestamp.toISOString(),
        temperature: toDisplay(r.temperature),
        humidity: parseFloat(r.humidity.toFixed(2)),
      })),
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `coldwatch-${selectedDevice?.name.replace(/\s+/g, '-').toLowerCase() ?? 'device'}-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    window.URL.revokeObjectURL(url);
  };

  const getStatus = (temp: number) => {
    if (temp >= critTemp) return 'Critical';
    if (temp >= warnTemp) return 'Warning';
    return 'Normal';
  };

  const statusStyles: Record<string, string> = {
    Critical: 'text-red-500 bg-red-500/15',
    Warning:  'text-orange-500 bg-orange-500/15',
    Normal:   'text-green-600 bg-green-500/15',
  };

  const reversedHistory = historyData.slice().reverse();

  // Empty state
  if (historyData.length === 0) {
    return (
      <div className="space-y-5">
        {/* Device selector still shows even when empty */}
        <DeviceSelector
          devices={devices}
          selectedDeviceId={historyDeviceId}
          setSelectedDeviceId={setHistoryDeviceId}
          selectedDevice={selectedDevice}
        />
        <div className="flex flex-col items-center justify-center min-h-[50vh] text-center px-6">
          <div className="w-20 h-20 rounded-full bg-[#F3F4F6] flex items-center justify-center mb-5">
            <Clock className="w-9 h-9 text-[#6B7280]" />
          </div>
          <h2 className="text-[#111827] font-semibold text-lg mb-2">No history yet</h2>
          <p className="text-[#6B7280] text-sm max-w-xs leading-relaxed">
            {selectedDevice
              ? <>Sensor readings for <span className="font-medium text-[#111827]">{selectedDevice.name}</span> will appear here once it starts collecting data.</>
              : 'Sensor readings will appear here once your device starts collecting data.'
            }
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">

      {/* Device Selector */}
      <DeviceSelector
        devices={devices}
        selectedDeviceId={historyDeviceId}
        setSelectedDeviceId={setHistoryDeviceId}
        selectedDevice={selectedDevice}
      />

      {/* Stats Summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: 'Avg Temp',     value: `${avgTemp}${unitLabel}`,   color: '#0984E3' },
          { label: 'Max Temp',     value: `${maxTemp}${unitLabel}`,   color: '#C0392B' },
          { label: 'Min Temp',     value: `${minTemp}${unitLabel}`,   color: '#27AE60' },
          { label: 'Avg Humidity', value: `${avgHumidity}%`, color: '#16A085' },
        ].map((stat, i) => (
          <div key={i} className="bg-white rounded-2xl p-4 shadow-sm border border-[#E4E7EC]">
            <p className="text-2xl font-semibold" style={{ color: stat.color }}>{stat.value}</p>
            <p className="text-xs text-[#6B7280] mt-1">{stat.label}</p>
          </div>
        ))}
      </div>

      {/* Controls */}
      <div className="bg-white rounded-2xl p-4 shadow-sm border border-[#E4E7EC]">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <div className="flex gap-1.5">
              <button onClick={() => setViewMode('chart')}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-colors active:scale-95 ${viewMode === 'chart' ? 'bg-[#0984E3] text-white' : 'bg-[#F3F4F6] text-[#6B7280]'}`}
                style={{ minHeight: 44 }}>
                <BarChart3 className="w-4 h-4" /> Chart
              </button>
              <button onClick={() => setViewMode('table')}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-colors active:scale-95 ${viewMode === 'table' ? 'bg-[#0984E3] text-white' : 'bg-[#F3F4F6] text-[#6B7280]'}`}
                style={{ minHeight: 44 }}>
                <Table className="w-4 h-4" /> Table
              </button>
            </div>
            <span className="text-xs text-[#6B7280]">{historyData.length} readings</span>
          </div>
          {/* Export — submenu for managers (CSV + JSON), direct CSV for everyone else */}
          {isAdvancedUser ? (
            <div className="relative" ref={exportMenuRef}>
              <button
                onClick={() => setShowExportMenu(v => !v)}
                className="flex items-center gap-2 px-4 py-2.5 border-2 border-[#E4E7EC] rounded-xl text-sm font-medium text-[#111827] transition-colors active:bg-[#F3F4F6]"
                style={{ minHeight: 44 }}>
                <Upload className="w-4 h-4" />
                Export
              </button>
              <AnimatePresence>
                {showExportMenu && (
                  <motion.div
                    initial={{ opacity: 0, y: -6, scale: 0.97 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -6, scale: 0.97 }}
                    transition={{ duration: 0.15 }}
                    className="absolute left-0 top-full mt-1.5 bg-white rounded-2xl shadow-lg border border-[#E4E7EC] overflow-hidden z-20"
                    style={{ minWidth: 200 }}
                  >
                    <button
                      onClick={() => { handleExportCSV(); setShowExportMenu(false); }}
                      className="w-full flex items-center gap-3 px-4 py-3.5 text-sm text-[#111827] hover:bg-[#F3F4F6] active:bg-[#E4E7EC] transition-colors border-b border-[#E4E7EC] text-left"
                    >
                      <FileText className="w-4 h-4 text-[#6B7280] flex-shrink-0" />
                      <div>
                        <p className="font-medium">Export CSV</p>
                        <p className="text-xs text-[#9CA3AF]">Spreadsheet compatible</p>
                      </div>
                    </button>
                    <button
                      onClick={() => { handleExportJSON(); setShowExportMenu(false); }}
                      className="w-full flex items-center gap-3 px-4 py-3.5 text-sm text-[#111827] hover:bg-[#F3F4F6] active:bg-[#E4E7EC] transition-colors text-left"
                    >
                      <FileJson className="w-4 h-4 text-[#6B7280] flex-shrink-0" />
                      <div>
                        <p className="font-medium">Export JSON</p>
                        <p className="text-xs text-[#9CA3AF]">Raw data with metadata</p>
                      </div>
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          ) : (
            <button
              onClick={handleExportCSV}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium text-[#6B7280] transition-colors active:bg-[#F3F4F6]"
              style={{ minHeight: 44 }}>
              <Upload className="w-3.5 h-3.5" />
              Export CSV
            </button>
          )}
        </div>
      </div>

      {/* Chart View */}
      {viewMode === 'chart' && (
        <div className="space-y-4">
          <div className="bg-white rounded-2xl p-4 md:p-6 shadow-sm border border-[#E4E7EC]">
            <div className="flex items-center gap-2 mb-4">
              <div className="w-3 h-3 rounded-full bg-[#0984E3]" />
              <h3 className="text-[#111827] text-sm font-medium">Temperature ({unitLabel})</h3>
            </div>
            <ResponsiveContainer width="100%" height={200}>
              <AreaChart data={chartData} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="tempGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor="#0984E3" stopOpacity={0.2} />
                    <stop offset="95%" stopColor="#0984E3" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#E4E7EC" />
                <XAxis dataKey="time" stroke="#6B7280" fontSize={10} tickLine={false} interval="preserveStartEnd" />
                <YAxis stroke="#0984E3" fontSize={10} tickLine={false} axisLine={false} width={32} />
                <Tooltip contentStyle={{ backgroundColor: '#FFFFFF', border: '1px solid #E4E7EC', borderRadius: '12px', fontSize: '11px', color: '#111827' }} formatter={(v: number) => [`${v}${unitLabel}`, 'Temperature']} />
                <ReferenceLine y={warnTemp} stroke="#E67E22" strokeDasharray="4 4" label={{ value: 'Warn', position: 'right', fontSize: 9, fill: '#E67E22' }} />
                <ReferenceLine y={critTemp} stroke="#C0392B" strokeDasharray="4 4" label={{ value: 'Crit', position: 'right', fontSize: 9, fill: '#C0392B' }} />
                <Area type="monotone" dataKey="temperature" stroke="#0984E3" strokeWidth={2} fill="url(#tempGrad)" dot={false} />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          <div className="bg-white rounded-2xl p-4 md:p-6 shadow-sm border border-[#E4E7EC]">
            <div className="flex items-center gap-2 mb-4">
              <div className="w-3 h-3 rounded-full bg-[#16A085]" />
              <h3 className="text-[#111827] text-sm font-medium">Humidity (%)</h3>
            </div>
            <ResponsiveContainer width="100%" height={200}>
              <AreaChart data={chartData} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="humidGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor="#16A085" stopOpacity={0.2} />
                    <stop offset="95%" stopColor="#16A085" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#E4E7EC" />
                <XAxis dataKey="time" stroke="#6B7280" fontSize={10} tickLine={false} interval="preserveStartEnd" />
                <YAxis stroke="#16A085" fontSize={10} tickLine={false} axisLine={false} width={32} domain={[0, 100]} />
                <Tooltip contentStyle={{ backgroundColor: '#FFFFFF', border: '1px solid #E4E7EC', borderRadius: '12px', fontSize: '11px', color: '#111827' }} formatter={(v: number) => [`${v}%`, 'Humidity']} />
                <ReferenceLine y={warnHumid} stroke="#E67E22" strokeDasharray="4 4" label={{ value: 'Warn', position: 'right', fontSize: 9, fill: '#E67E22' }} />
                <ReferenceLine y={critHumid} stroke="#C0392B" strokeDasharray="4 4" label={{ value: 'Crit', position: 'right', fontSize: 9, fill: '#C0392B' }} />
                <Area type="monotone" dataKey="humidity" stroke="#16A085" strokeWidth={2} fill="url(#humidGrad)" dot={false} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Table View */}
      {viewMode === 'table' && (
        <>
          <div className="md:hidden space-y-2">
            {reversedHistory.map((reading, index) => {
              const status = getStatus(reading.temperature);
              return (
                <div key={index} className="bg-white rounded-2xl px-4 py-3.5 shadow-sm border border-[#E4E7EC]">
                  <p className="text-xs text-[#6B7280] font-mono mb-2.5">
                    {reading.timestamp.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: '2-digit' })}
                    {' · '}
                    {reading.timestamp.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                  </p>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div>
                        <p className="text-xs text-[#6B7280] mb-0.5">Temp</p>
                        <p className="text-sm font-semibold" style={{ color: '#0984E3' }}>{toDisplay(reading.temperature).toFixed(2)}{unitLabel}</p>
                      </div>
                      <div className="w-px h-8 bg-[#E4E7EC]" />
                      <div>
                        <p className="text-xs text-[#6B7280] mb-0.5">Humidity</p>
                        <p className="text-sm font-semibold" style={{ color: '#16A085' }}>{reading.humidity.toFixed(2)}%</p>
                      </div>
                    </div>
                    <span className={`px-3 py-1 rounded-xl text-xs font-medium ${statusStyles[status]}`}>{status}</span>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="hidden md:block bg-white rounded-2xl shadow-sm border border-[#E4E7EC] overflow-hidden">
            <div className="overflow-x-auto max-h-[600px] overflow-y-auto">
              <table className="w-full">
                <thead className="bg-[#F3F4F6] sticky top-0">
                  <tr>
                    <th className="px-5 py-3.5 text-left text-sm font-medium text-[#6B7280]">Timestamp</th>
                    <th className="px-5 py-3.5 text-left text-sm font-medium text-[#6B7280]">Temperature ({unitLabel})</th>
                    <th className="px-5 py-3.5 text-left text-sm font-medium text-[#6B7280]">Humidity (%)</th>
                    <th className="px-5 py-3.5 text-left text-sm font-medium text-[#6B7280]">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {reversedHistory.map((reading, index) => {
                    const status = getStatus(reading.temperature);
                    return (
                      <tr key={index} className="border-t border-[#E4E7EC] hover:bg-[#F3F4F6]/50 transition-colors">
                        <td className="px-5 py-3 text-sm font-mono text-[#6B7280]">{reading.timestamp.toLocaleString('en-GB')}</td>
                        <td className="px-5 py-3 text-sm font-semibold" style={{ color: '#0984E3' }}>{toDisplay(reading.temperature).toFixed(2)}</td>
                        <td className="px-5 py-3 text-sm font-semibold" style={{ color: '#16A085' }}>{reading.humidity.toFixed(2)}</td>
                        <td className="px-5 py-3">
                          <span className={`px-2.5 py-1 rounded-lg text-xs font-medium ${statusStyles[status]}`}>{status}</span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      <div className="h-4" />
    </div>
  );
}

//  Device Selector — extracted so it renders in both empty and data states 
function DeviceSelector({
  devices, selectedDeviceId, setSelectedDeviceId, selectedDevice,
}: {
  devices: Device[];
  selectedDeviceId: string;
  setSelectedDeviceId: (id: string) => void;
  selectedDevice: Device | undefined;
}) {
  return (
    <div className="bg-white rounded-2xl border border-[#E4E7EC] p-4 shadow-sm">
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs font-semibold text-[#6B7280] uppercase tracking-wide">Viewing History For</p>
        <span className={`flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full ${selectedDevice?.status === 'online' ? 'bg-green-500/10 text-green-600' : 'bg-red-500/10 text-red-500'}`}>
          {selectedDevice?.status === 'online' ? <Wifi className="w-3 h-3" /> : <WifiOff className="w-3 h-3" />}
          {selectedDevice?.status ?? 'unknown'}
        </span>
      </div>
      <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
        {devices.map(device => (
          <button
            key={device.id}
            onClick={() => setSelectedDeviceId(device.id)}
            className={`flex-shrink-0 flex items-start gap-2.5 px-3.5 py-2.5 rounded-xl border transition-all active:scale-[0.97] text-left ${selectedDeviceId === device.id ? 'border-[#0984E3] bg-[#0984E3]/10' : 'border-[#E4E7EC] bg-[#F3F4F6]'}`}
            style={{ minWidth: 160 }}
          >
            <div className={`w-2 h-2 rounded-full mt-1.5 flex-shrink-0 ${device.status === 'online' ? 'bg-green-500' : 'bg-red-400'}`} />
            <div className="min-w-0">
              <p className={`text-xs font-semibold truncate ${selectedDeviceId === device.id ? 'text-[#0984E3]' : 'text-[#111827]'}`}>{device.name}</p>
              <div className="flex items-center gap-1 mt-0.5">
                <MapPin className="w-2.5 h-2.5 text-[#6B7280] flex-shrink-0" />
                <p className="text-[10px] text-[#6B7280] truncate">{device.location}</p>
              </div>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}