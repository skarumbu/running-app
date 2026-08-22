import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.skarumbu.runningapp',
  appName: 'Running App',
  webDir: 'build',
  plugins: {
    GoogleAuth: {
      // iOS OAuth client ID from Google Cloud Console — a separate
      // "iOS" client, distinct from the web client used for the PWA.
      iosClientId: process.env.REACT_APP_GOOGLE_IOS_CLIENT_ID,
      scopes: ['profile', 'email'],
    },
  },
};

export default config;
