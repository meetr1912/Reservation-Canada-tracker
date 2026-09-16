const { test, expect } = require('@playwright/test');
const { openApp, openFilters, closeFilters } = require('./helpers');

async function chooseNights(page, label) {
  await page.getByRole('combobox', { name: 'Nights' }).click();
  await page.getByRole('option', { name: label }).click();
}

test.describe('multi-night stays', () => {
  test('filters the list to consecutive-night stays and deep-links them', async ({ page }, testInfo) => {
    await openApp(page);
    await openFilters(page, testInfo);
    await chooseNights(page, '2 nights');
    await closeFilters(page, testInfo);

    await expect(page.getByTestId('results-heading')).toContainText('2 nights');
    await expect.poll(() => new URL(page.url()).searchParams.get('nights')).toBe('2');

    const card = page.locator('[data-testid="site-card"][data-status="available"]').first();
    if (await card.count()) {
      const url = new URL(await card.getAttribute('href'));
      expect(url.searchParams.get('nights')).toBe('2');
      const start = Date.parse(url.searchParams.get('startDate'));
      const end = Date.parse(url.searchParams.get('endDate'));
      expect(Math.round((end - start) / 86400000)).toBe(2);
    } else {
      // No consecutive 2-night stays in this snapshot is a valid state too.
      await expect(page.getByTestId('empty-state')).toBeVisible();
    }
  });

  test('only offers nights that fit inside the scan window', async ({ page }, testInfo) => {
    await openApp(page);
    await openFilters(page, testInfo);
    await page.getByRole('combobox', { name: 'Nights' }).click();
    const options = await page.getByRole('option').allTextContents();
    expect(options.join(' ')).toContain('1 night');
    expect(options.join(' ')).toContain('3 nights');
    await page.keyboard.press('Escape');
    await closeFilters(page, testInfo);
  });

  test('calendar stay counts reflect the selected nights', async ({ page }, testInfo) => {
    await openApp(page);
    await openFilters(page, testInfo);
    await chooseNights(page, '2 nights');
    await closeFilters(page, testInfo);

    await page.getByRole('tab', { name: 'Calendar' }).click();
    const day = page.locator('[data-testid="calendar-day"]:not([disabled])').first();
    await expect(day).toBeVisible();
    await day.click();
    const dialog = page.getByTestId('day-dialog');
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText('2 nights');
  });

  test('switching back to 1 night restores single-night counts', async ({ page }, testInfo) => {
    await openApp(page);
    await openFilters(page, testInfo);
    await chooseNights(page, '2 nights');
    await chooseNights(page, '1 night');
    await closeFilters(page, testInfo);

    await expect(page.getByTestId('results-heading')).not.toContainText('nights');
    expect(new URL(page.url()).searchParams.get('nights')).toBeNull();
  });
});
