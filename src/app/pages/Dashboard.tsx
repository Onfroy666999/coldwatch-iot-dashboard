import { useState } from 'react';
import { Thermometer, Droplets, Activity, AlertTriangle, TrendingUp, TrendingDown, Snowflake } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ReferenceLine } from 'recharts';

export default function Dashboard() {
  const { currentTemperature, currentHumidity, systemStatus, targetTemperature, autoMode, alerts, sensorHistory, settings, user, setTargetTemperature, setAutoMode, startCooling, stopCooling, addToast } = useApp();

  const [tempInput, setTempInput]     = useState(targetTemperature);
  const [isApplying, setIsApplying]   = useState(false);
  const [commandSuccess, setCommandSuccess] = useState(false);
  const [timeRange, setTimeRange]     = useState<'1h' | '6h' | '24h' | '7d'>('1h');

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
    if (currentTemperature >= settings.warningTemperature)  return '#E67E22';
    return '#2979C8';
  };

  const getHumidityColor = () => {
    if (currentHumidity >= settings.criticalHumidity) return '#C0392B';
    if (currentHumidity >= settings.warningHumidity)  return '#E67E22';
    return '#16A085';
  };

  const shouldPulseRed    = currentTemperature >= settings.criticalTemperature;
  const shouldPulseOrange = currentTemperature >= settings.warningTemperature && !shouldPulseRed;
  const activeAlerts      = alerts.filter(a => a.status !== 'resolved').length;

  const chartData = sensorHistory.slice(-20).map(r => ({
    time:        r.timestamp.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }),
    temperature: parseFloat(r.temperature.toFixed(1)),
    humidity:    parseFloat(r.humidity.toFixed(1)),
  }));

  const statCards = [
    {
      icon: <Thermometer className="w-5 h-5" style={{ color: getTempColor() }} />,
      iconBg: `${getTempColor()}15`,
      value: `${currentTemperature.toFixed(1)}°C`,
      label: 'Temperature',
      color: getTempColor(),
      pulse: shouldPulseRed ? 'animate-pulse-red' : shouldPulseOrange ? 'animate-pulse-orange' : '',
      bar: Math.min(100, (currentTemperature / settings.criticalTemperature) * 100),
      barMax: `${settings.criticalTemperature}°C`,
      trend: <TrendingDown className="w-3 h-3" />,
    },
    {
      icon: <Droplets className="w-5 h-5" style={{ color: getHumidityColor() }} />,
      iconBg: `${getHumidityColor()}15`,
      value: `${currentHumidity.toFixed(1)}%`,
      label: 'Humidity',
      color: getHumidityColor(),
      pulse: '',
      bar: Math.min(100, currentHumidity),
      barMax: '100%',
      trend: <TrendingUp className="w-3 h-3" />,
    },
  ];

  const systemColor = systemStatus === 'cooling' ? '#2979C8' : systemStatus === 'override' ? '#E67E22' : 'var(--muted-foreground)';
  const systemLabel = systemStatus === 'cooling' ? 'Cooling Active' : systemStatus === 'override' ? 'Override' : 'System Idle';

  return (
    <div className="space-y-5">

      {/* Welcome Banner — intentionally stays navy in dark mode, it's a brand element */}
      <div className="rounded-2xl p-4 md:p-6 text-white relative overflow-hidden" style={{ background: 'linear-gradient(135deg, #1F3864 0%, #2979C8 100%)' }}>
        <div className="absolute top-0 right-0 w-40 h-40 md:w-64 md:h-64 opacity-10 pointer-events-none">
          <Snowflake className="w-full h-full" />
        </div>
        <div className="relative z-10">
          <h2 className="text-lg md:text-xl mb-1 font-medium">
            Good {new Date().getHours() < 12 ? 'Morning' : new Date().getHours() < 17 ? 'Afternoon' : 'Evening'}, {user.name.split(' ')[0]}!
          </h2>
          <p className="text-blue-100 text-sm leading-relaxed">
            {activeAlerts > 0 ? `${activeAlerts} active alert${activeAlerts > 1 ? 's' : ''} need your attention.` : 'Your cold storage systems are running smoothly.'}
          </p>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-5">
        {statCards.map((card, i) => (
          <div key={i} className={`bg-card rounded-2xl p-4 md:p-5 shadow-sm border border-border transition-all ${card.pulse}`}>
            <div className="flex items-start justify-between mb-3">
              <div className="w-11 h-11 rounded-xl flex items-center justify-center" style={{ backgroundColor: card.iconBg }}>
                {card.icon}
              </div>
              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                {card.trend}
                <span>Live</span>
              </div>
            </div>
            <p className="text-3xl font-semibold" style={{ color: card.color }}>{card.value}</p>
            <p className="text-sm text-muted-foreground mt-1">{card.label}</p>
            <div className="mt-3 flex items-center gap-2">
              <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
                <div className="h-full rounded-full transition-all duration-500" style={{ width: `${card.bar}%`, backgroundColor: card.color }} />
              </div>
              <span className="text-xs text-muted-foreground">{card.barMax}</span>
            </div>
          </div>
        ))}

        {/* System Status */}
        <div className="bg-card rounded-2xl p-4 md:p-5 shadow-sm border border-border">
          <div className="flex items-start justify-between mb-3">
            <div className="w-11 h-11 rounded-xl flex items-center justify-center" style={{ backgroundColor: `${systemColor}15` }}>
              <Activity className="w-5 h-5" style={{ color: systemColor }} />
            </div>
            <span className="px-2 py-1 rounded-full text-xs text-white font-medium" style={{ backgroundColor: systemColor }}>
              {systemStatus}
            </span>
          </div>
          <p className="text-base md:text-xl font-semibold" style={{ color: systemColor }}>{systemLabel}</p>
          <p className="text-sm text-muted-foreground mt-1">Peltier Module</p>
        </div>

        {/* Alerts */}
        <div className="bg-card rounded-2xl p-4 md:p-5 shadow-sm border border-border">
          <div className="flex items-start justify-between mb-3">
            <div className="w-11 h-11 rounded-xl flex items-center justify-center" style={{ backgroundColor: activeAlerts > 0 ? 'rgba(192,57,43,0.1)' : 'rgba(39,174,96,0.1)' }}>
              <AlertTriangle className="w-5 h-5" style={{ color: activeAlerts > 0 ? '#C0392B' : '#27AE60' }} />
            </div>
          </div>
          <p className="text-3xl font-semibold" style={{ color: activeAlerts > 0 ? '#C0392B' : '#27AE60' }}>{activeAlerts}</p>
          <p className="text-sm text-muted-foreground mt-1">Active Alerts</p>
          {activeAlerts > 0 && <p className="text-xs mt-2 px-2 py-1 rounded-lg bg-red-500/10 text-red-500 inline-block font-medium">Needs attention</p>}
        </div>
      </div>

      {/* Chart + Control Panel */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 md:gap-6">

        {/* Chart */}
        <div className="lg:col-span-2 bg-card rounded-2xl p-4 md:p-6 shadow-sm border border-border">
          <div className="flex items-center justify-between mb-5">
            <h3 className="text-foreground text-sm md:text-base font-medium">Live Sensor Data</h3>
            <div className="flex gap-1.5">
              {(['1h', '6h', '24h', '7d'] as const).map(range => (
                <button
                  key={range}
                  onClick={() => setTimeRange(range)}
                  className={`px-3 py-2 rounded-xl text-xs font-medium transition-colors active:scale-95 ${timeRange === range ? 'bg-[#2979C8] text-white' : 'bg-muted text-muted-foreground'}`}
                  style={{ minHeight: 36, minWidth: 36 }}
                >
                  {range}
                </button>
              ))}
            </div>
          </div>
          <ResponsiveContainer width="100%" height={240}>
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="time" stroke="var(--muted-foreground)" fontSize={11} tickLine={false} />
              <YAxis yAxisId="left"  stroke="#2979C8" fontSize={11} tickLine={false} axisLine={false} />
              <YAxis yAxisId="right" orientation="right" stroke="#16A085" fontSize={11} tickLine={false} axisLine={false} />
              <Tooltip contentStyle={{ backgroundColor: 'var(--card)', border: '1px solid var(--border)', borderRadius: 12, fontSize: 12, color: 'var(--foreground)' }} />
              <Legend wrapperStyle={{ fontSize: 12, color: 'var(--muted-foreground)' }} />
              <ReferenceLine yAxisId="left" y={settings.warningTemperature}  stroke="#E67E22" strokeDasharray="5 5" label={{ value: 'Warning',  position: 'right', fontSize: 10, fill: '#E67E22' }} />
              <ReferenceLine yAxisId="left" y={settings.criticalTemperature} stroke="#C0392B" strokeDasharray="5 5" label={{ value: 'Critical', position: 'right', fontSize: 10, fill: '#C0392B' }} />
              <Line yAxisId="left"  type="monotone" dataKey="temperature" stroke="#2979C8" strokeWidth={2} dot={false} name="Temperature (°C)" />
              <Line yAxisId="right" type="monotone" dataKey="humidity"    stroke="#16A085" strokeWidth={2} dot={false} name="Humidity (%)" />
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* Control Panel */}
        <div className="bg-card rounded-2xl p-4 md:p-6 shadow-sm border border-border">
          <h3 className="text-foreground font-medium mb-5">Control Panel</h3>

          <div className="space-y-5">
            <div>
              <label className="text-sm text-muted-foreground mb-3 block">Target Temperature</label>
              <div className="flex items-center gap-3 mb-3">
                <button onClick={() => setTempInput(p => Math.max(0, p - 1))} className="rounded-2xl border-2 border-border flex items-center justify-center active:bg-muted transition-colors text-xl font-light text-foreground" style={{ minWidth: 52, minHeight: 52 }}>−</button>
                <div className="flex-1 text-center">
                  <span className="text-4xl font-semibold" style={{ color: '#2979C8' }}>{tempInput}</span>
                  <span className="text-xl text-muted-foreground">°C</span>
                </div>
                <button onClick={() => setTempInput(p => Math.min(30, p + 1))} className="rounded-2xl border-2 border-border flex items-center justify-center active:bg-muted transition-colors text-xl font-light text-foreground" style={{ minWidth: 52, minHeight: 52 }}>+</button>
              </div>
              <p className="text-xs text-muted-foreground text-center mb-4">Current target: {targetTemperature}°C</p>
              <button
                onClick={handleApplyTarget}
                disabled={isApplying || tempInput === targetTemperature}
                className="w-full py-3.5 rounded-2xl text-white text-sm font-medium transition-all disabled:opacity-50 active:scale-[0.98]"
                style={{ backgroundColor: commandSuccess ? '#27AE60' : '#2979C8' }}
              >
                {isApplying ? (
                  <span className="flex items-center justify-center gap-2">
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    Sending...
                  </span>
                ) : commandSuccess ? '✓ Command Sent' : 'Apply'}
              </button>
            </div>

            <div className="pt-4 border-t border-border">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <p className="text-sm text-foreground font-medium">Auto Mode</p>
                  <p className="text-xs text-muted-foreground mt-0.5">Automatic temperature control</p>
                </div>
                <button
                  onClick={() => setAutoMode(!autoMode)}
                  className={`w-14 h-8 rounded-full transition-colors relative flex-shrink-0 ${autoMode ? 'bg-[#2979C8]' : 'bg-muted'}`}
                  aria-label="Toggle auto mode"
                >
                  <div className={`w-6 h-6 bg-white rounded-full shadow-md absolute top-1 transition-transform duration-200 ${autoMode ? 'translate-x-7' : 'translate-x-1'}`} />
                </button>
              </div>
              {!autoMode && (
                <div className="space-y-2.5">
                  <button onClick={startCooling} disabled={systemStatus === 'cooling'} className="w-full py-3.5 rounded-2xl text-white text-sm font-medium disabled:opacity-50 active:scale-[0.98] transition-all" style={{ backgroundColor: '#2979C8' }}>Start Cooling</button>
                  <button onClick={stopCooling}  disabled={systemStatus !== 'cooling'} className="w-full py-3.5 rounded-2xl border-2 border-border text-foreground text-sm font-medium disabled:opacity-50 active:bg-muted transition-all">Stop Cooling</button>
                  <p className="text-xs text-muted-foreground italic text-center">Manual mode overrides automatic control.</p>
                </div>
              )}
            </div>

            <div className="pt-4 border-t border-border">
              <p className="text-xs text-muted-foreground">Last command: <span className="text-foreground">Just now by {user.name}</span></p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}