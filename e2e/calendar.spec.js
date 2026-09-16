const { test, expect } = require('@playwright/test');
const {
  openApp, openFilters, closeFilters, selectFirstOptions,
} = require('./helpers');

test.describe('calendar view', () => {
  test('renders month grids with availability counts', async ({ page }) => {
    await openApp(page);
    await page.getByRole('tab', { name: 'Calendar' }).click();

    await expect(page.getByTestId('calendar-day').first()).toBeVisible();
    await expect(page.getByText('Availability:')).toBeVisible();
    await expect(page.getByText('Jump to:')).toBeVisible();

    const months = await page.locator('[id^="month-"]').count();
    expect(months).toBeGreaterThan(0);
  });

  test('clicking a day opens its openings with booking links', async ({ page }) => {
    await openApp(page);
    await page.getByRole('tab', { name: 'Calendar' }).click();

    const day = page.locator('[data-testid="calendar-day"]:not([disabled])').first();
    await day.click();

    const dialog = page.getByTestId('day-dialog');
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText(/sites? available/)).toBeVisible();

    const sites = page.getByTestId('calendar-site');
    expect(await sites.count()).toBeGreaterThan(0);
    await expect(sites.first().locator('a[href*="reservation.pc.gc.ca"]')).toBeVisible();

    await page.getByRole('button', { name: 'Close' }).click();
    await expect(dialog).toHaveCount(0);
  });

  test('calendar day dialog respects the park filter', async ({ page }, testInfo) => {
    await openApp(page);
    await openFilters(page, testInfo);
    const parks = await selectFirstOptions(page, 'Parks', 1);
    await closeFilters(page, testInfo);

    await page.getByRole('tab', { name: 'Calendar' }).click();
    const day = page.locator('[data-testid="calendar-day"]:not([disabled])').first();
    await day.click();

    const dialog = page.getByTestId('day-dialog');
    await expect(dialog).toBeVisible();
    const sites = page.getByTestId('calendar-site');
    expect(await sites.count()).toBeGreaterThan(0);
    const texts = await sites.allTextContents();
    for (const text of texts) expect(text).toContain(parks[0]);
  });

  test('month jump scrolls to the chosen month', async ({ page }) => {
    await openApp(page);
    await page.getByRole('tab', { name: 'Calendar' }).click();

    const pills = page.getByRole('button', { name: /^[A-Z][a-z]{2} \d{4}$/ });
    const pillCount = await pills.count();
    test.skip(pillCount < 2, 'calendar only covers a single month in this snapshot');

    await pills.last().click();
    await expect.poll(async () => page.evaluate(() => {
      const cards = [...document.querySelectorAll('[id^="month-"]')];
      return Math.min(...cards.map(c => Math.abs(c.getBoundingClientRect().top)));
    }), { timeout: 10_000 }).toBeLessThan(400);
  });
});
