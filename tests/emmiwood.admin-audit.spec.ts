import { type Page, type Route } from '@playwright/test';
import { expect, test } from './e2e-server-ready';
import AxeBuilder from '@axe-core/playwright';

// Browser-only fixtures: every API request is intercepted; no D1 or SMS effects.
function dashboardFixture() {
  return {
    admin: { id: 'audit-owner', email: 'Owner audit fixture', role: 'owner' },
    shop: { id: 'emmiwood', name: 'Emmiwood', timezone: 'America/Chicago', horizon_days: 7 },
    appointments: [], customers: [], outbox: [], events: [], blocks: [], eligibility: [],
    barbers: [{ id: 'audit-barber', name: 'Audit Barber', bio: 'Fixture only', active: 1, sort_order: 1, phone: '+16059006334' }],
    services: [
      { id: 'audit-cut', name: 'Audit Cut', description: 'Fixture haircut', price_cents: 2500, duration_minutes: 30, buffer_minutes: 5, active: 1, sort_order: 1 },
      { id: 'audit-beard', name: 'Audit Beard', description: 'Fixture beard', price_cents: 1500, duration_minutes: 15, buffer_minutes: 0, active: 1, sort_order: 2 },
    ],
    availability: [],
  };
}

async function fixtureRoutes(
  page: Page,
  handler?: (route: Route) => Promise<boolean>,
  dashboard: ReturnType<typeof dashboardFixture> = dashboardFixture(),
) {
  await page.route('**/api/emmiwood/**', async (route) => {
    if (handler && await handler(route)) return;
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith('/admin/dashboard')) {
      await route.fulfill({ json: { ok: true, data: dashboard } });
    } else if (path.endsWith('/slots')) {
      await route.fulfill({ json: { ok: true, data: [] } });
    } else {
      await route.fulfill({ status: 503, json: { ok: false, error: 'Controlled audit failure. No action was sent.' } });
    }
  });
}

test('manager cannot edit the barber roster or service fit', async ({ page }, testInfo) => {
  await fixtureRoutes(page, undefined, {
    ...dashboardFixture(),
    admin: { id: 'audit-manager', email: 'Manager audit fixture', role: 'manager' },
  });
  await page.goto('/emmiwood/admin');
  await page.getByRole('button', { name: 'Shop', exact: true }).click();
  await page.getByRole('button', { name: 'Team', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Team', exact: true })).toBeVisible();
  await expect(page.getByText('Staff SMS on')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Add new', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Edit', exact: true })).toHaveCount(0);
  await expect(page.getByRole('checkbox').first()).toBeDisabled();
  await page.screenshot({ path: testInfo.outputPath('manager-team-readonly.png'), fullPage: true });
});

test('owner Team editor includes the staff SMS number', async ({ page }, testInfo) => {
  await fixtureRoutes(page);
  await page.goto('/emmiwood/admin');
  await page.getByRole('button', { name: 'Shop', exact: true }).click();
  await page.getByRole('button', { name: 'Team', exact: true }).click();
  await page.getByRole('button', { name: 'Add new', exact: true }).click();
  await expect(page.getByLabel('Staff SMS number', { exact: true })).toBeVisible();
  await page.locator('.ewa-resource-list article').filter({ hasText: 'Audit Barber' }).getByRole('button', { name: 'Edit', exact: true }).click();
  await expect(page.getByLabel('Staff SMS number', { exact: true })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('owner-team-staff-sms.png'), fullPage: true });
});

test('staff hours snapshot survives disabled controls and duplicate submits', async ({ page }, testInfo) => {
  const saves: Record<string, unknown>[] = [];
  let releaseSave!: () => void;
  const released = new Promise<void>((resolve) => { releaseSave = resolve; });
  await fixtureRoutes(page, async (route) => {
    if (!route.request().url().endsWith('/admin/resources/availability')) return false;
    saves.push(route.request().postDataJSON());
    await released;
    await route.fulfill({ json: { ok: true, data: { id: 'audit-hours' } } });
    return true;
  });
  await page.goto('/emmiwood/admin');
  await page.getByRole('button', { name: 'Shop', exact: true }).click();
  await page.getByRole('button', { name: 'Add new', exact: true }).click();
  await expect(page.getByRole('combobox', { name: 'Barber', exact: true })).toBeFocused();
  await expect(page.getByLabel('Starts', { exact: true })).toHaveValue('09:00');
  await expect(page.getByLabel('Ends', { exact: true })).toHaveValue('17:00');
  try {
    await page.locator('form.ewa-edit').evaluate((form) => {
      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    });
    await expect.poll(() => saves.length).toBe(1);
    expect(saves[0]).toMatchObject({ barber_id: 'audit-barber', weekday: 1, start_minute: 540, end_minute: 1020, active: 1 });
    await expect(page.getByLabel('Starts', { exact: true })).toBeDisabled();
    await expect(page.getByRole('button', { name: 'Close', exact: true })).toBeDisabled();
    await page.screenshot({ path: testInfo.outputPath('hours-saving.png'), fullPage: true });
  } finally {
    releaseSave();
  }
  await expect(page.getByText('Hours saved.', { exact: true })).toBeVisible();
  expect(saves).toHaveLength(1);
});

