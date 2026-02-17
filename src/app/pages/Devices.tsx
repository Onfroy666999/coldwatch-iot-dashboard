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
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl text-gray-800">Connected Devices</h2>
          <p className="text-gray-500 text-sm mt-1">Manage your ColdWatch ESP32 monitoring modules</p>
        </div>
        <button
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-white text-sm hover:opacity-90 transition-all"
          style={{ backgroundColor: '#2979C8' }}
        >
          <Plus className="w-4 h-4" />
          Add Device
        </button>
      </div>

      {/* Devices Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
        {devices.map(device => (
          <div key={device.id} className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100 hover:shadow-md transition-all">
            {/* Header */}
            <div className="flex items-start justify-between mb-5">
              <div className="flex items-center gap-3">
                <div
                  className="w-12 h-12 rounded-xl flex items-center justify-center"
                  style={{ backgroundColor: device.status === 'online' ? 'rgba(41,121,200,0.1)' : 'rgba(192,57,43,0.08)' }}
                >
                  <Cpu className="w-6 h-6" style={{ color: device.status === 'online' ? '#2979C8' : '#C0392B' }} />
                </div>
                <div>
                  <h3 className="text-gray-800">{device.name}</h3>
                  <div className="flex items-center gap-1.5 text-sm text-gray-500 mt-0.5">
                    <MapPin className="w-3.5 h-3.5" />
                    {device.location}
                  </div>
                </div>
              </div>
              <span
                className="px-2.5 py-1 rounded-full text-xs text-white uppercase"
                style={{ backgroundColor: device.status === 'online' ? '#27AE60' : '#C0392B' }}
              >
                {device.status}
              </span>
            </div>

            {/* Info Rows */}
            <div className="space-y-3 mb-5">
              <div className="flex items-center justify-between py-2 border-b border-gray-50">
                <div className="flex items-center gap-2 text-sm text-gray-500">
                  {device.status === 'online' ? <Wifi className="w-4 h-4" /> : <WifiOff className="w-4 h-4" />}
                  <span>Connection</span>
                </div>
                <span className="text-sm text-gray-800">
                  {device.status === 'online' ? 'Connected' : 'Disconnected'}
                </span>
              </div>

              <div className="flex items-center justify-between py-2 border-b border-gray-50">
                <div className="flex items-center gap-2 text-sm text-gray-500">
                  <Info className="w-4 h-4" />
                  <span>Last Seen</span>
                </div>
                <span className="text-sm text-gray-800">
                  {device.lastSeen.toLocaleString('en-GB', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>

              <div className="flex items-center justify-between py-2 border-b border-gray-50">
                <div className="flex items-center gap-2 text-sm text-gray-500">
                  <Signal className="w-4 h-4" />
                  <span>Firmware</span>
                </div>
                <span className="text-sm text-gray-800 font-mono">v{device.firmwareVersion}</span>
              </div>

              <div className="flex items-center justify-between py-2">
                <div className="flex items-center gap-2 text-sm text-gray-500">
                  <Battery className="w-4 h-4" />
                  <span>Battery</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-24 h-2 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all"
                      style={{ width: `${device.batteryLevel}%`, backgroundColor: getBatteryColor(device.batteryLevel) }}
                    />
                  </div>
                  <span className="text-sm text-gray-800">{device.batteryLevel}%</span>
                </div>
              </div>
            </div>

            {/* Actions */}
            <div className="flex gap-2">
              <button
                onClick={() => setActivePage('dashboard')}
                className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-white text-sm hover:opacity-90 transition-all"
                style={{ backgroundColor: '#2979C8' }}
              >
                View Dashboard
                <ChevronRight className="w-4 h-4" />
              </button>
              <button className="flex-1 py-2.5 border border-gray-200 rounded-xl text-gray-700 text-sm hover:bg-gray-50 transition-all">
                Configure
              </button>
            </div>
          </div>
        ))}

        {/* Add Device Card */}
        <div className="bg-white rounded-2xl p-6 shadow-sm border-2 border-dashed border-gray-200 hover:border-[#2979C8] transition-colors cursor-pointer flex flex-col items-center justify-center min-h-[320px]">
          <div className="w-16 h-16 rounded-full flex items-center justify-center mb-4" style={{ backgroundColor: 'rgba(41,121,200,0.1)' }}>
            <Plus className="w-8 h-8" style={{ color: '#2979C8' }} />
          </div>
          <h3 className="text-gray-800 mb-2">Add New Device</h3>
          <p className="text-gray-500 text-sm text-center max-w-xs mb-4">
            Connect additional storage units with ESP32 controllers and DHT22 sensors.
          </p>
          <button
            className="px-6 py-2.5 rounded-xl text-white text-sm hover:opacity-90 transition-all"
            style={{ backgroundColor: '#2979C8' }}
          >
            Get Started
          </button>
        </div>
      </div>
    </div>
  );
}
