const { test, expect } = require('@playwright/test');
const { openApp } = require('./helpers');
const { buildReport } = require('./fixtures');

test.describe('data robustness', () => {
  test('warns when the snapshot is stale and offers a retry', async ({ page }) => {
    const generatedAt = new Date(Date.now() - 48 * 3600 * 1000).toISOString();
    await page.route('**/availability_report.json', route =>
      route.fulfill({ json: buildReport({ generatedAt }) }));

    await openApp(page);
    const notice = page.getByTestId('data-notice');
    await expect(notice).toBeVisible();
    await expect(notice).toHaveAttribute('data-kind', 'stale');
    await expect(notice.getByRole('button')).toBeVisible();
    await expect(page.getByTestId('soonest-row').first()).toBeVisible();
  });

  test('flags partially invalid snapshots but keeps rendering', async ({ page }) => {
    await page.route('**/availability_report.json', route =>
      route.fulfill({ json: buildReport({ invalidRows: 1, sites: 20 }) }));

    await openApp(page);
    const notice = page.getByTestId('data-notice');
    await expect(notice).toHaveAttribute('data-kind', 'incomplete');
    await expect(page.getByTestId('soonest-row').first()).toBeVisible();
  });

  test('rejects a mostly-corrupt snapshot and shows the error state', async ({ page }) => {
    await page.route('**/availability_report.json', route =>
      route.fulfill({ json: buildReport({ invalidRows: 20, sites: 4 }) }));

    await page.goto('/');
    await expect(page.getByTestId('error-state')).toBeVisible({ timeout: 30_000 });
  });

  test('falls back to the last cached snapshot when the fetch fails', async ({ page }) => {
    await openApp(page);
    await expect(page.getByTestId('soonest-row').first()).toBeVisible();

    // Break the network and reload: the app should serve its cached copy.
    await page.route('**/availability_report.json', route => route.abort('failed'));
    await page.reload();

    await expect(page.getByTestId('data-notice')).toHaveAttribute('data-kind', 'cached', { timeout: 30_000 });
    await expect(page.getByTestId('search-input')).toBeVisible();
    await expect(page.getByTestId('stat-available')).toContainText(/\d/);
  });

  test('renders correctly with a frozen clock', async ({ page }) => {
    await page.clock.setFixedTime(new Date('2026-06-15T12:00:00Z'));
    await openApp(page);
    await expect(page.getByTestId('results-heading')).not.toBeEmpty();
    await expect(page.getByTestId('soonest-row').first()).toBeVisible();
  });
});
