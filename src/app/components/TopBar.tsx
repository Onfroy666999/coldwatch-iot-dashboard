import { useEffect, useState } from 'react';
import { Bell, Snowflake } from 'lucide-react';
import { useApp } from '../context/AppContext';

const pageTitles: Record<string, string> = {
  dashboard: 'Dashboard',
  devices: 'Devices',
  alerts: 'Alerts',
  history: 'History',
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
    <div className="bg-background border-b border-border px-4 md:px-8 py-2 md:py-4 flex items-center justify-between sticky top-0 z-40">
      <div className="flex items-center gap-3">
        <div
          className="md:hidden w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0"
          style={{ backgroundColor: '#1F3864' }}
        >
          <Snowflake className="w-5 h-5 text-white" />
        </div>
        <h1 className="text-base md:text-xl text-foreground font-medium">{title}</h1>
      </div>

      <div className="flex items-center gap-1 md:gap-6">
        {/* Bell — 44×44px tap target */}
        <button
          onClick={() => setActivePage('alerts')}
          className="relative flex items-center justify-center w-11 h-11 rounded-xl active:bg-accent transition-colors"
          aria-label="View alerts"
        >
          <Bell className="w-6 h-6 text-muted-foreground" />
          {unreadAlertCount > 0 && (
            <span
              className="absolute top-1 right-1 w-5 h-5 rounded-full text-white flex items-center justify-center font-medium"
              style={{ fontSize: 10, backgroundColor: '#C0392B' }}
            >
              {unreadAlertCount > 9 ? '9+' : unreadAlertCount}
            </span>
          )}
        </button>

        {/* Date/time — desktop only */}
        <div className="hidden md:block text-right">
          <p className="text-sm text-muted-foreground">
            {currentTime.toLocaleDateString('en-GB', { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' })}
          </p>
          <p className="text-sm text-foreground">
            {currentTime.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
          </p>
        </div>

        {/* Status pill */}
        <div className={`flex items-center gap-1.5 px-3 py-2 rounded-full ${deviceStatus === 'online' ? 'bg-green-500/10' : 'bg-red-500/10'}`}>
          <div className={`w-2 h-2 rounded-full flex-shrink-0 ${deviceStatus === 'online' ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`} />
          <span className={`text-xs font-medium ${deviceStatus === 'online' ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
            {deviceStatus === 'online' ? 'Live' : 'Offline'}
          </span>
        </div>
      </div>
    </div>
  );
}