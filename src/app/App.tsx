import { useState } from 'react';
import { AppProvider, useApp } from './context/AppContext';
import Sidebar from './components/Sidebar';
import TopBar from './components/TopBar';
import BottomNav from './components/BottomNav';
import ToastContainer from './components/ToastContainer';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Alerts from './pages/Alerts';
import History from './pages/History';
import Devices from './pages/Devices';
import Settings from './pages/Settings';
import Onboarding from './pages/Onboarding';

function AppContent() {
  const { isAuthenticated, activePage } = useApp();

  // Always show onboarding during testing — will switch to first-launch only later
  const [showOnboarding, setShowOnboarding] = useState(true);

  if (showOnboarding) {
    return <Onboarding onComplete={() => setShowOnboarding(false)} />;
  }

  if (!isAuthenticated) {
    return <Login />;
  }

  const renderPage = () => {
    switch (activePage) {
      case 'dashboard': return <Dashboard />;
      case 'alerts': return <Alerts />;
      case 'history': return <History />;
      case 'devices': return <Devices />;
      case 'settings': return <Settings />;
      default: return <Dashboard />;
    }
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Sidebar — desktop only */}
      <Sidebar />

      {/* Main content — full width on mobile, offset on desktop */}
      <div className="md:ml-60 pb-20 md:pb-0">
        <TopBar />
        <main className="p-4 md:p-6 lg:p-8">
          {renderPage()}
        </main>
      </div>

      {/* Bottom nav — mobile only */}
      <BottomNav />

      <ToastContainer />
    </div>
  );
}

export default function App() {
  return (
    <AppProvider>
      <AppContent />
    </AppProvider>
  );
}
