import { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertTriangle } from 'lucide-react';

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

// Without this, an uncaught render error anywhere in the tree (e.g.
// produce.tsx throwing on an invalid cropId from the backend) white-screens
// the Capacitor WebView with no UI, no logs visible to the user, and no way
// to recover short of force-closing the app. This catches it, shows a plain
// fallback, and offers a reload that re-mounts the app fresh.
//
// Reload rather than CapacitorApp.exitApp(): a full app exit is jarring and
// exitApp() doesn't exist on web, so it would need a platform check for no
// real benefit — reloading the WebView clears the broken React tree either
// way and works identically on native and web.
export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Logged for now. Wire this to a crash reporter (e.g. Sentry's Capacitor
    // SDK) once one is added to the project — right now a crash on a user's
    // device produces nothing anyone can see after the fact.
    console.error('[ErrorBoundary] Uncaught render error:', error, info.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <div className="fixed inset-0 flex flex-col items-center justify-center text-center px-6" style={{ backgroundColor: '#FFFFFF' }}>
        <div className="w-20 h-20 rounded-full flex items-center justify-center mb-5" style={{ backgroundColor: 'rgba(220,38,38,0.08)' }}>
          <AlertTriangle className="w-10 h-10" style={{ color: '#DC2626' }} />
        </div>
        <h2 className="text-xl font-semibold text-[#111827] mb-2">Something went wrong</h2>
        <p className="text-sm text-[#6B7280] mb-6 max-w-xs leading-relaxed">
          ColdWatch hit an unexpected error. Your devices are still monitoring in the background — restarting the app should fix this.
        </p>
        <button
          onClick={() => window.location.reload()}
          className="flex items-center gap-2 px-6 py-3.5 rounded-2xl text-white text-sm font-semibold active:scale-[0.98] transition-all"
          style={{ backgroundColor: '#0984E3' }}
        >
          Restart App
        </button>
      </div>
    );
  }
}
