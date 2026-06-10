import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright E2E + accessibility config for the Web companion dashboard.
 *
 * E2E specs use the `*.e2e.ts` suffix so Vitest (which matches `*.test.ts` /
 * `*.spec.ts`) never tries to run them, and vice-versa. Playwright starts the
 * Vite dev server automatically via `webServer`.
 *
 * First-time setup (downloads the browser): `npx playwright install chromium`
 * Run: `npm run test:e2e`
 */
export default defineConfig({
  testDir: './e2e',
  testMatch: '**/*.e2e.ts',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'on-first-retry',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:5173',
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
