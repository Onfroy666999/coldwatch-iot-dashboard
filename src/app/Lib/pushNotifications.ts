// ── Push notification registration (native only) ────────────────────────────
//
// fcm.ts / notifyUser() on the backend have always been able to *send* a push
// notification — but nothing on the frontend ever registered a device's FCM
// token, so `pushToken` on the User row was always null and every send was a
// silent no-op. This wires up the missing half: request permission, register
// with FCM via Capacitor, and hand the resulting token to the backend.
//
// Requires @capacitor/push-notifications as a project dependency:
//   npm install @capacitor/push-notifications
//   npx cap sync
// On Android this also needs google-services.json in android/app/ (the same
// Firebase project — coldwatch-4ccaf — already used by fcm.ts on the backend)
// and the POST_NOTIFICATIONS runtime permission, which the plugin requests
// automatically via requestPermissions() below on API 33+.
//
// No-ops entirely on web — Capacitor.isNativePlatform() guards every call so
// this is safe to invoke unconditionally from AppContext regardless of platform.

import { Capacitor } from '@capacitor/core';
import { PushNotifications, type Token } from '@capacitor/push-notifications';
import { usersApi } from './api';

let initialized = false;

export function initPushNotifications(): () => void {
  if (!Capacitor.isNativePlatform()) return () => {};
  if (initialized) return () => {}; // StrictMode/HMR can run effects twice — guard against double-registering listeners
  initialized = true;

  const onRegistration = (token: Token) => {
    usersApi.registerPushToken(token.value).catch((err) => {
      // Non-fatal — the next app launch will retry via this same effect.
      console.error('[Push] Failed to register token with backend:', err);
    });
  };

  const onRegistrationError = (err: unknown) => {
    console.error('[Push] FCM registration error:', err);
  };

  PushNotifications.addListener('registration', onRegistration);
  PushNotifications.addListener('registrationError', onRegistrationError);

  PushNotifications.requestPermissions()
    .then(({ receive }) => {
      if (receive === 'granted') {
        return PushNotifications.register();
      }
      console.warn('[Push] Permission not granted — notifications disabled for this session');
    })
    .catch((err) => {
      console.error('[Push] requestPermissions failed:', err);
    });

  return () => {
    PushNotifications.removeAllListeners().catch(() => {});
    initialized = false;
  };
}
