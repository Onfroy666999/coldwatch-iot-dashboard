import { useState, useEffect, useRef } from 'react';
import { AnimatePresence, motion } from 'motion/react';
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
import SetupSurvey from './pages/SetupSurvey';
import SplashScreen from './pages/SplashScreen';
import { Analytics } from '@vercel/analytics/react';
import { WifiOff, Bot } from 'lucide-react';
import SyncBanner from './components/SyncBanner';
import AIAssistant from './components/AIAssistant';
const PAGE_ORDER = ['dashboard', 'alerts', 'history', 'devices', 'settings'];

const slideVariants = {
  enter:  (dir: number) => ({ opacity: 0, x: dir * 32 }),
  center: { opacity: 1, x: 0 },
  exit:   (dir: number) => ({ opacity: 0, x: dir * -32 }),
};


function AppContent() {
  const { isAuthenticated, activePage, unreadAlertCount, addToast, isOnline } = useApp();
  const [showSplash, setShowSplash] = useState(true);

  // Onboarding flow — only show if not previously completed
  const [showOnboarding, setShowOnboarding] = useState(
    () => localStorage.getItem('cw_onboarding_complete') !== 'true'
  );
  const [showSurvey, setShowSurvey] = useState(false);
  const [showAssistant, setShowAssistant] = useState(false);

  // Direction tracking — must be here, before any early returns
  const prevPageRef = useRef(activePage);
  const [direction, setDirection] = useState(0);

  // Dynamic tab title
  useEffect(() => {
    const pageLabels: Record<string, string> = {
      dashboard: 'Dashboard', alerts: 'Alerts',
      history: 'History', devices: 'Devices', settings: 'Settings',
    };
    const page   = pageLabels[activePage] ?? 'Dashboard';
    const prefix = unreadAlertCount > 0 ? `(${unreadAlertCount}) ` : '';
    document.title = `${prefix}${page} — ColdWatch`;
  }, [activePage, unreadAlertCount]);

  // Update slide direction whenever activePage changes
  useEffect(() => {
    const prev = prevPageRef.current;
    if (prev !== activePage) {
      const prevIdx = PAGE_ORDER.indexOf(prev);
      const nextIdx = PAGE_ORDER.indexOf(activePage);
      setDirection(nextIdx > prevIdx ? 1 : -1);
      prevPageRef.current = activePage;
    }
  }, [activePage]);

  // One-time reminder toast if user skipped the survey
  useEffect(() => {
    if (!isAuthenticated || showSurvey) return;
    try {
      const session = JSON.parse(localStorage.getItem('cw_session') || 'null');
      const users   = JSON.parse(localStorage.getItem('cw_users')   || '[]');
      if (!session?.userId) return;
      const stored = users.find((u: any) => u.id === session.userId);
      if (stored && !stored.surveyComplete && !stored.surveySkippedReminded) {
        const updated = users.map((u: any) =>
          u.id === session.userId ? { ...u, surveySkippedReminded: true } : u
        );
        localStorage.setItem('cw_users', JSON.stringify(updated));
        setTimeout(() => {
          addToast({
            id: `survey-reminder-${Date.now()}`,
            type: 'info',
            message: 'Tip: Complete your setup to personalise ColdWatch for your produce type.',
            duration: 8000,
          });
        }, 2500);
      }
    } catch { /* */ }
  }, [isAuthenticated]);

  const handleOnboardingComplete = () => {
    localStorage.setItem('cw_onboarding_complete', 'true');
    setShowOnboarding(false);
  };

  const handleSignedUp = (_userId: string) => {
    // New signup — go to survey next (onboarding was already seen before login)
    setShowSurvey(true);
  };

  const handleSurveyComplete = () => {
    setShowSurvey(false);
    // Survey done — land on dashboard
  };

  const handleSurveySkip = () => {
    try {
      const session = JSON.parse(localStorage.getItem('cw_session') || 'null');
      const users   = JSON.parse(localStorage.getItem('cw_users')   || '[]');
      if (session?.userId) {
        const updated = users.map((u: any) =>
          u.id === session.userId ? { ...u, surveySkipped: true } : u
        );
        localStorage.setItem('cw_users', JSON.stringify(updated));
      }
    } catch { /* */ }
    setShowSurvey(false);
    // Survey skipped — land on dashboard
  };

  if (showSplash) {
    return (
      <AnimatePresence>
        <SplashScreen key="splash" onDone={() => setShowSplash(false)} />
      </AnimatePresence>
    );
  }

  if (showOnboarding) {
    return <Onboarding onComplete={handleOnboardingComplete} />;
  }

  if (!isAuthenticated) {
    return <Login onSignedUp={handleSignedUp} />;
  }

  if (showSurvey) {
    return <SetupSurvey onComplete={handleSurveyComplete} onSkip={handleSurveySkip} />;
  }

  const renderPage = () => {
    switch (activePage) {
      case 'dashboard': return <Dashboard />;
      case 'alerts':    return <Alerts />;
      case 'history':   return <History />;
      case 'devices':   return <Devices />;
      case 'settings':  return <Settings />;
      default:          return <Dashboard />;
    }
  };

  return (
    <div className="fixed inset-0 flex flex-col" style={{ backgroundColor: '#F8FAFC', color: '#111827' }}>
      {/* Offline banner */}
      <AnimatePresence>
        {!isOnline && (
          <motion.div
            initial={{ y: -48, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -48, opacity: 0 }}
            transition={{ duration: 0.25, ease: 'easeOut' }}
            className="fixed top-0 left-0 right-0 z-50 flex items-center justify-center gap-2 px-4 py-2.5 text-white text-sm font-medium"
            style={{ backgroundColor: '#C0392B' }}
          >
            <WifiOff className="w-4 h-4 flex-shrink-0" />
            You are offline. Changes will sync when connection returns.
          </motion.div>
        )}
      </AnimatePresence>
      <SyncBanner />
      <Sidebar />
      <div className="md:ml-56 flex flex-col flex-1 min-h-0">
        <TopBar />
        <main className="flex-1 overflow-y-auto p-4 md:p-6 lg:p-8 pb-24 md:pb-8">
          <AnimatePresence mode="wait" custom={direction}>
            <motion.div
              key={activePage}
              custom={direction}
              variants={slideVariants}
              initial="enter"
              animate="center"
              exit="exit"
              transition={{ duration: 0.2, ease: [0.25, 0.46, 0.45, 0.94] }}
            >
              {renderPage()}
            </motion.div>
          </AnimatePresence>
        </main>
      </div>
      <BottomNav />
      <ToastContainer />

      {/* ── AI Assistant floating trigger button ── */}
      {/* Positioned above BottomNav on mobile (bottom-20), above fold on desktop (bottom-8) */}
      <button
        onClick={() => setShowAssistant(true)}
        aria-label="Open AI Assistant"
        className="fixed right-4 bottom-20 md:bottom-8 md:right-8 z-40 w-14 h-14 rounded-full shadow-lg flex items-center justify-center transition-all active:scale-95 hover:shadow-xl"
        style={{ backgroundColor: '#0984E3' }}
      >
        <Bot className="w-6 h-6 text-white" />
      </button>

      {/* ── AI Assistant drawer — rendered outside main layout so it overlays everything ── */}
      <AIAssistant
        isOpen={showAssistant}
        onClose={() => setShowAssistant(false)}
      />
    </div>
  );
}

export default function App() {
  return (
    <AppProvider>
      <AppContent />
      <Analytics />
    </AppProvider>
  );
}