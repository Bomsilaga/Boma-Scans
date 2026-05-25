import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.fourscans.app',
  appName: '4Scans',
  // Point to the live Vercel deployment — no static export needed
  server: {
    url: 'https://4scans.vercel.app',
    cleartext: false,
  },
  android: {
    allowMixedContent: false,
    captureInput: true,
    webContentsDebuggingEnabled: false,
  },
};

export default config;
