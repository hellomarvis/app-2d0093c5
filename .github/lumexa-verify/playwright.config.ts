import { defineConfig, devices } from '@playwright/test';

// Tests run against the DEPLOYED app (APP_URL). One retry absorbs cold-start
// and network flakiness so only real, repeatable failures reach the fixer.
export default defineConfig({
  testDir: './tests',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  retries: 1,
  workers: 2,
  fullyParallel: false,
  reporter: [['json', { outputFile: process.env.RESULTS_FILE || 'results.json' }], ['list']],
  use: {
    baseURL: process.env.APP_URL,
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile', use: { ...devices['Pixel 7'] }, grep: /@mobile/ },
  ],
});
