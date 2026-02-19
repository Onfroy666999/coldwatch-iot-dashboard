import { useState } from 'react';
import { useApp } from '../context/AppContext';
import {
  XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine, AreaChart, Area
} from 'recharts';
import { Download, BarChart3, Table } from 'lucide-react';

export default function History() {
  const { sensorHistory, settings } = useApp();
  const [viewMode, setViewMode] = useState<'chart' | 'table'>('chart');

  const chartData = sensorHistory.map(reading => ({
    time: reading.timestamp.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }),
    temperature: parseFloat(reading.temperature.toFixed(1)),
    humidity: parseFloat(reading.humidity.toFixed(1)),
  }));

  const avgTemp = sensorHistory.length > 0
    ? (sensorHistory.reduce((s, r) => s + r.temperature, 0) / sensorHistory.length).toFixed(1) : '0';
  const maxTemp = sensorHistory.length > 0
    ? Math.max(...sensorHistory.map(r => r.temperature)).toFixed(1) : '0';
  const minTemp = sensorHistory.length > 0
    ? Math.min(...sensorHistory.map(r => r.temperature)).toFixed(1) : '0';
  const avgHumidity = sensorHistory.length > 0
    ? (sensorHistory.reduce((s, r) => s + r.humidity, 0) / sensorHistory.length).toFixed(1) : '0';

  const handleExportCSV = () => {
    const headers = ['Timestamp', 'Temperature (°C)', 'Humidity (%)'];
    const csvContent = [
      headers.join(','),
      ...sensorHistory.map(r => [
        r.timestamp.toISOString(),
        r.temperature.toFixed(2),
        r.humidity.toFixed(2),
      ].join(',')),
    ].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `coldwatch-data-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
  };

  const getStatus = (temp: number) => {
    if (temp >= settings.criticalTemperature) return 'Critical';
    if (temp >= settings.warningTemperature) return 'Warning';
    return 'Normal';
  };

  const statusStyles: Record<string, string> = {
    Critical: 'text-red-600 bg-red-50',
    Warning: 'text-orange-500 bg-orange-50',
    Normal: 'text-green-600 bg-green-50',
  };

  const reversedHistory = sensorHistory.slice().reverse();

  return (
    <div className="space-y-5">

      {/* Stats Summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: 'Avg Temp', value: `${avgTemp}°C`, color: '#2979C8' },
          { label: 'Max Temp', value: `${maxTemp}°C`, color: '#C0392B' },
          { label: 'Min Temp', value: `${minTemp}°C`, color: '#27AE60' },
          { label: 'Avg Humidity', value: `${avgHumidity}%`, color: '#16A085' },
        ].map((stat, i) => (
          <div key={i} className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
            <p className="text-2xl font-semibold" style={{ color: stat.color }}>{stat.value}</p>
            <p className="text-xs text-gray-500 mt-1">{stat.label}</p>
          </div>
        ))}
      </div>

      {/* Controls */}
      <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <div className="flex gap-1.5">
              <button
                onClick={() => setViewMode('chart')}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-colors active:scale-95 ${
                  viewMode === 'chart' ? 'bg-[#2979C8] text-white' : 'bg-gray-100 text-gray-600'
                }`}
                style={{ minHeight: 44 }}
              >
                <BarChart3 className="w-4 h-4" />
                Chart
              </button>
              <button
                onClick={() => setViewMode('table')}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-colors active:scale-95 ${
                  viewMode === 'table' ? 'bg-[#2979C8] text-white' : 'bg-gray-100 text-gray-600'
                }`}
                style={{ minHeight: 44 }}
              >
                <Table className="w-4 h-4" />
                Table
              </button>
            </div>
            <span className="text-xs text-gray-400">{sensorHistory.length} data points</span>
          </div>

          <button
            onClick={handleExportCSV}
            className="flex items-center gap-2 px-4 py-2.5 border-2 border-gray-200 rounded-xl text-sm text-gray-700 active:bg-gray-50 font-medium"
            style={{ minHeight: 44 }}
          >
            <Download className="w-4 h-4" />
            Export CSV
          </button>
        </div>
      </div>

      {/* Chart View */}
      {viewMode === 'chart' && (
        <div className="space-y-4">
          <div className="bg-white rounded-2xl p-4 md:p-6 shadow-sm border border-gray-100">
            <div className="flex items-center gap-2 mb-4">
              <div className="w-3 h-3 rounded-full" style={{ backgroundColor: '#2979C8' }} />
              <h3 className="text-gray-800 text-sm md:text-base font-medium">Temperature (°C)</h3>
            </div>
            <ResponsiveContainer width="100%" height={200}>
              <AreaChart data={chartData} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="tempGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor="#2979C8" stopOpacity={0.2} />
                    <stop offset="95%" stopColor="#2979C8" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="time" stroke="#9CA3AF" fontSize={10} tickLine={false} interval="preserveStartEnd" />
                <YAxis stroke="#2979C8" fontSize={10} tickLine={false} axisLine={false} width={32} />
                <Tooltip
                  contentStyle={{ backgroundColor: 'white', border: '1px solid #E5E7EB', borderRadius: '12px', fontSize: '11px' }}
                  formatter={(v: number) => [`${v}°C`, 'Temperature']}
                />
                <ReferenceLine y={settings.warningTemperature}  stroke="#E67E22" strokeDasharray="4 4" label={{ value: 'Warn', position: 'right', fontSize: 9, fill: '#E67E22' }} />
                <ReferenceLine y={settings.criticalTemperature} stroke="#C0392B" strokeDasharray="4 4" label={{ value: 'Crit', position: 'right', fontSize: 9, fill: '#C0392B' }} />
                <Area type="monotone" dataKey="temperature" stroke="#2979C8" strokeWidth={2} fill="url(#tempGrad)" dot={false} />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          <div className="bg-white rounded-2xl p-4 md:p-6 shadow-sm border border-gray-100">
            <div className="flex items-center gap-2 mb-4">
              <div className="w-3 h-3 rounded-full" style={{ backgroundColor: '#16A085' }} />
              <h3 className="text-gray-800 text-sm md:text-base font-medium">Humidity (%)</h3>
            </div>
            <ResponsiveContainer width="100%" height={200}>
              <AreaChart data={chartData} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="humidGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor="#16A085" stopOpacity={0.2} />
                    <stop offset="95%" stopColor="#16A085" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="time" stroke="#9CA3AF" fontSize={10} tickLine={false} interval="preserveStartEnd" />
                <YAxis stroke="#16A085" fontSize={10} tickLine={false} axisLine={false} width={32} domain={[0, 100]} />
                <Tooltip
                  contentStyle={{ backgroundColor: 'white', border: '1px solid #E5E7EB', borderRadius: '12px', fontSize: '11px' }}
                  formatter={(v: number) => [`${v}%`, 'Humidity']}
                />
                <ReferenceLine y={settings.warningHumidity}  stroke="#E67E22" strokeDasharray="4 4" label={{ value: 'Warn', position: 'right', fontSize: 9, fill: '#E67E22' }} />
                <ReferenceLine y={settings.criticalHumidity} stroke="#C0392B" strokeDasharray="4 4" label={{ value: 'Crit', position: 'right', fontSize: 9, fill: '#C0392B' }} />
                <Area type="monotone" dataKey="humidity" stroke="#16A085" strokeWidth={2} fill="url(#humidGrad)" dot={false} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Table View */}
      {viewMode === 'table' && (
        <>
          {/* ── Mobile: card list — no horizontal overflow needed ── */}
          <div className="md:hidden space-y-2">
            {reversedHistory.map((reading, index) => {
              const status = getStatus(reading.temperature);
              return (
                <div key={index} className="bg-white rounded-2xl px-4 py-3.5 shadow-sm border border-gray-100">
                  {/* Timestamp */}
                  <p className="text-xs text-gray-400 font-mono mb-2.5">
                    {reading.timestamp.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: '2-digit' })}
                    {' · '}
                    {reading.timestamp.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                  </p>
                  {/* Values + status in one row */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div>
                        <p className="text-xs text-gray-400 mb-0.5">Temp</p>
                        <p className="text-sm font-semibold" style={{ color: '#2979C8' }}>
                          {reading.temperature.toFixed(2)}°C
                        </p>
                      </div>
                      <div className="w-px h-8 bg-gray-100" />
                      <div>
                        <p className="text-xs text-gray-400 mb-0.5">Humidity</p>
                        <p className="text-sm font-semibold" style={{ color: '#16A085' }}>
                          {reading.humidity.toFixed(2)}%
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-xs text-gray-400 mb-0.5">Status</p>
                      <span className={`px-3 py-1 rounded-xl text-xs font-medium ${statusStyles[status]}`}>
                        {status}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* ── Desktop: full table ── */}
          <div className="hidden md:block bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="overflow-x-auto max-h-[600px] overflow-y-auto">
              <table className="w-full">
                <thead className="bg-gray-50 sticky top-0">
                  <tr>
                    <th className="px-5 py-3.5 text-left text-sm font-medium text-gray-600">Timestamp</th>
                    <th className="px-5 py-3.5 text-left text-sm font-medium text-gray-600">Temperature (°C)</th>
                    <th className="px-5 py-3.5 text-left text-sm font-medium text-gray-600">Humidity (%)</th>
                    <th className="px-5 py-3.5 text-left text-sm font-medium text-gray-600">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {reversedHistory.map((reading, index) => {
                    const status = getStatus(reading.temperature);
                    return (
                      <tr key={index} className="border-t border-gray-50 hover:bg-gray-50 transition-colors">
                        <td className="px-5 py-3 text-sm font-mono text-gray-600">
                          {reading.timestamp.toLocaleString('en-GB')}
                        </td>
                        <td className="px-5 py-3 text-sm font-semibold" style={{ color: '#2979C8' }}>
                          {reading.temperature.toFixed(2)}
                        </td>
                        <td className="px-5 py-3 text-sm font-semibold" style={{ color: '#16A085' }}>
                          {reading.humidity.toFixed(2)}
                        </td>
                        <td className="px-5 py-3">
                          <span className={`px-2.5 py-1 rounded-lg text-xs font-medium ${statusStyles[status]}`}>
                            {status}
                          </span>
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

      {/* Bottom spacing to clear BottomNav */}
      <div className="h-4" />
    </div>
  );
}