import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'cloud.youandme.app',
  appName: 'YouAndMe Mobile',
  webDir: 'public',
  server: {
    url: 'https://www.youandme.cloud',
    allowNavigation: ['www.youandme.cloud']
  }
};

export default config;
