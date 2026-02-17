import { useState } from 'react';
import { useApp } from '../context/AppContext';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ReferenceLine, AreaChart, Area } from 'recharts';
import { Download, BarChart3, Table, Calendar } from 'lucide-react';

export default function History() {
  const { sensorHistory, settings } = useApp();
  const [viewMode, setViewMode] = useState<'chart' | 'table'>('chart');

  const chartData = sensorHistory.map(reading => ({
    time: reading.timestamp.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }),
    temperature: parseFloat(reading.temperature.toFixed(1)),
    humidity: parseFloat(reading.humidity.toFixed(1)),
  }));

  const avgTemp = sensorHistory.length > 0
    ? (sensorHistory.reduce((s, r) => s + r.temperature, 0) / sensorHistory.length).toFixed(1)
    : '0';
  const maxTemp = sensorHistory.length > 0
    ? Math.max(...sensorHistory.map(r => r.temperature)).toFixed(1)
    : '0';
  const minTemp = sensorHistory.length > 0
    ? Math.min(...sensorHistory.map(r => r.temperature)).toFixed(1)
    : '0';
  const avgHumidity = sensorHistory.length > 0
    ? (sensorHistory.reduce((s, r) => s + r.humidity, 0) / sensorHistory.length).toFixed(1)
    : '0';

  const handleExportCSV = () => {
    const headers = ['Timestamp', 'Temperature (°C)', 'Humidity (%)'];
    const csvContent = [
      headers.join(','),
      ...sensorHistory.map(r => [r.timestamp.toISOString(), r.temperature.toFixed(2), r.humidity.toFixed(2)].join(',')),
    ].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `coldwatch-data-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      {/* Stats Summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'Avg Temperature', value: `${avgTemp}°C`, color: '#2979C8' },
          { label: 'Max Temperature', value: `${maxTemp}°C`, color: '#C0392B' },
          { label: 'Min Temperature', value: `${minTemp}°C`, color: '#27AE60' },
          { label: 'Avg Humidity', value: `${avgHumidity}%`, color: '#16A085' },
        ].map((stat, i) => (
          <div key={i} className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
            <p className="text-2xl" style={{ color: stat.color }}>{stat.value}</p>
            <p className="text-sm text-gray-500">{stat.label}</p>
          </div>
        ))}
      </div>

      {/* Controls */}
      <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex gap-1.5">
              <button
                onClick={() => setViewMode('chart')}
                className={`flex items-center gap-2 px-3 py-2 rounded-xl text-sm transition-colors ${
                  viewMode === 'chart' ? 'bg-[#2979C8] text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                <BarChart3 className="w-4 h-4" />
                Chart
              </button>
              <button
                onClick={() => setViewMode('table')}
                className={`flex items-center gap-2 px-3 py-2 rounded-xl text-sm transition-colors ${
                  viewMode === 'table' ? 'bg-[#2979C8] text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                <Table className="w-4 h-4" />
                Table
              </button>
            </div>
            <span className="text-sm text-gray-400">{sensorHistory.length} data points</span>
          </div>

          <button
            onClick={handleExportCSV}
            className="flex items-center gap-2 px-4 py-2 border border-gray-200 rounded-xl text-sm text-gray-700 hover:bg-gray-50 transition-colors"
          >
            <Download className="w-4 h-4" />
            Export CSV
          </button>
        </div>
      </div>

      {/* Chart View */}
      {viewMode === 'chart' && (
        <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
          <div className="flex items-center gap-2 mb-6">
            <Calendar className="w-5 h-5 text-gray-400" />
            <h3 className="text-gray-800">Temperature & Humidity Over Time</h3>
          </div>
          <ResponsiveContainer width="100%" height={450}>
            <AreaChart data={chartData}>
              <defs>
                <linearGradient id="tempGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#2979C8" stopOpacity={0.15} />
                  <stop offset="95%" stopColor="#2979C8" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="humidGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#16A085" stopOpacity={0.15} />
                  <stop offset="95%" stopColor="#16A085" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="time" stroke="#9CA3AF" fontSize={11} tickLine={false} />
              <YAxis yAxisId="left" stroke="#2979C8" fontSize={11} tickLine={false} axisLine={false} />
              <YAxis yAxisId="right" orientation="right" stroke="#16A085" fontSize={11} tickLine={false} axisLine={false} />
              <Tooltip contentStyle={{ backgroundColor: 'white', border: '1px solid #E5E7EB', borderRadius: '12px', fontSize: '12px' }} />
              <Legend wrapperStyle={{ fontSize: '12px' }} />
              <ReferenceLine yAxisId="left" y={settings.warningTemperature} stroke="#E67E22" strokeDasharray="5 5" />
              <ReferenceLine yAxisId="left" y={settings.criticalTemperature} stroke="#C0392B" strokeDasharray="5 5" />
              <Area yAxisId="left" type="monotone" dataKey="temperature" stroke="#2979C8" strokeWidth={2} fill="url(#tempGrad)" name="Temperature (°C)" />
              <Area yAxisId="right" type="monotone" dataKey="humidity" stroke="#16A085" strokeWidth={2} fill="url(#humidGrad)" name="Humidity (%)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Table View */}
      {viewMode === 'table' && (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="overflow-x-auto max-h-[600px] overflow-y-auto">
            <table className="w-full">
              <thead className="bg-gray-50 sticky top-0">
                <tr>
                  <th className="px-5 py-3 text-left text-sm text-gray-600">Timestamp</th>
                  <th className="px-5 py-3 text-left text-sm text-gray-600">Temperature (°C)</th>
                  <th className="px-5 py-3 text-left text-sm text-gray-600">Humidity (%)</th>
                  <th className="px-5 py-3 text-left text-sm text-gray-600">Status</th>
                </tr>
              </thead>
              <tbody>
                {sensorHistory.slice().reverse().map((reading, index) => {
                  const status =
                    reading.temperature >= settings.criticalTemperature ? 'Critical' :
                    reading.temperature >= settings.warningTemperature ? 'Warning' : 'Normal';
                  const statusStyle =
                    status === 'Critical' ? 'text-red-600 bg-red-50' :
                    status === 'Warning' ? 'text-orange-600 bg-orange-50' :
                    'text-green-600 bg-green-50';

                  return (
                    <tr key={index} className="border-t border-gray-50 hover:bg-gray-50 transition-colors">
                      <td className="px-5 py-3 text-sm font-mono text-gray-600">
                        {reading.timestamp.toLocaleString('en-GB')}
                      </td>
                      <td className="px-5 py-3 text-sm" style={{ color: '#2979C8' }}>
                        {reading.temperature.toFixed(2)}
                      </td>
                      <td className="px-5 py-3 text-sm" style={{ color: '#16A085' }}>
                        {reading.humidity.toFixed(2)}
                      </td>
                      <td className="px-5 py-3">
                        <span className={`px-2 py-1 rounded-lg text-xs ${statusStyle}`}>
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
      )}
    </div>
  );
}
