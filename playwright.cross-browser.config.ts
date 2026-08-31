import { defineConfig, devices } from '@playwright/test';

const e2ePort = process.env.EMMIWOOD_E2E_PORT || '8790';
const e2eBaseURL = `http://localhost:${e2ePort}`;

export default defineConfig({
  testDir: './tests',
  testMatch: 'emmiwood.cross-browser.spec.ts',
  outputDir: 'test-results/cross-browser',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 45_000,
  expect: { timeout: 20_000 },
  reporter: [['list'], ['html', { outputFolder: 'playwright-report/emmiwood-cross-browser', open: 'never' }]],
  metadata: { executionBoundary: 'isolated-local-d1-read-only', artifact: '.deploy/pages/artifact-manifest.json' },
  use: {
    baseURL: e2eBaseURL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'firefox-critical', use: { ...devices['Desktop Firefox'], viewport: { width: 1366, height: 768 } } },
    { name: 'webkit-critical', use: { ...devices['Desktop Safari'], viewport: { width: 1366, height: 768 } } },
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
