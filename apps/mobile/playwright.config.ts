import { defineConfig } from '@playwright/test';
const port = Number(process.env.UNICORE_E2E_PORT || 8082);
const baseURL = `http://127.0.0.1:${port}`;
export default defineConfig({
  testDir: './tests/e2e',
  timeout: 60000,
  workers: 1,
  use: {
    baseURL,
    viewport: { width: 393, height: 852 },
    locale: 'ru-RU',
    launchOptions: process.env.PLAYWRIGHT_CHROME_PATH
      ? { executablePath: process.env.PLAYWRIGHT_CHROME_PATH }
      : {},
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: `node node_modules/expo/bin/cli start --localhost --port ${port}`,
    env: { EXPO_PUBLIC_DATA_MODE: 'mock' },
    url: baseURL,
    reuseExistingServer: false,
    timeout: 120000,
  },
});
