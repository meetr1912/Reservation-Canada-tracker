const { test, expect } = require('@playwright/test');
const {
  openApp, openFilters, closeFilters, isNarrow,
  openMultiSelect, closeMultiSelect, optionLabels, selectFirstOptions,
} = require('./helpers');

test.describe('filters', () => {
  test('multi-selects parks, shows chips, and filters the results', async ({ page }, testInfo) => {
    await openApp(page);
    await openFilters(page, testInfo);

    const parks = await selectFirstOptions(page, 'Parks', 2);
    expect(parks.length).toBe(2);
    await closeFilters(page, testInfo);

    // Chips for every selected park, removable.
    for (const name of parks) {
      await expect(page.getByRole('button', { name: `Remove ${name} filter` })).toBeVisible();
    }

    // Desktop list groups are limited to the selected parks.
    if (!isNarrow(testInfo)) {
      const grouped = await page.getByTestId('park-group')
        .evaluateAll(els => els.map(e => e.dataset.park));
      expect(grouped.length).toBeGreaterThan(0);
      for (const park of grouped) expect(parks).toContain(park);
    }

    // Removing a chip shrinks the selection.
    await page.getByRole('button', { name: `Remove ${parks[0]} filter` }).click();
    await expect(page.getByRole('button', { name: `Remove ${parks[0]} filter` })).toHaveCount(0);
    await expect(page.getByRole('button', { name: `Remove ${parks[1]} filter` })).toBeVisible();

    // Clear all resets everything.
    await page.getByRole('button', { name: 'Clear all' }).click();
    await expect(page.getByTestId('active-filters')).toHaveCount(0);
  });

  test('multi-selects accommodation types and reflects them in the feed', async ({ page }, testInfo) => {
    await openApp(page);
    await openFilters(page, testInfo);

    const types = await selectFirstOptions(page, 'Accommodation', 2);
    expect(types.length).toBe(2);
    await closeFilters(page, testInfo);

    // The ranked feed summary names the active types.
    await expect(page.getByText(`${types.join(', ')} ·`)).toBeVisible();
  });

  test('park search inside the dropdown narrows the options', async ({ page }, testInfo) => {
    await openApp(page);
    await openFilters(page, testInfo);

    await openMultiSelect(page, 'Parks');
    const all = await optionLabels(page, 100);
    expect(all.length).toBeGreaterThan(3);

    const fragment = all[2].split(' ')[0];
    await page.getByPlaceholder('Search parks…').fill(fragment);
    await expect(page.getByRole('option')).not.toHaveCount(all.length);
    const filtered = await optionLabels(page, 100);
    for (const label of filtered) expect(label.toLowerCase()).toContain(fragment.toLowerCase());

    await expect(page.getByRole('button', { name: 'Select shown' })).toBeVisible();
    await closeMultiSelect(page, 'Parks');
    await closeFilters(page, testInfo);
  });

  test('search box filters the feed and the empty state can be cleared', async ({ page }) => {
    await openApp(page);

    await page.getByTestId('search-input').fill('zzzz-no-such-site');
    await expect(page.getByTestId('empty-state')).toBeVisible();
    await expect(page.getByTestId('soonest-row')).toHaveCount(0);

    await page.getByTestId('search-input').fill('');
    await expect(page.getByTestId('empty-state')).toHaveCount(0);
    await expect(page.getByTestId('soonest-row').first()).toBeVisible();
  });

  test('"show available only" toggles the list back to every site', async ({ page }, testInfo) => {
    await openApp(page);
    await openFilters(page, testInfo);

    const toggle = page.getByRole('switch', { name: 'Show available only' });
    await expect(toggle).toHaveAttribute('aria-checked', 'true');
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-checked', 'false');
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-checked', 'true');

    await closeFilters(page, testInfo);
    await expect(page.getByTestId('site-card').first()).toBeVisible();
  });

  test('filters survive switching between list and calendar', async ({ page }, testInfo) => {
    await openApp(page);
    await openFilters(page, testInfo);
    const parks = await selectFirstOptions(page, 'Parks', 1);
    await closeFilters(page, testInfo);

    await page.getByRole('tab', { name: 'Calendar' }).click();
    await expect(page.getByTestId('calendar-day').first()).toBeVisible();
    await expect(page.getByRole('button', { name: `Remove ${parks[0]} filter` })).toBeVisible();

    await page.getByRole('tab', { name: 'List' }).click();
    await expect(page.getByRole('button', { name: `Remove ${parks[0]} filter` })).toBeVisible();
  });
});
