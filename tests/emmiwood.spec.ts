import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

async function expectAccessible(page: Page) {
  // Measure the settled UI, not an intermediate opacity frame on stage entry.
  await page.evaluate(async () => {
    await Promise.all(document.getAnimations().filter((animation) => {
      const timing = animation.effect?.getComputedTiming();
      return animation.playState === 'running' && timing && Number.isFinite(Number(timing.endTime));
    }).map((animation) => animation.finished.catch(() => undefined)));
  });
  const report = await new AxeBuilder({ page }).analyze();
  expect(report.violations.filter((item) => ['serious', 'critical'].includes(item.impact || ''))).toEqual([]);
}

test.afterEach(async ({ page }, info) => {
  if (info.status !== 'passed' || page.url() === 'about:blank') return;
  await expectAccessible(page);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expectAccessible(page);
});

async function expectNoPageOverflow(page: Page) {
  const dimensions = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth + 1);
}

async function openBookingAtTime(page: Page) {
  await page.goto('/emmiwood/book?service=signature&barber=barro', { waitUntil: 'networkidle' });
  await expect(page.getByRole('heading', { name: 'Book your appointment.' })).toBeVisible();
  await expect(page.locator('.ew-choice-grid label.selected')).toContainText('Signature Haircut');
  await expect(page.locator('.ew-barber-choice label.selected')).toContainText('Barro');
  const bookingBarroPhoto = page.locator('.ew-barber-choice label.selected .ew-booking-barber-photo');
  await expect(bookingBarroPhoto).toHaveAttribute('src', '/emmiwood/barro-profile.webp');
  await expect(bookingBarroPhoto).toBeVisible();
  await page.getByRole('button', { name: 'Find openings' }).click();
  await expect(page.getByRole('heading', { name: 'Choose the time.' })).toBeVisible();
  const opening = page.locator('.ew-day-panel .ew-slot-grid button').first();
  await expect(opening).toBeVisible();
  await opening.click();
  await page.getByRole('button', { name: /^Confirm \d/ }).click();
  await expect(page.getByRole('heading', { name: 'Who should we expect?' })).toBeVisible();
  await expectAccessible(page);
}

async function fillGuest(page: Page, suffix: string) {
  await page.getByLabel('Name').fill(`Emmiwood QA ${suffix}`);
  await page.getByLabel('Mobile').fill(suffix === 'mobile' ? '6055550182' : '6055550181');
}

