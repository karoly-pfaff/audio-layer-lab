import { defineConfig, devices } from '@playwright/test';

const baseURL = 'http://127.0.0.1:4173';

const firefoxAutomationPreferences = {
  // Headless Linux runners have no interactive audio session. Keep native Web Audio enabled while
  // removing autoplay and background-tab policy from the browser-infrastructure boundary.
  'media.autoplay.block-webaudio': false,
  'media.block-autoplay-until-in-foreground': false,
};

export default defineConfig({
  testDir: './tests/e2e',
  outputDir: 'output/playwright/test-results',
  fullyParallel: true,
  forbidOnly: Boolean(process.env['CI']),
  retries: process.env['CI'] ? 2 : 0,
  workers: process.env['CI'] ? 2 : 4,
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'output/playwright/report' }]],
  expect: { timeout: 10_000 },
  use: {
    baseURL,
    actionTimeout: 10_000,
    navigationTimeout: 15_000,
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'firefox',
      use: {
        ...devices['Desktop Firefox'],
        launchOptions: { firefoxUserPrefs: firefoxAutomationPreferences },
      },
    },
    {
      name: 'webkit',
      use: { ...devices['Desktop Safari'] },
    },
  ],
  webServer: {
    command: 'npm run preview -- --host 127.0.0.1 --port 4173',
    url: baseURL,
    reuseExistingServer: !process.env['CI'],
    timeout: 120_000,
  },
});
