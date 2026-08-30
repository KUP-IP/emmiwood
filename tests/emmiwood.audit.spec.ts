import { expect, test, type Page, type Route, type TestInfo } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import type { Catalog, Dashboard } from '../client/src/pages/emmiwood/types';

// Deliberately synthetic fixtures: this suite never reaches D1 or a message provider.
const catalog: Catalog = {
  shop: { id: 'emmiwood', name: 'Emmiwood Barbers', address: '1118 S Minnesota Ave', phone: '+16059006334', timezone: 'America/Chicago', min_notice_minutes: 0, horizon_days: 2, change_cutoff_minutes: 0 },
  services: [{ id: 'signature', name: 'Signature Haircut', description: 'A tailored cut or fade.', price_cents: 3500, duration_minutes: 35, buffer_minutes: 5, active: 1, sort_order: 1 }],
  barbers: [{ id: 'barro', name: 'Barro', bio: 'Cuts and fades.', active: 1, sort_order: 1 }],
  eligibility: [{ id: 'barro--signature', barber_id: 'barro', service_id: 'signature' }],
};
const emptyDashboard: Dashboard = {
  admin: { id: 'audit-owner', email: 'audit@example.invalid', role: 'owner' },
  shop: catalog.shop, appointments: [], barbers: [], services: [], availability: [],
  blocks: [], eligibility: [], outbox: [], events: [], customers: [],
};
const surfaces = [
  { name: 'public', path: '/emmiwood', heading: 'Get the best for less.' },
  { name: 'booking', path: '/emmiwood/book', heading: 'Book your appointment.' },
  { name: 'admin-sign-in', path: '/emmiwood/admin', heading: 'Open the shop.' },
  { name: 'manage-error', path: '/emmiwood/manage', heading: 'Manage appointment.' },
  { name: 'chair-rental', path: '/emmiwood/chair-rental', heading: /./ },
  { name: 'privacy', path: '/emmiwood/privacy/', heading: 'Privacy notice' },
  { name: 'sms-terms', path: '/emmiwood/sms-terms/', heading: 'SMS terms — Appointment Texts' },
  { name: 'opt-in-evidence', path: '/emmiwood/opt-in-evidence/', heading: /./ },
];

async function reply(route: Route, data: unknown, status = 200, code = '') {
  await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(status < 400 ? { ok: true, data } : { ok: false, error: data, code }) });
}
async function screenshot(page: Page, info: TestInfo, name: string) {
  const path = info.outputPath(`${name}.png`);
  await page.screenshot({ path, fullPage: true, animations: 'disabled' });
  await info.attach(name, { path, contentType: 'image/png' });
}
async function noOverflow(page: Page) {
  const size = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, width: document.documentElement.clientWidth }));
  expect(size.scroll).toBeLessThanOrEqual(size.width + 1);
}
async function accessible(page: Page) {
  const result = await new AxeBuilder({ page }).analyze();
  expect(result.violations.filter((item) => ['serious', 'critical'].includes(item.impact || ''))).toEqual([]);
}

test.beforeEach(async ({ page, baseURL }) => {
  expect(baseURL, 'Audit must use the isolated local artifact').toMatch(/^http:\/\/(localhost|127\.0\.0\.1):\d+$/);
  const localOrigin = new URL(baseURL!).origin;
  await page.route('**/*', async (route) => {
    const url = new URL(route.request().url());
    if (url.origin !== localOrigin) return route.abort('blockedbyclient');
    if (url.pathname.startsWith('/api/emmiwood/')) {
      if (route.request().method() !== 'GET') throw new Error(`Unmocked mutation: ${route.request().method()} ${url.pathname}`);
      if (url.pathname === '/api/emmiwood/catalog') return reply(route, catalog);
      if (url.pathname === '/api/emmiwood/slots') return reply(route, []);
      if (url.pathname === '/api/emmiwood/admin/dashboard') return reply(route, 'Please sign in.', 401, 'unauthorized');
      if (url.pathname === '/api/emmiwood/appointments/manage') return reply(route, 'This private link has expired.', 404, 'appointment_not_found');
      throw new Error(`Unmocked API read: ${url.pathname}`);
    }
    if (!['GET', 'HEAD'].includes(route.request().method())) throw new Error(`Unexpected request method: ${route.request().method()}`);
    return route.continue();
  });
});