test('staff editors reset between records and all-day closures match storage contract', async ({ page }, testInfo) => {
  const closures: Record<string, unknown>[] = [];
  await fixtureRoutes(page, async (route) => {
    if (!route.request().url().endsWith('/admin/resources/blocks')) return false;
    closures.push(route.request().postDataJSON());
    await route.fulfill({ json: { ok: true, data: { id: 'audit-closure' } } });
    return true;
  });
  await page.goto('/emmiwood/admin');
  await page.getByRole('button', { name: 'Shop', exact: true }).click();
  await page.getByRole('button', { name: 'Services', exact: true }).click();
  await page.locator('.ewa-resource-list article').filter({ hasText: 'Audit Cut' }).getByRole('button', { name: 'Edit', exact: true }).click();
  await expect(page.getByLabel('Name', { exact: true })).toHaveValue('Audit Cut');
  await page.locator('.ewa-resource-list article').filter({ hasText: 'Audit Beard' }).getByRole('button', { name: 'Edit', exact: true }).click();
  await expect(page.getByLabel('Name', { exact: true })).toHaveValue('Audit Beard');
  await expect(page.getByLabel('Name', { exact: true })).toBeFocused();
  await page.getByRole('button', { name: 'Closures', exact: true }).click();
  await page.getByRole('button', { name: 'Add new', exact: true }).click();
  await page.getByLabel('Date', { exact: true }).fill('2026-12-25');
  await page.getByRole('combobox', { name: 'Type', exact: true }).selectOption('closed');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByText('Closures saved.', { exact: true })).toBeVisible();
  expect(closures).toEqual([expect.objectContaining({ date: '2026-12-25', barber_id: null, start_minute: 0, end_minute: 1440, kind: 'closed' })]);
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Sign out could not be confirmed');
  await expect(page.getByRole('button', { name: 'Sign out', exact: true })).toBeEnabled();
  await expect(page.getByRole('heading', { name: 'Closures', exact: true })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('logout-recovery.png'), fullPage: true });
});

test('staff empty states and failure feedback remain accessible at audit widths', async ({ page }, testInfo) => {
  test.setTimeout(120_000);
  await fixtureRoutes(page);
  await page.goto('/emmiwood/admin');
  for (const width of [320, 430, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    const signOut = await page.getByRole('button', { name: 'Sign out', exact: true }).boundingBox();
    expect(signOut).not.toBeNull();
    expect(signOut!.x).toBeGreaterThanOrEqual(0);
    expect(signOut!.x + signOut!.width).toBeLessThanOrEqual(width);
    await page.emulateMedia({ reducedMotion: width === 430 ? 'reduce' : 'no-preference' });
    await page.getByRole('button', { name: 'Shop', exact: true }).click();
    for (const label of ['Hours', 'Closures', 'Team', 'Services', 'Customers', 'Texts']) {
      await page.getByRole('button', { name: label, exact: true }).click();
      await expect(page.getByRole('heading', { name: label, exact: true })).toBeVisible();
      const size = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, client: document.documentElement.clientWidth }));
      expect(size.scroll, `${label} at ${width}px`).toBeLessThanOrEqual(size.client + 1);
      if (width === 320 || width === 1440) {
        const axe = await new AxeBuilder({ page }).analyze();
        expect(axe.violations.filter((item) => item.impact === 'serious' || item.impact === 'critical'), `${label} at ${width}px`).toEqual([]);
      }
      await page.screenshot({ path: testInfo.outputPath(`staff-${label.toLowerCase()}-${width}.png`), fullPage: true });
    }
  }
});

test('verified staff login retries only dashboard after dashboard failure', async ({ page }, testInfo) => {
  let dashboardRequests = 0;
  let codeRequests = 0;
  let verifications = 0;
  await fixtureRoutes(page, async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith('/admin/dashboard')) {
      dashboardRequests += 1;
      if (dashboardRequests === 1) {
        await route.fulfill({ status: 401, json: { ok: false, error: 'Sign in to continue.' } });
      } else if (dashboardRequests === 2) {
        await route.fulfill({ status: 503, json: { ok: false, error: 'Workspace temporarily unavailable.' } });
      } else {
        await route.fulfill({ json: { ok: true, data: dashboardFixture() } });
      }
      return true;
    }
    if (path.endsWith('/admin/auth/request-code')) {
      codeRequests += 1;
      await route.fulfill({ json: { ok: true, data: { previewCode: '123456' } } });
      return true;
    }
    if (path.endsWith('/admin/auth/verify')) {
      verifications += 1;
      await route.fulfill({ json: { ok: true, data: { admin: dashboardFixture().admin } } });
      return true;
    }
    return false;
  });
  await page.goto('/emmiwood/admin');
  await page.getByLabel('Mobile number', { exact: true }).fill('6055550199');
  await page.getByRole('button', { name: 'Text me a code', exact: true }).click();
  await page.getByLabel('Six-digit code', { exact: true }).fill('123456');
  await page.getByRole('button', { name: 'Verify and enter', exact: true }).click();
  await expect(page.getByRole('heading', { name: "Couldn't open the shop.", exact: true })).toBeVisible();
  await expect(page.getByRole('alert')).toContainText('Workspace temporarily unavailable.');
  await expect(page.getByLabel('Six-digit code', { exact: true })).toHaveCount(0);
  await page.screenshot({ path: testInfo.outputPath('verified-login-dashboard-recovery.png'), fullPage: true });
  await page.getByRole('button', { name: 'Try again', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Today', exact: true })).toBeVisible();
  expect(dashboardRequests).toBe(3);
  expect(codeRequests).toBe(1);
  expect(verifications).toBe(1);
});
