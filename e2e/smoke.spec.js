const { test, expect } = require('@playwright/test');
const { openApp, isNarrow, noHorizontalOverflow } = require('./helpers');

test.describe('smoke', () => {
  test('loads the report and renders the dashboard', async ({ page }) => {
    await openApp(page);

    await expect(page.getByRole('heading', { level: 1 })).toContainText('Parks Canada');
    await expect(page.getByTestId('stat-available')).toContainText(/\d/);
    await expect(page.getByTestId('stat-parks')).toContainText(/\d/);
    await expect(page.getByTestId('stat-days')).toContainText(/\d/);
    await expect(page.getByTestId('stat-slots')).toBeVisible();
    await expect(page.getByTestId('soonest-row').first()).toBeVisible();
    await expect(page.getByTestId('results-heading')).toContainText(/\d/);
    await expect(page.getByTestId('error-state')).toHaveCount(0);
    await expect(page.getByTestId('empty-state')).toHaveCount(0);
  });

  test('shows a readable error state with a working retry', async ({ page }) => {
    await page.route('**/availability_report.json', route =>
      route.fulfill({ status: 500, contentType: 'text/plain', body: 'nope' }));

    await page.goto('/');
    await expect(page.getByTestId('error-state')).toBeVisible({ timeout: 30_000 });

    await page.unroute('**/availability_report.json');
    await page.getByRole('button', { name: 'Try again' }).click();
    await expect(page.getByTestId('search-input')).toBeVisible({ timeout: 90_000 });
    await expect(page.getByTestId('soonest-row').first()).toBeVisible();
  });

  test('renders without horizontal overflow in list, calendar and filters', async ({ page }, testInfo) => {
    await openApp(page);

    const assertNoOverflow = async (label) => {
      const { scrollWidth, clientWidth } = await noHorizontalOverflow(page);
      expect(scrollWidth, `${label} overflows horizontally`).toBeLessThanOrEqual(clientWidth + 1);
    };

    await assertNoOverflow('list top');
    await page.getByText('Soonest openings').scrollIntoViewIfNeeded();
    await assertNoOverflow('soonest open');

    if (isNarrow(testInfo)) {
      await page.getByTestId('filters-button').click();
      await expect(page.getByTestId('filters-sheet')).toBeVisible();
      await assertNoOverflow('filters sheet');
      await page.getByRole('button', { name: 'Close filters' }).click();
    }

    await page.getByRole('tab', { name: 'Calendar' }).click();
    await expect(page.getByTestId('calendar-day').first()).toBeVisible();
    await assertNoOverflow('calendar');
  });

  test('shows loading placeholder while the report is fetching', async ({ page }) => {
    let release;
    const gate = new Promise(resolve => { release = resolve; });
    await page.route('**/availability_report.json', async route => {
      await gate;
      await route.continue();
    });

    await page.goto('/');
    await expect(page.getByTestId('loading')).toBeVisible();
    release();
    await expect(page.getByTestId('search-input')).toBeVisible({ timeout: 90_000 });
  });
});