for (const width of [320, 430, 768, 1440]) {
  test(`audit all public entry surfaces reflow without horizontal overflow at ${width}px`, async ({ page }, info) => {
    test.setTimeout(90_000);
    await page.setViewportSize({ width, height: 900 });
    // 320 CSS pixels is a reflow check, not a claim of actual browser zoom testing.
    for (const surface of surfaces) {
      await page.goto(surface.path);
      await expect(page.getByRole('heading', { level: 1, name: surface.heading }).first()).toBeVisible();
      await noOverflow(page);
      await screenshot(page, info, `${surface.name}-${width}`);
    }
  });
}

test('audit reduced-motion public, booking, sign-in, legal, and management-error accessibility', async ({ page }, info) => {
  test.setTimeout(90_000);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  for (const surface of surfaces.filter((item) => ['public', 'booking', 'admin-sign-in', 'privacy', 'manage-error'].includes(item.name))) {
    await page.goto(surface.path);
    await expect(page.getByRole('heading', { level: 1, name: surface.heading }).first()).toBeVisible();
    expect(await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches)).toBe(true);
    await accessible(page);
    await noOverflow(page);
    await screenshot(page, info, `${surface.name}-reduced-motion`);
  }
});

test('audit public skip link transfers keyboard focus and EWB marks remain square', async ({ page }, info) => {
  await page.goto('/emmiwood');
  await expect(page.getByRole('heading', { name: 'Get the best for less.' })).toBeVisible();
  await page.keyboard.press('Tab');
  await expect(page.getByRole('link', { name: 'Skip to content' })).toBeFocused();
  await screenshot(page, info, 'public-skip-link-focus');
  await page.keyboard.press('Enter');
  await expect(page.locator('#main')).toBeFocused();
  const marks = page.locator('.ew-brand img');
  expect(await marks.count()).toBeGreaterThan(0);
  for (const mark of await marks.all()) {
    await expect(mark).toHaveAttribute('src', '/emmiwood/brand/ewb-app-icon-192.png');
    const metric = await mark.evaluate((image: HTMLImageElement) => ({ loaded: image.complete && image.naturalWidth > 0, width: image.getBoundingClientRect().width, height: image.getBoundingClientRect().height }));
    expect(metric.loaded).toBe(true);
    expect(metric.width).toBeGreaterThan(0);
    expect(Math.abs(metric.width - metric.height)).toBeLessThanOrEqual(1);
  }
  await screenshot(page, info, 'public-main-keyboard-focus');
});

test('audit management token exchange retries transient failure but stops at terminal expiry', async ({ page }, info) => {
  let exchanges = 0;
  const token = 'audit-only-token-never-sent-to-server';
  await page.route('**/api/emmiwood/appointments/manage-session', async (route) => {
    expect(route.request().method()).toBe('POST');
    expect(route.request().postDataJSON()).toEqual({ token });
    exchanges += 1;
    return exchanges === 1
      ? reply(route, 'Appointment lookup is temporarily unavailable.', 503, 'temporarily_unavailable')
      : reply(route, 'This private link has expired.', 404, 'appointment_not_found');
  });
  await page.goto(`/emmiwood/manage#token=${token}`);
  await expect(page.getByRole('heading', { name: 'Manage appointment.' })).toBeVisible();
  await expect(page.getByRole('alert')).toContainText('temporarily unavailable');
  await expect(page).not.toHaveURL(/token=/);
  await expect(page.getByRole('button', { name: 'Try opening again' })).toBeVisible();
  await screenshot(page, info, 'manage-transient-retry');
  await page.getByRole('button', { name: 'Try opening again' }).click();
  await expect(page.getByRole('alert')).toContainText('expired');
  await expect(page.getByRole('button', { name: 'Try opening again' })).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Book another appointment' })).toBeVisible();
  expect(exchanges).toBe(2);
  await noOverflow(page);
  await accessible(page);
  await screenshot(page, info, 'manage-terminal-expired');
});

