import { useApp } from '../context/AppContext';
import { Cpu, MapPin, Wifi, WifiOff, Battery, Info, Plus, ChevronRight, Signal } from 'lucide-react';

export default function Devices() {
  const { devices, setActivePage } = useApp();

  const getBatteryColor = (level: number) => {
    if (level > 50) return '#27AE60';
    if (level > 20) return '#E67E22';
    return '#C0392B';
  };

  return (
    <div className="space-y-5">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl text-foreground font-semibold">Connected Devices</h2>
          <p className="text-muted-foreground text-sm mt-1">Manage your ColdWatch ESP32 monitoring modules</p>
        </div>
        <button className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-white text-sm font-medium active:scale-95 transition-all" style={{ backgroundColor: '#2979C8' }}>
          <Plus className="w-4 h-4" />
          Add Device
        </button>
      </div>

      {/* Devices Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
        {devices.map(device => (
          <div key={device.id} className="bg-card rounded-2xl p-5 md:p-6 shadow-sm border border-border transition-all">

            {/* Card Header */}
            <div className="flex items-start justify-between mb-5">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-xl flex items-center justify-center" style={{ backgroundColor: device.status === 'online' ? 'rgba(41,121,200,0.1)' : 'rgba(192,57,43,0.08)' }}>
                  <Cpu className="w-6 h-6" style={{ color: device.status === 'online' ? '#2979C8' : '#C0392B' }} />
                </div>
                <div>
                  <h3 className="text-foreground font-semibold text-sm">{device.name}</h3>
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground mt-0.5">
                    <MapPin className="w-3 h-3" />
                    {device.location}
                  </div>
                </div>
              </div>
              <span className="px-2.5 py-1 rounded-full text-xs text-white uppercase font-medium" style={{ backgroundColor: device.status === 'online' ? '#27AE60' : '#C0392B' }}>
                {device.status}
              </span>
            </div>

            {/* Info Rows */}
            <div className="space-y-0 mb-5">
              {[
                {
                  icon: device.status === 'online' ? <Wifi className="w-4 h-4" /> : <WifiOff className="w-4 h-4" />,
                  label: 'Connection',
                  value: device.status === 'online' ? 'Connected' : 'Disconnected',
                },
                {
                  icon: <Info className="w-4 h-4" />,
                  label: 'Last Seen',
                  value: device.lastSeen.toLocaleString('en-GB', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }),
                },
                {
                  icon: <Signal className="w-4 h-4" />,
                  label: 'Firmware',
                  value: `v${device.firmwareVersion}`,
                  mono: true,
                },
              ].map((row, i) => (
                <div key={i} className="flex items-center justify-between py-2.5 border-b border-border">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    {row.icon}
                    <span>{row.label}</span>
                  </div>
                  <span className={`text-sm text-foreground ${row.mono ? 'font-mono' : ''}`}>{row.value}</span>
                </div>
              ))}

              {/* Battery row */}
              <div className="flex items-center justify-between py-2.5">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Battery className="w-4 h-4" />
                  <span>Battery</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-20 h-2 bg-muted rounded-full overflow-hidden">
                    <div className="h-full rounded-full transition-all" style={{ width: `${device.batteryLevel}%`, backgroundColor: getBatteryColor(device.batteryLevel) }} />
                  </div>
                  <span className="text-sm text-foreground font-medium">{device.batteryLevel}%</span>
                </div>
              </div>
            </div>

            {/* Actions */}
            <div className="flex gap-2">
              <button onClick={() => setActivePage('dashboard')} className="flex-1 flex items-center justify-center gap-2 py-3 rounded-2xl text-white text-sm font-medium active:scale-95 transition-all" style={{ backgroundColor: '#2979C8' }}>
                View Dashboard
                <ChevronRight className="w-4 h-4" />
              </button>
              <button className="flex-1 py-3 border-2 border-border rounded-2xl text-foreground text-sm font-medium active:bg-muted transition-all">
                Configure
              </button>
            </div>
          </div>
        ))}

        {/* Add Device Card */}
        <div className="bg-card rounded-2xl p-6 shadow-sm border-2 border-dashed border-border hover:border-[#2979C8] transition-colors cursor-pointer flex flex-col items-center justify-center min-h-[300px]">
          <div className="w-16 h-16 rounded-full flex items-center justify-center mb-4" style={{ backgroundColor: 'rgba(41,121,200,0.1)' }}>
            <Plus className="w-8 h-8" style={{ color: '#2979C8' }} />
          </div>
          <h3 className="text-foreground font-semibold mb-2">Add New Device</h3>
          <p className="text-muted-foreground text-sm text-center max-w-xs mb-5">
            Connect additional storage units with ESP32 controllers and DHT22 sensors.
          </p>
          <button className="px-6 py-2.5 rounded-xl text-white text-sm font-medium active:scale-95" style={{ backgroundColor: '#2979C8' }}>
            Get Started
          </button>
        </div>
      </div>
    </div>
  );
}