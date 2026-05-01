import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId:   'com.coldwatch.app',
  appName: 'ColdWatch',
  webDir:  'dist',

  server: {
    // Forces Capacitor to use https:// scheme on Android instead of
    // the default capacitor:// — this makes requests appear as
    // https://localhost to the backend, which is in ALLOWED_ORIGINS.
    // Without this, some Android WebView versions send a different
    // origin that doesn't match what the backend expects.
    androidScheme: 'https',

    // Allow the app to reach your Railway backend over HTTPS.
    // This is safe because Railway uses TLS — no cleartext traffic.
    allowNavigation: [
      'coldwatch-api-production.up.railway.app',
    ],
  },

  plugins: {
    PushNotifications: {
      presentationOptions: ['badge', 'sound', 'alert'],
    },
  },
};

export default config;
