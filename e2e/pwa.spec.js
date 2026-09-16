const { test, expect, devices } = require('@playwright/test');

test.describe('offline / PWA', () => {
  test('exposes a valid manifest and service worker', async ({ page }) => {
    await page.goto('/');

    const href = await page.locator('link[rel="manifest"]').getAttribute('href');
    expect(href).toContain('manifest.json');

    const manifest = await page.evaluate(async (url) => (await fetch(url)).json(), href);
    expect(manifest.name).toContain('Parks Canada');
    expect(manifest.start_url).toBeTruthy();
    expect(manifest.icons.length).toBeGreaterThan(0);

    const sw = await page.request.get(new URL('sw.js', page.url()).toString());
    expect(sw.ok()).toBeTruthy();
    expect(await sw.text()).toContain('staleWhileRevalidate');

    const icon = await page.request.get(new URL(manifest.icons[0].src, page.url()).toString());
    expect(icon.ok()).toBeTruthy();
  });

  test('serves the cached shell and data after going offline', async ({ browser }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'service worker behavior is browser-level');

    const context = await browser.newContext({
      ...devices['Desktop Chrome'],
      serviceWorkers: 'allow',
    });
    const page = await context.newPage();

    await page.goto('/');
    await expect(page.getByTestId('search-input')).toBeVisible({ timeout: 90_000 });
    await page.evaluate(() => navigator.serviceWorker.ready);

    // First load happens while the worker is still installing; reload so the
    // report fetch is controlled and lands in the SW data cache.
    await page.reload();
    await expect(page.getByTestId('search-input')).toBeVisible({ timeout: 90_000 });
    await expect.poll(
      () => page.evaluate(async () => (await caches.keys()).includes('pct-data-v1')),
      { timeout: 30_000 },
    ).toBe(true);

    await context.setOffline(true);
    await page.reload();

    await expect(page.getByTestId('search-input')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId('data-notice')).toHaveAttribute('data-kind', 'offline');
    await expect(page.getByTestId('soonest-row').first()).toBeVisible();

    await context.close();
  });
});
