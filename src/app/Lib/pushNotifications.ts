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
import {
  PushNotifications,
  type Token,
  type PushNotificationSchema,
  type ActionPerformed,
} from '@capacitor/push-notifications';
import { usersApi } from './api';

let initialized = false;

export interface PushNotificationCallbacks {
  /**
   * Fires when a push arrives while the app is in the foreground. FCM does
   * NOT show a system tray notification in this case — without this handler
   * a foreground user gets no signal at all that a critical alert just came
   * in. Wire this to the app's toast system.
   */
  onNotificationReceived?: (notification: PushNotificationSchema) => void;
  /**
   * Fires when the user taps the system notification (from background or a
   * killed state). The payload only carries `type` / `severity` / `device`
   * / `location` today (see backend notifications.ts) — no alertId/deviceId
   * — so this can only navigate to the Alerts list, not deep-link to the
   * specific alert or device yet.
   */
  onNotificationAction?: (action: ActionPerformed) => void;
}

export function initPushNotifications(callbacks: PushNotificationCallbacks = {}): () => void {
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

  // Foreground delivery: Android/iOS do not surface a system tray banner
  // while the app is open, so without this listener a temperature spike
  // while the farmer is looking at the dashboard produces no signal at all.
  const onNotificationReceived = (notification: PushNotificationSchema) => {
    callbacks.onNotificationReceived?.(notification);
  };

  // Tap from the system tray (background or killed-app launch).
  const onNotificationAction = (action: ActionPerformed) => {
    callbacks.onNotificationAction?.(action);
  };

  PushNotifications.addListener('registration', onRegistration);
  PushNotifications.addListener('registrationError', onRegistrationError);
  PushNotifications.addListener('pushNotificationReceived', onNotificationReceived);
  PushNotifications.addListener('pushNotificationActionPerformed', onNotificationAction);

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
