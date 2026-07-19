import { defineConfig, devices } from '@playwright/test';

const remoteBase = process.env.EMMIWOOD_BASE_URL;
const usePagesArtifact = process.env.EMMIWOOD_USE_PAGES_ARTIFACT === '1';

export default defineConfig({
  testDir: './tests',
  testMatch: 'emmiwood.spec.ts',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 45_000,
  expect: { timeout: 20_000 },
  reporter: [['list'], ['html', { outputFolder: 'playwright-report/emmiwood', open: 'never' }]],
  use: {
    baseURL: remoteBase || 'http://localhost:8788',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } },
    { name: 'mobile', use: { ...devices['Pixel 5'] } },
  ],
  webServer: remoteBase ? undefined : {
    command: usePagesArtifact
      ? 'cd .deploy/pages && npx wrangler pages dev ./static --persist-to ../../.wrangler/state --port 8788 --binding ENVIRONMENT=preview'
      : 'SKIP_GIT_SYNC=1 npm run dev:build',
    url: 'http://localhost:8788/api/health',
    reuseExistingServer: true,
    timeout: 120_000,
    stdout: 'pipe',
    stderr: 'pipe',
  },
});
