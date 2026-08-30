import { expect, test, type Page, type Route, type TestInfo } from '@playwright/test';
import type { Appointment, Catalog } from '../client/src/pages/emmiwood/types';

const catalog: Catalog = {
  shop: { id: 'audit-shop', name: 'Emmiwood Barbers', address: '1118 S Minnesota Ave', phone: '+16059006334', timezone: 'America/Chicago', min_notice_minutes: 0, horizon_days: 2, change_cutoff_minutes: 0 },
  services: [{ id: 'signature', name: 'Signature Haircut', description: 'A tailored cut.', price_cents: 3500, duration_minutes: 35, buffer_minutes: 5, active: 1, sort_order: 1 }],
  barbers: [{ id: 'barro', name: 'Barro', bio: 'Cuts and fades.', active: 1, sort_order: 1 }],
  eligibility: [{ id: 'barro-signature', barber_id: 'barro', service_id: 'signature' }],
};
const appointment: Appointment = {
  id: 'audit-appointment', service_id: 'signature', barber_id: 'barro',
  start_at: Math.floor(Date.now() / 1000) + 86400, end_at: Math.floor(Date.now() / 1000) + 88500,
  status: 'booked', customer_name: 'Fixture Guest', phone: '+16055550199',
  barber_name: 'Barro', service_name: 'Signature Haircut', price_cents: 3500,
};

async function reply(route: Route, data: unknown) {
  await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ ok: true, data }) });
}
async function evidence(page: Page, info: TestInfo, name: string) {
  const path = info.outputPath(`${name}.png`);
  await page.screenshot({ path, fullPage: true, animations: 'disabled' });
  await info.attach(name, { path, contentType: 'image/png' });
}

test.beforeEach(async ({ page, baseURL }) => {
  expect(baseURL).toMatch(/^http:\/\/(localhost|127\.0\.0\.1):\d+$/);
  await page.route('**/*', async (route) => {
    const url = new URL(route.request().url());
    if (url.origin !== new URL(baseURL!).origin) return route.abort('blockedbyclient');
    if (url.pathname.startsWith('/api/emmiwood/')) {
      if (route.request().method() !== 'GET') throw new Error(`Unmocked mutation: ${url.pathname}`);
      if (url.pathname.endsWith('/catalog')) return reply(route, catalog);
      if (url.pathname.endsWith('/appointments/manage')) return reply(route, appointment);
      if (url.pathname.endsWith('/slots')) {
        const date = url.searchParams.get('date');
        return reply(route, [{ start: Date.parse(`${date}T15:00:00Z`) / 1000, barberId: 'barro', barberName: 'Barro' }]);
      }
      throw new Error(`Unmocked API read: ${url.pathname}`);
    }
    if (!['GET', 'HEAD'].includes(route.request().method())) throw new Error(`Unexpected request: ${route.request().method()}`);
    return route.continue();
  });
});

