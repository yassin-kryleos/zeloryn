import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

/**
 * Accessibility audit (WCAG 2.1 A/AA) for the Web companion dashboard.
 * Pass/fail: zero `critical` OR `serious` axe violations on each main tab.
 *
 * The earlier color-contrast debt (green text on light surfaces, ~1.5:1) was
 * burned down in the UI/UX theme pass — the palette now uses WCAG-AA semantic
 * tokens (--accent / --text-* / --line-*) across all three themes. `serious` is
 * therefore part of the BLOCKING gate so contrast regressions fail CI.
 * `moderate`/`minor` issues are still logged but non-blocking.
 */
const BLOCKING = new Set(['critical', 'serious']);

async function scan(page: import('@playwright/test').Page) {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
  return results.violations;
}

test.describe('Web companion — accessibility', () => {
  test('marketing/home tab has no critical or serious a11y violations', async ({ page }) => {
    await page.goto('/');
    const violations = await scan(page);
    const blocking = violations.filter(v => BLOCKING.has(v.impact ?? ''));
    // Surface details in the report for any non-blocking findings.
    if (violations.length) {
      console.log('axe (home) violations:', violations.map(v => `${v.impact}:${v.id}`).join(', '));
    }
    expect(blocking, JSON.stringify(blocking, null, 2)).toEqual([]);
  });

  for (const tabName of ['Planning tab', 'Tutorial tab', 'Downloads tab', 'Settings tab']) {
    test(`${tabName} has no critical or serious a11y violations`, async ({ page }) => {
      await page.goto('/');
      await page.getByRole('tab', { name: tabName }).click();
      const violations = await scan(page);
      const blocking = violations.filter(v => BLOCKING.has(v.impact ?? ''));
      if (violations.length) {
        console.log(`axe (${tabName}) violations:`, violations.map(v => `${v.impact}:${v.id}`).join(', '));
      }
      expect(blocking, JSON.stringify(blocking, null, 2)).toEqual([]);
    });
  }
});
