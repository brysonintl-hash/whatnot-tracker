import type { CapacitorConfig } from '@capacitor/cli';

// Replace PRODUCTION_URL with your Railway app URL (e.g. https://whatnot-tracker-production.up.railway.app)
const PRODUCTION_URL = 'whatnot-tracker-production.up.railway.app';

const config: CapacitorConfig = {
  appId: 'com.stackbargains.app',
  appName: 'Stack Bargains',
  webDir: 'out',
  server: {
    url: PRODUCTION_URL,
    cleartext: false,
    androidScheme: 'https',
  },
  ios: {
    backgroundColor: '#0f172a',
    contentInset: 'automatic',
    scrollEnabled: true,
    allowsLinkPreview: false,
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 2000,
      launchAutoHide: true,
      backgroundColor: '#0f172a',
      showSpinner: false,
    },
    StatusBar: {
      style: 'DARK',
      backgroundColor: '#0f172a',
    },
  },
};

export default config;