test('every Emmiwood route stays shop-owned; legal pages stay crawler-static', async ({ request }) => {
  const spaRoutes = ['/emmiwood/', '/emmiwood/book/', '/emmiwood/manage/', '/emmiwood/admin/', '/emmiwood/chair-rental/'];
  for (const route of spaRoutes) {
    const response = await request.get(route);
    expect(response.ok(), route).toBeTruthy();
    const html = await response.text();
    expect(html, route).toContain('Emmiwood');
    expect(html, route).not.toContain('KUP Solutions');
    expect(html, route).not.toContain('Isaiah Peters');
    expect(html, route).not.toContain('isaiah-park');
    expect(html, route).not.toContain('kup-logo');
    expect(html, route).not.toContain('605gooddog');
    expect(html, route).not.toContain('bridge-icon');
  }
  const publicHtml = await (await request.get('/emmiwood/')).text();
  expect(publicHtml).toContain('<title>Emmiwood Barbers');
  for (const asset of [
    '/emmiwood/brand/ewb-horizontal-header.webp',
    '/emmiwood/brand/ewb-app-icon-192.png',
    '/emmiwood/brand/ewb-app-icon-512.png',
    '/emmiwood/brand/ewb-maskable-512.png',
    '/emmiwood/brand/ewb-favicon-16.png',
    '/emmiwood/brand/ewb-favicon-32.png',
    '/emmiwood/brand/ewb-favicon-48.png',
    '/emmiwood/brand/ewb-apple-touch-icon-180.png',
    '/emmiwood/brand/ewb-social-og-1200x630.png',
    '/emmiwood/brand/favicon.ico',
    '/emmiwood/brand/manifest.webmanifest',
  ]) {
    expect((await request.get(asset)).ok(), asset).toBeTruthy();
  }

  const privacy = await (await request.get('/emmiwood/privacy/')).text();
  expect(privacy).toContain('Privacy notice');
  expect(privacy).toContain('Retention');
  for (const alias of ['/privacy/', '/privacy.html', '/emmiwood/privacy.html']) {
    expect(await (await request.get(alias)).text(), alias).toBe(privacy);
  }
  expect(privacy).toMatch(/do not share, sell/i);
  expect(privacy).toContain('KUP Solutions');
  expect(privacy).toContain('https://kup.solutions/sms/privacy');
  expect(privacy).not.toContain('id="root"');
  expect(privacy).not.toMatch(/texts from Emmiwood/i);
  expect(privacy).not.toContain('Emmiwood Barbers Appointment Texts');

  const sms = await (await request.get('/emmiwood/sms-terms/')).text();
  expect(sms).toContain('Appointment Texts');
  expect(sms).toMatch(/do not share, sell/i);
  expect(sms).toContain('https://kup.solutions/sms/terms');
  expect(sms).not.toContain('id="root"');
  expect(sms).not.toContain('Emmiwood Barbers Appointment Texts');

  const evidence = await (await request.get('/emmiwood/opt-in-evidence/')).text();
  expect(evidence).toContain('KUP Solutions');
  expect(evidence).toContain('Send me appointment texts.');
  expect(evidence).toContain('Reply STOP to opt out or HELP for help.');
  expect(evidence).toContain('https://kup.solutions/sms/terms');
  expect(evidence).toContain('this booking is for Emmiwood Barbers');
  expect(evidence).not.toContain('id="root"');
  expect(evidence).not.toMatch(/1118 S Minnesota Ave/);
});

