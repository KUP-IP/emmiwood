import { defineConfig, devices } from '@playwright/test';
import { validateSafeLiveOrigin } from './scripts/safe-live-request-guard.mjs';

const baseURL = process.env.EMMIWOOD_BASE_URL;
if (!baseURL) throw new Error('EMMIWOOD_BASE_URL is required for the read-only safe-live lane.');

const origin = validateSafeLiveOrigin(baseURL);

export default defineConfig({
  testDir: './tests',
  testMatch: 'emmiwood.live.spec.ts',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 45_000,
  expect: { timeout: 20_000 },
  reporter: [['list'], ['html', { outputFolder: 'playwright-report/emmiwood-live', open: 'never' }]],
  metadata: { executionBoundary: 'read-only-safe-live' },
  use: {
    baseURL: origin,
    serviceWorkers: 'block',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'live-desktop-read-only', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } },
    { name: 'live-mobile-read-only', use: { ...devices['Pixel 5'] } },
  ],
});
