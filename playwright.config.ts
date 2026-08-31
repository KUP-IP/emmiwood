import { defineConfig, devices } from '@playwright/test';

const e2ePort = process.env.EMMIWOOD_E2E_PORT || '8788';
const e2eBaseURL = `http://localhost:${e2ePort}`;

export default defineConfig({
  testDir: './tests',
  testMatch: ['emmiwood.spec.ts', 'emmiwood.audit.spec.ts', 'emmiwood.admin-audit.spec.ts', 'emmiwood.booking-audit.spec.ts'],
  outputDir: 'test-results/chromium',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 45_000,
  expect: { timeout: 20_000 },
  reporter: [['list'], ['html', { outputFolder: 'playwright-report/emmiwood', open: 'never' }]],
  metadata: { executionBoundary: 'isolated-local-d1', artifact: '.deploy/pages/artifact-manifest.json' },
  use: {
    baseURL: e2eBaseURL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } },
    { name: 'mobile', use: { ...devices['Pixel 5'] } },
  ],
  webServer: {
    command: `EMMIWOOD_E2E_PORT=${e2ePort} npm run dev:e2e`,
    url: `${e2eBaseURL}/api/health`,
    reuseExistingServer: false,
    timeout: 120_000,
    stdout: 'pipe',
    stderr: 'pipe',
  },
});
