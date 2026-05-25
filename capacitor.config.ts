import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.bomaintelligent.app',
  appName: 'Boma Intelligent',
  server: {
    url: 'https://boma-intelligent.vercel.app',
    cleartext: false,
  },
  android: {
    allowMixedContent: false,
    captureInput: true,
    webContentsDebuggingEnabled: false,
  },
};

export default config;
