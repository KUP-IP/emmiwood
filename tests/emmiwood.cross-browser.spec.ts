import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

async function expectReadOnlySurfaceQuality(page: Page) {
  // Match the full suite: contrast belongs to the settled UI, not a transient
  // opacity frame from the booking-stage entrance animation.
  await page.evaluate(async () => {
    await Promise.all(document.getAnimations().filter((animation) => {
      const timing = animation.effect?.getComputedTiming();
      return animation.playState === 'running' && timing && Number.isFinite(Number(timing.endTime));
    }).map((animation) => animation.finished.catch(() => undefined)));
  });
  const dimensions = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth + 1);
  const accessibility = await new AxeBuilder({ page }).analyze();
  expect(accessibility.violations.filter((item) => ['serious', 'critical'].includes(item.impact || ''))).toEqual([]);
}

test('public surface remains readable, responsive, and branded', async ({ page }, testInfo) => {
  await page.goto('/emmiwood', { waitUntil: 'networkidle' });
  await expect(page.getByRole('img', { name: 'Emmiwood Barbers — cuts, fades, grooming' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Get the best for less.' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Book an appointment' }).first()).toBeVisible();
  await expectReadOnlySurfaceQuality(page);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.reload({ waitUntil: 'networkidle' });
  await expectReadOnlySurfaceQuality(page);
  await page.screenshot({ path: testInfo.outputPath(`public-${testInfo.project.name}.png`), fullPage: true });
});

test('booking critical path reaches available times without a write', async ({ page }, testInfo) => {
  await page.goto('/emmiwood/book?service=signature&barber=barro', { waitUntil: 'networkidle' });
  await expect(page.locator('.ew-choice-grid label.selected')).toContainText('Signature Haircut');
  await expect(page.locator('.ew-barber-choice label.selected')).toContainText('Barro');
  await page.getByRole('button', { name: 'Find openings' }).click();
  await expect(page.getByRole('heading', { name: 'Choose the time.' })).toBeVisible();
  await expect(page.locator('.ew-day-tabs [role="tab"]')).toHaveCount(7);
  await expect(page.locator('.ew-day-panel .ew-slot-grid button').first()).toBeVisible();
  await expectReadOnlySurfaceQuality(page);
  await page.screenshot({ path: testInfo.outputPath(`booking-${testInfo.project.name}.png`), fullPage: true });
});

test('management entry explains recovery without exposing appointment data', async ({ page }, testInfo) => {
  await page.goto('/emmiwood/manage', { waitUntil: 'networkidle' });
  await expect(page.getByRole('heading', { name: 'Manage appointment.' })).toBeVisible();
  await expect(page.getByRole('link', { name: /Call/ })).toBeVisible();
  await expectReadOnlySurfaceQuality(page);
  await page.screenshot({ path: testInfo.outputPath(`manage-${testInfo.project.name}.png`), fullPage: true });
});

test('staff sign-in is usable without requesting an OTP', async ({ page }, testInfo) => {
  await page.goto('/emmiwood/admin', { waitUntil: 'networkidle' });
  await expect(page.getByRole('heading', { name: 'Open the shop.' })).toBeVisible();
  await expect(page.getByLabel('Mobile number')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Text me a code' })).toBeVisible();
  await expectReadOnlySurfaceQuality(page);
  await page.screenshot({ path: testInfo.outputPath(`admin-${testInfo.project.name}.png`), fullPage: true });
});
