// Crash reporting — scaffold only. Wires up @sentry/capacitor so ErrorBoundary
// and future explicit reports have somewhere to send to, but this project
// doesn't have a Sentry DSN yet. Until VITE_SENTRY_DSN is set in the build
// environment, init() is a deliberate no-op: no network calls, no
// initialization, nothing to verify without a live account.
//
// To turn this on for real once a Sentry project exists:
//   1. Set VITE_SENTRY_DSN in the build env (same place VITE_API_URL lives).
//   2. That's it — init() below picks it up automatically.
//
// Why @sentry/capacitor specifically (not plain @sentry/react): it wraps
// @sentry/react with native-layer context — device model, OS version, and
// native (Java/Kotlin) crashes below the WebView — which plain @sentry/react
// can't see. It's still driven from this JS/TS file; no native code changes
// needed for this scaffold.

import * as Sentry from '@sentry/capacitor';
import * as SentryReact from '@sentry/react';

const DSN = import.meta.env.VITE_SENTRY_DSN as string | undefined;

let initialized = false;

/** Call once, as early as possible (see main.tsx). No-op if DSN isn't set. */
export function initCrashReporting(): void {
  if (!DSN) {
    // Expected in every environment until a Sentry project is created —
    // not an error, just confirms the scaffold is inert as intended.
    console.info('[crashReporting] VITE_SENTRY_DSN not set — crash reporting disabled.');
    return;
  }
  Sentry.init(
    {
      dsn: DSN,
      // Conservative default; revisit once there's a real crash volume to
      // judge cost/signal against. 1.0 = trace every session.
      tracesSampleRate: 0.2,
    },
    SentryReact.init,
  );
  initialized = true;
}

/** Report a caught error. Safe to call even if init() was never called or was a no-op. */
export function captureException(error: unknown, context?: Record<string, unknown>): void {
  if (!initialized) return;
  Sentry.captureException(error, context ? { extra: context } : undefined);
}
