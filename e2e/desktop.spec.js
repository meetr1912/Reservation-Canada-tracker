const { test, expect } = require('@playwright/test');
const { openApp, isNarrow } = require('./helpers');

test.describe('desktop experience', () => {
  test.beforeEach(({}, testInfo) => {
    test.skip(isNarrow(testInfo), 'desktop/tablet layout only');
  });

  test('filter card is sticky and keeps all controls visible', async ({ page }) => {
    await openApp(page);

    const card = page.getByTestId('desktop-controls');
    await expect(card).toBeVisible();
    await expect(card.getByRole('combobox', { name: 'Date' })).toBeVisible();
    await expect(card.getByRole('button', { name: 'Parks', exact: true })).toBeVisible();
    await expect(card.getByRole('button', { name: 'Accommodation', exact: true })).toBeVisible();
    await expect(card.getByRole('switch', { name: 'Show available only' })).toBeVisible();

    await page.mouse.wheel(0, 1400);
    await expect.poll(async () => (await card.boundingBox()).y).toBeLessThanOrEqual(16);
    await expect(card.getByRole('button', { name: 'Parks', exact: true })).toBeVisible();
  });

  test('hides the list-only toggle while in calendar view', async ({ page }) => {
    await openApp(page);

    await expect(page.getByRole('switch', { name: 'Show available only' })).toBeVisible();
    await page.getByRole('tab', { name: 'Calendar' }).click();
    await expect(page.getByTestId('calendar-day').first()).toBeVisible();
    await expect(page.getByRole('switch', { name: 'Show available only' })).toHaveCount(0);

    await page.getByRole('tab', { name: 'List' }).click();
    await expect(page.getByRole('switch', { name: 'Show available only' })).toBeVisible();
  });
});
