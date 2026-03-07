import { motion } from 'motion/react';
import { LayoutDashboard, Cpu, Bell, History, Settings } from 'lucide-react';
import { useApp } from '../context/AppContext';

export default function BottomNav() {
  const { activePage, setActivePage, unreadAlertCount } = useApp();

  const navItems = [
    { id: 'dashboard', icon: LayoutDashboard, label: 'Home'     },
    { id: 'devices',   icon: Cpu,             label: 'Devices'  },
    { id: 'alerts',    icon: Bell,            label: 'Alerts',  badge: unreadAlertCount },
    { id: 'history',   icon: History,         label: 'History'  },
    { id: 'settings',  icon: Settings,        label: 'Settings' },
  ];

  return (
    <nav
      className="md:hidden fixed bottom-0 left-0 right-0 z-50 flex items-center px-3 border-t"
      style={{
        backgroundColor: '#FFFFFF',
        borderColor: '#E4E7EC',
        paddingTop: 8,
        paddingBottom: 'calc(env(safe-area-inset-bottom) + 8px)',
        boxShadow: '0 -1px 12px rgba(0,0,0,0.06)',
      }}
    >
      {navItems.map(item => {
        const isActive = activePage === item.id;
        const Icon = item.icon;

        return (
          <button
            key={item.id}
            onClick={() => setActivePage(item.id)}
            className="relative flex items-center justify-center transition-all duration-200 active:scale-90"
            style={{ minHeight: 52, flex: isActive ? '0 0 auto' : '1 1 0' }}
            aria-label={item.label}
            aria-current={isActive ? 'page' : undefined}
          >
            {isActive ? (
              // ── Active: dark pill with icon + label ──
              <motion.div
                layoutId="nav-active-pill"
                className="flex items-center gap-2 px-4 py-2.5 rounded-2xl"
                style={{ backgroundColor: '#111827' }}
                transition={{ type: 'spring', stiffness: 420, damping: 36 }}
              >
                {/* Badge outside pill but still visible when active */}
                <div className="relative">
                  <Icon
                    className="w-[18px] h-[18px]"
                    style={{ color: '#FFFFFF', strokeWidth: 2.2 }}
                  />
                  {item.badge !== undefined && item.badge > 0 && (
                    <span
                      className="absolute -top-2 -right-2 min-w-[15px] h-[15px] rounded-full text-white flex items-center justify-center font-bold"
                      style={{
                        fontSize: 8,
                        backgroundColor: '#DC2626',
                        paddingLeft: 3,
                        paddingRight: 3,
                        boxShadow: '0 0 0 2px #111827',
                      }}
                    >
                      {item.badge > 9 ? '9+' : item.badge}
                    </span>
                  )}
                </div>
                <motion.span
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ duration: 0.15, delay: 0.08 }}
                  style={{
                    fontSize: 13,
                    fontWeight: 600,
                    color: '#FFFFFF',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {item.label}
                </motion.span>
              </motion.div>
            ) : (
              // ── Inactive: icon only ──
              <div className="relative flex items-center justify-center w-10 h-10">
                <Icon
                  className="w-[20px] h-[20px] transition-colors duration-200"
                  style={{ color: '#9CA3AF', strokeWidth: 1.8 }}
                />
                {item.badge !== undefined && item.badge > 0 && (
                  <span
                    className="absolute top-0.5 right-0.5 min-w-[15px] h-[15px] rounded-full text-white flex items-center justify-center font-bold animate-pulse"
                    style={{
                      fontSize: 8,
                      backgroundColor: '#DC2626',
                      paddingLeft: 3,
                      paddingRight: 3,
                      boxShadow: '0 0 0 2px #FFFFFF',
                    }}
                  >
                    {item.badge > 9 ? '9+' : item.badge}
                  </span>
                )}
              </div>
            )}
          </button>
        );
      })}
    </nav>
  );
}