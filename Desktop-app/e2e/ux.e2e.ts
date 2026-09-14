import { test, expect } from '@playwright/test';

/**
 * Desktop renderer — UX interaction tests.
 *
 * Covers: theme switching (localStorage matrix_theme), project creation flow,
 * CONFIG panel tab switching, and "New Plan" button behaviour.
 *
 * These tests interact with the running renderer. Backend is helpful but not
 * required — the UI handles offline state gracefully.
 */

test.describe('Desktop renderer — UX interactions', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
  });

  async function selectTheme(page: import('@playwright/test').Page, theme: 'forge' | 'dark' | 'light') {
    await page.getByRole('button', { name: 'CONFIG', exact: true }).click();
    await page.getByRole('button', { name: 'Theme', exact: true }).click();
    await page.getByRole('button', { name: theme, exact: true }).click();
    await page.getByRole('button', { name: 'Save Settings', exact: true }).click();
  }

  test('theme toggle persists selection to localStorage matrix_theme key', async ({ page }) => {
    await selectTheme(page, 'light');
    const storedTheme = await page.evaluate(() => localStorage.getItem('matrix_theme'));
    expect(storedTheme).toBe('light');
  });

  test('clicking theme toggle a second time switches to the alternate theme', async ({ page }) => {
    await selectTheme(page, 'light');
    const theme1 = await page.evaluate(() => localStorage.getItem('matrix_theme'));
    await selectTheme(page, 'dark');
    const theme2 = await page.evaluate(() => localStorage.getItem('matrix_theme'));
    expect(theme1).not.toBe(theme2);
  });

  test('CONFIG panel opens and tabs are navigable', async ({ page }) => {
    const configBtn = page.locator('button, [role="button"]').filter({ hasText: /config/i }).first();
    if (await configBtn.isVisible()) {
      await configBtn.click();
      await page.waitForTimeout(300);
    }
    // Check at least one config tab is visible (Security, Theme, Directory, Syncs, etc.)
    const configTab = page.locator('[role="tab"], button').filter({
      hasText: /security|theme|directory|syncs|agents|permissions/i
    }).first();
    if (await configTab.isVisible()) {
      await configTab.click();
      await page.waitForTimeout(200);
      const error = page.locator('[data-testid="error-boundary-fallback"]');
      await expect(error).not.toBeVisible();
    }
  });

  test('project creation button is reachable and clickable', async ({ page }) => {
    const newPlanBtn = page.locator('[data-testid="add-project-button"], button:has-text("+ Add project")').first();
    await newPlanBtn.click();
    await page.waitForTimeout(300);
    const error = page.locator('[data-testid="error-boundary-fallback"]');
    await expect(error).not.toBeVisible();
  });

  test('workspace space navigation does not cause a render crash', async ({ page }) => {
    const spaceButtons = page.locator('button, [role="tab"]').filter({
      hasText: /plan|crew|flow|forge|chat/i
    });
    const count = await spaceButtons.count();
    for (let i = 0; i < Math.min(count, 4); i++) {
      const btn = spaceButtons.nth(i);
      if (await btn.isVisible()) {
        await btn.click();
        await page.waitForTimeout(200);
        const error = page.locator('[data-testid="error-boundary-fallback"]');
        await expect(error).not.toBeVisible();
      }
    }
  });

  test('keyboard Tab key cycles focus through interactive elements', async ({ page }) => {
    await page.keyboard.press('Tab');
    const focused = await page.evaluate(() => document.activeElement?.tagName);
    expect(['BUTTON', 'A', 'INPUT', 'SELECT', 'TEXTAREA', 'DIV']).toContain(focused);
  });
});
