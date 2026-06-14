import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright E2E config for the Mobile companion app (Expo Web on port 8081).
 *
 * First-time setup: `npx playwright install chromium`
 * Run all E2E:      `npx playwright test`
 *
 * Note: Tests target Expo Web — native iOS/Android behaviours (voice,
 * haptics, camera) cannot be covered here. For native testing, use
 * Detox or Maestro against a real device or emulator.
 */
export default defineConfig({
  testDir: './e2e',
  testMatch: '**/*.e2e.ts',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:8081',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
  webServer: {
    command: 'npx expo start --web --port 8081',
    url: 'http://localhost:8081',
    reuseExistingServer: !process.env.CI,
    timeout: 90_000,
  },
});
