import { defineConfig } from '@playwright/test';
import { existsSync } from 'node:fs';

export default defineConfig({
  testDir: './tests',
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  failOnFlakyTests: !!process.env.CI,
  timeout: 45000,
  expect: { timeout: process.env.CI ? 10000 : 5000 },
  reporter: [
    ['list'],
    ['html', { outputFolder: 'playwright-report', open: 'never' }],
    ['json', { outputFile: 'quality-reports/playwright-results.json' }],
  ],
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL || 'http://127.0.0.1:5173/',
    headless: true,
    serviceWorkers: 'block',
    locale: 'es-PE',
    timezoneId: 'America/Lima',
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
    video: { mode: 'retain-on-failure', size: { width: 1280, height: 720 } },
    launchOptions: {
      executablePath: process.env.CHROMIUM_PATH || (existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined),
      args: ['--no-sandbox'],
    },
  },
  webServer: process.env.PLAYWRIGHT_BASE_URL ? undefined : {
    command: 'npm run dev -- --port 5173',
    url: 'http://127.0.0.1:5173',
    reuseExistingServer: !process.env.CI,
    env: { VITE_LEGACY_DEMO_START: 'true', VITE_DIRECTORY_URL: '/api/people', VITE_MAKE_TEST_API_URL: '/api/integrations/make/test' },
  },
});
