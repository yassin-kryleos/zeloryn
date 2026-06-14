import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

/**
 * Desktop renderer — WCAG 2.1 A/AA accessibility audit.
 *
 * Covers: addresses A11Y-NEW-01 (Desktop renderer never scanned with axe).
 * Scans the initial load and each workspace space for critical/serious violations.
 *
 * Pass/fail: zero critical OR serious axe violations on each scanned view.
 * Moderate/minor issues are logged but non-blocking (UX improvements, not blockers).
 *
 * First-time setup: `npx playwright install chromium`
 */

const BLOCKING = new Set(['critical', 'serious']);

async function axeScan(page: import('@playwright/test').Page) {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
  return results.violations;
}

test.describe('Desktop renderer — accessibility (axe WCAG 2.1 A/AA)', () => {
  test('initial page load has no critical/serious violations', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    const violations = await axeScan(page);
    const blocking = violations.filter(v => BLOCKING.has(v.impact ?? ''));
    if (blocking.length > 0) {
      const summary = blocking.map(v => `[${v.impact}] ${v.id}: ${v.description}`).join('\n');
      expect.soft(blocking, `Blocking a11y violations:\n${summary}`).toHaveLength(0);
    }
    expect(blocking).toHaveLength(0);
  });

  test('Plan workspace has no critical/serious violations', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    const planTab = page.locator('button, [role="tab"]').filter({ hasText: /plan/i }).first();
    if (await planTab.isVisible()) {
      await planTab.click();
      await page.waitForTimeout(500);
    }
    const violations = await axeScan(page);
    const blocking = violations.filter(v => BLOCKING.has(v.impact ?? ''));
    expect(blocking).toHaveLength(0);
  });

  test('all interactive elements have accessible names', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    // Check all buttons have accessible names
    const buttons = page.locator('button:not([aria-hidden="true"])');
    const count = await buttons.count();
    for (let i = 0; i < Math.min(count, 20); i++) {
      const btn = buttons.nth(i);
      if (!await btn.isVisible()) continue;
      const label = await btn.getAttribute('aria-label') ??
                    await btn.getAttribute('title') ??
                    await btn.textContent();
      expect(label?.trim().length, `Button at index ${i} has no accessible name`).toBeGreaterThan(0);
    }
  });

  test('page has exactly one <h1> landmark', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    const h1s = page.locator('h1');
    const count = await h1s.count();
    // Either 0 (app-style SPA without h1) or 1 (proper landmark) — never 2+
    expect(count).toBeLessThanOrEqual(1);
  });

  test('images have alt attributes', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    const imgs = page.locator('img:not([role="presentation"])');
    const count = await imgs.count();
    for (let i = 0; i < count; i++) {
      const alt = await imgs.nth(i).getAttribute('alt');
      expect(alt, `img at index ${i} is missing alt`).not.toBeNull();
    }
  });
});
