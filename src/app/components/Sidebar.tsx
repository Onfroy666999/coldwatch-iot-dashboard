import { LayoutDashboard, Cpu, Bell, History, Settings, LogOut, Snowflake } from 'lucide-react';
import { useApp } from '../context/AppContext';

export default function Sidebar() {
  const { user, logout, activePage, setActivePage, unreadAlertCount } = useApp();

  const navItems = [
    { id: 'dashboard', icon: LayoutDashboard, label: 'Dashboard' },
    { id: 'devices', icon: Cpu, label: 'Devices' },
    { id: 'alerts', icon: Bell, label: 'Alerts', badge: unreadAlertCount },
    { id: 'history', icon: History, label: 'History' },
    { id: 'settings', icon: Settings, label: 'Settings' },
  ];

  return (
    <div
      className="w-60 h-screen fixed left-0 top-0 flex flex-col z-50"
      style={{ backgroundColor: '#1F3864' }}
    >
      {/* Logo */}
      <div className="p-6 flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ backgroundColor: 'rgba(41,121,200,0.3)' }}>
          <Snowflake className="w-6 h-6 text-white" />
        </div>
        <span className="text-xl text-white" style={{ fontFamily: 'Inter, sans-serif' }}>
          ColdWatch
        </span>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-4 space-y-1">
        {navItems.map(item => {
          const isActive = activePage === item.id;
          return (
            <button
              key={item.id}
              onClick={() => setActivePage(item.id)}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 text-left ${
                isActive
                  ? 'bg-white/15 text-white'
                  : 'text-white/60 hover:bg-white/5 hover:text-white'
              }`}
              style={isActive ? { borderLeft: '3px solid #2979C8' } : {}}
            >
              <item.icon className="w-5 h-5" />
              <span className="flex-1">{item.label}</span>
              {item.badge && item.badge > 0 ? (
                <span className="w-5 h-5 rounded-full text-xs flex items-center justify-center text-white" style={{ backgroundColor: '#C0392B' }}>
                  {item.badge > 9 ? '9+' : item.badge}
                </span>
              ) : null}
            </button>
          );
        })}
      </nav>

      {/* User Profile */}
      <div className="p-4 border-t border-white/10">
        <div className="flex items-center gap-3 mb-3">
          <div
            className="w-10 h-10 rounded-full flex items-center justify-center text-white text-sm"
            style={{ backgroundColor: '#2979C8' }}
          >
            {user.avatar}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-white text-sm truncate">{user.name}</p>
            <p className="text-white/50 text-xs truncate">{user.email}</p>
          </div>
        </div>
        <button
          onClick={logout}
          className="w-full flex items-center gap-2 px-3 py-2 text-white/60 hover:bg-white/5 hover:text-white rounded-lg transition-all duration-200"
        >
          <LogOut className="w-4 h-4" />
          <span className="text-sm">Logout</span>
        </button>
      </div>
    </div>
  );
}
