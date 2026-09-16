const { test, expect } = require('@playwright/test');
const AxeBuilder = require('@axe-core/playwright').default;
const { openApp, openFilters, isNarrow } = require('./helpers');

function seriousViolations(results) {
  return results.violations.filter(v => ['serious', 'critical'].includes(v.impact));
}

function formatViolations(violations) {
  return violations.map(v => `${v.id} (${v.nodes.length} nodes): ${v.help}`).join('\n');
}

test.describe('accessibility', () => {
  test('list view has no serious or critical violations', async ({ page }) => {
    await openApp(page);
    const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
    const worst = seriousViolations(results);
    expect(worst, formatViolations(worst)).toEqual([]);
  });

  test('calendar view has no serious or critical violations', async ({ page }) => {
    await openApp(page);
    await page.getByRole('tab', { name: 'Calendar' }).click();
    await expect(page.getByTestId('calendar-day').first()).toBeVisible();
    const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
    const worst = seriousViolations(results);
    expect(worst, formatViolations(worst)).toEqual([]);
  });

  test('mobile filter sheet is accessible', async ({ page }, testInfo) => {
    test.skip(!isNarrow(testInfo), 'sheet only exists on phone layouts');
    await openApp(page);
    await openFilters(page, testInfo);
    const results = await new AxeBuilder({ page })
      .include('[data-testid="filters-sheet"]')
      .withTags(['wcag2a', 'wcag2aa'])
      .analyze();
    const worst = seriousViolations(results);
    expect(worst, formatViolations(worst)).toEqual([]);
  });

  test('alert dialog is accessible', async ({ page }) => {
    await openApp(page);
    await page.getByRole('button', { name: 'Alert me' }).click();
    await expect(page.getByTestId('alert-dialog')).toBeVisible();
    const results = await new AxeBuilder({ page })
      .include('[data-testid="alert-dialog"]')
      .withTags(['wcag2a', 'wcag2aa'])
      .analyze();
    const worst = seriousViolations(results);
    expect(worst, formatViolations(worst)).toEqual([]);
  });
});
