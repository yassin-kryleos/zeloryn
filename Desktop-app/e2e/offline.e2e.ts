import { test, expect } from '@playwright/test';

/**
 * Desktop renderer — offline / network error state tests.
 *
 * Simulates network failures by intercepting API routes and returning 503
 * or by using Playwright's offline mode. Verifies the UI degrades gracefully
 * rather than crashing or showing raw error objects.
 *
 * Pass/fail: UI shows a human-readable state (empty list, error message, or
 * placeholder) — not a React error boundary crash or blank white screen.
 */

test.describe('Desktop renderer — offline / error states', () => {
  test('shows graceful state when backend API is unreachable', async ({ page }) => {
    // Block all backend API calls to simulate an offline backend
    await page.route('**/api/**', route => route.abort('connectionrefused'));

    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(1000);

    // Should not crash the React tree
    const crash = page.locator('[data-testid="error-boundary-fallback"]');
    await expect(crash).not.toBeVisible();

    // Should not show a blank white page
    const bodyText = await page.evaluate(() => document.body.innerText.trim());
    expect(bodyText.length).toBeGreaterThan(0);
  });

  test('shows graceful state when backend returns 500', async ({ page }) => {
    await page.route('**/api/**', route =>
      route.fulfill({ status: 500, body: JSON.stringify({ error: 'internal server error' }) })
    );

    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(1000);

    const crash = page.locator('[data-testid="error-boundary-fallback"]');
    await expect(crash).not.toBeVisible();
  });

  test('goes offline via Playwright offline mode and recovers UI', async ({ page, context }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Take page offline
    await context.setOffline(true);
    await page.waitForTimeout(500);

    // UI should not crash when offline
    const crash = page.locator('[data-testid="error-boundary-fallback"]');
    await expect(crash).not.toBeVisible();

    // Restore connection
    await context.setOffline(false);
    await page.waitForTimeout(500);
    await expect(crash).not.toBeVisible();
  });

  test('empty session list renders without error when API returns empty array', async ({ page }) => {
    await page.route('**/api/sessions', route =>
      route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
    );

    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const crash = page.locator('[data-testid="error-boundary-fallback"]');
    await expect(crash).not.toBeVisible();
  });

  test('malformed JSON from API does not crash the renderer', async ({ page }) => {
    await page.route('**/api/sessions', route =>
      route.fulfill({ status: 200, contentType: 'application/json', body: 'not json' })
    );

    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(1000);

    const crash = page.locator('[data-testid="error-boundary-fallback"]');
    await expect(crash).not.toBeVisible();
  });
});
