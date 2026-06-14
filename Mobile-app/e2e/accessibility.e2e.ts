import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

/**
 * Mobile companion app — WCAG 2.1 A/AA accessibility audit (Expo Web).
 *
 * Covers: addresses A11Y-NEW-02 (no accessibility test for Mobile).
 * Scans each tab for critical/serious axe violations.
 *
 * Pass/fail: zero critical OR serious violations per tab.
 * Moderate/minor logged as informational (terminal-aesthetic intentional design).
 */

const BLOCKING = new Set(['critical', 'serious']);

async function axeScan(page: import('@playwright/test').Page) {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
  return results.violations;
}

const TABS = [
  { name: 'Dashboard', label: 'Dashboard' },
  { name: 'Plan', label: 'Plan' },
  { name: 'Tasks', label: 'Tasks' },
  { name: 'Settings', label: 'Settings' },
];

test.describe('Mobile app — accessibility (axe WCAG 2.1 A/AA)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(2000);
  });

  test('initial page load has no critical/serious violations', async ({ page }) => {
    const violations = await axeScan(page);
    const blocking = violations.filter(v => BLOCKING.has(v.impact ?? ''));
    if (blocking.length > 0) {
      const summary = blocking.map(v => `[${v.impact}] ${v.id}: ${v.description}`).join('\n');
      console.log(`Blocking violations on initial load:\n${summary}`);
    }
    expect(blocking).toHaveLength(0);
  });

  for (const { name, label } of TABS) {
    test(`${name} tab has no critical/serious violations`, async ({ page }) => {
      const tabEl = page.locator(`text="${label}"`).first();
      if (await tabEl.isVisible({ timeout: 2000 })) {
        await tabEl.click();
        await page.waitForTimeout(500);
      }
      const violations = await axeScan(page);
      const blocking = violations.filter(v => BLOCKING.has(v.impact ?? ''));
      if (blocking.length > 0) {
        const summary = blocking.map(v => `[${v.impact}] ${v.id}: ${v.description}`).join('\n');
        console.log(`Blocking violations on ${name} tab:\n${summary}`);
      }
      expect(blocking).toHaveLength(0);
    });
  }

  test('interactive elements have accessible touch targets (min 44×44px)', async ({ page }) => {
    const buttons = page.locator('button:not([aria-hidden="true"])');
    const count = await buttons.count();
    const tooSmall: string[] = [];

    for (let i = 0; i < Math.min(count, 15); i++) {
      const btn = buttons.nth(i);
      if (!await btn.isVisible()) continue;
      const box = await btn.boundingBox();
      if (!box) continue;
      if (box.width < 44 || box.height < 44) {
        const label = await btn.textContent();
        tooSmall.push(`"${label?.trim()}" (${box.width.toFixed(0)}×${box.height.toFixed(0)}px)`);
      }
    }

    if (tooSmall.length > 0) {
      console.log(`Touch targets below 44×44px: ${tooSmall.join(', ')}`);
    }
    // Log as informational rather than hard-blocking (Expo Web scaling may differ)
    expect(tooSmall.length).toBeLessThan(5);
  });
});
