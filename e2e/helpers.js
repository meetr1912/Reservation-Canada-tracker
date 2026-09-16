const { expect } = require('@playwright/test');

const MOBILE_BREAKPOINT = 640;

function viewportWidth(testInfo) {
  return testInfo.project.use.viewport?.width ?? 1280;
}

// True for phone layouts (our app switches to the mobile filter sheet < 640px).
function isNarrow(testInfo) {
  return viewportWidth(testInfo) < MOBILE_BREAKPOINT;
}

async function openApp(page) {
  await page.goto('/');
  await expect(page.getByTestId('search-input')).toBeVisible({ timeout: 90_000 });
  await expect(page.getByText('Soonest openings')).toBeVisible();
}

async function openFilters(page, testInfo) {
  if (!isNarrow(testInfo)) return;
  await page.getByTestId('filters-button').click();
  await expect(page.getByTestId('filters-sheet')).toBeVisible();
}

async function closeFilters(page, testInfo) {
  if (!isNarrow(testInfo)) return;
  await page.getByRole('button', { name: 'Close filters' }).click();
  await expect(page.getByTestId('filters-sheet')).toHaveCount(0);
}

async function openMultiSelect(page, name) {
  await page.getByRole('button', { name, exact: true }).click();
  await expect(page.getByRole('option').first()).toBeVisible();
}

async function closeMultiSelect(page, name) {
  // Desktop: clicking the trigger closes the popover.
  // Mobile: the picker is a nested sheet with an explicit Done button.
  const done = page.getByRole('button', { name: 'Done', exact: true });
  if (await done.count()) {
    await done.click();
  } else {
    await page.getByRole('button', { name, exact: true }).click();
  }
  await expect(page.getByRole('option')).toHaveCount(0);
}

async function optionLabels(page, count = 100) {
  return page.getByRole('option').evaluateAll(
    (els, n) => els.slice(0, n).map(e => e.textContent.trim()),
    count,
  );
}

// Opens a multi-select, reads the first `count` labels, selects them, closes.
async function selectFirstOptions(page, name, count = 2) {
  await openMultiSelect(page, name);
  const labels = await optionLabels(page, count);
  for (const label of labels) {
    await page.getByRole('option', { name: label, exact: true }).click();
  }
  await closeMultiSelect(page, name);
  return labels;
}

async function selectOptions(page, name, labels) {
  await openMultiSelect(page, name);
  for (const label of labels) {
    await page.getByRole('option', { name: label, exact: true }).click();
  }
  await closeMultiSelect(page, name);
}

function noHorizontalOverflow(page) {
  return page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
}

module.exports = {
  MOBILE_BREAKPOINT,
  viewportWidth,
  isNarrow,
  openApp,
  openFilters,
  closeFilters,
  openMultiSelect,
  closeMultiSelect,
  selectFirstOptions,
  selectOptions,
  optionLabels,
  noHorizontalOverflow,
};
