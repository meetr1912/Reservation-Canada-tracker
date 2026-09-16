// @ts-check
const { defineConfig, devices } = require('@playwright/test');

const PORT = Number(process.env.PORT || 4173);
const BASE_URL = `http://127.0.0.1:${PORT}/Reservation-Canada-tracker/`;

module.exports = defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: process.env.CI
    ? [['github'], ['html', { open: 'never' }]]
    : [['list'], ['html', { open: 'never' }]],

  use: {
    baseURL: BASE_URL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    // Keep tests deterministic: the PWA spec opts back in with its own context.
    serviceWorkers: 'block',
  },

  projects: [
    {
      name: 'desktop',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } },
    },
    {
      name: 'mobile',
      use: { ...devices['Pixel 7'] },
    },
    {
      // Device descriptors default to WebKit; pin Chromium so the suite runs
      // anywhere without extra system libraries, while keeping iOS metrics.
      name: 'iphone',
      use: { ...devices['iPhone 14'], browserName: 'chromium' },
    },
    {
      name: 'tablet',
      use: { ...devices['iPad Mini'], browserName: 'chromium' },
    },
  ],

  webServer: {
    command: 'node e2e/static-server.js',
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
