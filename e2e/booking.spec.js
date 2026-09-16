const { test, expect } = require('@playwright/test');
const { openApp, openFilters, closeFilters } = require('./helpers');

test.describe('booking links', () => {
  test('available site cards deep-link onto Parks Canada', async ({ page }) => {
    await openApp(page);

    const card = page.locator('[data-testid="site-card"][data-status="available"]').first();
    await expect(card).toBeVisible();

    const href = await card.getAttribute('href');
    expect(href).toContain('reservation.pc.gc.ca');

    if (href.includes('/create-booking/results')) {
      const url = new URL(href);
      expect(url.searchParams.get('startDate')).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(url.searchParams.get('endDate')).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(url.searchParams.get('resourceLocationId')).toBeTruthy();
      expect(url.searchParams.get('transactionLocationId')).toBeTruthy();

      // The link's start date should match the date shown in the list.
      const heading = await page.getByTestId('results-heading').textContent();
      const day = heading.match(/(\d{1,2})$/)?.[1];
      expect(url.searchParams.get('startDate').endsWith(`-${String(day).padStart(2, '0')}`)).toBe(true);
    }
  });

  test('booked sites are informational, not links', async ({ page }, testInfo) => {
    await openApp(page);
    await openFilters(page, testInfo);
    await page.getByRole('switch', { name: 'Show available only' }).click();
    await closeFilters(page, testInfo);

    const booked = page.locator('[data-testid="site-card"][data-status="booked"]');
    test.skip(await booked.count() === 0, 'no booked sites rendered in this snapshot');

    await expect(booked.first()).toBeVisible();
    expect(await booked.first().locator('a').count()).toBe(0);
  });
});