test('public site is booking-first, specific, responsive, and accessible', async ({ page }, testInfo) => {
  const forbiddenRequests: string[] = [];
  page.on('request', (request) => {
    if (/isaiah-park|kup-logo|605gooddog|bridge-icon/i.test(request.url())) forbiddenRequests.push(request.url());
  });
  await page.goto('/emmiwood', { waitUntil: 'networkidle' });
  expect(forbiddenRequests).toEqual([]);
  const brandLockup = page.getByRole('img', { name: 'Emmiwood Barbers — cuts, fades, grooming' });
  await expect(brandLockup).toBeVisible();
  await expect(brandLockup).toHaveAttribute('src', '/emmiwood/brand/ewb-horizontal-header.webp');
  await expect(page.locator('link[rel="manifest"]')).toHaveAttribute('href', '/emmiwood/brand/manifest.webmanifest');
  await expect(page.locator('link[rel="apple-touch-icon"]')).toHaveAttribute('href', '/emmiwood/brand/ewb-apple-touch-icon-180.png');
  await expect(page.getByRole('heading', { name: 'Get the best for less.' })).toBeVisible();
  await expect(page.getByText(/1118 S Minnesota Ave/)).toBeVisible();
  const today = page.getByRole('region', { name: 'Today at Emmiwood' });
  await expect(today).toBeVisible();
  await expect(today).toContainText(/Open now|Closed now|Opens at/);
  await expect(today).toContainText('Noon–5:00 PM');
  const hours = page.getByRole('img', { name: 'Daily shop hours' });
  await expect(hours).toContainText('Appointments');
  await expect(hours).toContainText('Walk-ins');
  await expect(hours).toContainText('9:00 AM');
  await expect(hours).toContainText('7:00 PM');
  const directions = page.getByRole('link', { name: 'Get directions' }).first();
  await expect(directions).toHaveAttribute('href', /google\.com\/maps\/search\/\?api=1&query=/);
  const palette = await page.locator('.ew-public').evaluate((element) => {
    const styles = getComputedStyle(element);
    return {
      brown: styles.getPropertyValue('--ew-brown').trim(),
      crimson: styles.getPropertyValue('--ew-crimson').trim(),
      gold: styles.getPropertyValue('--ew-gold').trim(),
      lime: styles.getPropertyValue('--ew-lime').trim(),
    };
  });
  expect(palette.brown).not.toBe('');
  expect(palette.crimson).not.toBe('');
  expect(palette.gold).not.toBe('');
  expect(palette.lime).toBe('');
  await expect(page.getByRole('heading', { name: 'Choose the work you need.' })).toBeVisible();
  await expect(page.getByText('$35', { exact: true }).first()).toBeVisible();
  await expect(page.getByText('35 min', { exact: true }).first()).toBeVisible();
  await expect(page.locator('.ew-proof-row')).toHaveCount(0);
  await expect(page.locator('.ew-manifesto')).toHaveCount(0);
  await expect(hours).not.toContainText('Closed');
  const serviceCards = page.locator('.ew-service-card');
  const barberCards = page.locator('.ew-barber-card');
  await expect(serviceCards).toHaveCount(5);
  await expect(barberCards).toHaveCount(2);

  const visualContract = await page.evaluate(() => {
    const hero = document.querySelector('.ew-public-hero') as HTMLElement | null;
    const booking = document.querySelector('.ew-hero-booking') as HTMLElement | null;
    const service = document.querySelector('.ew-service-card') as HTMLElement | null;
    const barber = document.querySelector('.ew-barber-card') as HTMLElement | null;
    const box = (element: HTMLElement | null) => element?.getBoundingClientRect();
    const heroBox = box(hero);
    const bookingBox = box(booking);
    const serviceBox = box(service);
    const barberBox = box(barber);
    const serviceStyle = service ? getComputedStyle(service) : null;
    const barberStyle = barber ? getComputedStyle(barber) : null;
    return {
      heroHeight: heroBox?.height || 0,
      bookingContained: Boolean(heroBox && bookingBox && bookingBox.top >= heroBox.top && bookingBox.bottom <= heroBox.bottom + 1),
      serviceHeight: serviceBox?.height || 0,
      barberHeight: barberBox?.height || 0,
      serviceRadius: Number.parseFloat(serviceStyle?.borderRadius || '0'),
      barberRadius: Number.parseFloat(barberStyle?.borderRadius || '0'),
      serviceShadow: serviceStyle?.boxShadow || 'none',
      barberShadow: barberStyle?.boxShadow || 'none',
    };
  });
  expect(visualContract.bookingContained).toBe(true);
  expect(visualContract.serviceRadius).toBeGreaterThanOrEqual(16);
  expect(visualContract.barberRadius).toBeGreaterThanOrEqual(16);
  expect(visualContract.serviceShadow).not.toBe('none');
  expect(visualContract.barberShadow).not.toBe('none');
  expect(visualContract.serviceHeight).toBeLessThan(520);
  expect(visualContract.barberHeight).toBeLessThan(testInfo.project.name === 'mobile' ? 640 : 520);
  if (testInfo.project.name === 'desktop') expect(visualContract.heroHeight).toBeLessThan(960);
  const barroPhoto = page.getByRole('img', { name: 'Barro working at the chair inside Emmiwood Barbers.' });
  await expect(barroPhoto).toHaveAttribute('src', '/emmiwood/barro-profile.webp');
  const barroPhotoMetrics = await barroPhoto.evaluate((image: HTMLImageElement) => ({
    loaded: image.complete && image.naturalWidth > 0,
    width: image.getBoundingClientRect().width,
    height: image.getBoundingClientRect().height,
  }));
  expect(barroPhotoMetrics.loaded).toBe(true);
  if (testInfo.project.name === 'desktop') {
    expect(Math.abs(barroPhotoMetrics.width - barroPhotoMetrics.height)).toBeLessThanOrEqual(1);
  }
  await expect(page.getByRole('link', { name: 'Book with Barro' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Chair rental' })).toHaveAttribute('href', '/emmiwood/chair-rental');

  if (testInfo.project.name === 'mobile') {
    const dock = page.getByRole('navigation', { name: 'Mobile booking' });
    await expect(dock).toBeVisible();
    const box = await dock.boundingBox();
    const viewport = page.viewportSize();
    expect(box && viewport && box.y < viewport.height).toBeTruthy();
    const todayBox = await today.boundingBox();
    expect(todayBox && viewport && todayBox.y < viewport.height * 1.5).toBeTruthy();
  } else {
    const heroBook = page.locator('.ew-hero-main').getByRole('link', { name: 'Book an appointment' });
    const box = await heroBook.boundingBox();
    const viewport = page.viewportSize();
    expect(box && viewport && box.y < viewport.height).toBeTruthy();
  }

  await expectNoPageOverflow(page);
  const accessibility = await new AxeBuilder({ page }).analyze();
  expect(accessibility.violations.filter((item) => ['serious', 'critical'].includes(item.impact || ''))).toEqual([]);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.reload({ waitUntil: 'networkidle' });
  const reducedMotionAccessibility = await new AxeBuilder({ page }).analyze();
  expect(reducedMotionAccessibility.violations.filter((item) => ['serious', 'critical'].includes(item.impact || ''))).toEqual([]);
  await page.screenshot({ path: testInfo.outputPath(`public-${testInfo.project.name}.png`), fullPage: true });
});

test('availability browser separates days, bounds choices, and honors the shop horizon', async ({ page, request }, testInfo) => {
  const catalogResponse = await request.get('/api/emmiwood/catalog');
  const catalogBody = await catalogResponse.json();
  const horizonDays = Number(catalogBody.data.shop.horizon_days);

  await page.goto('/emmiwood/book?service=signature&barber=barro', { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: 'Find openings' }).click();
  await expect(page.getByRole('heading', { name: 'Choose the time.' })).toBeVisible();

  const dayTabs = page.locator('.ew-day-tabs [role="tab"]');
  await expect(dayTabs).toHaveCount(7);
  const labels = await dayTabs.allTextContents();
  expect(new Set(labels).size).toBe(7);
  await expect(dayTabs.first()).toContainText(/times|No openings/);

  const periods = page.locator('.ew-time-period');
  expect(await periods.count()).toBeGreaterThan(0);
  for (let index = 0; index < await periods.count(); index += 1) {
    const visibleTimes = periods.nth(index).locator('.ew-slot-grid button');
    expect(await visibleTimes.count()).toBeLessThanOrEqual(4);
  }

  const dateInput = page.locator('.ew-date-picker input');
  const min = await dateInput.getAttribute('min');
  const max = await dateInput.getAttribute('max');
  expect(min).toBeTruthy();
  expect(max).toBeTruthy();
  const daysBetween = Math.round((new Date(`${max}T12:00:00Z`).getTime() - new Date(`${min}T12:00:00Z`).getTime()) / 86400000);
  expect(daysBetween).toBe(horizonDays);

  const controlMetrics = await page.evaluate(() => {
    const input = document.querySelector('.ew-date-picker input')?.getBoundingClientRect();
    const button = document.querySelector('.ew-find-next')?.getBoundingClientRect();
    return { inputHeight: input?.height || 0, buttonHeight: button?.height || 0 };
  });
  expect(controlMetrics.inputHeight).toBeGreaterThan(20);
  expect(controlMetrics.buttonHeight).toBeGreaterThan(20);
  await expectNoPageOverflow(page);
  await page.screenshot({ path: testInfo.outputPath(`availability-${testInfo.project.name}.png`), fullPage: true });
});

test('availability browser survives one failed day without collapsing the week', async ({ page }) => {
  let unavailableDate = '';
  await page.route('**/api/emmiwood/slots?**', async (route) => {
    const date = new URL(route.request().url()).searchParams.get('date') || '';
    if (!unavailableDate) unavailableDate = date;
    if (date === unavailableDate) {
      await route.fulfill({ status: 503, contentType: 'text/html', body: 'Temporary scheduling outage' });
      return;
    }
    await route.continue();
  });

  await page.goto('/emmiwood/book?service=signature&barber=barro', { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: 'Find openings' }).click();
  const dayTabs = page.locator('.ew-day-tabs [role="tab"]');
  await expect(dayTabs).toHaveCount(7);
  await expect(dayTabs.filter({ hasText: 'Try again' })).toHaveCount(1);
  await expect(page.locator('.ew-time-period').first()).toBeVisible();

  await dayTabs.filter({ hasText: 'Try again' }).click();
  await expect(page.getByText("Couldn't check this day.")).toBeVisible();
  await expect(page.getByRole('button', { name: /Retry/ })).toBeVisible();
  await expectNoPageOverflow(page);
});

test('changing the active day clears a stale selected time and supports arrow navigation', async ({ page }) => {
  await page.goto('/emmiwood/book?service=signature&barber=barro', { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: 'Find openings' }).click();
  const tabs = page.locator('.ew-day-tabs [role="tab"]');
  await expect(tabs).toHaveCount(7);
  const firstOpening = page.locator('.ew-day-panel .ew-slot-grid button').first();
  await firstOpening.click();
  await expect(page.getByRole('button', { name: /^Confirm \d/ })).toBeEnabled();
  // The first opening may be on any weekday (including index 1 on Sundays).
  const nextDay = page.locator('.ew-day-tabs [role="tab"][aria-selected="false"]').first();
  const nextDayId = await nextDay.getAttribute('id');
  await nextDay.click();
  await expect(page.getByRole('button', { name: 'Confirm a time' })).toBeDisabled();
  await expect(page.locator('.ew-selected-slot-inline')).toHaveCount(0);
  const chosenIndex = await tabs.evaluateAll((elements, id) => elements.findIndex((element) => element.id === id), nextDayId);
  await tabs.nth(chosenIndex).press('ArrowRight');
  const following = tabs.nth((chosenIndex + 1) % 7);
  await expect(following).toHaveAttribute('aria-selected', 'true');
  await expect(following).toBeFocused();
});

test('booking uses explicit stages, next availability, consent, and review', async ({ page }, testInfo) => {
  await openBookingAtTime(page);
  await page.getByLabel('Name').fill(`Emmiwood QA ${testInfo.project.name}`);
  await page.getByLabel('Mobile').fill('not-a-number');
  await page.getByRole('button', { name: 'Review appointment' }).click();
  await expect(page.getByText('Enter a valid 10-digit mobile number.')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Who should we expect?' })).toBeVisible();
  await fillGuest(page, testInfo.project.name);
  const consent = page.getByRole('checkbox', { name: /Send me appointment texts/ });
  await expect(consent).not.toBeChecked();
  await consent.check();
  await expect(page.getByRole('link', { name: 'SMS terms' })).toHaveAttribute('href', 'https://kup.solutions/sms/terms');
  await expect(page.getByRole('link', { name: 'Privacy' })).toHaveAttribute('href', 'https://kup.solutions/sms/privacy');
  await expect(page.getByText('from KUP Solutions about this appointment')).toBeVisible();
  await expect(page.getByText('Reply STOP to opt out or HELP for help.')).toBeVisible();
  await page.getByRole('button', { name: 'Review appointment' }).click();
  await expect(page.getByRole('heading', { name: 'Review before we reserve it.' })).toBeVisible();
  await expect(page.locator('.ew-review-list')).toContainText('Signature Haircut');
  await expect(page.locator('.ew-review-list')).toContainText('35 minutes · $35');
  await expect(page.locator('.ew-review-list')).toContainText('Appointment updates enabled');
  await expect(page.getByRole('button', { name: 'Confirm · $35' })).toBeVisible();
  await expectNoPageOverflow(page);
  await page.screenshot({ path: testInfo.outputPath(`booking-review-${testInfo.project.name}.png`), fullPage: true });
});

test('booking conflict preserves customer work and returns useful openings', async ({ page }, testInfo) => {
  let rejected = false;
  await page.route('**/api/emmiwood/appointments', async (route) => {
    if (route.request().method() === 'POST' && !rejected) {
      rejected = true;
      await route.fulfill({ status: 409, contentType: 'application/json', body: JSON.stringify({ ok: false, code: 'slot_taken', error: 'That opening was just booked.' }) });
      return;
    }
    await route.continue();
  });

  await openBookingAtTime(page);
  await fillGuest(page, testInfo.project.name);
  await page.getByRole('button', { name: 'Review appointment' }).click();
  await page.getByRole('button', { name: 'Confirm · $35' }).click();
  await expect(page.getByText('That opening was just booked. Your details are saved—choose another time.')).toBeVisible();
  const replacement = page.locator('.ew-day-panel .ew-slot-grid button').first();
  await expect(replacement).toBeVisible();
  await replacement.click();
  await page.getByRole('button', { name: /^Confirm \d/ }).click();
  await expect(page.getByLabel('Name')).toHaveValue(`Emmiwood QA ${testInfo.project.name}`);
  await expect(page.getByLabel('Mobile')).toHaveValue(testInfo.project.name === 'mobile' ? '(605) 555-0182' : '(605) 555-0181');
});

test('guest booking exchanges the private fragment for an HttpOnly management session', async ({ page, context }, testInfo) => {
  await openBookingAtTime(page);
  const unique = `${testInfo.project.name}-${Date.now()}`;
  await page.getByLabel('Name').fill(`Manage QA ${unique}`);
  await page.getByLabel('Mobile').fill(testInfo.project.name === 'mobile' ? '6055550192' : '6055550191');
  await page.getByRole('button', { name: 'Review appointment' }).click();
  await page.getByRole('button', { name: 'Confirm · $35' }).click();
  await expect(page.getByRole('heading', { name: 'You’re on the books.' })).toBeVisible();
  const manage = page.getByRole('link', { name: 'Manage appointment' });
  const href = await manage.getAttribute('href');
  expect(href).toMatch(/^\/emmiwood\/manage#token=/);
  expect(href).not.toContain('?token=');
  await manage.click();
  await expect(page.getByRole('heading', { name: 'Manage appointment.' })).toBeVisible();
  await expect(page).toHaveURL(/\/emmiwood\/manage\/?$/);
  const cookie = (await context.cookies()).find((item) => item.name === 'emmiwood_manage_session');
  expect(cookie?.httpOnly).toBe(true);
  expect(cookie?.sameSite).toBe('Strict');
  await expect(page.locator('.ew-status-pill')).toHaveText('booked');
  await page.getByRole('button', { name: 'Find another time' }).click();
  await expect(page.locator('.ew-manage-grid .ew-day-tabs [role="tab"]')).toHaveCount(7);
  await expect(page.locator('.ew-manage-grid .ew-time-period').first()).toBeVisible();
  await page.locator('.ew-manage-grid .ew-slot-grid button').first().click();
  await page.route('**/api/emmiwood/appointments/reschedule', async (route) => {
    await route.fulfill({ status: 409, contentType: 'application/json', body: JSON.stringify({ ok: false, code: 'slot_taken', error: 'That opening was just booked.' }) });
  });
  await page.getByRole('button', { name: /^Move to/ }).click();
  await expect(page.getByText('That opening was just booked. Your current appointment is still reserved.')).toBeVisible();
  await expect(page.locator('.ew-status-pill')).toHaveText('booked');
  await expect(page.getByRole('button', { name: 'Choose a new time' })).toBeDisabled();
  await page.getByRole('button', { name: 'Cancel appointment' }).click();
  const cancelDialog = page.getByRole('alertdialog', { name: 'Release this appointment?' });
  await expect(cancelDialog).toBeVisible();
  await expect(cancelDialog.getByRole('button', { name: 'Keep appointment' })).toBeFocused();
  await expectAccessible(page);
  await page.screenshot({ path: testInfo.outputPath(`cancel-dialog-${testInfo.project.name}.png`), fullPage: true });
  await page.keyboard.press('Escape');
  await expect(cancelDialog).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Cancel appointment' })).toBeFocused();
  await page.getByRole('button', { name: 'Cancel appointment' }).click();
  await page.getByRole('alertdialog', { name: 'Release this appointment?' }).getByRole('button', { name: 'Cancel appointment' }).click();
  await expect(page.locator('.ew-status-pill')).toHaveText('cancelled');
  await page.screenshot({ path: testInfo.outputPath(`manage-${testInfo.project.name}.png`), fullPage: true });
});

test('staff workspace uses cookie auth and shop-shaped mobile controls', async ({ page, context }, testInfo) => {
  const forbiddenRequests: string[] = [];
  page.on('request', (request) => {
    if (/isaiah-park|kup-logo|605gooddog|bridge-icon/i.test(request.url())) forbiddenRequests.push(request.url());
  });
  await page.goto('/emmiwood/admin', { waitUntil: 'networkidle' });
  expect(forbiddenRequests).toEqual([]);
  await expect(page.getByRole('heading', { name: 'Open the shop.' })).toBeVisible();
  await page.getByLabel('Mobile number').fill('6055550199');
  await page.getByRole('button', { name: 'Text me a code' }).click();
  const previewCode = (await page.locator('.ewa-preview strong').textContent())?.trim();
  expect(previewCode).toMatch(/^\d{6}$/);
  await page.getByLabel('Six-digit code').fill(previewCode || '');
  await page.getByRole('button', { name: 'Verify and enter' }).click();
  await expect(page.getByRole('heading', { name: 'Today', exact: true })).toBeVisible();
  const cookie = (await context.cookies()).find((item) => item.name === 'emmiwood_admin_session');
  expect(cookie?.httpOnly).toBe(true);
  expect(await page.evaluate(() => sessionStorage.getItem('emmiwood-admin'))).toBeNull();
  const primaryNav = page.getByRole('navigation', { name: 'Shop workspace' });
  await expect(primaryNav.getByRole('button')).toHaveCount(3);
  await expect(primaryNav).toContainText('Today');
  await expect(primaryNav).toContainText('Book');
  await expect(primaryNav).toContainText('Shop');
  await expect(primaryNav).not.toContainText('Hours');
  await expect(primaryNav).not.toContainText('Eligibility');

  await page.setViewportSize(testInfo.project.name === 'desktop' ? { width: 1440, height: 900 } : { width: 390, height: 844 });
  await expectNoPageOverflow(page);

  await page.getByRole('button', { name: 'New appointment' }).click();
  await expect(page.getByRole('heading', { name: 'Today', exact: true })).toBeVisible();
  await expect(page.locator('.ewa-appointment-edit .ew-day-tabs [role="tab"]')).toHaveCount(7);
  await expect(page.locator('.ewa-appointment-edit .ew-time-period').first()).toBeVisible();
  await page.getByRole('button', { name: 'Close' }).click();

  await page.getByRole('button', { name: 'Shop' }).click();
  const shopNav = page.getByRole('navigation', { name: 'Shop setup' });
  await expect(shopNav.getByRole('button')).toHaveCount(6);
  await expect(shopNav.getByRole('button').last()).toHaveText('Texts');
  await expect(page.locator('.ewa-hours-group').first()).toBeVisible();
  await expect(page.locator('.ewa-hours-group').first().getByRole('heading', { level: 2 })).toHaveText(/Barro|John|Entire shop/);
  await page.locator('.ewa-resource-list article').first().getByRole('button', { name: 'Edit' }).click();
  await expect(page.getByLabel('Starts')).toHaveAttribute('type', 'time');
  await expect(page.getByLabel('Ends')).toHaveAttribute('type', 'time');
  await page.getByRole('button', { name: 'Close' }).click();

  await shopNav.getByRole('button', { name: 'Services' }).click();
  await expect(page.getByRole('heading', { name: 'Services', exact: true })).toBeVisible();
  await page.locator('.ewa-resource-list article').first().getByRole('button', { name: 'Edit' }).click();
  await expect(page.getByLabel('Price')).toHaveValue('35');
  await page.getByRole('button', { name: 'Close' }).click();

  await shopNav.getByRole('button', { name: 'Texts' }).click();
  await expect(page.getByRole('heading', { name: 'Texts' })).toBeVisible();
  const latestMessage = page.locator('.ewa-message-list article').first();
  await expect(latestMessage).toContainText('Provider');
  await expect(latestMessage).toContainText('Attempts');
  await expect(latestMessage).toContainText('Provider ID');

  await expectNoPageOverflow(page);
  const accessibility = await new AxeBuilder({ page }).analyze();
  expect(accessibility.violations.filter((item) => ['serious', 'critical'].includes(item.impact || ''))).toEqual([]);
  await page.screenshot({ path: testInfo.outputPath(`admin-${testInfo.project.name}.png`), fullPage: true });
});
