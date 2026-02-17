import { useState, useEffect } from 'react';
import { Thermometer, Droplets, Activity, AlertTriangle, TrendingUp, TrendingDown, Snowflake } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ReferenceLine } from 'recharts';

export default function Dashboard() {
  const {
    currentTemperature,
    currentHumidity,
    systemStatus,
    targetTemperature,
    autoMode,
    alerts,
    sensorHistory,
    settings,
    user,
    setTargetTemperature,
    setAutoMode,
    startCooling,
    stopCooling,
    addToast,
  } = useApp();

  const [tempInput, setTempInput] = useState(targetTemperature);
  const [isApplying, setIsApplying] = useState(false);
  const [commandSuccess, setCommandSuccess] = useState(false);
  const [timeRange, setTimeRange] = useState<'1h' | '6h' | '24h' | '7d'>('1h');

  const handleApplyTarget = () => {
    setIsApplying(true);
    setTimeout(() => {
      setTargetTemperature(tempInput);
      setIsApplying(false);
      setCommandSuccess(true);
      addToast({ id: `toast-${Date.now()}`, type: 'success', message: `Target temperature set to ${tempInput}°C` });
      setTimeout(() => setCommandSuccess(false), 2000);
    }, 1500);
  };

  const getTempColor = () => {
    if (currentTemperature >= settings.criticalTemperature) return '#C0392B';
    if (currentTemperature >= settings.warningTemperature) return '#E67E22';
    return '#2979C8';
  };

  const getHumidityColor = () => {
    if (currentHumidity >= settings.criticalHumidity) return '#C0392B';
    if (currentHumidity >= settings.warningHumidity) return '#E67E22';
    return '#16A085';
  };

  const shouldPulse = currentTemperature >= settings.criticalTemperature;
  const activeAlerts = alerts.filter(a => a.status !== 'resolved').length;

  const chartData = sensorHistory.slice(-20).map(reading => ({
    time: reading.timestamp.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }),
    temperature: parseFloat(reading.temperature.toFixed(1)),
    humidity: parseFloat(reading.humidity.toFixed(1)),
  }));

  return (
    <div className="space-y-6">
      {/* Welcome Banner */}
      <div className="rounded-2xl p-6 text-white relative overflow-hidden" style={{ background: 'linear-gradient(135deg, #1F3864 0%, #2979C8 100%)' }}>
        <div className="absolute top-0 right-0 w-64 h-64 opacity-10">
          <Snowflake className="w-full h-full" />
        </div>
        <div className="relative z-10">
          <h2 className="text-xl mb-1">Good {new Date().getHours() < 12 ? 'Morning' : new Date().getHours() < 17 ? 'Afternoon' : 'Evening'}, {user.name.split(' ')[0]}!</h2>
          <p className="text-blue-100 text-sm">Your cold storage systems are running smoothly. {activeAlerts > 0 ? `${activeAlerts} active alert${activeAlerts > 1 ? 's' : ''} need attention.` : 'No alerts at this time.'}</p>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
        {/* Temperature Card */}
        <div
          className={`bg-white rounded-2xl p-5 shadow-sm border border-gray-100 transition-all ${shouldPulse ? 'animate-pulse-red' : ''}`}
        >
          <div className="flex items-start justify-between mb-3">
            <div className="w-11 h-11 rounded-xl flex items-center justify-center" style={{ backgroundColor: `${getTempColor()}15` }}>
              <Thermometer className="w-5 h-5" style={{ color: getTempColor() }} />
            </div>
            <div className="flex items-center gap-1 text-xs text-gray-400">
              <TrendingDown className="w-3 h-3" />
              <span>Live</span>
            </div>
          </div>
          <p className="text-3xl" style={{ color: getTempColor() }}>{currentTemperature.toFixed(1)}°C</p>
          <p className="text-sm text-gray-500 mt-1">Current Temperature</p>
          <div className="mt-3 flex items-center gap-2">
            <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{
                  width: `${Math.min(100, (currentTemperature / settings.criticalTemperature) * 100)}%`,
                  backgroundColor: getTempColor(),
                }}
              />
            </div>
            <span className="text-xs text-gray-400">{settings.criticalTemperature}°C</span>
          </div>
        </div>

        {/* Humidity Card */}
        <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
          <div className="flex items-start justify-between mb-3">
            <div className="w-11 h-11 rounded-xl flex items-center justify-center" style={{ backgroundColor: `${getHumidityColor()}15` }}>
              <Droplets className="w-5 h-5" style={{ color: getHumidityColor() }} />
            </div>
            <div className="flex items-center gap-1 text-xs text-gray-400">
              <TrendingUp className="w-3 h-3" />
              <span>Live</span>
            </div>
          </div>
          <p className="text-3xl" style={{ color: getHumidityColor() }}>{currentHumidity.toFixed(1)}%</p>
          <p className="text-sm text-gray-500 mt-1">Current Humidity</p>
          <div className="mt-3 flex items-center gap-2">
            <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{
                  width: `${Math.min(100, (currentHumidity / 100) * 100)}%`,
                  backgroundColor: getHumidityColor(),
                }}
              />
            </div>
            <span className="text-xs text-gray-400">100%</span>
          </div>
        </div>

        {/* System Status Card */}
        <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
          <div className="flex items-start justify-between mb-3">
            <div
              className="w-11 h-11 rounded-xl flex items-center justify-center"
              style={{
                backgroundColor: systemStatus === 'cooling' ? 'rgba(41,121,200,0.1)' : systemStatus === 'override' ? 'rgba(230,126,34,0.1)' : 'rgba(156,163,175,0.1)',
              }}
            >
              <Activity
                className="w-5 h-5"
                style={{ color: systemStatus === 'cooling' ? '#2979C8' : systemStatus === 'override' ? '#E67E22' : '#9CA3AF' }}
              />
            </div>
            <span
              className="px-2 py-0.5 rounded-full text-xs text-white"
              style={{ backgroundColor: systemStatus === 'cooling' ? '#2979C8' : systemStatus === 'override' ? '#E67E22' : '#9CA3AF' }}
            >
              {systemStatus}
            </span>
          </div>
          <p className="text-xl" style={{ color: systemStatus === 'cooling' ? '#2979C8' : systemStatus === 'override' ? '#E67E22' : '#9CA3AF' }}>
            {systemStatus === 'cooling' ? 'Cooling Active' : systemStatus === 'override' ? 'Override' : 'System Idle'}
          </p>
          <p className="text-sm text-gray-500 mt-1">Peltier Module Status</p>
        </div>

        {/* Active Alerts Card */}
        <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
          <div className="flex items-start justify-between mb-3">
            <div
              className="w-11 h-11 rounded-xl flex items-center justify-center"
              style={{ backgroundColor: activeAlerts > 0 ? 'rgba(192,57,43,0.1)' : 'rgba(39,174,96,0.1)' }}
            >
              <AlertTriangle className="w-5 h-5" style={{ color: activeAlerts > 0 ? '#C0392B' : '#27AE60' }} />
            </div>
          </div>
          <p className="text-3xl" style={{ color: activeAlerts > 0 ? '#C0392B' : '#27AE60' }}>{activeAlerts}</p>
          <p className="text-sm text-gray-500 mt-1">Active Alerts</p>
          {activeAlerts > 0 && (
            <p className="text-xs mt-2 px-2 py-1 rounded-lg bg-red-50 text-red-600 inline-block">Needs attention</p>
          )}
        </div>
      </div>

      {/* Chart and Control Panel */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Live Chart */}
        <div className="lg:col-span-2 bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-gray-800">Live Temperature & Humidity</h3>
            <div className="flex gap-1.5">
              {(['1h', '6h', '24h', '7d'] as const).map(range => (
                <button
                  key={range}
                  onClick={() => setTimeRange(range)}
                  className={`px-3 py-1.5 rounded-lg text-xs transition-colors ${
                    timeRange === range ? 'bg-[#2979C8] text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                  }`}
                >
                  {range}
                </button>
              ))}
            </div>
          </div>
          <ResponsiveContainer width="100%" height={320}>
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="time" stroke="#9CA3AF" fontSize={11} tickLine={false} />
              <YAxis yAxisId="left" stroke="#2979C8" fontSize={11} tickLine={false} axisLine={false} />
              <YAxis yAxisId="right" orientation="right" stroke="#16A085" fontSize={11} tickLine={false} axisLine={false} />
              <Tooltip
                contentStyle={{ backgroundColor: 'white', border: '1px solid #E5E7EB', borderRadius: '12px', fontSize: '12px' }}
              />
              <Legend wrapperStyle={{ fontSize: '12px' }} />
              <ReferenceLine yAxisId="left" y={settings.warningTemperature} stroke="#E67E22" strokeDasharray="5 5" label={{ value: 'Warning', position: 'right', fontSize: 10, fill: '#E67E22' }} />
              <ReferenceLine yAxisId="left" y={settings.criticalTemperature} stroke="#C0392B" strokeDasharray="5 5" label={{ value: 'Critical', position: 'right', fontSize: 10, fill: '#C0392B' }} />
              <Line yAxisId="left" type="monotone" dataKey="temperature" stroke="#2979C8" strokeWidth={2} dot={false} name="Temperature (°C)" />
              <Line yAxisId="right" type="monotone" dataKey="humidity" stroke="#16A085" strokeWidth={2} dot={false} name="Humidity (%)" />
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* Control Panel */}
        <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
          <h3 className="text-gray-800 mb-5">Control Panel</h3>

          <div className="space-y-5">
            {/* Target Temperature */}
            <div>
              <label className="text-sm text-gray-600 mb-2 block">Target Temperature</label>
              <div className="flex items-center gap-3 mb-2">
                <button
                  onClick={() => setTempInput(prev => Math.max(0, prev - 1))}
                  className="w-10 h-10 rounded-xl border border-gray-200 flex items-center justify-center hover:bg-gray-50 transition-colors text-lg"
                >
                  −
                </button>
                <div className="flex-1 text-center">
                  <span className="text-3xl" style={{ color: '#2979C8' }}>{tempInput}</span>
                  <span className="text-lg text-gray-400">°C</span>
                </div>
                <button
                  onClick={() => setTempInput(prev => Math.min(30, prev + 1))}
                  className="w-10 h-10 rounded-xl border border-gray-200 flex items-center justify-center hover:bg-gray-50 transition-colors text-lg"
                >
                  +
                </button>
              </div>
              <p className="text-xs text-gray-400 text-center mb-3">Current target: {targetTemperature}°C</p>
              <button
                onClick={handleApplyTarget}
                disabled={isApplying || tempInput === targetTemperature}
                className="w-full py-2.5 rounded-xl text-white text-sm transition-all disabled:opacity-50 hover:opacity-90"
                style={{ backgroundColor: commandSuccess ? '#27AE60' : '#2979C8' }}
              >
                {isApplying ? (
                  <span className="flex items-center justify-center gap-2">
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    Sending...
                  </span>
                ) : commandSuccess ? (
                  '✓ Command Sent'
                ) : (
                  'Apply'
                )}
              </button>
            </div>

            {/* Auto/Manual Toggle */}
            <div className="pt-4 border-t border-gray-100">
              <div className="flex items-center justify-between mb-4">
                <span className="text-sm text-gray-700">Auto Mode</span>
                <button
                  onClick={() => setAutoMode(!autoMode)}
                  className={`w-11 h-6 rounded-full transition-colors relative ${autoMode ? 'bg-[#2979C8]' : 'bg-gray-300'}`}
                >
                  <div className={`w-5 h-5 bg-white rounded-full shadow-sm absolute top-0.5 transition-transform ${autoMode ? 'translate-x-5.5' : 'translate-x-0.5'}`} />
                </button>
              </div>
              {!autoMode && (
                <div className="space-y-2">
                  <button
                    onClick={startCooling}
                    disabled={systemStatus === 'cooling'}
                    className="w-full py-2.5 rounded-xl text-white text-sm disabled:opacity-50 hover:opacity-90 transition-all"
                    style={{ backgroundColor: '#2979C8' }}
                  >
                    Start Cooling
                  </button>
                  <button
                    onClick={stopCooling}
                    disabled={systemStatus !== 'cooling'}
                    className="w-full py-2.5 rounded-xl border border-gray-200 text-gray-700 text-sm disabled:opacity-50 hover:bg-gray-50 transition-all"
                  >
                    Stop Cooling
                  </button>
                  <p className="text-xs text-gray-400 italic">Manual mode overrides automatic control.</p>
                </div>
              )}
            </div>

            {/* Last Command */}
            <div className="pt-4 border-t border-gray-100">
              <p className="text-xs text-gray-400">
                Last command: <span className="text-gray-600">Just now by {user.name}</span>
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
