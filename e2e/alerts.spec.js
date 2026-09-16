const { test, expect } = require('@playwright/test');
const {
  openApp, openFilters, closeFilters, selectFirstOptions,
} = require('./helpers');

test.describe('email alerts', () => {
  test('validates the email and submits a prefilled GitHub issue', async ({ page }) => {
    await page.addInitScript(() => {
      window.__opened = [];
      window.open = (url) => { window.__opened.push(url); return null; };
    });
    await openApp(page);

    await page.getByRole('button', { name: 'Alert me' }).click();
    const dialog = page.getByTestId('alert-dialog');
    await expect(dialog).toBeVisible();

    const submit = page.getByTestId('alert-submit');
    await expect(submit).toBeDisabled();

    await page.getByRole('textbox', { name: 'Email', exact: true }).fill('not-an-email');
    await expect(dialog.getByText('Enter a valid email address.')).toBeVisible();
    await expect(submit).toBeDisabled();

    await page.getByRole('textbox', { name: 'Email', exact: true }).fill('camper@example.com');
    await expect(submit).toBeEnabled();
    await submit.click();

    await expect(dialog.getByText(/pre-filled GitHub issue/)).toBeVisible();

    const opened = await page.evaluate(() => window.__opened);
    expect(opened.length).toBeGreaterThan(0);
    const url = new URL(opened[0]);
    expect(url.hostname).toBe('github.com');
    expect(url.pathname).toContain('/issues/new');
    expect(url.searchParams.get('labels')).toBe('alert');
    expect(url.searchParams.get('title')).toContain('Alert');
    expect(decodeURIComponent(url.searchParams.get('body'))).toContain('camper@example.com');
  });

  test('seeds the park picker from the active park filters', async ({ page }, testInfo) => {
    await openApp(page);
    await openFilters(page, testInfo);
    const parks = await selectFirstOptions(page, 'Parks', 2);
    await closeFilters(page, testInfo);

    await page.getByRole('button', { name: 'Alert me' }).click();
    const dialog = page.getByTestId('alert-dialog');
    await expect(dialog).toBeVisible();

    for (const park of parks) {
      await expect(dialog.getByRole('button', { name: park, exact: true })).toHaveAttribute('aria-pressed', 'true');
    }
  });

  test('calendar day detail can prefill the alert date', async ({ page }) => {
    await openApp(page);
    await page.getByRole('tab', { name: 'Calendar' }).click();

    const day = page.locator('[data-testid="calendar-day"]:not([disabled])').first();
    const date = await day.getAttribute('data-date');
    await day.click();
    await page.getByRole('button', { name: 'Alert me for this date' }).click();

    const dialog = page.getByTestId('alert-dialog');
    await expect(dialog).toBeVisible();
    await expect(page.getByLabel('Start date')).toHaveValue(date);
    await expect(page.getByLabel('End date')).toHaveValue(date);
  });
});
