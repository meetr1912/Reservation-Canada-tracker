const { test, expect } = require('@playwright/test');
const { openApp } = require('./helpers');

const DATE_RE = /(Mon|Tue|Wed|Thu|Fri|Sat|Sun), (Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) \d{1,2}/;

test.describe('soonest openings', () => {
  test('renders ranked rows with direct booking links', async ({ page }) => {
    await openApp(page);

    const rows = page.getByTestId('soonest-row');
    const count = await rows.count();
    expect(count).toBeGreaterThan(0);

    const firstLink = rows.first().locator('a[href*="reservation.pc.gc.ca"]');
    await expect(firstLink).toHaveAttribute('target', '_blank');
  });

  test('horizon pills update the feed summary', async ({ page }) => {
    await openApp(page);

    await expect(page.getByText('any time').first()).toBeVisible();
    await page.getByRole('button', { name: 'Within a week' }).click();
    await expect(page.getByText('within a week').first()).toBeVisible();

    await page.getByRole('button', { name: 'Within a month' }).click();
    await expect(page.getByText('within a month').first()).toBeVisible();

    await page.getByRole('button', { name: 'Any time' }).click();
    await expect(page.getByText('any time').first()).toBeVisible();
  });

  test('sort control switches ranking', async ({ page }) => {
    await openApp(page);

    const sort = page.getByRole('combobox', { name: 'Sort soonest openings' });
    await expect(sort).toContainText('Soonest');

    await sort.click();
    await page.getByRole('option', { name: 'A–Z' }).click();
    await expect(sort).toContainText('A–Z');
    await expect(page.getByTestId('soonest-row').first()).toBeVisible();

    await sort.click();
    await page.getByRole('option', { name: 'Most open' }).click();
    await expect(sort).toContainText('Most open');
    await expect(page.getByTestId('soonest-row').first()).toBeVisible();
  });

  test('clicking an opening jumps to that date and park', async ({ page }) => {
    await openApp(page);

    const rows = page.getByTestId('soonest-row');
    const heading = page.getByTestId('results-heading');
    const headingText = await heading.textContent();

    // Prefer a row whose date differs from the heading so the change is real.
    let target = rows.first();
    for (let i = 0; i < Math.min(await rows.count(), 8); i++) {
      const row = rows.nth(i);
      const rowDate = (await row.textContent()).match(DATE_RE)?.[0];
      if (rowDate) {
        const day = rowDate.split(' ').pop();
        if (!headingText.includes(day)) { target = row; break; }
      }
    }

    const rowText = await target.textContent();
    const rowDate = rowText.match(DATE_RE)?.[0];
    const park = await target.getAttribute('data-park');
    await target.getByRole('button').first().click();

    if (rowDate) await expect(heading).toContainText(rowDate.split(' ').pop());
    await expect(page.getByRole('button', { name: `Remove ${park} filter` })).toBeVisible();
  });

  test('type chips drill into a single accommodation type', async ({ page }) => {
    await openApp(page);

    const chip = page.getByTestId('type-chip').first();
    test.skip(await chip.count() === 0, 'no multi-type park in this data snapshot');

    const chipText = (await chip.textContent()).trim();
    const type = chipText.replace(/\s*\d+$/, '');
    await chip.click();

    await expect(page.getByText(new RegExp(`${type.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} ·`))).toBeVisible();
    await expect(page.getByRole('button', { name: `Remove ${type} filter` })).toBeVisible();
  });

  test('show all / show fewer expands the ranked list', async ({ page }) => {
    await openApp(page);

    const expand = page.getByRole('button', { name: /Show all \d+ parks/ });
    test.skip(await expand.count() === 0, 'fewer than the cap of parks have openings');

    const before = await page.getByTestId('soonest-row').count();
    await expand.click();
    await expect(page.getByRole('button', { name: 'Show fewer' })).toBeVisible();
    const after = await page.getByTestId('soonest-row').count();
    expect(after).toBeGreaterThan(before);

    await page.getByRole('button', { name: 'Show fewer' }).click();
    await expect(page.getByTestId('soonest-row')).toHaveCount(before);
  });
});
