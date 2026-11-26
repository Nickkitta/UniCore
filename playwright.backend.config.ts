import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests/backend-e2e',
  timeout: 60000,
  workers: 1,
  use: {
    baseURL: 'http://127.0.0.1:8083',
    viewport: { width: 393, height: 852 },
    locale: 'ru-RU',
    launchOptions: process.env.PLAYWRIGHT_CHROME_PATH
      ? { executablePath: process.env.PLAYWRIGHT_CHROME_PATH }
      : {},
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: 'npx expo start --web --port 8083',
    env: { EXPO_PUBLIC_DATA_MODE: 'supabase' },
    url: 'http://127.0.0.1:8083',
    reuseExistingServer: false,
    timeout: 120000,
  },
});
