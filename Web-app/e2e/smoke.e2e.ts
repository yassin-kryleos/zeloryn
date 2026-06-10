import { test, expect } from '@playwright/test';

/**
 * E2E smoke flow for the Web companion dashboard.
 * Pass/fail: page loads, hero + nav render, and tab navigation works.
 */
test.describe('Web companion — smoke', () => {
  test('loads the dashboard with hero heading', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1 })).toContainText('KRYLEOS');
  });

  test('exposes a labelled tab list with all tabs', async ({ page }) => {
    await page.goto('/');
    // The nav is a WAI-ARIA tablist (role="tablist") with role="tab" children.
    await expect(page.getByRole('tablist', { name: 'Main navigation' })).toBeVisible();
    await expect(page.getByRole('tab')).toHaveCount(5);
  });

  test('navigates to the Planning tab', async ({ page }) => {
    await page.goto('/');
    // Tabs expose role="tab" (inside the role="tablist" nav).
    const planningTab = page.getByRole('tab', { name: 'Planning tab' });
    await planningTab.click();
    await expect(planningTab).toHaveAttribute('aria-selected', 'true');
    // After switching, the planning UI (voice input control) is shown.
    await expect(page.getByRole('button', { name: /voice input/i }).first()).toBeVisible();
  });
});
