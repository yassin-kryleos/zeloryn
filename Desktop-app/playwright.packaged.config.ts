import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  testMatch: '**/packaged.e2e.ts',
  fullyParallel: false,
  timeout: 90_000,
  retries: 0,
  reporter: [['list']]
});
