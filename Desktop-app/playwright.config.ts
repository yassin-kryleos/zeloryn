import { defineConfig, devices } from '@playwright/test';
import path from 'path';

/**
 * Playwright E2E config for the Desktop renderer (Vite dev server on port 5174).
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
  testIgnore: '**/packaged.e2e.ts',
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:5174',
    storageState: {
      cookies: [],
      origins: [{
        origin: 'http://localhost:5174',
        localStorage: [
          { name: 'matrix_setup_done', value: 'true' },
          { name: 'matrix_tutorial_completed', value: 'true' }
        ]
      }]
    },
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
  webServer: {
    command: 'npm run dev:e2e',
    url: 'http://localhost:5174',
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
    env: {
      KRYLEOS_DATA_DIR: path.join(process.cwd(), '.tmp-e2e'),
      KRYLEOS_LOCAL_SESSION_SECRET: 'test-session-secret-for-playwright-32chars',
      VITE_KRYLEOS_LOCAL_SESSION_SECRET: 'test-session-secret-for-playwright-32chars',
      KRYLEOS_TEST_MODE: '1',
    },
  },
});
