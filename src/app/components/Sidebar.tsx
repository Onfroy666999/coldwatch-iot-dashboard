import { motion } from 'motion/react';
import { LayoutDashboard, Cpu, Bell, History, Settings, LogOut, Snowflake, ChevronRight } from 'lucide-react';
import { useApp } from '../context/AppContext';

const ROLE_LABELS: Record<string, string> = {
  farmer: 'Farmer', warehouse_manager: 'Warehouse Manager',
  transporter: 'Transporter', other: 'User',
};

export default function Sidebar() {
  const { user, logout, activePage, setActivePage, unreadAlertCount, deviceStatus } = useApp();
  const isLive = deviceStatus === 'online';

  const navItems = [
    { id: 'dashboard', icon: LayoutDashboard, label: 'Dashboard' },
    { id: 'devices',   icon: Cpu,             label: 'Devices'   },
    { id: 'alerts',    icon: Bell,            label: 'Alerts',   badge: unreadAlertCount },
    { id: 'history',   icon: History,         label: 'History'   },
    { id: 'settings',  icon: Settings,        label: 'Settings'  },
  ];

  return (
    <aside className="hidden md:flex w-56 h-screen fixed left-0 top-0 flex-col z-50"
      style={{ backgroundColor: '#FFFFFF', borderRight: '1px solid #E4E7EC' }}>

      <div className="flex items-center gap-3 px-5 py-5" style={{ borderBottom: '1px solid #F3F4F6' }}>
        <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
          style={{ backgroundColor: '#0984E3', boxShadow: '0 2px 8px rgba(9,132,227,0.3)' }}>
          <Snowflake className="w-5 h-5 text-white" />
        </div>
        <div>
          <p className="text-sm font-bold" style={{ color: '#111827', letterSpacing: '-0.01em' }}>ColdWatch</p>
          <p className="text-[10px] font-medium uppercase tracking-widest" style={{ color: '#9CA3AF' }}>IoT Monitor</p>
        </div>
      </div>

      <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
        {navItems.map(item => {
          const isActive = activePage === item.id;
          return (
            <button key={item.id} onClick={() => setActivePage(item.id)}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all duration-150 text-left relative active:scale-[0.98]"
              style={{ backgroundColor: isActive ? 'rgba(9,132,227,0.08)' : 'transparent', color: isActive ? '#0984E3' : '#6B7280' }}>
              {isActive && (
                <motion.div layoutId="sidebar-active"
                  className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-5 rounded-full"
                  style={{ backgroundColor: '#0984E3' }}
                  transition={{ type: 'spring', stiffness: 500, damping: 35 }} />
              )}
              <item.icon className="w-4 h-4 flex-shrink-0" style={{ strokeWidth: isActive ? 2.2 : 1.8 }} />
              <span className="flex-1 text-sm" style={{ fontWeight: isActive ? 600 : 400 }}>{item.label}</span>
              {item.badge !== undefined && item.badge > 0 && (
                <span className="min-w-[18px] h-[18px] rounded-full text-white flex items-center justify-center font-bold"
                  style={{ fontSize: 9, backgroundColor: '#DC2626', paddingLeft: 4, paddingRight: 4 }}>
                  {item.badge > 9 ? '9+' : item.badge}
                </span>
              )}
              {isActive && <ChevronRight className="w-3 h-3 opacity-40" />}
            </button>
          );
        })}
      </nav>

      <div className="px-3 pb-4 pt-3" style={{ borderTop: '1px solid #F3F4F6' }}>
        <div className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl mb-2" style={{ backgroundColor: '#F9FAFB' }}>
          <div className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0 overflow-hidden"
            style={{ backgroundColor: '#0984E3' }}>
            {user.profilePicture
              ? <img src={user.profilePicture} alt="Profile" className="w-full h-full object-cover" />
              : user.avatar}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold truncate" style={{ color: '#111827' }}>{user.name}</p>
            <p className="text-[10px] truncate" style={{ color: '#9CA3AF' }}>{ROLE_LABELS[user.role || ''] || 'User'}</p>
          </div>
          <div className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: isLive ? '#16A34A' : '#DC2626' }} />
        </div>
        <button onClick={logout}
          className="w-full flex items-center gap-2 px-3 py-2 rounded-xl transition-all active:bg-red-50 active:scale-[0.98]"
          style={{ color: '#9CA3AF' }}>
          <LogOut className="w-4 h-4" />
          <span className="text-xs font-medium">Sign out</span>
        </button>
      </div>
    </aside>
  );
}