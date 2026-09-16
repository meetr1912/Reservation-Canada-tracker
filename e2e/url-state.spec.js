const { test, expect } = require('@playwright/test');
const {
  openApp, openFilters, closeFilters, selectFirstOptions,
} = require('./helpers');

test.describe('shareable URL state', () => {
  test('opens directly into the calendar view', async ({ page }) => {
    await page.goto('/?view=calendar');
    await expect(page.getByTestId('calendar-day').first()).toBeVisible({ timeout: 90_000 });
    await expect(page.getByRole('tab', { name: 'Calendar' })).toHaveAttribute('aria-selected', 'true');
  });

  test('applies nights from the URL', async ({ page }, testInfo) => {
    await page.goto('/?nights=2');
    await expect(page.getByTestId('search-input')).toBeVisible({ timeout: 90_000 });
    await expect(page.getByTestId('results-heading')).toContainText('2 nights');
    await openFilters(page, testInfo);
    await expect(page.getByRole('combobox', { name: 'Nights' })).toContainText('2 nights');
    await closeFilters(page, testInfo);
  });

  test('applies the language from the URL', async ({ page }) => {
    await page.goto('/?lang=fr');
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Parcs Canada', { timeout: 90_000 });
    await expect(page.getByTestId('lang-toggle')).toHaveText('EN');
  });

  test('writes filters to the URL and restores them after reload', async ({ page }, testInfo) => {
    await openApp(page);
    await openFilters(page, testInfo);
    const parks = await selectFirstOptions(page, 'Parks', 1);
    await closeFilters(page, testInfo);

    await expect.poll(() => new URL(page.url()).searchParams.get('parks')).toBe(parks[0]);

    await page.reload();
    await expect(page.getByRole('button', { name: `Remove ${parks[0]} filter` })).toBeVisible({ timeout: 90_000 });
  });

  test('language toggle switches copy and persists in the URL', async ({ page }) => {
    await openApp(page);
    await page.getByTestId('lang-toggle').click();
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Parcs Canada');
    await expect.poll(() => new URL(page.url()).searchParams.get('lang')).toBe('fr');
    await page.getByTestId('lang-toggle').click();
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Parks Canada');
    expect(new URL(page.url()).searchParams.get('lang')).toBeNull();
  });
});
