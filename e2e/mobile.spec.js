const { test, expect } = require('@playwright/test');
const { openApp, isNarrow, selectFirstOptions } = require('./helpers');

test.describe('mobile experience', () => {
  test.beforeEach(({}, testInfo) => {
    test.skip(!isNarrow(testInfo), 'mobile-only layout');
  });

  test('compact sticky bar stays pinned while scrolling', async ({ page }) => {
    await openApp(page);

    const bar = page.getByTestId('mobile-controls');
    await expect(bar).toBeVisible();
    const before = await bar.boundingBox();
    expect(before.height).toBeLessThan(200);

    await page.mouse.wheel(0, 1600);
    await expect.poll(async () => (await bar.boundingBox()).y).toBeLessThanOrEqual(1);
    const after = await bar.boundingBox();
    expect(after.height).toBeLessThan(200);
  });

  test('filters open as a bottom sheet anchored to the bottom', async ({ page }) => {
    await openApp(page);

    await page.getByTestId('filters-button').click();
    const sheet = page.getByTestId('filters-sheet');
    await expect(sheet).toBeVisible();
    await expect(sheet).toHaveAttribute('role', 'dialog');

    const viewport = page.viewportSize();
    const box = await sheet.boundingBox();
    expect(box.x).toBe(0);
    expect(box.y + box.height).toBeGreaterThan(viewport.height - 4);
  });

  test('applying filters closes the sheet and scrolls to the results', async ({ page }) => {
    await openApp(page);

    await page.getByTestId('filters-button').click();
    const parks = await selectFirstOptions(page, 'Parks', 1);
    await page.getByRole('button', { name: /^Show \d+ results?$/ }).click();

    await expect(page.getByTestId('filters-sheet')).toHaveCount(0);
    await expect(page.getByRole('button', { name: `Remove ${parks[0]} filter` })).toBeVisible();

    const viewport = page.viewportSize();
    await expect.poll(async () => {
      const box = await page.getByTestId('results-heading').boundingBox();
      return box ? box.y : 9999;
    }).toBeLessThan(viewport.height);
  });

  test('primary touch targets are at least 40px tall', async ({ page }) => {
    await openApp(page);

    const targets = [
      page.getByTestId('filters-button'),
      page.getByTestId('search-input'),
      page.getByRole('tab', { name: 'List' }),
      page.getByRole('tab', { name: 'Calendar' }),
      page.getByRole('button', { name: 'Alert me' }),
    ];
    for (const target of targets) {
      const box = await target.boundingBox();
      expect(box.height).toBeGreaterThanOrEqual(40);
    }
  });
});
