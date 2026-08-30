import { expect, test as base, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { assertSafeLiveRequest, assertSafeLiveResponse, guardApiRequestContext, guardSharedApiRequestContext } from '../scripts/safe-live-request-guard.mjs';

const test = base.extend<{ mutationGuard: void }>({
  request: async ({ playwright }, use, testInfo) => {
    const request = await playwright.request.newContext({ baseURL: String(testInfo.project.use.baseURL) });
    try {
      await use(guardApiRequestContext(request, String(testInfo.project.use.baseURL)));
    } finally {
      await request.dispose();
    }
  },
  mutationGuard: [async ({ context }, use, testInfo) => {
    const blocked: string[] = [];
    const restoreRequestGuard = guardSharedApiRequestContext(context.request, String(testInfo.project.use.baseURL));
    await context.route('**/*', async (route) => {
      const method = route.request().method().toUpperCase();
      try {
        assertSafeLiveRequest(route.request());
      } catch {
        blocked.push(`${method} ${route.request().url()}`);
        await route.abort('blockedbyclient');
        return;
      }
      // Playwright routing only intercepts the first URL of an automatic
      // redirect chain. Fetch one hop, then reject redirects before fulfilling
      // so no subsequent HTTP downgrade can escape the URL guard.
      const response = await route.fetch({ maxRedirects: 0 });
      try {
        assertSafeLiveResponse(response.status());
      } catch {
        blocked.push(`REDIRECT ${route.request().url()}`);
        await route.abort('blockedbyclient');
        return;
      }
      await route.fulfill({ response });
    });
    // WebSockets can mutate state without an HTTP mutation method. This lane
    // does not need them and never connects their server-side transport.
    await context.routeWebSocket('**/*', (socket) => {
      blocked.push(`WEBSOCKET ${socket.url()}`);
      socket.close();
    });
    try {
      await use();
      expect(blocked, 'safe-live lane attempted a mutating, insecure, or socket request').toEqual([]);
    } finally {
      restoreRequestGuard();
    }
  }, { auto: true }],
});

async function expectNoSeriousAccessibilityViolations(page: Page) {
  const accessibility = await new AxeBuilder({ page }).analyze();
  expect(accessibility.violations.filter((item) => ['serious', 'critical'].includes(item.impact || ''))).toEqual([]);
}

async function expectNoPageOverflow(page: Page) {
  const dimensions = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth + 1);
}

test('safe-live public and legal surfaces are readable and shop-owned', async ({ page, request }) => {
  for (const route of ['/emmiwood/', '/emmiwood/book/', '/emmiwood/manage/', '/emmiwood/admin/', '/emmiwood/chair-rental/']) {
    const response = await request.get(route);
    expect(response.ok(), route).toBeTruthy();
    expect(await response.text(), route).toContain('Emmiwood');
  }
  for (const route of ['/emmiwood/privacy/', '/emmiwood/sms-terms/', '/emmiwood/opt-in-evidence/']) {
    const response = await request.get(route);
    expect(response.ok(), route).toBeTruthy();
    expect(await response.text(), route).not.toContain('id="root"');
  }
  await page.goto('/emmiwood', { waitUntil: 'networkidle' });
  await expect(page.getByRole('heading', { name: 'Get the best for less.' })).toBeVisible();
  await expectNoPageOverflow(page);
  await expectNoSeriousAccessibilityViolations(page);
});

test('safe-live booking stops before customer data or reservation writes', async ({ page }) => {
  await page.goto('/emmiwood/book?service=signature&barber=barro', { waitUntil: 'networkidle' });
  await expect(page.locator('.ew-choice-grid label.selected')).toContainText('Signature Haircut');
  await expect(page.locator('.ew-barber-choice label.selected')).toContainText('Barro');
  await page.getByRole('button', { name: 'Find openings' }).click();
  await expect(page.getByRole('heading', { name: 'Choose the time.' })).toBeVisible();
  await expect(page.locator('.ew-day-tabs [role="tab"]')).toHaveCount(7);
  await expectNoPageOverflow(page);
  await expectNoSeriousAccessibilityViolations(page);
});

test('safe-live management surface remains at unauthenticated entry', async ({ page }) => {
  await page.goto('/emmiwood/manage', { waitUntil: 'networkidle' });
  await expect(page.getByRole('heading', { name: 'Manage appointment.' })).toBeVisible();
  await expectNoPageOverflow(page);
  await expectNoSeriousAccessibilityViolations(page);
});

test('safe-live staff surface stops before requesting an OTP', async ({ page }) => {
  await page.goto('/emmiwood/admin', { waitUntil: 'networkidle' });
  await expect(page.getByRole('heading', { name: 'Open the shop.' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Text me a code' })).toBeVisible();
  await expectNoPageOverflow(page);
  await expectNoSeriousAccessibilityViolations(page);
});
