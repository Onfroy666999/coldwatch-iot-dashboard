import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId:   'com.coldwatch.app',
  appName: 'ColdWatch',
  webDir:  'dist',

  server: {
    androidScheme: 'https',
    // Stable hostname — the WebView sends this as the Origin header.
    // Must be in ALLOWED_ORIGINS on the backend.
    hostname: 'coldwatch.app',
    allowNavigation: [
      'coldwatch-api-production.up.railway.app',
    ],
  },

  plugins: {
    PushNotifications: {
      presentationOptions: ['badge', 'sound', 'alert'],
    },
    SplashScreen: {
      launchShowDuration:  2000,
      backgroundColor:     '#FFFFFF',
      showSpinner:         false,
    },
  },
};

export default config;