test('audit booking availability loading, empty, failed-read, and retry recovery states', async ({ page }, info) => {
  let releaseReads!: () => void;
  const waiting = new Promise<void>((resolve) => { releaseReads = resolve; });
  let mode: 'loading' | 'empty' | 'error' = 'loading';
  await page.route('**/api/emmiwood/slots?*', async (route) => {
    if (mode === 'loading') await waiting;
    return mode === 'error' ? reply(route, 'Availability is temporarily unavailable.', 503, 'unavailable') : reply(route, []);
  });
  await page.goto('/emmiwood/book?service=signature&barber=barro');
  await page.getByRole('button', { name: 'Find openings' }).click();
  await expect(page.getByRole('heading', { name: 'Choose the time.' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Searching…', exact: true })).toBeDisabled();
  await expect(page.locator('.ew-slot-status')).toContainText('Searching');
  await screenshot(page, info, 'booking-loading');
  mode = 'empty';
  releaseReads();
  await expect(page.getByText('No openings this day.', { exact: true })).toBeVisible();
  await screenshot(page, info, 'booking-empty');
  mode = 'error';
  await page.getByRole('button', { name: 'Find next', exact: true }).click();
  await expect(page.getByText("Couldn't check this day.", { exact: true })).toBeVisible();
  await expect(page.locator('.ew-slot-status')).toContainText('could not check');
  await expect(page.getByText('No openings this day.', { exact: true })).toHaveCount(0);
  await noOverflow(page);
  await accessible(page);
  await screenshot(page, info, 'booking-failed-read');
  mode = 'empty';
  await page.getByRole('button', { name: /^Retry / }).click();
  await expect(page.getByText('No openings this day.', { exact: true })).toBeVisible();
  await screenshot(page, info, 'booking-recovered-empty');
});

test('audit workspace loading, recoverable failure, and each empty tab without account access', async ({ page }, info) => {
  test.setTimeout(90_000);
  let releaseDashboard!: () => void;
  const waiting = new Promise<void>((resolve) => { releaseDashboard = resolve; });
  let attempts = 0;
  await page.route('**/api/emmiwood/admin/dashboard', async (route) => {
    attempts += 1;
    if (attempts === 1) { await waiting; return reply(route, 'Workspace temporarily unavailable.', 503, 'unavailable'); }
    return reply(route, emptyDashboard);
  });
  await page.goto('/emmiwood/admin');
  await expect(page.getByRole('status')).toContainText('Opening the shop workspace');
  await screenshot(page, info, 'admin-loading');
  releaseDashboard();
  await expect(page.getByRole('heading', { name: "Couldn't open the shop." })).toBeVisible();
  await expect(page.getByRole('alert')).toContainText('temporarily unavailable');
  await screenshot(page, info, 'admin-recoverable-error');
  await page.getByRole('button', { name: 'Try again', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'No booked appointments today.' })).toBeVisible();
  await screenshot(page, info, 'admin-today-empty');
  const primary = page.getByRole('navigation', { name: 'Shop workspace', exact: true });
  await primary.getByRole('button', { name: 'Book', exact: true }).click();
  await expect(page.getByText('No appointments yet.', { exact: true })).toBeVisible();
  await screenshot(page, info, 'admin-book-empty');
  await primary.getByRole('button', { name: 'Shop', exact: true }).click();
  const setup = page.getByRole('navigation', { name: 'Shop setup', exact: true });
  for (const [tab, emptyText] of [
    ['Hours', 'No recurring hours yet.'], ['Closures', 'No closures yet.'],
    ['Team', 'No team yet.'], ['Services', 'No services yet.'],
    ['Customers', 'No customer history yet.'], ['Texts', 'No appointment texts yet.'],
  ]) {
    await setup.getByRole('button', { name: tab, exact: true }).click();
    await expect(page.getByText(emptyText, { exact: true })).toBeVisible();
    await noOverflow(page);
    await accessible(page);
    await screenshot(page, info, `admin-${tab.toLowerCase()}-empty`);
  }
  await expect(page.getByText('No recent activity.', { exact: true })).toBeVisible();
  expect(attempts).toBe(2);
});
