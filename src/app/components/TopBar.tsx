import { useEffect, useState } from 'react';
import { Bell } from 'lucide-react';
import { useApp } from '../context/AppContext';

const pageTitles: Record<string, string> = {
  dashboard: 'Dashboard',
  devices: 'Devices',
  alerts: 'Alerts & Notifications',
  history: 'Historical Data',
  settings: 'Settings',
};

export default function TopBar() {
  const { unreadAlertCount, deviceStatus, activePage, setActivePage } = useApp();
  const [currentTime, setCurrentTime] = useState(new Date());

  useEffect(() => {
    const interval = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(interval);
  }, []);

  const title = pageTitles[activePage] || 'Dashboard';

  return (
    <div className="bg-white border-b border-gray-200 px-8 py-4 flex items-center justify-between">
      <h1 className="text-xl text-gray-800">{title}</h1>

      <div className="flex items-center gap-6">
        {/* Notification Bell */}
        <button
          onClick={() => setActivePage('alerts')}
          className="relative p-2 hover:bg-gray-100 rounded-lg transition-colors"
        >
          <Bell className="w-5 h-5 text-gray-600" />
          {unreadAlertCount > 0 && (
            <span
              className="absolute -top-1 -right-1 w-5 h-5 rounded-full text-white text-xs flex items-center justify-center"
              style={{ backgroundColor: '#C0392B' }}
            >
              {unreadAlertCount > 9 ? '9+' : unreadAlertCount}
            </span>
          )}
        </button>

        {/* Date and Time */}
        <div className="text-right">
          <p className="text-sm text-gray-500">
            {currentTime.toLocaleDateString('en-GB', { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' })}
          </p>
          <p className="text-sm text-gray-800">
            {currentTime.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
          </p>
        </div>

        {/* Device Status */}
        <div className={`flex items-center gap-2 px-4 py-2 rounded-full ${deviceStatus === 'online' ? 'bg-green-50' : 'bg-red-50'}`}>
          <div className={`w-2.5 h-2.5 rounded-full ${deviceStatus === 'online' ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`} />
          <span className={`text-sm ${deviceStatus === 'online' ? 'text-green-700' : 'text-red-700'}`}>
            {deviceStatus === 'online' ? 'Online' : 'Offline'}
          </span>
        </div>
      </div>
    </div>
  );
}
