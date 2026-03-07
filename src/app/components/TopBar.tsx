import { useEffect, useState } from 'react';
import { Bell, Snowflake } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useApp } from '../context/AppContext';
import ProfileSheet from './ProfileSheet';

const pageTitles: Record<string, string> = {
  dashboard: 'Dashboard', devices: 'Devices',
  alerts: 'Alerts', history: 'History', settings: 'Settings',
};

export default function TopBar() {
  const { unreadAlertCount, deviceStatus, activePage, setActivePage, user } = useApp();
  const [currentTime, setCurrentTime] = useState(new Date());
  const [showProfile, setShowProfile] = useState(false);
  const [bellAnimKey, setBellAnimKey] = useState(0);

  useEffect(() => {
    const t = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (unreadAlertCount > 0) setBellAnimKey(k => k + 1);
  }, [unreadAlertCount]);

  const title  = pageTitles[activePage] || 'Dashboard';
  const isLive = deviceStatus === 'online';

  return (
    <>
      <header className="sticky top-0 z-40 flex items-center justify-between px-4 md:px-6"
        style={{ backgroundColor: '#FFFFFF', borderBottom: '1px solid #E4E7EC', height: 56, boxShadow: '0 1px 6px rgba(0,0,0,0.04)' }}>
        <div className="flex items-center gap-2.5">
          <div className="md:hidden w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0" style={{ backgroundColor: '#0984E3' }}>
            <Snowflake className="w-4 h-4 text-white" />
          </div>
          <h1 className="text-base font-semibold" style={{ color: '#111827' }}>{title}</h1>
        </div>

        <div className="flex items-center gap-1.5 md:gap-3">
          <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-full"
            style={{ backgroundColor: isLive ? 'rgba(22,163,74,0.08)' : 'rgba(220,38,38,0.08)', border: `1px solid ${isLive ? 'rgba(22,163,74,0.2)' : 'rgba(220,38,38,0.2)'}` }}>
            <span className="w-1.5 h-1.5 rounded-full flex-shrink-0"
              style={{ backgroundColor: isLive ? '#16A34A' : '#DC2626', animation: isLive ? 'pulse 2s infinite' : 'none' }} />
            <span className="text-xs font-semibold" style={{ color: isLive ? '#16A34A' : '#DC2626' }}>
              {isLive ? 'Live' : 'Offline'}
            </span>
          </div>

          <div className="hidden md:block text-right mr-1">
            <p className="text-xs font-medium" style={{ color: '#374151' }}>
              {currentTime.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })}
            </p>
            <p className="text-xs tabular-nums" style={{ color: '#9CA3AF' }}>
              {currentTime.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
            </p>
          </div>

          <button onClick={() => setActivePage('alerts')}
            className="relative w-9 h-9 rounded-xl flex items-center justify-center transition-colors active:bg-gray-100"
            aria-label="View alerts">
            <motion.div key={bellAnimKey}
              animate={unreadAlertCount > 0 ? { rotate: [0, -15, 15, -10, 10, -6, 6, 0] } : { rotate: 0 }}
              transition={{ duration: 0.5 }}>
              <Bell className="w-5 h-5" style={{ color: unreadAlertCount > 0 ? '#DC2626' : '#6B7280' }} />
            </motion.div>
            {unreadAlertCount > 0 && (
              <span className="absolute top-1 right-1 min-w-[16px] h-4 rounded-full text-white flex items-center justify-center font-bold"
                style={{ fontSize: 9, backgroundColor: '#DC2626', paddingLeft: 3, paddingRight: 3, boxShadow: '0 0 0 2px #FFFFFF' }}>
                {unreadAlertCount > 9 ? '9+' : unreadAlertCount}
              </span>
            )}
          </button>

          {activePage !== 'settings' && (
            <button onClick={() => setShowProfile(true)}
              className="w-8 h-8 rounded-full overflow-hidden flex items-center justify-center text-white text-xs font-bold flex-shrink-0 active:opacity-80 transition-opacity"
              style={{ backgroundColor: '#0984E3', boxShadow: '0 0 0 2px #FFFFFF, 0 0 0 3.5px #0984E3' }}
              aria-label="View profile">
              {user.profilePicture
                ? <img src={user.profilePicture} alt="Profile" className="w-full h-full object-cover" />
                : <span>{user.avatar}</span>}
            </button>
          )}
        </div>
      </header>
      <AnimatePresence>
        {showProfile && <ProfileSheet key="profile-sheet" onClose={() => setShowProfile(false)} />}
      </AnimatePresence>
    </>
  );
}