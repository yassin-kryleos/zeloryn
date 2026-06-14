import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright E2E config for the Desktop renderer (Vite dev server on port 5173).
 *
 * First-time setup: `npx playwright install chromium`
 * Run all E2E:      `npx playwright test`
 * Run smoke only:   `npx playwright test e2e/smoke.e2e.ts`
 *
 * Note: Tests require the Desktop backend to be running on port 3001 for
 * companion-pairing and API tests. Start with `npm run server` in a separate shell.
 */
export default defineConfig({
  testDir: './e2e',
  testMatch: '**/*.e2e.ts',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
  webServer: {
    command: 'npm run dev -- --mode test',
    url: 'http://localhost:5173',
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
