import { LayoutDashboard, Cpu, Bell, History, Settings } from 'lucide-react';
import { useApp } from '../context/AppContext';

export default function BottomNav() {
  const { activePage, setActivePage, unreadAlertCount } = useApp();

  const navItems = [
    { id: 'dashboard', icon: LayoutDashboard, label: 'Home' },
    { id: 'devices',   icon: Cpu,             label: 'Devices' },
    { id: 'alerts',    icon: Bell,            label: 'Alerts', badge: unreadAlertCount },
    { id: 'history',   icon: History,         label: 'History' },
    { id: 'settings',  icon: Settings,        label: 'Settings' },
  ];

  return (
    <nav
      className="md:hidden fixed bottom-0 left-0 right-0 z-50 flex items-center justify-around px-1 border-t border-border bg-card"
      style={{ paddingTop: 8, paddingBottom: 'calc(env(safe-area-inset-bottom) + 8px)' }}
    >
      {navItems.map(item => {
        const isActive = activePage === item.id;
        return (
          <button
            key={item.id}
            onClick={() => setActivePage(item.id)}
            className="relative flex flex-col items-center justify-center gap-1 px-4 py-2 rounded-2xl transition-all duration-200 active:scale-95"
            style={{ minWidth: 60, minHeight: 56 }}
          >
            {isActive && (
              <span className="absolute inset-0 rounded-2xl" style={{ backgroundColor: 'rgba(41,121,200,0.1)' }} />
            )}
            {item.badge && item.badge > 0 ? (
              <span className="absolute top-1 right-2 w-5 h-5 rounded-full text-white flex items-center justify-center z-10 font-medium" style={{ fontSize: 10, backgroundColor: '#C0392B' }}>
                {item.badge > 9 ? '9+' : item.badge}
              </span>
            ) : null}
            <item.icon className="w-6 h-6 relative z-10 transition-colors duration-200" style={{ color: isActive ? '#2979C8' : 'var(--muted-foreground)' }} />
            <span className="text-xs relative z-10 transition-colors duration-200" style={{ color: isActive ? '#2979C8' : 'var(--muted-foreground)', fontWeight: isActive ? 600 : 400 }}>
              {item.label}
            </span>
          </button>
        );
      })}
    </nav>
  );
}