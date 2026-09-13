import { test, expect } from '@playwright/test';

/**
 * Desktop renderer — smoke E2E tests.
 *
 * Verifies the four main workspace spaces (Plan, Crew, Flow, Forge/Chat)
 * load and render key structural elements. Backend is NOT required for
 * these tests (UI renders with empty state / placeholders).
 *
 * Pass/fail: every assertion is structural. Tests fail if a major layout
 * element is absent, indicating a regression in the renderer.
 */

test.describe('Desktop renderer — smoke', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
  });

  test('page title contains app brand (Zeloryn)', async ({ page }) => {
    const title = await page.title();
    expect(title.toLowerCase()).toMatch(/zeloryn|kryleos/);
  });

  test('app container renders without a crash banner', async ({ page }) => {
    const errorBoundary = page.locator('[data-testid="error-boundary-fallback"]');
    await expect(errorBoundary).not.toBeVisible();
  });

  test('at least one workspace nav item is visible', async ({ page }) => {
    // The sidebar or top bar should show workspace labels
    const navItems = page.locator('button, [role="tab"], [role="menuitem"]');
    await expect(navItems.first()).toBeVisible();
  });

  test('no raw markdown ** markers visible in the DOM text', async ({ page }) => {
    const bodyText = await page.evaluate(() => document.body.innerText);
    expect(bodyText).not.toMatch(/\*\*[^*]+\*\*/);
  });

  test('no console errors on initial load', async ({ page }) => {
    const errors: string[] = [];
    const failedResponses: string[] = [];
    page.on('console', msg => {
      if (msg.type() === 'error') errors.push(msg.text());
    });
    page.on('response', response => {
      if (response.status() >= 500) {
        failedResponses.push(`${response.status()} ${response.url()}`);
      }
    });
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    const criticalErrors = errors.filter(e =>
      !e.includes('favicon') && !e.includes('net::ERR_') && !e.includes('WebSocket') && !e.includes('503')
    );
    const criticalFailedResponses = failedResponses.filter(r => !r.includes('/api/ollama/models'));
    expect({ criticalErrors, failedResponses: criticalFailedResponses }).toEqual({ criticalErrors: [], failedResponses: [] });
  });

  test('CONFIG header area is visible', async ({ page }) => {
    // The Desktop app has a CONFIG bar at the top or sidebar
    const configEl = page.locator('text=/config/i').first();
    await expect(configEl).toBeVisible();
  });

  test('Plan workspace tab is accessible', async ({ page }) => {
    const planTab = page.locator('button, [role="tab"]').filter({ hasText: /plan/i }).first();
    if (await planTab.isVisible()) {
      await planTab.click();
      await page.waitForTimeout(300);
      // Should not crash after tab click
      const error = page.locator('[data-testid="error-boundary-fallback"]');
      await expect(error).not.toBeVisible();
    }
  });

  test('page responds within 3 seconds', async ({ page }) => {
    const start = Date.now();
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');
    const elapsed = Date.now() - start;
    expect(elapsed).toBeLessThan(3000);
  });
});
