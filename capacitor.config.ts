import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId:   'com.coldwatch.app',
  appName: 'ColdWatch',
  webDir:  'dist',

  // Server config — points to your Railway backend in production.
  // The hostname allows Capacitor's WebView to make requests to Railway
  // without being blocked by Android's cleartext/HTTPS policies.
  server: {
    // Remove this block entirely for local development (uses bundled assets)
    // Uncomment androidScheme if you want live reload during development:
    // androidScheme: 'https',
  },

  plugins: {
    // Push notifications — channel must match what the backend sends
    PushNotifications: {
      presentationOptions: ['badge', 'sound', 'alert'],
    },

    // Camera — used for produce condition photo assessment
    Camera: {
      permissionsExplanation: 'ColdWatch needs camera access to assess produce condition using AI.',
    },

    // Splash screen
    SplashScreen: {
      launchShowDuration:  2000,
      backgroundColor:     '#0984E3',
      androidSplashResourceName: 'splash',
      showSpinner:         false,
    },
  },
};

export default config;
