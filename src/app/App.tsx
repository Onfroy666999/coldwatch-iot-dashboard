import { useState, useEffect, useRef, useCallback } from 'react';
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
import Privacy from './pages/Privacy';
import TermsOfService from './pages/TermsOfService';
import { Analytics } from '@vercel/analytics/react';
import { WifiOff, Snowflake } from 'lucide-react';
import SyncBanner from './components/SyncBanner';
import AIAssistant, { type NixHandle } from './components/AIAssistant';
const PAGE_ORDER = ['dashboard', 'alerts', 'history', 'devices', 'settings'];

const slideVariants = {
  enter:  (dir: number) => ({ opacity: 0, x: dir * 32 }),
  center: { opacity: 1, x: 0 },
  exit:   (dir: number) => ({ opacity: 0, x: dir * -32 }),
};


function AppContent() {
  const { isAuthenticated, activePage, setActivePage, unreadAlertCount, addToast, isOnline, user, reconnectWebSockets } = useApp();
  const [showSplash, setShowSplash] = useState(true);

  // Onboarding flow — only show if not previously completed
  const [showOnboarding, setShowOnboarding] = useState(
    () => localStorage.getItem('cw_onboarding_complete') !== 'true'
  );
  const [showSurvey, setShowSurvey] = useState(false);
  const [showAssistant,  setShowAssistant]  = useState(false);
  const [nixListening,   setNixListening]   = useState(false);
  // True while the user is holding down the Nix button (before long-press fires)
  const [nixHolding,     setNixHolding]     = useState(false);

  // Ref to AIAssistant — lets the floating button trigger voice directly
  const nixRef          = useRef<NixHandle>(null);
  // Timer fires after HOLD_THRESHOLD ms to activate voice
  const holdTimerRef    = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Flag: set when long-press threshold crossed — prevents pointer-up also firing a tap
  const didLongPressRef = useRef(false);

  // Long-press threshold — 450ms feels intentional without being slow
  const HOLD_THRESHOLD = 450;


  // Called by AIAssistant when it navigates — updates activePage and closes drawer
  const handleNixNavigate = useCallback((page: string) => {
    setActivePage(page);
    setShowAssistant(false);
  }, [setActivePage]);

  // Direction tracking — must be here, before any early returns
  const prevPageRef = useRef(activePage);
  const [direction, setDirection] = useState(0);

  // Dynamic tab title
  useEffect(() => {
    const pageLabels: Record<string, string> = {
      dashboard: 'Dashboard', alerts: 'Alerts',
      history: 'History', devices: 'Devices', settings: 'Settings',
      privacy: 'Privacy Policy', terms: 'Terms of Service',
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

  // ── Capacitor app state — reconnect WebSockets when app returns to foreground
  // On iOS/Android the OS silently kills TCP connections when the app is backgrounded.
  // We listen for the app becoming active again and trigger a reconnect.
  // In the browser this falls back to the Page Visibility API.
  useEffect(() => {
    if (!isAuthenticated) return;

    let cleanup: (() => void) | null = null;

    const handleForeground = () => {
      // AppContext's openWebSocket is idempotent — safe to call even if connected
      reconnectWebSockets();
    };

    // Try Capacitor App plugin first (native mobile)
    import('@capacitor/app').then(({ App: CapApp }) => {
      const listener = CapApp.addListener('appStateChange', (state) => {
        if (state.isActive) handleForeground();
      });
      listener.then(handle => {
        cleanup = () => handle.remove();
      });
    }).catch(() => {
      // Not in Capacitor (browser) — use Page Visibility API
      const onVisibility = () => {
        if (document.visibilityState === 'visible') handleForeground();
      };
      document.addEventListener('visibilitychange', onVisibility);
      cleanup = () => document.removeEventListener('visibilitychange', onVisibility);
    });

    return () => { cleanup?.(); };
  }, [isAuthenticated]);

  // One-time reminder toast if user skipped the survey
  // surveyComplete comes from the backend via AppContext user object
  useEffect(() => {
    if (!isAuthenticated || showSurvey) return;
    try {
      const alreadyReminded = localStorage.getItem('cw_survey_reminded') === 'true';
      if (!user.surveyComplete && !alreadyReminded) {
        localStorage.setItem('cw_survey_reminded', 'true');
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
    setShowSurvey(false);
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
      case 'privacy':   return <Privacy />;
      case 'terms':     return <TermsOfService />;
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

      {/* ── Nix AI floating button ──────────────────────────────────────────────────
          Interaction model (mobile-first):
          • Tap (< 450 ms)   → open / close chat drawer
          • Hold (≥ 450 ms)  → start voice (Nix listens; release to send)
          • Tap while voice  → cancel listening
          Visual states:
          • Idle             → blue snowflake
          • Holding          → scale 1.12 + conic fill ring charging up
          • Listening        → three pulse rings + slow snowflake spin
          • Alerts badge     → red number, alert ping animation
      */}
      <div className="fixed right-4 bottom-20 md:bottom-8 md:right-8 z-40 flex flex-col items-center gap-2">

        {/* Status label — changes text based on current state */}
        <AnimatePresence>
          {(nixListening || nixHolding) && (
            <motion.div
              key="nix-status-label"
              initial={{ opacity: 0, y: 6, scale: 0.9 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 6, scale: 0.9 }}
              transition={{ duration: 0.18 }}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold text-white select-none"
              style={{
                background: nixListening
                  ? 'linear-gradient(135deg, #0984E3, #0652a0)'
                  : 'linear-gradient(135deg, #0652a0, #0984E3)',
                boxShadow: '0 2px 12px rgba(9,132,227,0.5)',
              }}
            >
              <motion.span
                className="w-2 h-2 rounded-full bg-white"
                animate={nixListening
                  ? { opacity: [1, 0.3, 1] }
                  : { scale: [1, 1.4, 1] }}
                transition={{ duration: nixListening ? 0.9 : 0.5, repeat: Infinity }}
              />
              {nixListening ? 'Nix is listening…' : 'Hold to talk…'}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Button wrapper — pulse rings positioned relative to button */}
        <div className="relative">

          {/* Pulse rings — three expanding rings while listening */}
          {nixListening && (
            <>
              <motion.span
                className="absolute inset-0 rounded-full pointer-events-none"
                style={{ backgroundColor: '#0984E3' }}
                animate={{ scale: [1, 2.2], opacity: [0.5, 0] }}
                transition={{ duration: 1.4, repeat: Infinity, ease: 'easeOut' }}
                aria-hidden="true"
              />
              <motion.span
                className="absolute inset-0 rounded-full pointer-events-none"
                style={{ backgroundColor: '#0984E3' }}
                animate={{ scale: [1, 1.8], opacity: [0.35, 0] }}
                transition={{ duration: 1.4, repeat: Infinity, ease: 'easeOut', delay: 0.3 }}
                aria-hidden="true"
              />
              <motion.span
                className="absolute inset-0 rounded-full pointer-events-none"
                style={{ backgroundColor: '#0984E3' }}
                animate={{ scale: [1, 1.4], opacity: [0.2, 0] }}
                transition={{ duration: 1.4, repeat: Infinity, ease: 'easeOut', delay: 0.6 }}
                aria-hidden="true"
              />
            </>
          )}

          {/* Alert urgency ping — shown only when idle with unread alerts */}
          {!nixListening && !nixHolding && unreadAlertCount > 0 && (
            <span
              className="absolute inset-0 rounded-full animate-ping pointer-events-none"
              style={{ backgroundColor: '#EF4444', opacity: 0.35 }}
              aria-hidden="true"
            />
          )}

          {/* Hold-to-talk charging ring — conic-gradient arc fills over 450 ms */}
          {nixHolding && !nixListening && (
            <motion.span
              className="absolute rounded-full pointer-events-none"
              style={{
                inset: -4,
                background: 'conic-gradient(#0984E3 0deg, #0984E3 0deg, transparent 0deg)',
              }}
              animate={{ background: [
                'conic-gradient(#0984E3 0deg, #0984E3 0deg, transparent 0deg)',
                'conic-gradient(#0984E3 0deg, #0984E3 360deg, transparent 360deg)',
              ]}}
              transition={{ duration: 0.45, ease: 'linear' }}
              aria-hidden="true"
            />
          )}

          {/* ── Main Nix button ── */}
          <motion.button
            animate={nixHolding && !nixListening ? { scale: 1.12 } : { scale: 1 }}
            transition={{ duration: 0.15, ease: 'easeOut' }}
            onPointerDown={(e) => {
              // Only react to primary pointer (touch or left-click)
              if (e.button !== 0 && e.pointerType !== 'touch') return;
              // If already listening, a tap cancels — don't start hold timer
              if (nixListening) return;
              didLongPressRef.current = false;
              setNixHolding(true);
              holdTimerRef.current = setTimeout(() => {
                didLongPressRef.current = true;
                setNixHolding(false);
                nixRef.current?.startListening();
              }, HOLD_THRESHOLD);
            }}
            onPointerUp={() => {
              // Cancel hold timer
              if (holdTimerRef.current) {
                clearTimeout(holdTimerRef.current);
                holdTimerRef.current = null;
              }
              setNixHolding(false);
              if (nixListening) {
                // Tap while listening → stop
                nixRef.current?.stopListening();
              } else if (!didLongPressRef.current) {
                // Short tap (long press did NOT fire) → toggle chat drawer
                setShowAssistant(prev => !prev);
              }
              // If long press fired, voice already started — nothing to do on release
            }}
            onPointerLeave={() => {
              // Finger slid off button before long press fired — cancel
              if (holdTimerRef.current) {
                clearTimeout(holdTimerRef.current);
                holdTimerRef.current = null;
              }
              setNixHolding(false);
            }}
            onPointerCancel={() => {
              // System cancelled gesture (e.g. incoming call)
              if (holdTimerRef.current) {
                clearTimeout(holdTimerRef.current);
                holdTimerRef.current = null;
              }
              setNixHolding(false);
            }}
            aria-label={
              nixListening ? 'Tap to stop Nix' :
              showAssistant ? 'Tap to close chat' :
              'Tap to open chat · Hold to talk to Nix'
            }
            title="Tap to open chat · Hold to talk"
            className="relative w-14 h-14 rounded-full flex items-center justify-center select-none touch-none"
            style={{
              background: nixListening
                ? 'linear-gradient(135deg, #0652a0 0%, #0984E3 100%)'
                : 'linear-gradient(135deg, #0984E3 0%, #0652a0 100%)',
              boxShadow: nixListening
                ? '0 4px 32px rgba(9,132,227,0.7), 0 2px 8px rgba(0,0,0,0.25)'
                : nixHolding
                  ? '0 4px 28px rgba(9,132,227,0.6), 0 2px 8px rgba(0,0,0,0.2)'
                  : '0 4px 24px rgba(9,132,227,0.45), 0 2px 8px rgba(0,0,0,0.18)',
              // Prevent iOS callout and text selection on long press
              WebkitUserSelect: 'none',
              WebkitTouchCallout: 'none',
            }}
          >
            <motion.div
              animate={nixListening ? { rotate: 360 } : { rotate: 0 }}
              transition={nixListening
                ? { duration: 8, repeat: Infinity, ease: 'linear' }
                : { duration: 0.3 }}
            >
              <Snowflake
                className="w-6 h-6 text-white"
                style={{ filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.25))' }}
              />
            </motion.div>

            {/* Alert count badge */}
            {unreadAlertCount > 0 && !nixListening && !nixHolding && (
              <span
                className="absolute -top-1 -right-1 w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold text-white pointer-events-none"
                style={{ backgroundColor: '#EF4444', border: '2px solid #F8FAFC' }}
              >
                {unreadAlertCount > 9 ? '9+' : unreadAlertCount}
              </span>
            )}
          </motion.button>
        </div>
      </div>

      {/* ── AI Assistant drawer ── */}
      <AIAssistant
        ref={nixRef}
        isOpen={showAssistant}
        onClose={() => setShowAssistant(false)}
        onNavigate={handleNixNavigate}
        onVoiceStateChange={setNixListening}
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