test('empty live catalog offers explicit recovery instead of an unreachable booking step', async ({ page }, info) => {
  await page.route('**/api/emmiwood/catalog', (route) => reply(route, { ...catalog, services: [], eligibility: [] }));
  await page.goto('/emmiwood/book');
  await expect(page.getByRole('heading', { name: 'Online booking is unavailable.' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Refresh services' })).toHaveAttribute('href', '/emmiwood/book');
  await expect(page.getByRole('link', { name: 'Back to the shop' }).last()).toBeVisible();
  await expect(page.getByRole('button', { name: 'Find openings' })).toHaveCount(0);
  await evidence(page, info, 'catalog-empty-recovery');
});

test('live catalog replacement selects a valid service and preserves a usable next step', async ({ page }, info) => {
  const replacement = {
    ...catalog,
    services: [{ ...catalog.services[0], id: 'fixture-service', name: 'Fixture Haircut' }],
    eligibility: [{ id: 'barro-fixture-service', barber_id: 'barro', service_id: 'fixture-service' }],
  };
  await page.route('**/api/emmiwood/catalog', (route) => reply(route, replacement));
  await page.goto('/emmiwood/book?service=signature');
  await expect(page.getByRole('radio', { name: /Fixture Haircut/ })).toBeChecked();
  await page.getByRole('button', { name: 'Find openings' }).click();
  await expect(page.getByRole('heading', { name: 'Choose the time.' })).toBeVisible();
  await expect(page.locator('.ew-slot-grid button').first()).toBeVisible();
  await evidence(page, info, 'catalog-replacement-time-step');
});

for (const flow of ['booking', 'manage'] as const) {
  test(`${flow} clears the selected time before refresh and after same-day results change`, async ({ page }, info) => {
    let refreshing = false;
    let releaseReads!: () => void;
    const held = new Promise<void>((resolve) => { releaseReads = resolve; });
    await page.route('**/api/emmiwood/slots?*', async (route) => {
      if (refreshing) await held;
      const date = new URL(route.request().url()).searchParams.get('date');
      return reply(route, [{ start: Date.parse(`${date}T${refreshing ? '16' : '15'}:00:00Z`) / 1000, barberId: 'barro', barberName: 'Barro' }]);
    });
    await page.goto(flow === 'booking' ? '/emmiwood/book?service=signature&barber=barro' : '/emmiwood/manage');
    await page.getByRole('button', { name: flow === 'booking' ? 'Find openings' : 'Find another time', exact: true }).click();
    await page.locator('.ew-slot-grid button').first().click();
    await expect(page.locator('.ew-slot-grid button[aria-pressed="true"]')).toHaveCount(1);
    const selectedDate = await page.locator('.ew-date-picker input').inputValue();
    refreshing = true;
    await page.getByRole('button', { name: 'Find next', exact: true }).click();
    const advance = page.getByRole('button', { name: flow === 'booking' ? 'Confirm a time' : 'Choose a new time', exact: true });
    await expect(advance).toBeDisabled();
    await expect(page.locator('.ew-selected-slot')).toHaveCount(0);
    await evidence(page, info, `${flow}-refresh-clears-selection`);
    releaseReads();
    await expect(page.getByRole('button', { name: 'Find next', exact: true })).toBeEnabled();
    await expect(page.locator('.ew-date-picker input')).toHaveValue(selectedDate);
    await expect(page.locator('.ew-slot-grid button').first()).toBeVisible();
    await expect(page.locator('.ew-slot-grid button[aria-pressed="true"]')).toHaveCount(0);
    await expect(advance).toBeDisabled();
    await evidence(page, info, `${flow}-same-day-results-unselected`);
  });
}

test('booking submission keeps details locked and sends only one mocked request while pending', async ({ page }, info) => {
  let submissions = 0;
  let releasePost!: () => void;
  const held = new Promise<void>((resolve) => { releasePost = resolve; });
  await page.route('**/api/emmiwood/appointments', async (route) => {
    expect(route.request().method()).toBe('POST');
    submissions += 1;
    const input = route.request().postDataJSON();
    await held;
    return reply(route, { id: 'mocked-booking', manageToken: 'mocked-token', start: input.start, barberName: 'Barro', serviceName: 'Signature Haircut' });
  });
  await page.goto('/emmiwood/book?service=signature&barber=barro');
  await page.getByRole('button', { name: 'Find openings' }).click();
  await page.locator('.ew-slot-grid button').first().click();
  await page.getByRole('button', { name: /^Confirm \d/ }).click();
  await page.getByLabel('Name', { exact: true }).fill('Fixture Guest');
  await page.getByRole('textbox', { name: /^Mobile/ }).fill('6055550199');
  await page.getByRole('button', { name: 'Review appointment' }).click();
  await page.getByRole('button', { name: /^Confirm ·/ }).evaluate((button: HTMLButtonElement) => { button.click(); button.click(); });
  await expect(page.getByRole('button', { name: 'Securing appointment…' })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Edit details' })).toBeDisabled();
  await expect.poll(() => submissions).toBe(1);
  await evidence(page, info, 'booking-pending-single-request');
  releasePost();
  await expect(page.getByRole('heading', { name: 'You’re on the books.' })).toBeFocused();
  expect(submissions).toBe(1);
  await evidence(page, info, 'booking-mocked-confirmed-focus');
});

for (const stage of ['details', 'review'] as const) {
  test(`delayed catalog removes selected barber during ${stage} without losing guest details or navigation`, async ({ page }, info) => {
    let releaseCatalog!: () => void;
    const held = new Promise<void>((resolve) => { releaseCatalog = resolve; });
    let liveCatalog = false;
    const replacement: Catalog = {
      ...catalog,
      barbers: [{ ...catalog.barbers[0], id: 'john', name: 'John' }],
      eligibility: [{ id: 'john-signature', barber_id: 'john', service_id: 'signature' }],
    };
    await page.route('**/api/emmiwood/catalog', async (route) => { await held; return reply(route, replacement); });
    await page.route('**/api/emmiwood/slots?*', (route) => {
      const date = new URL(route.request().url()).searchParams.get('date');
      return reply(route, [{ start: Date.parse(`${date}T15:00:00Z`) / 1000, barberId: liveCatalog ? 'john' : 'barro', barberName: liveCatalog ? 'John' : 'Barro' }]);
    });
    await page.goto('/emmiwood/book?service=signature&barber=barro');
    await page.getByRole('button', { name: 'Find openings' }).click();
    await page.locator('.ew-slot-grid button').first().click();
    await page.getByRole('button', { name: /^Confirm \d/ }).click();
    await page.getByLabel('Name', { exact: true }).fill('Preserved Fixture Guest');
    await page.getByRole('textbox', { name: /^Mobile/ }).fill('6055550199');
    if (stage === 'review') await page.getByRole('button', { name: 'Review appointment' }).click();
    liveCatalog = true;
    releaseCatalog();
    await expect(page.getByRole('heading', { name: /How can we help/ })).toBeVisible();
    await expect(page.getByRole('radio', { name: /First available/ })).toBeChecked();
    await expect(page.getByRole('button', { name: 'Find openings' })).toBeEnabled();
    await evidence(page, info, `catalog-barber-removed-${stage}-recovered`);
    await page.getByRole('button', { name: 'Find openings' }).click();
    await page.locator('.ew-slot-grid button').first().click();
    await page.getByRole('button', { name: /^Confirm \d/ }).click();
    await expect(page.getByLabel('Name', { exact: true })).toHaveValue('Preserved Fixture Guest');
    await expect(page.getByRole('textbox', { name: /^Mobile/ })).toHaveValue(/605.*555.*0199/);
    await evidence(page, info, `catalog-barber-removed-${stage}-details-retained`);
  });
}

test('service removed during pending failed booking reconciles after completion without automatic resubmission', async ({ page }, info) => {
  let releaseCatalog!: () => void;
  let releasePost!: () => void;
  const catalogHeld = new Promise<void>((resolve) => { releaseCatalog = resolve; });
  const postHeld = new Promise<void>((resolve) => { releasePost = resolve; });
  let submissions = 0;
  const replacement: Catalog = {
    ...catalog,
    services: [{ ...catalog.services[0], id: 'replacement-service', name: 'Replacement Haircut' }],
    eligibility: [{ id: 'barro-replacement', barber_id: 'barro', service_id: 'replacement-service' }],
  };
  await page.route('**/api/emmiwood/catalog', async (route) => { await catalogHeld; return reply(route, replacement); });
  await page.route('**/api/emmiwood/appointments', async (route) => {
    expect(route.request().method()).toBe('POST');
    submissions += 1;
    await postHeld;
    return route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ ok: false, error: 'Fixture reservation failed.' }) });
  });
  await page.goto('/emmiwood/book?service=signature&barber=barro');
  await page.getByRole('button', { name: 'Find openings' }).click();
  await page.locator('.ew-slot-grid button').first().click();
  await page.getByRole('button', { name: /^Confirm \d/ }).click();
  await page.getByLabel('Name', { exact: true }).fill('Pending Fixture Guest');
  await page.getByRole('textbox', { name: /^Mobile/ }).fill('6055550199');
  await page.getByRole('button', { name: 'Review appointment' }).click();
  await page.getByRole('button', { name: /^Confirm ·/ }).click();
  await expect.poll(() => submissions).toBe(1);
  const catalogResponse = page.waitForResponse('**/api/emmiwood/catalog');
  releaseCatalog();
  await (await catalogResponse).finished();
  await expect(page.getByRole('button', { name: 'Securing appointment…' })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Edit details' })).toBeDisabled();
  await evidence(page, info, 'catalog-service-removed-pending-still-visible');
  releasePost();
  await expect(page.getByRole('heading', { name: /How can we help/ })).toBeVisible();
  await expect(page.getByRole('radio', { name: /Replacement Haircut/ })).toBeChecked();
  await expect(page.getByRole('button', { name: 'Find openings' })).toBeEnabled();
  expect(submissions).toBe(1);
  await page.getByRole('button', { name: 'Find openings' }).click();
  await page.locator('.ew-slot-grid button').first().click();
  await page.getByRole('button', { name: /^Confirm \d/ }).click();
  await expect(page.getByLabel('Name', { exact: true })).toHaveValue('Pending Fixture Guest');
  await expect(page.getByRole('textbox', { name: /^Mobile/ })).toHaveValue(/605.*555.*0199/);
  expect(submissions).toBe(1);
  await evidence(page, info, 'catalog-service-removed-failure-recovered');
});
